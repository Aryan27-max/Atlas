"""Model pre-check (ARCHITECTURE §13): can this model screen résumés on this machine?

Before a run can start, the chosen model scores one bundled sample résumé
(``sample_resume.txt``, a fictional person). It must return a valid
evaluation within 120 s. The caller caches the result per model name and
digest (``settings``), so this runs once per model, not once per run.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from engine.errors import CandidateError, SystemUnavailable, TransientError
from engine.extract.sections import split_sections
from engine.llm.client import OllamaClient
from engine.llm.redact import scoring_input
from engine.llm.scorer import Scorer

log = logging.getLogger("atlas.llm")

SAMPLE_RESUME = Path(__file__).with_name("sample_resume.txt")
PRECHECK_CRITERIA = "Software engineering interns with solid Python or web development projects."
PRECHECK_TIMEOUT = 120.0

READY = "This model is ready for screening."
CANT_USE = "This model can't be used for screening. Choose another."


@dataclass(frozen=True)
class PrecheckResult:
    ok: bool
    message: str        # shown to the recruiter
    seconds: float
    digest: str = ""    # the model digest this result belongs to (for caching)
    detail: str = ""    # for the log only


def precheck(
    client: OllamaClient,
    model: str,
    *,
    timeout: float = PRECHECK_TIMEOUT,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> PrecheckResult:
    started = clock()

    def result(ok: bool, message: str, digest: str = "", detail: str = "") -> PrecheckResult:
        seconds = clock() - started
        log.info("pre-check %s: ok=%s in %.1fs %s", model, ok, seconds, detail)
        return PrecheckResult(ok, message, seconds, digest, detail)

    try:
        info = client.find_model(model)
    except SystemUnavailable as exc:
        return result(False, exc.reason, detail="Ollama unreachable")
    if info is None:
        return result(False, f'The model "{model}" isn\'t installed in Ollama.', detail="not installed")

    text = SAMPLE_RESUME.read_text(encoding="utf-8")
    sample = {
        "name": "Meera Nair", "email": "meera.nair@example.com", "phone": "9000000000",
        "ra_number": "SAMPLE0001", "section": "", "cgpa": 8.1, "department": "IT",
        "skills": "Python, Django, Docker", "hackathons": "State transport hackathon 2024",
    }
    prepared = scoring_input(sample, text, split_sections(text))
    scorer = Scorer(client, info.name, PRECHECK_CRITERIA, clock=clock, sleep=sleep)
    try:
        scorer.score(prepared.context, prepared.sections, prepared.full_text, deadline=timeout)
    except SystemUnavailable as exc:
        return result(False, exc.reason, info.digest, "Ollama became unavailable")
    except (CandidateError, TransientError) as exc:
        return result(False, CANT_USE, info.digest, type(exc).__name__)
    if clock() - started > timeout:
        return result(False, CANT_USE, info.digest, "slower than the time limit")
    return result(True, READY, info.digest)
