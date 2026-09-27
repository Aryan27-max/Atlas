"""How long a run will take (ARCHITECTURE §15). Pure: the caller supplies the numbers.

Three bases, best first:

* **measured** — after 5 résumés of *this* run are scored: an exponentially
  weighted moving average of their scoring times × résumés left. Scoring
  times never include paused time (the clock only runs inside a model call).
* **history** — the median seconds per résumé from earlier runs on this
  machine with this model (the worker records them in ``settings``).
* **precheck** — nothing else known: the model pre-check's duration × résumés,
  shown as a wide range and labelled "Rough estimate".

Hardware calibration (detecting the CPU/GPU and using a table) is Phase 3.
"""

from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass
from typing import Any, Literal, Sequence

Basis = Literal["precheck", "history", "measured"]

# ``settings`` key where the worker keeps recent per-résumé scoring times:
# {model_name: [seconds, …]} (newest last, at most HISTORY_KEEP per model).
TIMING_SETTING = "scoring_seconds"
HISTORY_KEEP = 200

MEASURED_AFTER = 5          # scored résumés in this run before the estimate is "measured"
EWMA_ALPHA = 0.3            # weight of the newest résumé in the moving average

# (low, high) multipliers around the central figure.
RANGE: dict[str, tuple[float, float]] = {
    "precheck": (0.7, 1.5),
    "history": (0.8, 1.3),
    "measured": (0.85, 1.2),
}

LABEL: dict[str, str] = {
    "precheck": "Rough estimate",
    "history": "Based on earlier runs on this computer",
    "measured": "Measured",
}


@dataclass(frozen=True)
class Estimate:
    low_seconds: int
    high_seconds: int
    basis: Basis
    per_resume_seconds: float
    label: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def estimate(
    remaining: int,
    *,
    measured: Sequence[float] = (),
    history: Sequence[float] = (),
    precheck_seconds: float | None = None,
) -> Estimate | None:
    """Estimate the time left for ``remaining`` résumés, or ``None`` if nothing is known.

    ``measured`` is this run's scoring times, oldest first; ``history`` is
    earlier runs' times for the same model; ``precheck_seconds`` is the
    model pre-check's duration.
    """
    if remaining < 0:
        raise ValueError("remaining can't be negative")
    basis: Basis
    if len(measured) >= MEASURED_AFTER:
        per, basis = ewma(measured), "measured"
    elif history:
        per, basis = statistics.median(history), "history"
    elif precheck_seconds and precheck_seconds > 0:
        per, basis = float(precheck_seconds), "precheck"
    else:
        return None
    low, high = RANGE[basis]
    return Estimate(
        low_seconds=round(per * remaining * low),
        high_seconds=round(per * remaining * high),
        basis=basis,
        per_resume_seconds=round(per, 1),
        label=LABEL[basis],
    )


def ewma(values: Sequence[float], alpha: float = EWMA_ALPHA) -> float:
    """Exponentially weighted moving average, oldest first."""
    if not values:
        raise ValueError("no values")
    average = float(values[0])
    for value in values[1:]:
        average = alpha * float(value) + (1 - alpha) * average
    return average


def remember(history: dict[str, list[float]] | None, model: str, seconds: float) -> dict[str, list[float]]:
    """``history`` with one more scoring time for ``model`` (bounded)."""
    updated = {k: list(v) for k, v in (history or {}).items()}
    updated[model] = (updated.get(model, []) + [round(float(seconds), 2)])[-HISTORY_KEEP:]
    return updated
