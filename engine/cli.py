"""Headless Atlas: ``python -m engine.cli <command>`` — the proof that Phase 1 works end to end.

Commands::

    preflight --csv PATH
    run       --csv PATH --model NAME --criteria TEXT|@file.txt --data-dir DIR
              [--shortlist 60] [--band 50] [--min 0] [--cgpa-min X] [--departments CSE,IT] [--yes]
    resume    --run ID --data-dir DIR
    results   --run ID --data-dir DIR [--shortlist N --band N --min N]
    export    --run ID --data-dir DIR --view all|shortlisted|cutoff|rejected|failed --out PATH
    retry     --run ID --data-dir DIR [--include-permanent]

Exit codes: 0 finished, 2 paused (resume later), 1 error or nothing done.
Ctrl+C pauses the run gracefully; ``resume`` continues it.

Output names only ids and RA numbers — never names, emails or phones.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any, Callable, Sequence, TextIO

from engine.buckets import compute_buckets
from engine.db import Database, DatabaseError, NotFoundError
from engine.errors import AUTO_RESUME_REASONS
from engine.export import VIEWS, ExportError, export_csv
from engine.extract.ocr import EasyOcrEngine
from engine.extract.pdf import PdfExtractor
from engine.health import HealthProbe
from engine.ingest.csv_loader import load_csv, render_report
from engine.ingest.downloader import Downloader
from engine.llm.client import DEFAULT_URL, OllamaClient
from engine.llm.precheck import precheck
from engine.llm.scorer import Scorer
from engine.logs import configure_logging, remove_logging
from engine.worker import Worker

PRECHECK_SETTING = "model_prechecks"
TOP_N = 20


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:   # argparse exits 2, which here means "paused"
        self.print_usage(sys.stderr)
        self.exit(1, f"{self.prog}: {message}\n")


def build_parser() -> argparse.ArgumentParser:
    parser = _Parser(prog="python -m engine.cli", description="Atlas résumé screening, without the app.")
    sub = parser.add_subparsers(dest="command", required=True, parser_class=_Parser)

    def data(p: argparse.ArgumentParser) -> None:
        p.add_argument("--data-dir", required=True, type=Path, help="folder for atlas.db, downloads and logs")

    def ollama(p: argparse.ArgumentParser) -> None:
        p.add_argument("--ollama-url", default=os.environ.get("ATLAS_OLLAMA_URL", DEFAULT_URL))

    def cutoffs(p: argparse.ArgumentParser, *, defaults: bool) -> None:
        p.add_argument("--shortlist", type=int, default=60 if defaults else None, help="shortlist score (0-100)")
        p.add_argument("--band", type=int, default=50 if defaults else None, help="cutoff band starts at (0-100)")
        p.add_argument("--min", type=int, default=0 if defaults else None, help="minimum number to shortlist")

    p = sub.add_parser("preflight", help="check a CSV without saving anything")
    p.add_argument("--csv", required=True, type=Path)

    p = sub.add_parser("run", help="screen a CSV")
    p.add_argument("--csv", required=True, type=Path)
    p.add_argument("--model", required=True)
    p.add_argument("--criteria", required=True, help="what the recruiter wants, or @file.txt")
    data(p)
    cutoffs(p, defaults=True)
    p.add_argument("--cgpa-min", type=float)
    p.add_argument("--departments", help="comma-separated, e.g. CSE,IT")
    p.add_argument("--name", help="run name (default: CSV name and date)")
    p.add_argument("--yes", action="store_true", help="don't ask for confirmation")
    ollama(p)

    p = sub.add_parser("resume", help="continue a paused run")
    p.add_argument("--run", required=True, type=int)
    data(p)
    ollama(p)

    p = sub.add_parser("results", help="show buckets (cutoffs can be previewed)")
    p.add_argument("--run", required=True, type=int)
    data(p)
    cutoffs(p, defaults=False)

    p = sub.add_parser("export", help="write a CSV")
    p.add_argument("--run", required=True, type=int)
    data(p)
    p.add_argument("--view", required=True, choices=VIEWS)
    p.add_argument("--out", required=True, type=Path)

    p = sub.add_parser("retry", help="send failed candidates through again")
    p.add_argument("--run", required=True, type=int)
    data(p)
    p.add_argument("--include-permanent", action="store_true")
    ollama(p)
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    stdout: TextIO | None = None,
    stdin: TextIO | None = None,
    url_rewrite: Callable[[str], str] | None = None,
    health: Any = None,
    poll_interval: float = 5.0,
    download_interval: float = 1.0,
    idle_interval: float = 0.2,
) -> int:
    """Entry point. The keyword arguments exist for tests (local stub servers)."""
    out = stdout or sys.stdout
    if out is sys.stdout and hasattr(sys.stdout, "reconfigure"):
        # UTF-8, so "→ ≥ ·" survive when the output is redirected to a file on
        # Windows (cp1252 turned them into "?"); "replace" for any console that
        # still can't show a character.
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = build_parser().parse_args(argv)
    cli = _Cli(out, stdin or sys.stdin, url_rewrite, health, poll_interval, download_interval, idle_interval)
    try:
        return getattr(cli, f"cmd_{args.command}")(args)
    except NotFoundError as exc:
        cli.say(str(exc))
        return 1
    except DatabaseError as exc:
        cli.say(f"The database couldn't be used: {exc}")
        return 1
    finally:
        cli.close()


class _Cli:
    def __init__(self, out: TextIO, inp: TextIO, url_rewrite: Callable[[str], str] | None, health: Any,
                 poll_interval: float, download_interval: float, idle_interval: float) -> None:
        self.out = out
        self.inp = inp
        self.url_rewrite = url_rewrite
        self.health = health
        self.poll_interval = poll_interval
        self.download_interval = download_interval
        self.idle_interval = idle_interval
        self.db: Database | None = None
        self.log_handler: Any = None

    def say(self, text: str = "") -> None:
        self.out.write(text + "\n")
        self.out.flush()

    def open(self, data_dir: Path) -> Database:
        data_dir.mkdir(parents=True, exist_ok=True)
        self.log_handler = configure_logging(data_dir)
        self.db = Database(data_dir / "atlas.db")
        return self.db

    def close(self) -> None:
        if self.db is not None:
            self.db.close()
        if self.log_handler is not None:
            remove_logging(self.log_handler)

    # ---- commands --------------------------------------------------------- #

    def cmd_preflight(self, args: argparse.Namespace) -> int:
        report = load_csv(args.csv)
        self.say(render_report(report))
        return 0 if report.ok else 1

    def cmd_run(self, args: argparse.Namespace) -> int:
        report = load_csv(args.csv)
        self.say(render_report(report))
        if not report.ok:
            self.say("\nFix the file and try again. Nothing was saved.")
            return 1
        criteria = _read_criteria(args.criteria)
        if not args.yes:
            self.out.write("\nContinue? [y/N] ")
            self.out.flush()
            if self.inp.readline().strip().lower() not in ("y", "yes"):
                self.say("Stopped. Nothing was saved.")
                return 1

        db = self.open(args.data_dir)
        client = OllamaClient(args.ollama_url)
        model = self._checked_model(db, client, args.model)
        if model is None:
            return 1

        run_id = db.create_run(args.name or f"{args.csv.stem} {date.today().isoformat()}", csv_filename=args.csv.name)
        try:
            db.configure_run(
                run_id,
                model_name=model,
                criteria_prompt=criteria,
                shortlist_cutoff=args.shortlist,
                maybe_cutoff=args.band,
                min_shortlist=args.min,
                cgpa_min=args.cgpa_min,
                departments_allowed=[d for d in (args.departments or "").split(",") if d.strip()] or None,
            )
        except DatabaseError as exc:
            db.delete_run(run_id)
            self.say(str(exc))
            return 1
        db.add_candidates(run_id, report.rows)
        self.say(f"\nRun {run_id}: {len(report.rows)} candidates, model {model}.")
        return self._drive(args.data_dir, run_id, client, lambda w: w.start(run_id))

    def cmd_resume(self, args: argparse.Namespace) -> int:
        self.open(args.data_dir)
        return self._drive(args.data_dir, args.run, OllamaClient(args.ollama_url), lambda w: w.resume(args.run))

    def cmd_retry(self, args: argparse.Namespace) -> int:
        db = self.open(args.data_dir)
        db.get_run(args.run)
        count = db.retry_failed(args.run, include_permanent=args.include_permanent)
        if not count:
            self.say("Nothing to retry.")
            return 0
        self.say(f"Retrying {count} candidates.")
        return self._drive(args.data_dir, args.run, OllamaClient(args.ollama_url), lambda w: w.start(args.run))

    def cmd_results(self, args: argparse.Namespace) -> int:
        db = self.open(args.data_dir)
        run = db.get_run(args.run)
        shortlist = run["shortlist_cutoff"] if args.shortlist is None else args.shortlist
        band = run["maybe_cutoff"] if args.band is None else args.band
        minimum = run["min_shortlist"] if args.min is None else args.min
        try:
            result = compute_buckets(db.scored_rows(args.run), shortlist_cutoff=shortlist, maybe_cutoff=band,
                                     min_shortlist=minimum, overrides=db.latest_overrides(args.run))
        except ValueError as exc:
            self.say(str(exc))
            return 1
        counts = db.state_counts(args.run)
        waiting = sum(counts[s] for s in ("queued", "downloading", "downloaded", "extracted", "scoring"))
        self.say(f"Run {run['id']} ({run['status']}) · shortlist ≥ {shortlist}, cutoff band ≥ {band}, minimum {minimum}")
        self.say(f"Shortlisted {result.counts['shortlisted']} · Cutoff {result.counts['cutoff']} · "
                 f"Rejected {result.counts['rejected']} · Failed {counts['failed']} · "
                 f"Filtered {counts['filtered']} · Not scored yet {waiting}")
        for note in result.notes:
            self.say(f"  note: {note}")
        if result.placements:
            self.say(f"\nTop {min(TOP_N, len(result.placements))}:")
            self.say(f"  {'Rank':>4}  {'RA number':<18} {'Score':>5}  Bucket")
            for p in result.placements[:TOP_N]:
                label = {"fill": " (filled to minimum)", "override": " (moved by recruiter)"}.get(p.reason, "")
                self.say(f"  {p.rank:>4}  {p.ra_number:<18} {p.score:>5}  {p.bucket}{label}")
        return 0

    def cmd_export(self, args: argparse.Namespace) -> int:
        db = self.open(args.data_dir)
        run = db.get_run(args.run)
        placements = compute_buckets(
            db.scored_rows(args.run), shortlist_cutoff=run["shortlist_cutoff"], maybe_cutoff=run["maybe_cutoff"],
            min_shortlist=run["min_shortlist"], overrides=db.latest_overrides(args.run),
        ).placements
        try:
            written = export_csv(db.export_rows(args.run), placements, args.out, view=args.view)
        except ExportError as exc:
            self.say(str(exc))
            return 1
        self.say(f"Wrote {written} candidates to {args.out}")
        return 0

    # ---- running ---------------------------------------------------------- #

    def _checked_model(self, db: Database, client: OllamaClient, model: str) -> str | None:
        """Run (or reuse) the model pre-check. Returns the installed model name, or None."""
        info = None
        try:
            info = client.find_model(model)
        except Exception:  # noqa: BLE001 — precheck() reports the same problem in recruiter words
            pass
        cache = db.get_setting(PRECHECK_SETTING, {}) or {}
        if info is not None:
            cached = cache.get(info.name)
            if cached and cached.get("ok") and cached.get("digest") == info.digest:
                self.say(f"Model {info.name}: ready (checked before).")
                return info.name
        self.say(f"Checking that {model} can screen résumés on this computer…")
        result = precheck(client, model)
        if not result.ok:
            self.say(result.message)
            return None
        name = info.name if info else model
        cache[name] = {"ok": True, "digest": result.digest, "seconds": round(result.seconds, 1),
                       "checked": date.today().isoformat()}
        db.set_setting(PRECHECK_SETTING, cache)
        self.say(f"{result.message} ({result.seconds:.0f} s)")
        return name

    def _drive(self, data_dir: Path, run_id: int, client: OllamaClient, begin: Callable[[Worker], None]) -> int:
        assert self.db is not None
        db = self.db
        db.get_run(run_id)
        worker = Worker(
            db, data_dir,
            Downloader(min_interval=self.download_interval, url_rewrite=self.url_rewrite),
            PdfExtractor(ocr=EasyOcrEngine(data_dir / "ocr-models")),
            lambda run: Scorer(client, run["model_name"], run["criteria_prompt"]),
            self.health or HealthProbe(ollama=client),
            poll_interval=self.poll_interval,
            idle_interval=self.idle_interval,
        )
        ra_numbers = {c["id"]: c["ra_number"] for c in db.list_candidates(run_id)}
        total = len(ra_numbers)
        counts = db.state_counts(run_id)
        done = counts["scored"] + counts["failed"] + counts["filtered"]
        last_event = max((e["id"] for e in db.events(run_id, limit=100_000)), default=0)
        announced: str | None = None
        try:
            begin(worker)
            while True:
                for event in db.events(run_id, after_id=last_event):
                    last_event = event["id"]
                    if event["candidate_id"] is not None:
                        if event["message"].startswith(("Scored", "Failed")):
                            done += 1
                        cid = event["candidate_id"]
                        self.say(f"[{done}/{total}] #{cid} {ra_numbers.get(cid, '?')}: {event['message']}")
                run = db.get_run(run_id)
                status, reason = run["status"], run["pause_reason"]
                if status == "completed":
                    worker.stop()
                    self._summary(run_id, data_dir)
                    return 0
                if status == "paused" and reason != announced:
                    announced = reason
                    if reason in AUTO_RESUME_REASONS:
                        self.say(f"Paused: {reason}. Atlas will continue by itself when it's back.")
                    else:
                        worker.stop()
                        self.say(f"Paused: {reason}")
                        self.say(f"Continue with: python -m engine.cli resume --run {run_id} --data-dir {data_dir}")
                        return 2
                if status == "running" and announced is not None:
                    announced = None
                    self.say("Resumed.")
                if status == "cancelled":
                    worker.stop()
                    self.say("The run was cancelled.")
                    return 1
                _wait(0.2)
        except KeyboardInterrupt:
            worker.stop()
            self.say(f"\nPaused. Continue with: python -m engine.cli resume --run {run_id} --data-dir {data_dir}")
            return 2

    def _summary(self, run_id: int, data_dir: Path) -> None:
        assert self.db is not None
        counts = self.db.state_counts(run_id)
        self.say(f"\nDone. Scored {counts['scored']}, failed {counts['failed']}, filtered {counts['filtered']}.")
        if not counts["failed"]:
            return
        failed = self.db.list_candidates(run_id, states=["failed"])
        retryable = sum(1 for c in failed if c["failure_kind"] == "retryable")
        if retryable:
            self.say(f"Retry the {retryable} that may work next time with: "
                     f"python -m engine.cli retry --run {run_id} --data-dir {data_dir}")
        else:
            self.say("All failures need action from the student (for example, fixing sharing). Fix the links, then "
                     f"use: python -m engine.cli retry --run {run_id} --data-dir {data_dir} --include-permanent")


def _wait(seconds: float) -> None:
    """Pause between progress checks (a function of its own so tests can interrupt it)."""
    time.sleep(seconds)


def _read_criteria(value: str) -> str:
    if value.startswith("@"):
        return Path(value[1:]).read_text(encoding="utf-8").strip()
    return value.strip()


if __name__ == "__main__":
    sys.exit(main())
