"""Privacy audit of the graphify output: counts only, never a matched value.

Run after every graph build or update:

    python -m engine.tools.graph_audit [graphify-out] [--repo .]

**Must be zero** (exit code 1 otherwise):

* **files under ``local/`` that were indexed**: from the graph's own list of
  source files (``graph.json`` ``source_file``) and ``manifest.json``. This
  is the privacy boundary: real data lives only in ``local/``.
* **RA numbers, ``local/`` paths and real-data file names that can't be traced
  to an indexed file**. The repo's own code and docs *mention* things like
  ``local/eval`` or ``student_details.csv``, and fictional test RA numbers;
  those mentions are fine. Anything that appears in the graph but in none of
  the indexed (non-``local/``) files came from somewhere else and fails.

**Reported for review:** e-mail addresses and runs of 10+ digits. graphify's
own files contain some that aren't student data (the vis-network library's
address in ``graph.html``, timestamps and hashes in ``manifest.json`` and
``cache/``), counted with how many are not traceable to an indexed file.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

TRACED_CHECKS: dict[str, re.Pattern[str]] = {
    "RA numbers": re.compile(r"RA\d{6,}"),
    "paths under local/": re.compile(r"(?<![\w.-])local[\\/]+[\w.\\/-]+"),
    "real-data file names": re.compile(r"[\w.-]*(?:student_details|smoke-report-full|results_all|preflight\.txt)[\w.-]*"),
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
    untraced: int        # matched values found in none of the indexed source files


def _texts(folder: Path) -> list[tuple[Path, str]]:
    return [
        (p, p.read_text(encoding="utf-8", errors="ignore"))
        for p in sorted(folder.rglob("*"))
        if p.is_file() and p.suffix.lower() not in BINARY
    ]


def _norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("./")


def indexed_files(folder: Path, repo: Path) -> set[str]:
    """Repo-relative paths graphify read, from graph.json and manifest.json."""
    found: set[str] = set()
    root = str(repo.resolve()).replace("\\", "/").rstrip("/") + "/"
    graph = folder / "graph.json"
    if graph.is_file():
        data: dict[str, Any] = json.loads(graph.read_text(encoding="utf-8"))
        found.update(_norm(str(n.get("source_file") or "")) for n in data.get("nodes", []) if n.get("source_file"))
    manifest = folder / "manifest.json"
    if manifest.is_file():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            found.update(_norm(str(k)) for k in data)
    return {f[len(root):] if f.startswith(root) else f for f in found if f}


def under_local(path: str) -> bool:
    return path.startswith("local/") or "/local/" in f"/{path}"


def audit(folder: Path, repo: Path) -> tuple[int, list[Count], list[Count]]:
    files = indexed_files(folder, repo)
    local = sum(1 for f in files if under_local(f))
    corpus = "\n".join(
        (repo / f).read_text(encoding="utf-8", errors="ignore")
        for f in sorted(files)
        if not under_local(f) and (repo / f).is_file() and (repo / f).suffix.lower() not in BINARY
    )
    texts = _texts(folder)

    def count(name: str, rx: re.Pattern[str]) -> Count:
        matches, in_files, untraced = 0, 0, set()
        for _path, text in texts:
            found = [m.group(0) for m in rx.finditer(text)]
            if found:
                in_files += 1
                matches += len(found)
                untraced.update(v for v in found if v not in corpus)
        return Count(name, matches, in_files, len(untraced))

    return local, [count(n, rx) for n, rx in TRACED_CHECKS.items()], [count(n, rx) for n, rx in FOR_REVIEW.items()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folder", nargs="?", default="graphify-out", type=Path)
    parser.add_argument("--repo", default=".", type=Path)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not args.folder.is_dir():
        print(f"No folder {args.folder}.")
        return 2
    local, traced, review = audit(args.folder, args.repo)
    print(f"Files scanned: {sum(1 for _ in args.folder.rglob('*') if _.is_file())}")
    print(f"[{'OK ' if local == 0 else 'BAD'}] indexed files under local/: {local}")
    for c in traced:
        print(f"[{'OK ' if c.untraced == 0 else 'BAD'}] {c.name} not traceable to an indexed file: {c.untraced} "
              f"({c.matches} match(es) in all)")
    for c in review:
        print(f"[REVIEW] {c.name}: {c.matches} in {c.files} file(s); not traceable to an indexed file: {c.untraced}")
    return 1 if local or any(c.untraced for c in traced) else 0


if __name__ == "__main__":
    sys.exit(main())
