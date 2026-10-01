"""Privacy audit of the graphify output: counts only, never a matched value.

Run after every graph build or update:

    python -m engine.tools.graph_audit [graphify-out]

**Must be zero** (exit code 1 otherwise): paths under ``local/``, RA numbers,
and the names of the real-data files.

**Reported for review:** e-mail addresses and runs of 10+ digits. graphify's
own files contain some that aren't student data (the vis-network library's
author address in ``graph.html``, file timestamps and hashes in
``manifest.json`` and ``cache/``). For each, the audit counts how many
distinct values also appear in git-tracked files (fictional by the repo's
rules), so a human can judge without seeing the values.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

MUST_BE_ZERO: dict[str, re.Pattern[str]] = {
    "paths under local/": re.compile(r"(?<![\w.-])local[\\/]+[\w.-]"),
    "RA numbers": re.compile(r"RA\d{6,}"),
    "real-data file names": re.compile(r"student_details|smoke-report-full|results_all|preflight\.txt"),
}
FOR_REVIEW: dict[str, re.Pattern[str]] = {
    "e-mail addresses": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    "runs of 10+ digits": re.compile(r"(?<!\d)\d{10,}(?!\d)"),
}
BINARY = {".png", ".jpg", ".jpeg", ".pdf", ".xlsx", ".gif", ".ico", ".woff", ".woff2"}


@dataclass(frozen=True)
class Count:
    name: str
    matches: int
    files: int
    untracked_values: int | None = None


def _texts(folder: Path) -> list[tuple[Path, str]]:
    return [
        (p, p.read_text(encoding="utf-8", errors="ignore"))
        for p in sorted(folder.rglob("*"))
        if p.is_file() and p.suffix.lower() not in BINARY
    ]


def _tracked_corpus(repo: Path) -> str:
    try:
        listing = subprocess.run(["git", "ls-files", "-z"], cwd=repo, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return ""
    parts = []
    for name in listing.decode("utf-8", errors="ignore").split("\0"):
        path = repo / name
        if name and not name.startswith("graphify-out") and path.suffix.lower() not in BINARY and path.is_file():
            parts.append(path.read_text(encoding="utf-8", errors="ignore"))
    return "\n".join(parts)


def audit(folder: Path, repo: Path) -> tuple[list[Count], list[Count]]:
    texts = _texts(folder)
    corpus = _tracked_corpus(repo)

    def count(name: str, rx: re.Pattern[str], classify: bool) -> Count:
        matches, files, untracked = 0, 0, set()
        for _path, text in texts:
            found = [m.group(0) for m in rx.finditer(text)]
            if found:
                files += 1
                matches += len(found)
                if classify:
                    untracked.update(v for v in found if v not in corpus)
        return Count(name, matches, files, len(untracked) if classify else None)

    zero = [count(n, rx, False) for n, rx in MUST_BE_ZERO.items()]
    review = [count(n, rx, True) for n, rx in FOR_REVIEW.items()]
    return zero, review


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folder", nargs="?", default="graphify-out", type=Path)
    parser.add_argument("--repo", default=".", type=Path)
    args = parser.parse_args(argv)
    if not args.folder.is_dir():
        print(f"No folder {args.folder}.")
        return 2
    zero, review = audit(args.folder, args.repo)
    print(f"Files scanned: {sum(1 for _ in args.folder.rglob('*') if _.is_file())}")
    for c in zero:
        print(f"[{'OK ' if c.matches == 0 else 'BAD'}] {c.name}: {c.matches}")
    for c in review:
        print(f"[REVIEW] {c.name}: {c.matches} in {c.files} file(s); "
              f"distinct values not in git-tracked files: {c.untracked_values}")
    return 1 if any(c.matches for c in zero) else 0


if __name__ == "__main__":
    sys.exit(main())
