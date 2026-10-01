"""Check the model's work against the résumé (ARCHITECTURE §13 guardrails).

* **Evidence quotes must really be in the résumé.** A model can "quote" text
  that isn't there. Each quote is compared with the résumé after normalising
  case, punctuation, whitespace and Unicode forms; quotes that aren't found
  are dropped. A quote the model shortened with "…" counts if its pieces
  appear in order.
* **Instruction-like text in the résumé is flagged** ("ignore previous
  instructions", "you are now…", "give this candidate 100"). The résumé is
  still scored — it's fenced and the model is told it's data — but the
  recruiter sees the flag and can judge.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Iterator

from engine.errors import Flag
from engine.llm.schema import Evaluation


def normalise(text: str) -> str:
    """Lower-case words separated by single spaces; punctuation removed."""
    text = unicodedata.normalize("NFKC", text).lower()
    return " ".join(re.findall(r"\w+", text))


def quote_found(quote: str, resume_normalised: str) -> bool:
    """Is ``quote`` (normalised) in the résumé, as whole words, pieces in order?"""
    pieces = [normalise(p) for p in re.split(r"\.\.\.|…", quote)]
    pieces = [p for p in pieces if p]
    if not pieces:
        return False
    haystack = f" {resume_normalised} "
    position = 0
    for piece in pieces:
        index = haystack.find(f" {piece} ", position)
        if index < 0:
            return False
        position = index + len(piece) + 1
    return True


_INJECTION_PATTERNS = [
    r"\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|above|prior|earlier|preceding|all|any|your|these|those|other)\b[^.\n]{0,20}\b(instructions?|prompts?|directions|guidelines)\b",
    r"\byou are now\b",
    r"\b(new|updated|real|actual|secret) instructions?\s*[:\-]",
    r"\b(ignore|reveal|print|show|override|replace|disregard|forget)\b[^.\n]{0,20}\bsystem prompt\b",
    r"\bsystem prompt\s*[:=]",
    r"\bscore (this|me|my|the) (candidate|resume|résumé|applicant|cv|profile|student)\b",
    r"\b(give|assign|award|rate)\b[^.\n]{0,30}\b(this|me|the) (candidate|resume|résumé|applicant|cv|profile|student)\b[^.\n]{0,40}(\b100\b|\bperfect\b|\bmaximum\b|\bhighest\b|\btop\b|10/10)",
    r"\b(give|assign|award)\b[^.\n]{0,20}\b(a )?(score|rating) of (100|9\d)\b",
    r"\b(shortlist|select|hire|accept) (this|me|the) (candidate|applicant|student)\b",
    r"\b(dear|hey|hello|attention|note to)[, ]+(the )?(ai|llm|language model|chatgpt|gpt|assistant|screener|screening (bot|model|system|tool)|ats|recruiter bot|model)\b",
    r"\b(ai|llm|language model|chatgpt|gpt|screener|ats)\b[, ]+(please|you must|you should|you will)\b",
    r"<\s*/?\s*(system|assistant|resume|instructions?)\s*>",
    r"\[\s*/?\s*(system|inst)\s*\]",
    r"(?m)^\s*(system|assistant)\s*:",
]
_INJECTION = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]


def detect_injection(text: str) -> bool:
    """True if the text contains something that reads like instructions to an AI."""
    flat = unicodedata.normalize("NFKC", text)
    return any(pattern.search(flat) for pattern in _INJECTION)


@dataclass(frozen=True)
class Review:
    """What :func:`review` kept and dropped. Unpacks as ``(evaluation, flags)``."""

    evaluation: Evaluation
    flags: list[str]
    quotes_not_found: int = 0       # not in the résumé (paraphrased or invented)
    quotes_duplicate: int = 0       # the same quote used again for another claim
    mismatches_dropped: int = 0     # named something the student never claimed

    def __iter__(self) -> Iterator[Any]:
        return iter((self.evaluation, self.flags))


def review(evaluation: Evaluation, resume_text: str, claims: str | None = None) -> Review:
    """Drop evidence whose quote isn't in the résumé (or repeats one already
    kept), drop claim mismatches about things the student never claimed, and
    flag instruction-like text.

    ``claims`` is the student's own form text (skills + hackathons). A
    mismatch may only name one of those claims (smoke test 1: the model listed
    the recruiter's criteria as "claims"). ``None`` skips that check.
    """
    haystack = normalise(resume_text)
    kept = []
    seen: set[str] = set()
    not_found = duplicates = 0
    for item in evaluation.evidence:
        key = normalise(item.quote)
        if key in seen:
            duplicates += 1
            continue
        if not quote_found(item.quote, haystack):
            not_found += 1
            continue
        seen.add(key)
        kept.append(item)
    mismatches = list(evaluation.claim_mismatches)
    if claims is not None:
        mismatches = [m for m in mismatches if names_a_claim(m, claims)]
    flags = [Flag.INJECTION] if detect_injection(resume_text) else []
    cleaned = evaluation.model_copy(update={"evidence": kept, "claim_mismatches": mismatches})
    return Review(cleaned, flags, not_found, duplicates, len(evaluation.claim_mismatches) - len(mismatches))


def _compact(text: str) -> str:
    return re.sub(r"[^a-z0-9+#]", "", unicodedata.normalize("NFKC", text).lower())


def names_a_claim(mismatch: str, claims: str) -> bool:
    """Does ``mismatch`` name one of the student's claimed items?

    Fuzzy on spelling: "NodeJS" matches "Node.js", "C++" matches "c++", and
    short claims ("Go", "C") must appear as a whole word.
    """
    items = [c.strip() for c in re.split(r"[,;|/\n]", claims) if c.strip()]
    if not items:
        return False
    compact = _compact(mismatch)
    words = set(re.findall(r"[a-z0-9+#]+", unicodedata.normalize("NFKC", mismatch).lower()))
    for item in items:
        key = _compact(item)
        if not key:
            continue
        if len(key) >= 4 and key in compact:
            return True
        if len(key) < 4 and key in words:
            return True
    return False
