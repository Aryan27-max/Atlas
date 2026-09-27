"""PDF → text with PyMuPDF, OCR for pages that have no text layer.

Adapted from QWENTUS ``parsers/pdf_parser.py``. What changed and why:

* At most ``MAX_PAGES`` (10) pages are read. Longer résumés are not failed;
  ``truncated_pages`` says how many were skipped, and the worker flags it.
* OCR runs **per page**, only for pages with fewer than ~50 characters of
  text. QWENTUS only OCR'd when the *whole* document was empty, so a résumé
  with one scanned page lost that page.
* Failures are typed (:class:`CandidateError`) with recruiter wording, not a
  generic ``PDFParseError``.
* Text is NFKC-normalised: ligatures such as "ﬁ" become "fi", so section
  headings and the model's evidence quotes match the text. Private-use
  glyphs (icon fonts like Font Awesome) are dropped.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import pymupdf

from engine.errors import CandidateError, Reason
from engine.extract.ocr import OcrUnavailable

log = logging.getLogger("atlas.extract")

# MuPDF prints repair notes ("format error: …") straight to stderr. Failures
# are already turned into typed errors, so keep the console quiet.
pymupdf.TOOLS.mupdf_display_errors(False)
pymupdf.TOOLS.mupdf_display_warnings(False)

MAX_PAGES = 10
MIN_PAGE_CHARS = 50      # fewer than this on a page → probably scanned → OCR it
MIN_TEXT_CHARS = 20      # fewer than this in the whole résumé → nothing to score


@dataclass(frozen=True)
class Extraction:
    text: str                        # all pages read, joined with blank lines
    page_texts: tuple[str, ...]      # one entry per page read (at most MAX_PAGES)
    page_count: int                  # pages in the document, including unread ones
    ocr_used: bool
    truncated_pages: int             # pages beyond MAX_PAGES that were not read


class OcrEngine(Protocol):
    def read_page(self, page: pymupdf.Page) -> str:
        """Text recognised on one rendered page. Raises ``OcrUnavailable``."""


class PdfExtractor:
    """Extract text from a résumé PDF. ``ocr`` is optional and injectable."""

    def __init__(
        self,
        *,
        ocr: OcrEngine | None = None,
        max_pages: int = MAX_PAGES,
        min_page_chars: int = MIN_PAGE_CHARS,
    ) -> None:
        self.ocr = ocr
        self.max_pages = max_pages
        self.min_page_chars = min_page_chars

    def extract(self, path: Path | str) -> Extraction:
        path = Path(path)
        if not path.is_file():
            # Not the candidate's fault: the worker re-downloads.
            raise FileNotFoundError(path)
        # Open from bytes, not from the path: when PyMuPDF fails to open a
        # corrupt file by path it keeps the file handle, and on Windows the
        # worker could then never delete the PDF. Files are ≤ 20 MB.
        data = path.read_bytes()
        try:
            document = pymupdf.open(stream=data, filetype="pdf")
        except (RuntimeError, ValueError):
            raise CandidateError("permanent", Reason.DAMAGED) from None

        with document:
            if document.needs_pass:
                raise CandidateError("permanent", Reason.DAMAGED)
            page_count = document.page_count
            if page_count == 0:
                raise CandidateError("permanent", Reason.DAMAGED)
            to_read = min(page_count, self.max_pages)

            texts: list[str] = []
            ocr_used = False
            ocr_missing = False
            try:
                for number in range(to_read):
                    page = document.load_page(number)
                    text = clean_text(page.get_text("text"))
                    if len(text) < self.min_page_chars:
                        recognised, missing = self._ocr(page)
                        ocr_missing = ocr_missing or missing
                        if len(recognised) > len(text):
                            text, ocr_used = recognised, True
                    texts.append(text)
            except (RuntimeError, ValueError):
                raise CandidateError("permanent", Reason.DAMAGED) from None

        full = "\n\n".join(t for t in texts if t).strip()
        if len(full) < MIN_TEXT_CHARS:
            raise CandidateError("permanent", Reason.OCR_UNAVAILABLE if ocr_missing else Reason.NO_TEXT)
        if page_count > to_read:
            log.info("read %d of %d pages", to_read, page_count)
        return Extraction(
            text=full,
            page_texts=tuple(texts),
            page_count=page_count,
            ocr_used=ocr_used,
            truncated_pages=page_count - to_read,
        )

    def _ocr(self, page: pymupdf.Page) -> tuple[str, bool]:
        """``(recognised text, ocr_missing)`` for one page."""
        if self.ocr is None:
            return "", True
        try:
            return clean_text(self.ocr.read_page(page)), False
        except OcrUnavailable as exc:
            log.warning("OCR unavailable: %s", exc)
            return "", True


def clean_text(text: str) -> str:
    """Normalise extracted text without changing its meaning."""
    text = unicodedata.normalize("NFKC", text)
    # Drop icon-font glyphs (Co), control characters (Cc) and invisible
    # formatting (Cf: soft hyphens, zero-width spaces, BOMs) — but keep the
    # zero-width (non-)joiners, which change meaning in Indic scripts.
    text = "".join(
        ch for ch in text
        if ch in "\n\t‌‍" or unicodedata.category(ch) not in ("Co", "Cc", "Cf")
    )
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    joined = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", joined).strip()
