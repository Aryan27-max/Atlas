"""Keep the student's identity away from the model (CLAUDE.md rule 9).

Two layers:

1. **Types.** :class:`CandidateContext` is the *only* candidate data the
   prompt builder accepts, and it has no field for name, email, phone, RA
   number or section. They cannot be passed by mistake.
2. **Text.** The résumé itself contains the student's name and contact
   details. :func:`scoring_input` takes the full candidate row once, drops the
   ``header`` and ``personal`` sections entirely, and redacts the known
   identity values plus anything that looks like an email or phone number
   from everything else. The identity values go no further than this module.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

from engine.extract.sections import PROMPT_PRIORITY, split_sections

# Sections that never reach the model.
NEVER_SENT = frozenset({"header", "personal"})

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Phone-like: optional +country code, then digits with at most one separator
# between groups; 10–13 digits in total (checked in _phone_sub).
_PHONE = re.compile(r"(?<![\w/])(?:\+\d{1,3}[\s.-]?)?\(?\d{2,5}\)?(?:[\s.-]?\d{2,5}){1,4}(?![\w/])")


@dataclass(frozen=True)
class CandidateContext:
    """What the model may know about the candidate besides the résumé.

    Skills and hackathons are the student's own claims from the form, to be
    checked against the résumé, not believed.
    """

    cgpa: float | None
    department: str
    skills: str
    hackathons: str


@dataclass(frozen=True)
class ScoringInput:
    context: CandidateContext
    sections: dict[str, str]    # redacted; header and personal removed
    full_text: str              # the redacted sections joined: what the model can quote


@dataclass(frozen=True)
class _Identity:
    name: str
    email: str
    phone: str
    ra_number: str
    section: str


def scoring_input(candidate: Mapping[str, Any], text: str, sections: Mapping[str, str] | None) -> ScoringInput:
    """Everything the scorer needs, with identity removed.

    ``candidate`` is a full candidate row (as stored in the database);
    ``sections`` may be ``None`` for older rows, in which case the text is split again.
    """
    identity = _Identity(
        name=str(candidate.get("name") or ""),
        email=str(candidate.get("email") or ""),
        phone=str(candidate.get("phone") or ""),
        ra_number=str(candidate.get("ra_number") or ""),
        section=str(candidate.get("section") or ""),
    )
    raw_sections = dict(sections) if sections else split_sections(text)
    clean = {
        name: redacted
        for name, body in raw_sections.items()
        if name not in NEVER_SENT and (redacted := redact(body, identity).strip())
    }
    order = [n for n in PROMPT_PRIORITY if n in clean] + [n for n in clean if n not in PROMPT_PRIORITY]
    cgpa = candidate.get("cgpa")
    context = CandidateContext(
        cgpa=float(cgpa) if cgpa not in (None, "") else None,
        department=redact(str(candidate.get("department") or ""), identity),
        skills=redact(str(candidate.get("skills") or ""), identity),
        hackathons=redact(str(candidate.get("hackathons") or ""), identity),
    )
    return ScoringInput(context, {n: clean[n] for n in order}, "\n\n".join(clean[n] for n in order))


def redact(text: str, identity: _Identity) -> str:
    """Replace identity values and email/phone look-alikes with placeholders."""
    if not text:
        return text
    if identity.email:
        text = re.sub(re.escape(identity.email), "[email]", text, flags=re.IGNORECASE)
    text = _EMAIL.sub("[email]", text)

    digits = re.sub(r"\D", "", identity.phone)
    if len(digits) >= 7:
        spaced = r"[\s().-]{0,2}".join(re.escape(d) for d in digits)
        text = re.sub(rf"(?<!\d)(?:\+?\d{{1,3}}[\s-]?)?{spaced}(?!\d)", "[phone]", text)
    text = _PHONE.sub(_phone_sub, text)

    if identity.ra_number:
        text = re.sub(rf"(?<!\w){re.escape(identity.ra_number)}(?!\w)", "[id]", text, flags=re.IGNORECASE)
    # A class section like "K2" or "A1". Plain letters ("A", "CSE") would erase
    # ordinary words, and a section isn't identifying on its own.
    if len(identity.section) >= 2 and re.search(r"\d", identity.section):
        text = re.sub(rf"(?<!\w){re.escape(identity.section)}(?!\w)", "[section]", text, flags=re.IGNORECASE)

    name = " ".join(identity.name.split())
    if name:
        full = r"\s+".join(re.escape(part) for part in name.split())
        text = re.sub(rf"(?<!\w){full}(?!\w)", "[name]", text, flags=re.IGNORECASE)
        for part in sorted(set(name.split()), key=len, reverse=True):
            part = part.strip(".,")
            if len(part) >= 3 and part.isalpha():
                text = re.sub(rf"(?<![^\W_]){re.escape(part)}(?![^\W_])", "[name]", text, flags=re.IGNORECASE)
    return text


def _phone_sub(match: re.Match[str]) -> str:
    value = match.group(0)
    count = sum(c.isdigit() for c in value)
    if 10 <= count <= 13 and not re.fullmatch(r"(19|20)\d\d\s*[-–]\s*(19|20)\d\d", value.strip()):
        return "[phone]"
    return value
