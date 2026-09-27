"""Hard filters (CGPA, department): one definition for the worker and the app.

The worker applies them when a run leaves draft; the app previews how many
students each filter would remove, live, before the run starts. Both call
:func:`filter_reason`, so the preview can never disagree with the run.
Pure: no database, no I/O.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


def department_key(value: str) -> str:
    """"C.S.E." == "cse" == "CSE" (letters and digits only, upper-case)."""
    return re.sub(r"[^0-9A-Za-z]", "", value).upper()


def filter_reason(
    cgpa: float | None,
    department: str,
    *,
    cgpa_min: float | None,
    departments: Sequence[str] | None,
) -> str | None:
    """Why this student is removed before scoring, or ``None`` to keep them.

    A missing CGPA or department never removes anyone: the filter can only
    act on what the student actually reported.
    """
    allowed = {department_key(d) for d in departments or () if department_key(d)}
    if cgpa_min is not None and cgpa is not None and cgpa < cgpa_min:
        return f"CGPA {cgpa:g} is below the minimum of {cgpa_min:g}."
    if allowed and department and department_key(department) not in allowed:
        return f"Department {department} isn't one of the selected departments ({', '.join(departments or ())})."
    return None


@dataclass(frozen=True)
class FilterPreview:
    total: int
    removed: int
    removed_by_cgpa: int
    removed_by_department: int
    remaining: int


def preview(
    rows: Iterable[Mapping[str, Any]], *, cgpa_min: float | None, departments: Sequence[str] | None
) -> FilterPreview:
    """How many of ``rows`` (each with ``cgpa`` and ``department``) the filters remove."""
    total = by_cgpa = by_department = 0
    for row in rows:
        total += 1
        reason = filter_reason(row.get("cgpa"), str(row.get("department") or ""),
                               cgpa_min=cgpa_min, departments=departments)
        if reason is None:
            continue
        if reason.startswith("CGPA"):
            by_cgpa += 1
        else:
            by_department += 1
    removed = by_cgpa + by_department
    return FilterPreview(total, removed, by_cgpa, by_department, total - removed)


def department_counts(rows: Iterable[Mapping[str, Any]]) -> list[tuple[str, int]]:
    """Departments in the file, most students first, spelled the way most rows spell them.

    "CSE", "C.S.E." and "cse" are one department (same key as the filter).
    """
    counts: Counter[str] = Counter()
    spellings: dict[str, Counter[str]] = {}
    for row in rows:
        name = " ".join(str(row.get("department") or "").split())
        key = department_key(name)
        if not key:
            continue
        counts[key] += 1
        spellings.setdefault(key, Counter())[name] += 1
    return [(spellings[key].most_common(1)[0][0], n)
            for key, n in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]
