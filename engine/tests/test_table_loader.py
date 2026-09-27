"""Excel input for the pre-flight (Phase 2, step 2.0b): ``load_table``.

Workbooks are built with openpyxl in a temp folder; all data is fictional.
"""

from __future__ import annotations

import datetime as dt
import tempfile
import unittest
from pathlib import Path
from typing import Any

import openpyxl

from engine.ingest.csv_loader import XLS_MESSAGE, _cell_text, load_csv, load_table

HEADER = ["Name", "RA Number", "CGPA", "Mail ID", "Section", "Department", "P.No",
          "Hackathon Won or Participated In", "Skills", "Resume Link"]


class TableTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def workbook(self, rows: list[list[Any]], name: str = "students.xlsx", *, title: str | None = None,
                 links: dict[tuple[int, int], str] | None = None, formats: dict[tuple[int, int], str] | None = None,
                 extra_sheet: bool = False) -> Path:
        book = openpyxl.Workbook()
        sheet = book.active
        if title:
            sheet.append([title])
        for row in rows:
            sheet.append(row)
        offset = 1 if title else 0
        for (r, c), target in (links or {}).items():
            sheet.cell(row=r + offset, column=c).hyperlink = target
        for (r, c), fmt in (formats or {}).items():
            sheet.cell(row=r + offset, column=c).number_format = fmt
        if extra_sheet:
            other = book.create_sheet("Other")
            other.append(["RA Number", "Resume Link"])
            other.append(["RA9999", "https://example.com/other.pdf"])
        path = self.dir / name
        book.save(path)
        return path

    def student(self, i: int, **overrides: Any) -> list[Any]:
        values = {
            "Name": f"Test Student {i}", "RA Number": f"RA{i:08d}", "CGPA": 8.1, "Mail ID": f"s{i}@example.com",
            "Section": "A", "Department": "CSE", "P.No": 919876543210 + i, "Hackathon Won or Participated In": "None",
            "Skills": "Python", "Resume Link": f"https://drive.google.com/file/d/file{i}/view?usp=sharing",
        }
        values.update(overrides)
        return [values[h] for h in HEADER]


class XlsxTests(TableTestCase):
    def test_numbers_come_through_as_the_digits_not_scientific_notation(self) -> None:
        path = self.workbook([HEADER, self.student(1), self.student(2, **{"P.No": 9876543210.0})])
        report = load_table(path)
        self.assertEqual(report.errors, [])
        self.assertEqual([r["phone"] for r in report.rows], ["9876543211", "9876543210"])
        self.assertEqual([r["cgpa"] for r in report.rows], [8.1, 8.1])
        self.assertEqual(report.rows[0]["ra_number"], "RA00000001")
        self.assertEqual(report.encoding, "xlsx")
        self.assertEqual(report.summary["ready"], 2)

    def test_a_link_cell_showing_a_word_uses_its_hyperlink(self) -> None:
        target = "https://drive.google.com/file/d/realfile/view"
        path = self.workbook([HEADER, self.student(1, **{"Resume Link": "Resume"})],
                             links={(2, 10): target})
        report = load_table(path)
        self.assertEqual(report.rows[0]["resume_link"], target)

    def test_a_mailto_hyperlink_on_the_email_is_ignored(self) -> None:
        path = self.workbook([HEADER, self.student(1)], links={(2, 4): "mailto:someone@else.com"})
        self.assertEqual(load_table(path).rows[0]["email"], "s1@example.com")

    def test_number_formats_are_shown_as_excel_shows_them(self) -> None:
        path = self.workbook([HEADER, self.student(1, CGPA=8.1)], formats={(2, 3): "0.00"})
        report = load_table(path)
        self.assertEqual(report.rows[0]["cgpa"], 8.1)

    def test_a_title_row_above_the_header_is_skipped(self) -> None:
        path = self.workbook([HEADER, self.student(1)], title="Placement drive 2026")
        report = load_table(path)
        self.assertEqual(len(report.rows), 1)
        self.assertEqual(report.errors, [])

    def test_only_the_first_sheet_is_read(self) -> None:
        path = self.workbook([HEADER, self.student(1)], extra_sheet=True)
        self.assertEqual([r["ra_number"] for r in load_table(path).rows], ["RA00000001"])

    def test_row_numbers_match_the_spreadsheet(self) -> None:
        path = self.workbook([HEADER, self.student(1), self.student(1)])
        report = load_table(path)
        self.assertEqual([(e.code, e.row) for e in report.errors], [("duplicate_ra", 3)])

    def test_missing_link_column_is_a_file_error(self) -> None:
        path = self.workbook([HEADER[:-1], self.student(1)[:-1]])
        report = load_table(path)
        self.assertFalse(report.ok)
        self.assertEqual([e.code for e in report.file_errors], ["missing_column"])
        self.assertIn("Résumé link", report.file_errors[0].message)

    def test_an_empty_workbook(self) -> None:
        path = self.workbook([])
        self.assertEqual([e.code for e in load_table(path).file_errors], ["empty_file"])

    def test_a_damaged_workbook_is_explained(self) -> None:
        path = self.dir / "broken.xlsx"
        path.write_bytes(b"PK\x03\x04 this is not really a workbook")
        report = load_table(path)
        self.assertEqual([e.code for e in report.file_errors], ["not_xlsx"])
        self.assertIn("save it again", report.file_errors[0].message)

    def test_load_csv_is_a_wrapper(self) -> None:
        path = self.workbook([HEADER, self.student(1)])
        self.assertEqual(load_csv(path).rows, load_table(path).rows)


class XlsTests(TableTestCase):
    def test_xls_extension_is_refused(self) -> None:
        path = self.dir / "students.xls"
        path.write_bytes(b"Name\tRA Number\n")
        report = load_table(path)
        self.assertEqual([e.code for e in report.file_errors], ["xls_unsupported"])
        self.assertEqual(report.file_errors[0].message, XLS_MESSAGE)
        self.assertEqual(XLS_MESSAGE, "Save this file as .xlsx or CSV and try again.")

    def test_old_excel_content_is_refused_whatever_the_name(self) -> None:
        path = self.dir / "students.xlsx"
        path.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64)
        self.assertEqual([e.code for e in load_table(path).file_errors], ["xls_unsupported"])


class CsvStillWorksTests(TableTestCase):
    def test_csv_through_load_table(self) -> None:
        path = self.dir / "students.csv"
        path.write_bytes(("﻿" + ",".join(HEADER) + "\r\n"
                          + ",".join(str(v) for v in self.student(1)) + "\r\n").encode("utf-8"))
        report = load_table(path)
        self.assertEqual(report.errors, [])
        self.assertEqual(report.rows[0]["phone"], "9876543211")
        self.assertEqual(report.encoding, "utf-8-sig")


class CellTextTests(unittest.TestCase):
    def test_values(self) -> None:
        cases = [
            (None, "General", ""),
            (919876543210, "General", "919876543210"),
            (919876543210.0, "General", "919876543210"),
            (8.1, "General", "8.1"),
            (8.1, "0.00", "8.10"),
            (0.826, "0%", "83%"),
            (0.825, "0.0%", "82.5%"),
            (True, "General", "TRUE"),
            (dt.datetime(2026, 9, 28, 10, 30), "yyyy-mm-dd h:mm", "2026-09-28"),
            (dt.date(2026, 9, 28), "General", "2026-09-28"),
            ("RA0001", "@", "RA0001"),
            (1.5e20, "General", "1.5e+20"),
        ]
        for value, fmt, expected in cases:
            with self.subTest(value=value, fmt=fmt):
                self.assertEqual(_cell_text(value, fmt), expected)


if __name__ == "__main__":
    unittest.main()
