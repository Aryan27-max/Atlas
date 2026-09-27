"""Split résumé text into named sections (ARCHITECTURE §12).

QWENTUS sent the model the first 2,500 characters of a résumé, about half a
page, so page 3 of a 5-page résumé was never read. With sections, the prompt
builder picks the parts that matter (Projects, Experience, Skills, …) from
*anywhere* in the document.

Headings are recognised on short lines, in any of the forms students use::

    PROJECTS            Projects:           ■ Projects          — SKILLS —
    P R O J E C T S     SKILLS: Python, Go  EDUCATION | SKILLS  Honors & Awards

Rules:

* Text before the first heading is ``header`` (name and contact details).
  It is never sent to the model.
* If no heading is found at all, everything goes to ``other``, because there
  is no way to tell the contact block from the rest.
* A heading the list doesn't know is not detected, so its lines stay in the
  section above. Known-but-unimportant headings (Hobbies, Languages…) go to
  ``other``; Personal Details / Declaration go to ``personal``, which is
  never sent to the model (date of birth, gender, religion: bias risks).
* Some words are also ordinary résumé lines ("Leadership" in a skills list).
  These *weak* headings only count when written like a heading: ALL CAPS,
  with a trailing colon, or with a decoration in front.
* Two headings on one line ("EDUCATION | SKILLS", "Awards & Certifications")
  belong to the more important one (``PROMPT_PRIORITY``), so the text lands
  where the prompt builder looks first. Nothing is dropped.
* Inside an item list (Projects, Experience, …) a skills-type label such as
  "Tech Stack: React" or "Skills: Python" describes *that item*; it does not
  start a new section.
"""

from __future__ import annotations

import re

SECTION_NAMES = (
    "header", "summary", "education", "experience", "projects", "skills", "achievements",
    "certifications", "hackathons", "positions", "publications", "personal", "other",
)

# Order the prompt builder fills its budget in (ARCHITECTURE §13).
# header and personal are deliberately absent: they never reach the model.
PROMPT_PRIORITY = (
    "projects", "experience", "skills", "achievements", "hackathons", "certifications",
    "education", "positions", "publications", "summary", "other",
)

_STRONG: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "professional summary", "career summary", "profile summary", "career objective",
                "objective", "about me", "professional profile"),
    "education": ("education", "academic details", "academics", "educational qualifications",
                  "educational qualification", "academic qualifications", "education details",
                  "academic background", "educational background", "education and training"),
    "experience": ("experience", "work experience", "professional experience", "internships", "internship",
                   "internship experience", "internships and trainings", "employment", "employment history",
                   "work history", "industrial experience", "industry experience", "relevant experience"),
    "projects": ("projects", "project", "academic projects", "personal projects", "key projects",
                 "major projects", "mini projects", "project work", "projects undertaken", "technical projects",
                 "project experience", "selected projects", "notable projects", "side projects"),
    "skills": ("skills", "technical skills", "key skills", "core skills", "skill set", "skillset",
               "technical proficiency",
               "programming languages", "soft skills", "areas of expertise", "core competencies",
               "skills and tools", "technical expertise"),
    "achievements": ("achievements", "awards", "awards and achievements", "achievements and awards",
                     "honors", "honours", "honors and awards", "honours and awards", "accomplishments",
                     "recognitions", "awards and recognitions", "scholastic achievements", "key achievements"),
    "certifications": ("certifications", "certificates", "certification", "online courses",
                       "courses and certifications", "licenses and certifications", "trainings",
                       "workshops", "certifications and trainings", "relevant coursework", "coursework"),
    "hackathons": ("hackathons", "hackathon", "hackathons and competitions", "coding competitions",
                   "competitive programming", "hackathon experience"),
    "positions": ("positions of responsibility", "position of responsibility", "leadership experience",
                  "extracurricular activities", "extra curricular activities", "extra-curricular activities",
                  "extracurriculars", "co curricular activities", "co-curricular activities",
                  "volunteering", "volunteer experience", "clubs and societies", "leadership and activities"),
    "publications": ("publications", "research papers", "research publications", "papers published",
                     "research experience"),
    "personal": ("personal details", "personal information", "personal profile", "personal data",
                 "declaration"),
    "other": ("hobbies", "interests", "hobbies and interests", "languages known", "references",
              "additional information", "strengths"),
}

# Words that are headings only when they look like one (see module docstring).
_WEAK: dict[str, tuple[str, ...]] = {
    "summary": ("profile", "about"),
    "skills": ("technologies", "tech stack", "tools and technologies", "tools"),
    "certifications": ("courses", "training"),
    "hackathons": ("competitions",),
    "positions": ("leadership", "responsibilities", "activities"),
    "publications": ("research", "papers"),
    "other": ("languages",),
}


def _norm(text: str) -> str:
    text = text.lower().replace("&", " and ").replace("’", "").replace("'", "")
    return re.sub(r"\s+", " ", text).strip()


_LOOKUP: dict[str, tuple[str, bool]] = {}
for _name, _phrases in _STRONG.items():
    for _phrase in _phrases:
        _LOOKUP[_norm(_phrase)] = (_name, False)
for _name, _phrases in _WEAK.items():
    for _phrase in _phrases:
        _LOOKUP.setdefault(_norm(_phrase), (_name, True))

# Sections made of items (one project, one internship…). Skills-type labels
# inside them belong to the item.
_ITEM_SECTIONS = frozenset({"projects", "experience", "hackathons", "positions"})

_MAX_HEADING_WORDS = 6
_MAX_HEADING_CHARS = 60
_RANK = {name: i for i, name in enumerate(PROMPT_PRIORITY)}
_INLINE = re.compile(r"^([A-Za-z][A-Za-z &/'’-]{1,40}?)\s*[:：]\s*(\S.*)$")


def split_sections(text: str) -> dict[str, str]:
    """``{section_name: text}`` with only non-empty sections, in document order."""
    blocks: dict[str, list[str]] = {}
    current = "header"
    found = False
    for line in text.splitlines():
        match = match_heading(line, current)
        if match is None:
            blocks.setdefault(current, []).append(line)
            continue
        name, rest = match
        found = True
        current = name
        lines = blocks.setdefault(name, [])
        if lines:
            lines.append("")          # a second block of the same section
        if rest:
            lines.append(rest)

    if not found:
        return {"other": text.strip()} if text.strip() else {}
    result: dict[str, str] = {}
    for name, lines in blocks.items():
        body = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
        if body:
            result[name] = body
    return result


def match_heading(line: str, current: str = "header") -> tuple[str, str] | None:
    """``(section, rest_of_line)`` if ``line`` starts a section, else ``None``.

    ``current`` is the section the line would otherwise belong to.
    """
    found = _match(line)
    if found is None:
        return None
    name, rest, label_like = found
    if name == "skills" and label_like and current in _ITEM_SECTIONS:
        return None       # "Tech Stack: React" inside a project describes the project
    return name, rest


def _match(line: str) -> tuple[str, str, bool] | None:
    """``(section, rest, label_like)``; ``label_like`` marks inline or weak matches."""
    stripped = line.strip()
    if not stripped or len(stripped) > 120:
        return None

    # Decoration: anything before the first letter (bullets, icons, dashes, #).
    core = re.sub(r"^[^\w]+", "", stripped)
    decorated = core != stripped
    core = re.sub(r"[^\w)]+$", "", core)          # trailing ":", "—", "•", "---"
    has_colon = bool(re.search(r"[:：]\s*$", stripped))
    if re.fullmatch(r"(?:[A-Za-z] )+[A-Za-z]", core):  # letter-spaced: "P R O J E C T S"
        core = core.replace(" ", "")
    if not core:
        return None
    letters = [c for c in core if c.isalpha()]
    all_caps = bool(letters) and all(c.isupper() for c in letters)
    looks_like_heading = all_caps or has_colon or decorated

    if len(core) <= _MAX_HEADING_CHARS and len(core.split()) <= _MAX_HEADING_WORDS:
        entry = _lookup(core, looks_like_heading)
        if entry:
            return entry[0], "", entry[1]
        parts = [p for p in re.split(r"\s*[|/,•·]\s*|\s{2,}|\t|\s+and\s+|\s*&\s*", core) if p.strip()]
        if len(parts) >= 2:
            entries = [_lookup(p, looks_like_heading) for p in parts]
            if all(entries):
                names = [e[0] for e in entries if e]
                return min(names, key=lambda n: _RANK.get(n, len(_RANK))), "", False

    # "SKILLS: Python, Java" — a strong heading, a colon, then content.
    inline = _INLINE.match(re.sub(r"^[^\w]+", "", stripped))
    if inline:
        entry = _LOOKUP.get(_norm(inline.group(1)))
        if entry and not entry[1]:
            return entry[0], inline.group(2).strip(), True
    return None


def _lookup(phrase: str, looks_like_heading: bool) -> tuple[str, bool] | None:
    """``(section, weak)`` for a known heading phrase, honouring the weak-word rule."""
    entry = _LOOKUP.get(_norm(phrase))
    if entry is None:
        return None
    name, weak = entry
    if weak and not looks_like_heading:
        return None
    return name, weak
