"""Tests for engine/extract/ — PDF text, OCR fallback, section splitting."""

from __future__ import annotations

import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from engine.errors import CandidateError, Reason
from engine.extract import PdfExtractor, split_sections
from engine.extract.ocr import EasyOcrEngine, OcrUnavailable
from engine.extract.pdf import clean_text
from engine.extract.sections import match_heading
from engine.tests.fixtures import (
    PAGE7_PROJECT_LINE,
    PAGE11_MARKER,
    make_pdf,
    make_ten_page_resume,
)

LONG_LINE = "Built a small web application for tracking library loans across three departments."


class FakeOcr:
    def __init__(self, text: str = "SCANNED PAGE Recognised résumé text about Python projects and internships.",
                 error: Exception | None = None) -> None:
        self.text = text
        self.error = error
        self.pages: list[int] = []

    def read_page(self, page) -> str:
        self.pages.append(page.number)
        if self.error:
            raise self.error
        return self.text


class ExtractTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def assert_fails(self, extractor: PdfExtractor, path: Path, reason: str) -> None:
        with self.assertRaises(CandidateError) as ctx:
            extractor.extract(path)
        self.assertEqual((ctx.exception.kind, ctx.exception.reason), ("permanent", reason))


class PdfTests(ExtractTestCase):
    def test_one_page(self) -> None:
        path = make_pdf(self.dir / "a.pdf", [f"SKILLS\nPython\n{LONG_LINE}"])
        result = PdfExtractor().extract(path)
        self.assertEqual((result.page_count, result.truncated_pages, result.ocr_used), (1, 0, False))
        self.assertIn(LONG_LINE, result.text)
        self.assertEqual(len(result.page_texts), 1)

    def test_ten_page_resume_projects_on_page_seven_reach_the_projects_section(self) -> None:
        """Phase 1 exit criterion: content from page 7 is found, not the first half-page only."""
        result = PdfExtractor().extract(make_ten_page_resume(self.dir / "ten.pdf"))
        self.assertEqual((result.page_count, len(result.page_texts), result.truncated_pages), (10, 10, 0))
        self.assertIn(PAGE7_PROJECT_LINE, result.page_texts[6])
        self.assertGreater(len(result.text), 2500 * 10)   # QWENTUS read the first 2,500 chars
        sections = split_sections(result.text)
        self.assertIn(PAGE7_PROJECT_LINE, sections["projects"])
        self.assertNotIn(PAGE7_PROJECT_LINE, sections.get("header", ""))
        for name in ("education", "experience", "certifications", "achievements", "skills", "positions"):
            self.assertIn(name, sections)

    def test_pages_after_ten_are_not_read_and_are_counted(self) -> None:
        result = PdfExtractor().extract(make_ten_page_resume(self.dir / "twelve.pdf", extra_pages=2))
        self.assertEqual((result.page_count, len(result.page_texts), result.truncated_pages), (12, 10, 2))
        self.assertNotIn(PAGE11_MARKER, result.text)

    def test_encrypted_pdf(self) -> None:
        path = make_pdf(self.dir / "locked.pdf", [LONG_LINE], user_password="secret")
        self.assert_fails(PdfExtractor(), path, Reason.DAMAGED)

    def test_corrupt_and_empty_files(self) -> None:
        for name, data in (("garbage", b"%PDF-1.7\n" + b"not really a pdf " * 20), ("empty", b"")):
            with self.subTest(name=name):
                path = self.dir / f"{name}.pdf"
                path.write_bytes(data)
                self.assert_fails(PdfExtractor(), path, Reason.DAMAGED)
                # The worker deletes the PDF next; on Windows that fails if a
                # handle leaked (PyMuPDF leaks one when opening by path fails).
                path.unlink()

    def test_files_can_be_deleted_after_every_outcome(self) -> None:
        good = make_pdf(self.dir / "good.pdf", [f"SKILLS\n{LONG_LINE}"])
        locked = make_pdf(self.dir / "locked.pdf", [LONG_LINE], user_password="pw")
        scan = make_pdf(self.dir / "scan.pdf", [None])
        for path in (good, locked, scan):
            try:
                PdfExtractor().extract(path)
            except CandidateError:
                pass
            path.unlink()

    def test_truncated_download_is_damaged_or_readable_never_a_crash(self) -> None:
        full = make_ten_page_resume(self.dir / "full.pdf").read_bytes()
        cut = self.dir / "cut.pdf"
        cut.write_bytes(full[: len(full) // 3])
        try:
            result = PdfExtractor().extract(cut)
        except CandidateError as exc:
            self.assertEqual(exc.reason, Reason.DAMAGED)
        else:
            self.assertTrue(result.text)   # PyMuPDF repaired what it could

    def test_missing_file_is_not_a_candidate_failure(self) -> None:
        with self.assertRaises(FileNotFoundError):
            PdfExtractor().extract(self.dir / "gone.pdf")


class OcrFallbackTests(ExtractTestCase):
    def test_only_pages_without_text_are_ocrd(self) -> None:
        path = make_pdf(self.dir / "mixed.pdf", [f"PROJECTS\n{LONG_LINE}", None, f"SKILLS\n{LONG_LINE}"])
        ocr = FakeOcr()
        result = PdfExtractor(ocr=ocr).extract(path)
        self.assertEqual(ocr.pages, [1])
        self.assertTrue(result.ocr_used)
        self.assertIn("SCANNED PAGE", result.page_texts[1])
        self.assertIn(LONG_LINE, result.page_texts[0])

    def test_scanned_resume_without_ocr_says_so(self) -> None:
        path = make_pdf(self.dir / "scan.pdf", [None, None])
        self.assert_fails(PdfExtractor(ocr=None), path, Reason.OCR_UNAVAILABLE)
        self.assert_fails(PdfExtractor(ocr=FakeOcr(error=OcrUnavailable("not installed"))), path, Reason.OCR_UNAVAILABLE)

    def test_ocr_that_finds_nothing(self) -> None:
        path = make_pdf(self.dir / "blank.pdf", [None])
        self.assert_fails(PdfExtractor(ocr=FakeOcr(text="  ")), path, Reason.NO_TEXT)

    def test_short_text_page_keeps_its_text_when_ocr_finds_less(self) -> None:
        path = make_pdf(self.dir / "short.pdf", ["SKILLS\nPython, SQL, Git, Docker"])
        result = PdfExtractor(ocr=FakeOcr(text="Py")).extract(path)
        self.assertFalse(result.ocr_used)
        self.assertIn("Python, SQL", result.text)

    def test_one_scanned_page_among_text_pages_without_ocr_is_fine(self) -> None:
        path = make_pdf(self.dir / "mostly.pdf", [f"PROJECTS\n{LONG_LINE}", None])
        result = PdfExtractor(ocr=None).extract(path)
        self.assertIn(LONG_LINE, result.text)
        self.assertFalse(result.ocr_used)


class EasyOcrEngineTests(unittest.TestCase):
    def test_missing_easyocr_is_a_clear_error_not_a_crash(self) -> None:
        engine = EasyOcrEngine(Path("models"))
        with patch.dict(sys.modules, {"easyocr": None}):   # makes "import easyocr" fail
            with self.assertRaises(OcrUnavailable):
                engine.read_page(object())

    def test_reader_never_downloads_and_uses_the_given_model_folder(self) -> None:
        created: dict[str, object] = {}

        class Reader:
            def __init__(self, languages, **kwargs) -> None:
                created.update(kwargs, languages=languages)

            def readtext(self, image, detail, paragraph):
                return ["Line one", "  ", "Line two"]

        fake = types.ModuleType("easyocr")
        fake.Reader = Reader  # type: ignore[attr-defined]
        engine = EasyOcrEngine(Path("bundled-models"))
        with patch.dict(sys.modules, {"easyocr": fake}), patch.object(EasyOcrEngine, "_render", return_value="img"):
            self.assertEqual(engine.read_page(object()), "Line one\nLine two")
        self.assertEqual(created["gpu"], False)
        self.assertEqual(created["download_enabled"], False)
        self.assertEqual(created["model_storage_directory"], "bundled-models")

    def test_missing_model_files_are_unavailable(self) -> None:
        fake = types.ModuleType("easyocr")

        def reader(*args, **kwargs):
            raise FileNotFoundError("craft_mlt_25k.pth")

        fake.Reader = reader  # type: ignore[attr-defined]
        with patch.dict(sys.modules, {"easyocr": fake}):
            with self.assertRaises(OcrUnavailable):
                EasyOcrEngine(Path("empty")).read_page(object())


class CleanTextTests(unittest.TestCase):
    def test_ligatures_icons_and_invisible_characters(self) -> None:
        raw = " Certiﬁcations­​  \n\n\n\nAWS Cloud\r\n"
        self.assertEqual(clean_text(raw), "Certifications\n\nAWS Cloud")

    def test_indic_joiners_survive(self) -> None:
        self.assertEqual(clean_text("क्‍ष"), "क्‍ष")


class SectionTests(unittest.TestCase):
    def test_single_column_resume(self) -> None:
        text = (
            "PRIYA SHARMA\npriya@example.com | 9876543210\n"
            "EDUCATION\nB.Tech CSE, 2026\n"
            "EXPERIENCE\nIntern, Acme Labs\n- Built dashboards\n"
            "PROJECTS\nChat App\n- Real-time chat with WebSockets\n"
            "SKILLS\nPython, Go\n"
        )
        s = split_sections(text)
        self.assertEqual(list(s), ["header", "education", "experience", "projects", "skills"])
        self.assertEqual(s["header"], "PRIYA SHARMA\npriya@example.com | 9876543210")
        self.assertEqual(s["projects"], "Chat App\n- Real-time chat with WebSockets")

    def test_inline_headings(self) -> None:
        s = split_sections("Asha\nSKILLS: Python, Java, SQL\nEducation: B.Tech IT, 2026\nCertifications: AWS CCP")
        self.assertEqual(s["skills"], "Python, Java, SQL")
        self.assertEqual(s["education"], "B.Tech IT, 2026")
        self.assertEqual(s["certifications"], "AWS CCP")

    def test_title_case_with_colons_and_letter_spaced_caps(self) -> None:
        s = split_sections("Name\nWork Experience:\nIntern\nP R O J E C T S\nRobot arm\nTechnical Skills\nC++")
        self.assertEqual((s["experience"], s["projects"], s["skills"]), ("Intern", "Robot arm", "C++"))

    def test_headings_with_icons_bullets_and_rules(self) -> None:
        text = ("Name\n■ Projects\nA\n➤ Work Experience\nB\n— SKILLS —\nC\n## Achievements\nD\n"
                "Certifications ———\nE\n• Hackathons\nF\n Education\nG")
        s = split_sections(text)
        self.assertEqual(
            [s[k] for k in ("projects", "experience", "skills", "achievements", "certifications", "hackathons", "education")],
            ["A", "B", "C", "D", "E", "F", "G"],
        )

    def test_two_headings_on_one_line_go_to_the_more_important_one(self) -> None:
        for line in ("EDUCATION | SKILLS", "Education        Skills", "EDUCATION\tSKILLS"):
            with self.subTest(line=line):
                s = split_sections(f"Name\n{line}\nB.Tech CSE\nPython, SQL")
                self.assertEqual(s["skills"], "B.Tech CSE\nPython, SQL")
                self.assertNotIn("education", s)
        s = split_sections("Name\nAwards & Certifications\nAWS CCP\nHonors and Awards\nDean's list")
        self.assertEqual(s["achievements"], "AWS CCP\n\nDean's list")

    def test_no_headings_at_all(self) -> None:
        text = "Ravi Kumar\nI build Android apps.\nI know Kotlin and Firebase."
        self.assertEqual(split_sections(text), {"other": text})
        self.assertEqual(split_sections("   \n "), {})

    def test_weak_words_need_to_look_like_headings(self) -> None:
        s = split_sections("Name\nSKILLS\nPython\nLeadership\nResearch\nLEADERSHIP\nCaptain, cricket team\n"
                           "Courses:\nML Specialisation\nLanguages\nEnglish")
        self.assertEqual(s["skills"], "Python\nLeadership\nResearch")
        self.assertEqual(s["positions"], "Captain, cricket team")
        self.assertEqual(s["certifications"], "ML Specialisation\nLanguages\nEnglish")

    def test_labels_inside_projects_stay_with_the_project(self) -> None:
        text = ("Name\nPROJECTS\nFlood Mapper\nTech Stack: PyTorch, FastAPI\n- Segmentation model\n"
                "Chat App\nSkills: React\nTechnologies:\nNode.js\nSKILLS\nPython, Go")
        s = split_sections(text)
        self.assertIn("Tech Stack: PyTorch, FastAPI", s["projects"])
        self.assertIn("Skills: React", s["projects"])
        self.assertIn("Node.js", s["projects"])
        self.assertEqual(s["skills"], "Python, Go")

    def test_repeated_sections_are_merged(self) -> None:
        s = split_sections("Name\nACADEMIC PROJECTS\nCompiler\nSKILLS\nC\nPersonal Projects\nGame engine")
        self.assertEqual(s["projects"], "Compiler\n\nGame engine")

    def test_personal_details_and_hobbies_are_kept_apart(self) -> None:
        s = split_sections("Name\nSKILLS\nPython\nPERSONAL DETAILS\nDate of birth: 01-01-2004\nGender: F\n"
                           "HOBBIES\nChess\nDeclaration\nI declare the above is true.")
        self.assertEqual(s["personal"], "Date of birth: 01-01-2004\nGender: F\n\nI declare the above is true.")
        self.assertEqual(s["other"], "Chess")
        self.assertEqual(s["skills"], "Python")

    def test_sentences_are_not_headings(self) -> None:
        for line in ("Worked on several projects involving machine learning",
                     "Experience with Docker and Kubernetes in production for two years",
                     "Skills gained: teamwork and more teamwork across many long projects over the years"):
            with self.subTest(line=line):
                self.assertIsNone(match_heading(line, "summary"))


if __name__ == "__main__":
    unittest.main()
