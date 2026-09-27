"""Test PDFs generated on the fly with PyMuPDF (no binary fixtures in git).

``ten_page_resume_pages()`` is the Phase 1 exit-criterion résumé: ten pages,
with the Projects section on **page 7**. QWENTUS only ever read the first
2,500 characters, which ends on page 1. The same fixture is used by the
extraction tests (1.5), the LLM tests (1.6) and the end-to-end test (1.10).

Everything here is fictional.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf

# A line that exists only on page 7, inside the Projects section.
PAGE7_PROJECT_LINE = "- Built Sentinel-2 flood segmentation with a U-Net in PyTorch, reaching 0.81 IoU"
PAGE11_MARKER = "Paper on graph pruning presented at the district symposium"

RESUME_NAME = "Arjun Mehta"
RESUME_EMAIL = "arjun.mehta@example.com"
RESUME_PHONE = "9876501234"


def _filler(prefix: str, count: int, start: int = 1) -> str:
    return "\n".join(
        f"{prefix} {n}: improved the weekly reporting workflow and documented every step for the team."
        for n in range(start, start + count)
    )


def ten_page_resume_pages(extra_pages: int = 0) -> list[str]:
    pages = [
        f"{RESUME_NAME.upper()}\n{RESUME_EMAIL} | +91 98765 01234 | github.com/arjun-codes\n"
        "Chennai, Tamil Nadu\n\n"
        "SUMMARY\nFinal-year computer science student who enjoys applied machine learning and data tools.\n\n"
        "EDUCATION\nB.Tech Computer Science and Engineering, 2022-2026, CGPA 8.4\n"
        "Higher Secondary, State Board, 2022, 94%\n" + _filler("- Coursework note", 30),
        "WORK EXPERIENCE\nData Intern, Kaveri Analytics (May 2025 - Jul 2025)\n"
        "- Cleaned 2 million rows of sensor data with pandas and wrote validation checks\n" + _filler("- Task", 40),
        _filler("- Task", 45, start=41),
        "CERTIFICATIONS\nAWS Certified Cloud Practitioner (2025)\n" + _filler("- Course module", 40),
        _filler("- Course module", 45, start=41),
        "ACHIEVEMENTS\nSecond place, Smart India Hackathon internal round 2024\n" + _filler("- Club activity", 40),
        "PROJECTS\nFlood Risk Mapper\n"
        f"{PAGE7_PROJECT_LINE}\n"
        "- Served tile predictions through a FastAPI endpoint used by two NGOs\n"
        "Campus Marketplace\n"
        "- Built a React and Node.js marketplace for used textbooks with 300 weekly users\n"
        + _filler("- Project detail", 30),
        "TECHNICAL SKILLS\nPython, PyTorch, pandas, SQL, FastAPI, React, Docker, Git\n" + _filler("- Tooling note", 40),
        "POSITIONS OF RESPONSIBILITY\nLead, Coding Club (2024-2025)\n" + _filler("- Club task", 40),
        "HOBBIES\nChess, cycling\n\nDECLARATION\nI hereby declare that the above information is true.\n"
        + _filler("- Hobby note", 30),
    ]
    for n in range(extra_pages):
        pages.append(("PUBLICATIONS\n" + PAGE11_MARKER + "\n" if n == 0 else "") + _filler("- Extra page line", 40))
    return pages


def make_pdf(path: Path | str, pages: list[str | None], *, user_password: str | None = None) -> Path:
    """Write a PDF with one page per entry. ``None`` makes a page with no text
    layer (a grey box standing in for a scanned image)."""
    path = Path(path)
    document = pymupdf.open()
    for text in pages:
        page = document.new_page(width=595, height=842)   # A4
        if text is None:
            page.draw_rect(pymupdf.Rect(60, 60, 535, 780), color=(0, 0, 0), fill=(0.85, 0.85, 0.85))
        else:
            page.insert_text((40, 50), text, fontsize=8, fontname="helv")
    options: dict[str, object] = {}
    if user_password is not None:
        options = {"encryption": pymupdf.PDF_ENCRYPT_AES_256, "user_pw": user_password, "owner_pw": "owner-secret"}
    document.save(path, **options)
    document.close()
    return path


def make_ten_page_resume(path: Path | str, extra_pages: int = 0) -> Path:
    return make_pdf(path, ten_page_resume_pages(extra_pages))  # type: ignore[arg-type]


def simple_resume_text(grade: int = 70, name: str = "Test Student") -> str:
    """A one-page résumé whose line "Capstone grade N out of 100" lets the
    Ollama stub (1.10) return a predictable score."""
    return (
        f"{name.upper()}\nstudent@example.com\n\n"
        "SUMMARY\nComputer science student interested in backend systems.\n\n"
        "PROJECTS\nLibrary Tracker\n- Built a Flask app that tracks book loans for the department library\n"
        f"- Capstone grade {grade} out of 100\n\n"
        "SKILLS\nPython, Flask, SQL, Git\n\n"
        "EDUCATION\nB.Tech Information Technology, 2022-2026\n"
    )
