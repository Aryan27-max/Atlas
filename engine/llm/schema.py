"""The model's output contract (ARCHITECTURE §13), validated with Pydantic.

``extra="forbid"`` everywhere: a key the model invents is a validation
failure, not something silently stored. Scores are whole numbers 0–100;
``true``/``false`` are not numbers here, even though Python thinks so.

``evaluation_json_schema()`` is the same contract as a plain JSON schema
(no ``$ref``), passed to Ollama as ``format`` so the model is constrained to
produce it in the first place.
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
    claim: Text
    quote: Text


class Evaluation(_Strict):
    overall_score: Score
    sub_scores: SubScores
    summary: str = Field(max_length=800)
    reasons: list[Text] = Field(min_length=1, max_length=10)
    evidence: list[Evidence] = Field(max_length=12)
    claim_mismatches: list[Text] = Field(max_length=20)


class EvaluationParseError(Exception):
    """The model's reply isn't a valid evaluation. Carries no reply text (it may hold résumé content)."""


def parse_evaluation(content: str) -> Evaluation:
    """Parse and validate the model's reply.

    Tolerates what models commonly wrap around JSON: Markdown code fences and
    a sentence before or after. Anything else is an :class:`EvaluationParseError`.
    """
    data = _load_json_object(content)
    try:
        return Evaluation.model_validate(data)
    except ValidationError as exc:
        # Report *where* it failed, never the values.
        where = ", ".join(".".join(str(p) for p in err["loc"]) or "root" for err in exc.errors()[:5])
        raise EvaluationParseError(f"invalid fields: {where}") from None


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
