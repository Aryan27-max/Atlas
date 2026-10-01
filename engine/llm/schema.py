"""The model's output contract (ARCHITECTURE §13), validated with Pydantic.

``extra="forbid"`` everywhere: a key the model invents is a validation
failure, not something silently stored. Scores are whole numbers 0–100;
``true``/``false`` are not numbers here, even though Python thinks so.

``evaluation_json_schema()`` is the same contract as a plain JSON schema
(no ``$ref``), passed to Ollama as ``format`` so the model is constrained to
produce it in the first place.

**Output caps (Phase 3, step 3.1c).** Generation time grows with the length
of the answer (smoke test 1: 2 quotes ≈ 115 s, 12 quotes ≈ 210 s on a CPU),
so the answer is capped: at most 5 evidence items with quotes of 20 words or
fewer, at most 4 reasons of 25 words or fewer, at most 5 claim mismatches,
and a two-sentence summary. The caps are ``maxItems``/``maxLength`` in the
schema (Ollama's grammar enforces them while generating) and are repeated in
the prompt. A model that ignores the schema loses the extra items, not the
whole answer (:func:`parse_evaluation` clips lists before validating).
"""

from __future__ import annotations

import json
import re
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError


def _not_bool(value: Any) -> Any:
    if isinstance(value, bool):
        raise ValueError("a score must be a number, not true/false")
    return value


# Field before the validator: the other order writes "ge"/"le" into the JSON
# schema instead of "minimum"/"maximum", and Ollama would see no range at all.
Score = Annotated[int, Field(ge=0, le=100), BeforeValidator(_not_bool)]
Text = Annotated[str, Field(min_length=1, max_length=600)]

# Caps (characters ≈ words × 8, so the grammar bound matches the word rule).
MAX_EVIDENCE = 5
MAX_REASONS = 4
MAX_MISMATCHES = 5
QUOTE_WORDS = 20
REASON_WORDS = 25
Quote = Annotated[str, Field(min_length=1, max_length=QUOTE_WORDS * 8)]
Claim = Annotated[str, Field(min_length=1, max_length=120)]
ReasonText = Annotated[str, Field(min_length=1, max_length=REASON_WORDS * 8)]
Mismatch = Annotated[str, Field(min_length=1, max_length=120)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SubScores(_Strict):
    technical: Score
    projects: Score
    experience: Score
    achievements: Score
    communication: Score
    criteria_fit: Score


class Evidence(_Strict):
    claim: Claim
    quote: Quote


class Evaluation(_Strict):
    overall_score: Score
    sub_scores: SubScores
    summary: str = Field(max_length=320)
    reasons: list[ReasonText] = Field(min_length=1, max_length=MAX_REASONS)
    evidence: list[Evidence] = Field(max_length=MAX_EVIDENCE)
    claim_mismatches: list[Mismatch] = Field(max_length=MAX_MISMATCHES)


class EvaluationParseError(Exception):
    """The model's reply isn't a valid evaluation. Carries no reply text (it may hold résumé content)."""


def parse_evaluation(content: str) -> Evaluation:
    """Parse and validate the model's reply.

    Tolerates what models commonly wrap around JSON: Markdown code fences and
    a sentence before or after. Anything else is an :class:`EvaluationParseError`.
    """
    data = _clip(_load_json_object(content))
    try:
        return Evaluation.model_validate(data)
    except ValidationError as exc:
        # Report *where* it failed, never the values.
        where = ", ".join(".".join(str(p) for p in err["loc"]) or "root" for err in exc.errors()[:5])
        raise EvaluationParseError(f"invalid fields: {where}") from None


_LIST_CAPS = {"evidence": MAX_EVIDENCE, "reasons": MAX_REASONS, "claim_mismatches": MAX_MISMATCHES}


def _clip(data: dict[str, Any]) -> dict[str, Any]:
    """Keep the first N items of each capped list (the model ranks its own)."""
    for key, cap in _LIST_CAPS.items():
        if isinstance(data.get(key), list) and len(data[key]) > cap:
            data[key] = data[key][:cap]
    return data


def _load_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    candidates = [text]
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        candidates.append(fenced.group(1).strip())
    start, end = text.find("{"), text.rfind("}")
    if 0 <= start < end:
        candidates.append(text[start:end + 1])
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(data, dict):
            return data
    raise EvaluationParseError("reply is not a JSON object")


def evaluation_json_schema() -> dict[str, Any]:
    """The contract as a self-contained JSON schema (``$ref``s inlined, titles dropped)."""
    schema = Evaluation.model_json_schema()
    definitions = schema.pop("$defs", {})

    def inline(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return inline(definitions[node["$ref"].rsplit("/", 1)[-1]])
            return {k: inline(v) for k, v in node.items() if k != "title"}
        if isinstance(node, list):
            return [inline(item) for item in node]
        return node

    return inline(schema)
