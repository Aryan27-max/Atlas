"""Score one résumé: prompt → Ollama → validate → verify, with retries (ARCHITECTURE §13).

Guardrails, in the order they're checked on every answer:

1. ``done_reason == "length"`` (answer cut off) → retry with ``num_predict``
   doubled, up to 4096.
2. JSON invalid or outside the contract → retry; 3 attempts in total with
   1 s / 3 s back-off.
3. Every evidence quote fake → retry once.
4. ``overall_score ≥ 85`` with no surviving evidence → retry once; if it
   happens again, keep the score and flag it for the recruiter.

If no attempt produced a valid evaluation, the candidate fails as
``retryable`` ("The model's answer couldn't be read."). If a later retry
fails but an earlier answer was valid, the earlier answer is used.

Ollama being unreachable is *not* handled here: ``SystemUnavailable`` and
``TransientError`` propagate so the worker can pause the run.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable, Mapping

from engine.errors import CandidateError, Flag, Reason
from engine.llm.client import ChatDeadline, ChatResult, OllamaClient
from engine.llm.prompt import Prompt, build_prompt, resume_budget_chars
from engine.llm.redact import CandidateContext
from engine.llm.schema import Evaluation, EvaluationParseError, evaluation_json_schema, parse_evaluation
from engine.llm.verify import detect_injection, review

log = logging.getLogger("atlas.llm")

START_NUM_PREDICT = 1024
MAX_NUM_PREDICT = 4096
MAX_PARSE_ATTEMPTS = 3
BACKOFF_SECONDS = (1.0, 3.0)
HIGH_SCORE = 85
NUM_CTX_CAP = 8192          # a laptop can't afford a 128k KV cache; 8k fits a 10-page résumé's key sections
MAX_CALLS = 8               # hard bound on model calls for one résumé

SCHEMA = evaluation_json_schema()


@dataclass(frozen=True)
class ScoreResult:
    evaluation: Evaluation          # evidence already verified
    flags: tuple[str, ...]
    raw_response: str               # the accepted answer, for SQLite only
    prompt_hash: str
    model: str
    duration_seconds: float
    attempts: int
    included_sections: tuple[str, ...]
    trimmed_sections: tuple[str, ...]


class Scorer:
    def __init__(
        self,
        client: OllamaClient,
        model: str,
        criteria: str,
        *,
        num_ctx_cap: int = NUM_CTX_CAP,
        start_num_predict: int = START_NUM_PREDICT,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.client = client
        self.model = model
        self.criteria = criteria
        self._num_ctx_cap = num_ctx_cap
        self._start_num_predict = start_num_predict
        self._clock = clock
        self._sleep = sleep
        self._num_ctx: int | None = None

    def score(
        self,
        candidate_context: CandidateContext,
        sections: Mapping[str, str],
        full_text: str,
        *,
        deadline: float | None = None,
    ) -> ScoreResult:
        """Score a résumé. ``full_text`` is the redacted text the model can quote.

        ``deadline`` (seconds) bounds the whole call; used by the pre-check.
        """
        started = self._clock()
        num_ctx = self._context_size()
        num_predict = self._start_num_predict
        fixed_chars = len(build_prompt(candidate_context, {}, self.criteria, budget_chars=0).text)
        claims = f"{candidate_context.skills}\n{candidate_context.hackathons}"
        suspicious = detect_injection(f"{full_text}\n{claims}")

        calls = parse_failures = 0
        retried_fake = retried_high = False
        best: tuple[Evaluation, ChatResult, Prompt] | None = None

        while calls < MAX_CALLS:
            prompt = build_prompt(
                candidate_context, sections, self.criteria,
                budget_chars=resume_budget_chars(num_ctx, num_predict, fixed_chars),
            )
            remaining = None if deadline is None else deadline - (self._clock() - started)
            if remaining is not None and remaining <= 0:
                raise ChatDeadline("ollama", Reason.MODEL_STOPPED, "time limit reached")
            result = self.client.chat_json(
                prompt, SCHEMA, model=self.model, num_ctx=num_ctx, num_predict=num_predict, timeout=remaining
            )
            calls += 1

            if result.done_reason == "length" and num_predict < MAX_NUM_PREDICT:
                num_predict = min(num_predict * 2, MAX_NUM_PREDICT)
                log.info("answer cut off; retrying with num_predict=%d", num_predict)
                continue

            try:
                evaluation = parse_evaluation(result.content)
            except EvaluationParseError as exc:
                parse_failures += 1
                log.info("unreadable answer (%s), attempt %d of %d", exc, parse_failures, MAX_PARSE_ATTEMPTS)
                if parse_failures >= MAX_PARSE_ATTEMPTS:
                    break
                self._sleep(BACKOFF_SECONDS[min(parse_failures, len(BACKOFF_SECONDS)) - 1])
                continue

            cleaned, _ = review(evaluation, full_text)
            dropped = len(evaluation.evidence) - len(cleaned.evidence)
            if dropped:
                log.info("dropped %d of %d evidence quotes not found in the résumé", dropped, len(evaluation.evidence))
            best = (cleaned, result, prompt)

            if evaluation.evidence and not cleaned.evidence and not retried_fake:
                retried_fake = True
                continue
            if cleaned.overall_score >= HIGH_SCORE and not cleaned.evidence and not retried_high:
                retried_high = True
                continue
            break

        if best is None:
            raise CandidateError("retryable", Reason.MODEL_UNREADABLE)

        evaluation, result, prompt = best
        flags: list[str] = []
        if suspicious:
            flags.append(Flag.INJECTION)
        if evaluation.overall_score >= HIGH_SCORE and not evaluation.evidence:
            flags.append(Flag.UNSUPPORTED_HIGH_SCORE)
        return ScoreResult(
            evaluation=evaluation,
            flags=tuple(flags),
            raw_response=result.content,
            prompt_hash=prompt.prompt_hash,
            model=self.model,
            duration_seconds=self._clock() - started,
            attempts=calls,
            included_sections=prompt.included_sections,
            trimmed_sections=prompt.trimmed,
        )

    def _context_size(self) -> int:
        if self._num_ctx is None:
            self._num_ctx = min(self.client.model_context_length(self.model), self._num_ctx_cap)
        return self._num_ctx
