"""The identity lexicon: every word that names this student, from *all* sources.

Smoke test 1 showed that the CSV is not enough (CLAUDE.md rule 9). The scored
résumé belonged to someone who wasn't in the CSV, so name redaction had
nothing to remove; only dropping the header kept the owner's name out, and
one word of their name line still reached the model from the body.

So the lexicon for one résumé is built from:

1. **the CSV row**: name parts, the email's local part;
2. **the résumé's own name line**: the first line of the header (text before
   the first heading) that isn't contact details or "Résumé"; if the résumé
   has no headings, the first line of the text, if it reads like a name;
3. **the local part of every email address** anywhere in the text, split on
   ``. _ - +`` and digits;
4. **usernames in profile URLs** (github.com/<u>, linkedin.com/in/<u>, …).

Name tokens are words of 2+ letters. Usernames and whole email local parts
are *handles*, redacted as whole strings.

A token that is also an ordinary word or a technical term (``Rose``,
``Grace``, ``Deep``, ``Ram``; see ``common_words.txt``) is only redacted
next to another identity token ("Rose Kumar", "Deep [name]"), so "rose to
lead the team" and "deep learning" survive. Initials are redacted when they
sit next to a redacted name ("P. Sharma", "Priya S.").
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Mapping

NAME = "[name]"

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Profile hosts and the path segment that is the username.
_PROFILE = re.compile(
    r"(?<![\w.-])(?:https?://)?(?:www\.)?"
    r"(?:github\.com|gitlab\.com|bitbucket\.org|linkedin\.com|twitter\.com|x\.com|instagram\.com|leetcode\.com|"
    r"kaggle\.com|medium\.com|dev\.to|behance\.net|dribbble\.com|hackerrank\.com|codechef\.com|codeforces\.com|"
    r"hashnode\.com|stackoverflow\.com)"
    r"/(?:in/|u/|users/(?:\d+/)?|profile/)?@?([A-Za-z0-9][\w.-]{1,60})",
    re.IGNORECASE,
)
_PAGES = re.compile(r"(?<![\w.])([A-Za-z0-9][\w-]{1,60})\.github\.io", re.IGNORECASE)
# A token: letters and combining marks (Tamil, Devanagari… keep their vowel signs).
_TOKEN = re.compile(r"[^\W\d_](?:[^\W\d_]|[̀-ͯऀ-෿])*")
_CONTACT_WORDS = re.compile(
    r"@|https?:|www\.|\.com\b|\.in\b|\.io\b|linkedin|github|gitlab|leetcode|portfolio|"
    r"\b(phone|mobile|mob|tel|email|e-mail|mail|address|contact|dob|date of birth)\b",
    re.IGNORECASE,
)
_TITLE_LINES = {"resume", "résumé", "curriculum vitae", "cv", "biodata", "bio data", "bio-data"}
_BOUND_L = r"(?<![^\W_])"
_BOUND_R = r"(?![^\W_])"


@lru_cache(maxsize=1)
def common_words() -> frozenset[str]:
    """Bundled ordinary words (``common_words.txt``), lower case."""
    path = Path(__file__).with_name("common_words.txt")
    words: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        words.update(line.split("#", 1)[0].lower().split())
    return frozenset(words)


@dataclass(frozen=True)
class Lexicon:
    names: frozenset[str]       # lower case; redacted wherever they appear as a word
    common: frozenset[str]      # lower case; redacted only next to another identity token
    initials: frozenset[str]    # upper-case first letters of the name tokens
    handles: frozenset[str]     # lower case usernames / email local parts, redacted as whole strings

    def __bool__(self) -> bool:
        return bool(self.names or self.common or self.handles)


def build_lexicon(candidate: Mapping[str, Any], text: str, header: str | None) -> Lexicon:
    """Everything that names this student. ``header`` is the résumé's header
    section (``None`` when the résumé has no headings)."""
    tokens: set[str] = set()
    handles: set[str] = set()

    tokens.update(name_tokens(str(candidate.get("name") or "")))
    emails = EMAIL.findall(text)
    if candidate.get("email"):
        emails.append(str(candidate["email"]))
    for email in emails:
        local = email.split("@", 1)[0].lower()
        if len(local) >= 3:
            handles.add(local)
        tokens.update(_split_handle(local))
    for user in profile_usernames(text):
        handles.add(user.lower())
        tokens.update(_split_handle(user))

    line = name_line(header if header is not None else text, headless=header is None)
    if line:
        tokens.update(name_tokens(line))

    common = common_words()
    lowered = {t.lower() for t in tokens if len(t) >= 2}
    return Lexicon(
        names=frozenset(t for t in lowered if t not in common),
        common=frozenset(t for t in lowered if t in common),
        initials=frozenset(t[0].upper() for t in lowered if t[0].isalpha()),
        handles=frozenset(h for h in handles if h not in common),
    )


def name_tokens(value: str) -> list[str]:
    """Words of 2+ letters: ``"Priyanka S."`` → ``["Priyanka"]``."""
    return [t for t in _TOKEN.findall(value) if len(t) >= 2]


def profile_usernames(text: str) -> list[str]:
    users = [m.group(1).rstrip(".-") for m in _PROFILE.finditer(text)]
    users += [m.group(1) for m in _PAGES.finditer(text)]
    return [u for u in users if u and not u.isdigit()]


def name_line(text: str, *, headless: bool = False) -> str | None:
    """The line that names the résumé's owner.

    In a header: the first line that isn't contact details or a title such as
    "Résumé". Without a header (``headless``) only the very first line is
    considered, and only if it reads like a name (1–4 words, no digits).
    """
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        # "PRIYA SHARMA | Software Engineer" → the part before the separator.
        line = re.split(r"\s*[|•·–—]\s*", line)[0].strip()
        line = re.sub(r"^(name|full name)\s*[:：-]\s*", "", line, flags=re.IGNORECASE)
        lowered = line.lower().strip(" .:-")
        if lowered in _TITLE_LINES or _CONTACT_WORDS.search(line) or sum(c.isdigit() for c in line) >= 4:
            if headless:
                return None
            continue
        words = line.split()
        if headless and (len(words) > 4 or any(c.isdigit() for c in line)):
            return None
        if 1 <= len(words) <= 6 and len(line) <= 60:
            return line
        if headless:
            return None
    return None


def apply(text: str, lexicon: Lexicon) -> str:
    """Replace every lexicon word in ``text`` with ``[name]``."""
    if not text or not lexicon:
        return text
    for handle in sorted(lexicon.handles, key=len, reverse=True):
        text = re.sub(rf"{_BOUND_L}{re.escape(handle)}{_BOUND_R}", NAME, text, flags=re.IGNORECASE)
    if lexicon.names:
        names = "|".join(re.escape(n) for n in sorted(lexicon.names, key=len, reverse=True))
        text = re.sub(rf"{_BOUND_L}(?:{names}){_BOUND_R}", NAME, text, flags=re.IGNORECASE)
    if NAME not in text:
        return text
    # Common-word names and initials only next to an identity token.
    gap = r"([\s.,'’-]{1,3})"
    patterns = []
    if lexicon.common:
        common = "|".join(re.escape(c) for c in sorted(lexicon.common, key=len, reverse=True))
        patterns += [
            (re.compile(rf"\[name\]{gap}(?:{common}){_BOUND_R}", re.IGNORECASE), rf"{NAME}\1{NAME}"),
            (re.compile(rf"{_BOUND_L}(?:{common}){gap}\[name\]", re.IGNORECASE), rf"{NAME}\1{NAME}"),
        ]
    if lexicon.initials:
        letters = "".join(sorted(lexicon.initials))
        patterns += [
            (re.compile(rf"{_BOUND_L}[{letters}]\.?(\s{{1,2}})\[name\]"), rf"{NAME}\1{NAME}"),
            (re.compile(rf"\[name\](\s{{1,2}})[{letters}]\.(?![^\W_])"), rf"{NAME}\1{NAME}"),
        ]
    for _ in range(4):
        before = text
        for pattern, replacement in patterns:
            text = pattern.sub(replacement, text)
        if text == before:
            break
    return re.sub(r"\[name\](?:[ \t.]+\[name\])+", NAME, text)


def lexicon_hits(text: str, lexicon: Lexicon) -> int:
    """How many lexicon words are in ``text`` (for checks; never returns the words)."""
    hits = 0
    for handle in lexicon.handles:
        hits += len(re.findall(rf"{_BOUND_L}{re.escape(handle)}{_BOUND_R}", text, flags=re.IGNORECASE))
    for name in lexicon.names:
        hits += len(re.findall(rf"{_BOUND_L}{re.escape(name)}{_BOUND_R}", text, flags=re.IGNORECASE))
    return hits


def _split_handle(value: str) -> Iterable[str]:
    return [p for p in re.split(r"[._+\-\d]+", value) if len(p) >= 2 and p.isalpha()]
