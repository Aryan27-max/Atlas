"""Seconds per résumé with a real local model, on the bundled fictional samples.

    python -m engine.tools.speed_bench --model qwen3:8b --runs 5 [--samples DIR]

One warm-up call first (not counted, so model loading isn't in the numbers),
then every sample ``--runs`` times, interleaved. Prints one line per run and
a summary: median seconds per résumé, scores, output size, and, when the
client reports them, Ollama's prefill (``prompt_eval``) and generation
(``eval``) time. Fictional data only; nothing is written anywhere.
"""

from __future__ import annotations

import argparse
import statistics
import sys
import tempfile
import time
from pathlib import Path

from engine.extract import PdfExtractor, split_sections
from engine.llm.client import DEFAULT_URL, OllamaClient
from engine.llm.redact import scoring_input
from engine.llm.scorer import Scorer
from engine.tests.fixtures import make_pdf

SAMPLES = Path(__file__).resolve().parents[1] / "tests" / "samples"
CRITERIA = "Backend software engineering interns: Python, APIs, databases, cloud deployment, real projects."


def prepare(samples: Path, tmp: Path) -> list[tuple[str, object]]:
    prepared = []
    for sample in sorted(samples.glob("*.txt")):
        lines = sample.read_text(encoding="utf-8").splitlines()
        pages = ["\n".join(lines[i:i + 55]) for i in range(0, len(lines), 55)]
        extraction = PdfExtractor().extract(make_pdf(tmp / f"{sample.stem}.pdf", pages))
        data = scoring_input(
            {"name": lines[0].title(), "cgpa": 8.0, "department": "CSE", "skills": "Python, Docker", "hackathons": ""},
            extraction.text, split_sections(extraction.text),
        )
        prepared.append((sample.stem, data))
    return prepared


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", required=True)
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--samples", type=Path, default=SAMPLES)
    parser.add_argument("--url", default=DEFAULT_URL)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

    client = OllamaClient(args.url)
    scorer = Scorer(client, args.model, CRITERIA)
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        prepared = prepare(args.samples, Path(tmp))
        started = time.monotonic()
        name, data = prepared[0]
        scorer.score(data.context, data.sections, data.full_text)
        print(f"warm-up ({name}): {time.monotonic() - started:.1f} s")
        for run in range(1, args.runs + 1):
            for name, data in prepared:
                started = time.monotonic()
                result = scorer.score(data.context, data.sections, data.full_text)
                seconds = time.monotonic() - started
                prefill = getattr(result, "prompt_eval_seconds", None)
                generate = getattr(result, "eval_seconds", None)
                rows.append((name, seconds, result.evaluation.overall_score, len(result.raw_response), prefill, generate))
                timing = f" prefill {prefill:.1f} s, generate {generate:.1f} s" if prefill is not None and generate is not None else ""
                print(f"run {run} {name:<16} {seconds:6.1f} s  score {result.evaluation.overall_score:>3}  "
                      f"answer {len(result.raw_response):>5} chars  attempts {result.attempts}{timing}")

    seconds = [r[1] for r in rows]
    print(f"\nmedian {statistics.median(seconds):.1f} s per résumé (min {min(seconds):.1f}, max {max(seconds):.1f}, n={len(seconds)})")
    for name in sorted({r[0] for r in rows}):
        mine = [r for r in rows if r[0] == name]
        print(f"  {name:<16} median {statistics.median(r[1] for r in mine):6.1f} s  scores {[r[2] for r in mine]}  "
              f"median answer {statistics.median(r[3] for r in mine):.0f} chars")
    prefills = [r[4] for r in rows if r[4] is not None]
    generates = [r[5] for r in rows if r[5] is not None]
    if prefills and generates:
        p, g = statistics.median(prefills), statistics.median(generates)
        print(f"  prefill median {p:.1f} s, generation median {g:.1f} s, prefill share {p / (p + g):.0%}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
