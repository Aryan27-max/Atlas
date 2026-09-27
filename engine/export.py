"""CSV export (ARCHITECTURE §16).

``export_csv(rows, placements, path, view=…)`` writes one view of a run:
``all``, ``shortlisted``, ``cutoff``, ``rejected`` or ``failed``. It takes
plain data prepared by the caller (candidate rows joined with their
evaluation, and the placements from ``buckets.compute_buckets``) and never
touches the database.

* **Excel-friendly:** UTF-8 with a BOM (so Tamil and Hindi names display
  correctly), CRLF line endings, every cell quoted.
* **Formula injection:** a cell that starts with ``=``, ``+``, ``-``, ``@``,
  tab or CR (after any leading spaces) is prefixed with ``'``, so a name
  like ``=HYPERLINK(…)`` is shown as text instead of being run by Excel.
* **Atomic:** written to a temp file in the same folder, fsynced, then
  renamed over the target. A crash never leaves half a CSV.
"""

from __future__ import annotations

import csv
import errno
import os
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping, Protocol

VIEWS = ("all", "shortlisted", "cutoff", "rejected", "failed")

SUB_SCORES = (("technical", "Technical"), ("projects", "Projects"), ("experience", "Experience"),
              ("achievements", "Achievements"), ("communication", "Communication"),
              ("criteria_fit", "Criteria Fit"))

COLUMNS = (
    "Rank", "RA Number", "Name", "Email", "Phone", "Section", "Department", "CGPA", "Overall Score",
    *(label for _, label in SUB_SCORES),
    "Bucket", "How placed", "Reasons", "Claim mismatches", "Flags", "Failure reason", "Model",
)

BUCKET_LABELS = {"shortlisted": "Shortlisted", "cutoff": "Cutoff", "rejected": "Rejected"}
HOW_PLACED = {"score": "Score", "fill": "Filled to minimum", "override": "Moved by recruiter"}
_DANGEROUS_START = ("=", "+", "-", "@", "\t", "\r")


class PlacementLike(Protocol):
    candidate_id: int
    rank: int
    bucket: str
    reason: str


class ExportError(Exception):
    """The export couldn't be written. ``str(exc)`` is written for the recruiter."""


def export_csv(
    rows: Iterable[Mapping[str, Any]],
    placements: Iterable[PlacementLike],
    path: Path | str,
    *,
    view: str,
) -> int:
    """Write ``view`` to ``path``. Returns the number of candidate rows written."""
    if view not in VIEWS:
        raise ValueError(f"Unknown view {view!r}; choose one of {', '.join(VIEWS)}.")
    placed = {p.candidate_id: p for p in placements}
    selected = _select(list(rows), placed, view)
    columns = [c for c in COLUMNS if view == "all" or c != "Bucket"]
    lines = [[_escape(cell) for cell in _cells(row, placed.get(row["candidate_id"]), columns)] for row in selected]

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=f".{path.stem}-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
            writer.writerow(columns)
            for line in lines:
                writer.writerow(line)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    except PermissionError as exc:
        raise ExportError(f"{path.name} is open in another program. Close it and export again.") from exc
    except OSError as exc:
        if exc.errno == errno.ENOSPC or getattr(exc, "winerror", None) in (39, 112):
            raise ExportError("The disk is full. Free some space and export again.") from exc
        raise
    finally:
        Path(temp).unlink(missing_ok=True)
    return len(lines)


def _select(rows: list[Mapping[str, Any]], placed: Mapping[int, PlacementLike], view: str) -> list[Mapping[str, Any]]:
    scored = sorted(
        (r for r in rows if r["candidate_id"] in placed),
        key=lambda r: (placed[r["candidate_id"]].rank, str(r["ra_number"])),
    )
    if view in BUCKET_LABELS:
        return [r for r in scored if placed[r["candidate_id"]].bucket == view]
    failed = sorted((r for r in rows if r.get("state") == "failed"), key=lambda r: str(r["ra_number"]))
    if view == "failed":
        return failed
    others = sorted(
        (r for r in rows if r["candidate_id"] not in placed and r.get("state") != "failed"),
        key=lambda r: (r.get("state") != "filtered", str(r["ra_number"])),
    )
    return scored + failed + others


def _cells(row: Mapping[str, Any], placement: PlacementLike | None, columns: list[str]) -> list[str]:
    state = row.get("state")
    sub_scores = row.get("sub_scores") or {}
    if placement is not None:
        bucket = BUCKET_LABELS[placement.bucket]
    elif state == "failed":
        bucket = "Failed"
    elif state == "filtered":
        bucket = "Filtered"
    else:
        bucket = "Not scored yet"
    cgpa = row.get("cgpa")
    values = {
        "Rank": str(placement.rank) if placement else "",
        "RA Number": row.get("ra_number") or "",
        "Name": row.get("name") or "",
        "Email": row.get("email") or "",
        "Phone": row.get("phone") or "",
        "Section": row.get("section") or "",
        "Department": row.get("department") or "",
        "CGPA": f"{cgpa:g}" if isinstance(cgpa, (int, float)) else "",
        "Overall Score": "" if row.get("overall_score") is None else str(row["overall_score"]),
        **{label: "" if sub_scores.get(key) is None else str(sub_scores[key]) for key, label in SUB_SCORES},
        "Bucket": bucket,
        "How placed": HOW_PLACED.get(placement.reason, "") if placement else "",
        "Reasons": " | ".join(row.get("reasons") or []),
        "Claim mismatches": " | ".join(row.get("claim_mismatches") or []),
        "Flags": " | ".join(row.get("flags") or []),
        "Failure reason": row.get("failure_reason") or row.get("filter_reason") or "",
        "Model": row.get("model_name") or "",
    }
    return [str(values[c]) for c in columns]


def _escape(cell: str) -> str:
    """Neutralise spreadsheet formulas (CSV/formula injection)."""
    stripped = cell.lstrip(" ")
    if stripped.startswith(_DANGEROUS_START) or cell.startswith(_DANGEROUS_START):
        return "'" + cell
    return cell
