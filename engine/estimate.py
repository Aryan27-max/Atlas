"""How long a run will take (ARCHITECTURE §15). Pure: the caller supplies the numbers.

Three bases, best first:

* **measured** — after 5 résumés of *this* run are scored: an exponentially
  weighted moving average of their scoring times × résumés left. Scoring
  times never include paused time (the clock only runs inside a model call).
* **history** — the median seconds per résumé from earlier runs on this
  machine with this model (the worker records them in ``settings``).
* **precheck** — the model pre-check's duration × résumés, shown as a wide
  range and labelled "Rough estimate".
* **hardware** *(Phase 3)* — nothing at all is known yet (no pre-check, no
  history): a small table of seconds per résumé for an 8B model by kind of
  computer. Rough, replaced by measurement as soon as there is one. The CPU
  figure comes from smoke test 1 (median 141.5 s on a 16-core Intel laptop
  without a usable GPU); the others are conservative guesses to be replaced by
  the owner's own measurements.

``long_run`` is true when the middle of the range is over 4 hours, so the app
can suggest running it overnight, plugged in (a setting can turn this off).
"""

from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass
from typing import Any, Literal, Sequence

Basis = Literal["precheck", "history", "measured", "hardware"]

# Seconds per résumé for an 8B model when nothing has been measured (see above).
HARDWARE_PRIOR: dict[str, float] = {"cpu": 140.0, "apple_silicon": 35.0, "gpu": 15.0}
LONG_RUN_SECONDS = 4 * 3600

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
    "hardware": (0.5, 2.0),
}

LABEL: dict[str, str] = {
    "precheck": "Rough estimate",
    "history": "Based on earlier runs on this computer",
    "measured": "Measured",
    "hardware": "Rough estimate from this computer's hardware",
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

    @property
    def long_run(self) -> bool:
        """The middle of the range is over 4 hours."""
        return (self.low_seconds + self.high_seconds) / 2 > LONG_RUN_SECONDS


def estimate(
    remaining: int,
    *,
    measured: Sequence[float] = (),
    history: Sequence[float] = (),
    precheck_seconds: float | None = None,
    hardware: str | None = None,
) -> Estimate | None:
    """Estimate the time left for ``remaining`` résumés, or ``None`` if nothing is known.

    ``measured`` is this run's scoring times, oldest first; ``history`` is
    earlier runs' times for the same model; ``precheck_seconds`` is the
    model pre-check's duration; ``hardware`` is the kind of computer
    (``hardware.Hardware.kind``), used only when nothing else is known.
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
    elif hardware in HARDWARE_PRIOR:
        per, basis = HARDWARE_PRIOR[hardware], "hardware"
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
