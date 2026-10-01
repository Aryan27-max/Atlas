"""Command line for the eval harness.

    python -m engine.eval run --set engine/eval/sets/fictional --model qwen3:8b
    python -m engine.eval run --set local/eval --model qwen3:8b --repeats 2
    python -m engine.eval make-fictional            # regenerate the bundled fictional set
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from engine.eval.harness import evaluate, render, write_report
from engine.llm.client import DEFAULT_URL, OllamaClient

FICTIONAL = Path(__file__).with_name("sets") / "fictional"


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    parser = argparse.ArgumentParser(prog="python -m engine.eval", description="Measure scoring quality on a labelled set.")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="score a set and write report.md / report.json into it")
    run.add_argument("--set", required=True, type=Path, dest="folder")
    run.add_argument("--model", required=True)
    run.add_argument("--repeats", type=int, default=2)
    run.add_argument("--shortlist", type=int, default=60)
    run.add_argument("--band", type=int, default=50)
    run.add_argument("--ollama-url", default=DEFAULT_URL)
    make = sub.add_parser("make-fictional", help="write the bundled fictional set")
    make.add_argument("--out", type=Path, default=FICTIONAL)
    args = parser.parse_args(argv)

    if args.command == "make-fictional":
        from engine.eval.fictional import write_set

        paths = write_set(args.out)
        print(f"Wrote {len(paths)} fictional résumés, labels.csv and criteria.txt to {args.out}")
        return 0

    from engine.llm.scorer import Scorer

    client = OllamaClient(args.ollama_url)
    report = evaluate(
        args.folder, lambda criteria: Scorer(client, args.model, criteria), model=args.model,
        repeats=args.repeats, shortlist=args.shortlist, band=args.band, progress=print,
    )
    md, _ = write_report(args.folder, report)
    print()
    print(render(report))
    print(f"Report written to {md}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
