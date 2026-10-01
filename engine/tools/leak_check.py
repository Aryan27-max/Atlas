"""Count identity leaks in the prompts Atlas would send, for a whole data dir.

    python -m engine.tools.leak_check --data-dir local/atlas-data [--run N]

Read-only: the database is opened with SQLite's ``mode=ro``, so nothing is
migrated or written. **Prints counts only, never text.** Safe to run on real
data (CLAUDE.md: real data stays in ``local/``; only numbers leave it).

For every candidate with extracted text, the prompt is rebuilt with the same
code the scorer uses (``scoring_input`` + ``build_prompt``), with the *whole*
résumé included (a stricter test than the real, budgeted prompt). Then:

* **own CSV identity**: name words, email, its local part, phone (any
  separators), RA number, a labelled section;
* **own résumé identity**: words of the résumé's name line, email local
  parts, profile usernames (the identity lexicon);
* **other students**: every other candidate's name words, email, phone, RA;
* **look-alikes**: anything shaped like an email, or 10+ digits in a row.

Name words that are ordinary English words ("Rose", "Deep") are left out of
the counts: the redactor deliberately keeps them unless they sit next to
another identity word. Exit code 1 if the total is not 0.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from engine.extract.sections import split_sections
from engine.llm.identity import EMAIL, build_lexicon, common_words, name_tokens
from engine.llm.prompt import build_prompt
from engine.llm.redact import scoring_input

_DIGITS = re.compile(r"(?<!\d)\d{10,}(?!\d)")


def _count_words(text: str, words: Iterable[str]) -> int:
    total = 0
    for word in words:
        total += len(re.findall(rf"(?<![^\W_]){re.escape(word)}(?![^\W_])", text, flags=re.IGNORECASE))
    return total


def _phone_hits(text: str, phone: str) -> int:
    digits = re.sub(r"\D", "", phone)[-10:]
    if len(digits) < 10:
        return 0
    pattern = r"\D{0,3}".join(digits)
    return len(re.findall(pattern, text))


def _identity(row: dict[str, Any]) -> dict[str, Any]:
    common = common_words()
    email = str(row.get("email") or "").lower()
    return {
        "names": {t.lower() for t in name_tokens(str(row.get("name") or "")) if t.lower() not in common},
        "email": email,
        "local": email.split("@", 1)[0] if "@" in email and len(email.split("@", 1)[0]) >= 3 else "",
        "phone": str(row.get("phone") or ""),
        "ra": str(row.get("ra_number") or "").lower(),
        "section": str(row.get("section") or ""),
    }


def check(db_path: Path, run_id: int | None = None) -> Counter[str]:
    uri = f"file:{db_path.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        where = "WHERE c.run_id = ?" if run_id is not None else ""
        args: tuple[Any, ...] = (run_id,) if run_id is not None else ()
        rows = [dict(r) for r in conn.execute(
            f"""SELECT c.*, t.text AS resume_text, t.sections AS resume_sections, r.criteria_prompt
                FROM candidates c JOIN resume_texts t ON t.candidate_id = c.id
                JOIN runs r ON r.id = c.run_id {where}""", args)]
        everyone = [dict(r) for r in conn.execute(
            f"SELECT c.id, c.run_id, c.name, c.email, c.phone, c.ra_number, c.section FROM candidates c {where}", args)]
    finally:
        conn.close()

    counts: Counter[str] = Counter()
    counts["prompts rebuilt"] = len(rows)
    common = common_words()
    for row in rows:
        text = row["resume_text"]
        sections = json.loads(row["resume_sections"]) if row["resume_sections"] else split_sections(text)
        data = scoring_input(row, text, sections)
        prompt = build_prompt(data.context, data.sections, row["criteria_prompt"] or "", budget_chars=10_000_000)
        sent = prompt.text
        low = sent.lower()

        own = _identity(row)
        counts["own CSV name words"] += _count_words(sent, own["names"])
        counts["own CSV email"] += low.count(own["email"]) if own["email"] else 0
        counts["own CSV email local part"] += _count_words(sent, [own["local"]]) if own["local"] else 0
        counts["own CSV phone"] += _phone_hits(sent, own["phone"])
        counts["own CSV RA number"] += _count_words(sent, [own["ra"]]) if own["ra"] else 0
        if own["section"]:
            counts["own labelled section"] += len(re.findall(
                rf"\bsec(?:tion)?\.?\s*[:-]?\s*{re.escape(own['section'])}\b", sent, flags=re.IGNORECASE))

        lexicon = build_lexicon(row, text, sections.get("header") if "header" in sections else None)
        counts["own résumé name-line / email / username words"] += _count_words(sent, lexicon.names)
        counts["own résumé handles"] += _count_words(sent, lexicon.handles)
        counts["(not counted) ordinary-word name tokens present"] += _count_words(sent, lexicon.common)

        for other in everyone:
            if other["id"] == row["id"]:
                continue
            ident = _identity(other)
            counts["other students' name words"] += _count_words(sent, ident["names"] - own["names"] - set(common))
            counts["other students' emails"] += low.count(ident["email"]) if ident["email"] else 0
            counts["other students' phones"] += _phone_hits(sent, ident["phone"])
            counts["other students' RA numbers"] += _count_words(sent, [ident["ra"]]) if ident["ra"] else 0

        counts["email-like strings"] += len(EMAIL.findall(sent))
        counts["runs of 10+ digits"] += len(_DIGITS.findall(sent))
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--run", type=int)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    db = args.data_dir / "atlas.db"
    if not db.is_file():
        print(f"No atlas.db in {args.data_dir}.")
        return 2
    counts = check(db, args.run)
    total = 0
    for name, value in counts.items():
        print(f"{name}: {value}")
        if name != "prompts rebuilt" and not name.startswith("(not counted)"):
            total += value
    print(f"TOTAL LEAKS: {total}")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
