"""Measure scoring quality on a labelled set of résumés (Phase 3, step 3.2b).

A set is a folder with:

* the résumé PDFs;
* ``labels.csv``: ``file, expected_bucket, expected_rank_group`` (1 = best),
  and optionally ``skills``, ``hackathons``, ``cgpa``, ``department``, ``name``;
* ``criteria.txt``: the recruiter's criteria for the whole set.

Every résumé goes through the real pipeline (PDF → text → sections →
redaction → prompt → model → validation → quote checks) and is scored
``repeats`` times. The report (``report.md`` + ``report.json``, written into
the set's folder) gives:

* **bucket agreement**: how many land in the expected bucket at the cutoffs;
* **Spearman rank correlation** between the scores and the expected order;
* **spread**: standard deviation, min and max of the scores;
* **stability**: mean absolute difference between repeated scores of the same résumé;
* **seconds per résumé** (median, plus Ollama's prefill/generation split);
* **leak count**: identity words left in the rebuilt prompts (must be 0).

Reports name files and numbers only, never résumé text or names, so a real
set's report under ``local/`` stays as private as the set itself.
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol

from engine.buckets import compute_buckets
from engine.extract import PdfExtractor, split_sections
from engine.llm.identity import EMAIL, build_lexicon, lexicon_hits
from engine.llm.prompt import build_prompt
from engine.llm.redact import CandidateContext, scoring_input

REPORT_MD = "report.md"
REPORT_JSON = "report.json"


class ScorerLike(Protocol):
    def score(self, candidate_context: CandidateContext, sections: dict[str, str], full_text: str) -> Any: ...


@dataclass
class ResumeResult:
    file: str
    expected_bucket: str
    expected_rank_group: int
    level: str
    scores: list[int] = field(default_factory=list)
    seconds: list[float] = field(default_factory=list)
    prefill_seconds: list[float] = field(default_factory=list)
    generate_seconds: list[float] = field(default_factory=list)
    leaks: int = 0
    bucket: str = ""
    error: str = ""

    @property
    def score(self) -> float:
        return statistics.mean(self.scores) if self.scores else float("nan")


@dataclass
class Report:
    set_name: str
    model: str
    criteria_chars: int
    shortlist: int
    band: int
    repeats: int
    resumes: list[ResumeResult]
    bucket_agreement: float
    spearman: float
    spread_stdev: float
    score_min: float
    score_max: float
    stability_mad: float
    seconds_median: float
    prefill_median: float | None
    generate_median: float | None
    leaks: int
    groups_in_order: bool
    above_95_not_exceptional: list[str]


def spearman(xs: list[float], ys: list[float]) -> float:
    """Spearman's rho with average ranks for ties (stdlib only)."""
    if len(xs) != len(ys) or len(xs) < 2:
        return float("nan")
    rx, ry = _ranks(xs), _ranks(ys)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den else float("nan")


def _ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def read_labels(folder: Path) -> list[dict[str, str]]:
    with open(folder / "labels.csv", encoding="utf-8-sig", newline="") as handle:
        rows = [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(handle)]
    missing = [r["file"] for r in rows if not (folder / r["file"]).is_file()]
    if missing:
        raise FileNotFoundError(f"labels.csv lists files that aren't in the folder: {', '.join(missing)}")
    return rows


def evaluate(
    folder: Path,
    scorer_factory: Callable[[str], ScorerLike],
    *,
    model: str,
    repeats: int = 2,
    shortlist: int = 60,
    band: int = 50,
    clock: Callable[[], float] = time.monotonic,
    progress: Callable[[str], None] = lambda line: None,
) -> Report:
    criteria = (folder / "criteria.txt").read_text(encoding="utf-8").strip()
    labels = read_labels(folder)
    scorer = scorer_factory(criteria)
    extractor = PdfExtractor()
    results: list[ResumeResult] = []
    for label in labels:
        result = ResumeResult(label["file"], label.get("expected_bucket", ""),
                              int(label.get("expected_rank_group") or 0), label.get("level", ""))
        results.append(result)
        try:
            text = extractor.extract(folder / label["file"]).text
        except Exception as exc:  # noqa: BLE001 — report it and go on with the rest of the set
            result.error = f"couldn't read the PDF ({type(exc).__name__})"
            progress(f"{label['file']}: {result.error}")
            continue
        row = _row(label)
        sections = split_sections(text)
        data = scoring_input(row, text, sections)
        result.leaks = _leaks(row, text, sections, data, criteria)
        for attempt in range(repeats):
            started = clock()
            scored = scorer.score(data.context, data.sections, data.full_text)
            result.seconds.append(clock() - started)
            result.scores.append(int(scored.evaluation.overall_score))
            if getattr(scored, "prompt_eval_seconds", None) is not None:
                result.prefill_seconds.append(float(scored.prompt_eval_seconds))
            if getattr(scored, "eval_seconds", None) is not None:
                result.generate_seconds.append(float(scored.eval_seconds))
            progress(f"{label['file']}: run {attempt + 1}/{repeats} score {result.scores[-1]} "
                     f"({result.seconds[-1]:.1f} s)")
    return _report(folder.name, model, criteria, shortlist, band, repeats, results)


def _row(label: Mapping[str, str]) -> dict[str, Any]:
    cgpa = label.get("cgpa") or None
    return {
        "name": label.get("name", ""), "email": "", "phone": "", "ra_number": "", "section": "",
        "cgpa": float(cgpa) if cgpa else None, "department": label.get("department", ""),
        "skills": label.get("skills", ""), "hackathons": label.get("hackathons", ""),
    }


def _leaks(row: dict[str, Any], text: str, sections: dict[str, str], data: Any, criteria: str) -> int:
    prompt = build_prompt(data.context, data.sections, criteria, budget_chars=10_000_000).text
    lexicon = build_lexicon(row, text, sections.get("header") if "header" in sections else None)
    return lexicon_hits(prompt, lexicon) + len(EMAIL.findall(prompt))


def _report(name: str, model: str, criteria: str, shortlist: int, band: int, repeats: int,
            results: list[ResumeResult]) -> Report:
    scored = [r for r in results if r.scores]
    placements = compute_buckets(
        [{"candidate_id": i, "ra_number": r.file, "overall_score": round(r.score)} for i, r in enumerate(scored)],
        shortlist_cutoff=shortlist, maybe_cutoff=band,
    ).placements
    for placement in placements:
        scored[placement.candidate_id].bucket = placement.bucket
    agree = sum(1 for r in scored if r.bucket == r.expected_bucket)
    scores = [r.score for r in scored]
    groups = sorted({r.expected_rank_group for r in scored})
    group_means = [statistics.mean(r.score for r in scored if r.expected_rank_group == g) for g in groups]
    prefill = [s for r in scored for s in r.prefill_seconds]
    generate = [s for r in scored for s in r.generate_seconds]
    return Report(
        set_name=name, model=model, criteria_chars=len(criteria), shortlist=shortlist, band=band, repeats=repeats,
        resumes=results,
        bucket_agreement=agree / len(scored) if scored else float("nan"),
        spearman=spearman(scores, [-r.expected_rank_group for r in scored]),
        spread_stdev=statistics.pstdev(scores) if len(scores) > 1 else 0.0,
        score_min=min(scores, default=float("nan")), score_max=max(scores, default=float("nan")),
        stability_mad=statistics.mean(max(r.scores) - min(r.scores) for r in scored) if scored else float("nan"),
        seconds_median=statistics.median(s for r in scored for s in r.seconds) if scored else float("nan"),
        prefill_median=statistics.median(prefill) if prefill else None,
        generate_median=statistics.median(generate) if generate else None,
        leaks=sum(r.leaks for r in results),
        groups_in_order=all(a > b for a, b in zip(group_means, group_means[1:])),
        above_95_not_exceptional=[r.file for r in scored if r.score >= 95 and r.level != "exceptional"],
    )


def write_report(folder: Path, report: Report) -> tuple[Path, Path]:
    data = asdict(report)
    for row, result in zip(data["resumes"], report.resumes):
        row["score"] = None if math.isnan(result.score) else round(result.score, 1)
    (folder / REPORT_JSON).write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    (folder / REPORT_MD).write_text(render(report), encoding="utf-8")
    return folder / REPORT_MD, folder / REPORT_JSON


def render(report: Report) -> str:
    def pct(x: float) -> str:
        return "–" if math.isnan(x) else f"{x:.0%}"

    def num(x: float | None, digits: int = 1) -> str:
        return "–" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{digits}f}"

    lines = [
        f"# Eval report — {report.set_name}",
        "",
        f"Model `{report.model}` · cutoffs shortlist {report.shortlist} / band {report.band} · "
        f"each résumé scored {report.repeats}× · files and numbers only (no names, no résumé text).",
        "",
        "| Measure | Value | What good looks like |",
        "|---|---|---|",
        f"| Bucket agreement | {pct(report.bucket_agreement)} | high; disagreements are worth reading |",
        f"| Spearman rank correlation | {num(report.spearman, 2)} | close to 1.0 (the expected order) |",
        f"| Expected groups in order | {'yes' if report.groups_in_order else 'no'} | yes |",
        f"| Score spread (std dev) | {num(report.spread_stdev)} | wide enough to rank (not everyone at 95) |",
        f"| Min / max score | {num(report.score_min, 0)} / {num(report.score_max, 0)} | |",
        f"| Scored 95+ but not \"exceptional\" | {len(report.above_95_not_exceptional)} | 0 |",
        f"| Stability (mean abs. difference between repeats) | {num(report.stability_mad)} | 0–3 points |",
        f"| Seconds per résumé (median) | {num(report.seconds_median)} | |",
        f"| … prefill / generation (median) | {num(report.prefill_median)} / {num(report.generate_median)} | |",
        f"| Identity leaks in prompts | {report.leaks} | **0** |",
        "",
        "| File | Level | Expected | Got | Scores | Group |",
        "|---|---|---|---|---|---|",
    ]
    for r in report.resumes:
        got = r.error or f"{r.bucket} ({num(r.score, 0)})"
        lines.append(f"| {r.file} | {r.level or '–'} | {r.expected_bucket} | {got} | "
                     f"{', '.join(str(s) for s in r.scores) or '–'} | {r.expected_rank_group} |")
    return "\n".join(lines) + "\n"
