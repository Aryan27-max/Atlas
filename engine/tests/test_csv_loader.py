"""Tests for engine/ingest/csv_loader.py — headers, encodings, normalisation, report."""

from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from engine import db as db_module
from engine.db import Database
from engine.ingest.csv_loader import (
    FIELDS,
    load_csv,
    normalise_cgpa,
    normalise_phone,
    render_report,
)

HEADER = "Name,RA Number,CGPA,Mail ID,Section,Department,Phone no.,Hackathons,Skills,Resume Link"


def drive(i: int) -> str:
    return f"https://drive.google.com/file/d/FILEID{i:05d}/view?usp=sharing"


class CsvTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def write(self, content: str | bytes, name: str = "students.csv") -> Path:
        path = self.dir / name
        path.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))
        return path

    def codes(self, issues) -> list[str]:
        return [i.code for i in issues]

    def row_warnings(self, report) -> list[tuple[str, str]]:
        return [(w.ra_number, w.code) for w in report.warnings if w.row is not None]


class HeaderTests(CsvTestCase):
    def test_aliases_ignore_case_spacing_punctuation_and_accents(self) -> None:
        path = self.write(
            "Student Name,RA No.,cgpa/10,E-Mail,SEC,Dept,P.No,Hackathons (won or participated),"
            "Technical Skills,Résumé Link\n"
            f"Asha,RA1,8.1,a@x.in,A,CSE,9876543210,SIH 2025,Python,{drive(1)}\n"
        )
        report = load_csv(path)
        self.assertTrue(report.ok, report.errors)
        self.assertEqual(set(report.columns), set(FIELDS))
        row = report.rows[0]
        self.assertEqual(row["name"], "Asha")
        self.assertEqual(row["hackathons"], "SIH 2025")
        self.assertEqual(row["resume_link"], drive(1))
        self.assertEqual(report.warnings, [])

    def test_longer_header_matches_by_prefix(self) -> None:
        path = self.write(
            "Registration Number,Resume Link (Google Drive - Anyone with the link),Mobile Number (WhatsApp)\n"
            f"ra7,{drive(7)},98765 43210\n"
        )
        report = load_csv(path)
        self.assertTrue(report.ok, report.errors)
        self.assertEqual(report.rows[0]["ra_number"], "RA7")
        self.assertEqual(report.rows[0]["phone"], "9876543210")

    def test_first_and_last_name_are_combined(self) -> None:
        report = load_csv(self.write(f"First Name,Last Name,RA Number,Resume\nAsha,Iyer,RA1,{drive(1)}\n"))
        self.assertEqual(report.rows[0]["name"], "Asha Iyer")

    def test_unknown_columns_warn_and_trailing_empty_columns_are_silent(self) -> None:
        report = load_csv(self.write(f"RA Number,Resume Link,Remarks,,,\nRA1,{drive(1)},ok,,,\n"))
        self.assertTrue(report.ok)
        self.assertEqual(self.codes(report.warnings), ["unknown_column", "missing_name_column"])
        self.assertIn('"Remarks"', report.warnings[0].message)
        self.assertIn("Names will be blank", render_report(report))

    def test_missing_required_columns_are_file_errors(self) -> None:
        report = load_csv(self.write("Name,Email\nAsha,a@x.in\n"))
        self.assertFalse(report.ok)
        self.assertEqual(self.codes(report.file_errors), ["missing_column", "missing_column"])
        self.assertTrue(any("RA number" in e.message for e in report.file_errors))
        self.assertTrue(any("Résumé link" in e.message for e in report.file_errors))
        self.assertEqual(report.rows, [])

    def test_two_columns_for_one_field_uses_the_first(self) -> None:
        report = load_csv(self.write(f"RA Number,Email,Mail ID,Resume\nRA1,a@x.in,b@x.in,{drive(1)}\n"))
        self.assertEqual(report.rows[0]["email"], "a@x.in")
        self.assertIn("duplicate_column", self.codes(report.warnings))

    def test_title_row_above_header(self) -> None:
        report = load_csv(self.write(f"Placement Drive 2026,,\nRA Number,Name,Resume Link\nRA1,Asha,{drive(1)}\n"))
        self.assertTrue(report.ok, report.errors)
        self.assertEqual(report.rows[0]["name"], "Asha")


class FileLevelTests(CsvTestCase):
    def test_empty_file(self) -> None:
        for content in ("", "   \n\n  \r\n"):
            with self.subTest(content=content):
                report = load_csv(self.write(content))
                self.assertFalse(report.ok)
                self.assertEqual(self.codes(report.file_errors), ["empty_file"])
                self.assertIn("empty", render_report(report))

    def test_header_only(self) -> None:
        report = load_csv(self.write(HEADER + "\n\n"))
        self.assertFalse(report.ok)
        self.assertEqual(self.codes(report.file_errors), ["no_rows"])

    def test_missing_file(self) -> None:
        report = load_csv(self.dir / "nope.csv")
        self.assertEqual(self.codes(report.file_errors), ["unreadable"])


class EncodingAndDelimiterTests(CsvTestCase):
    def test_utf8_with_bom_keeps_tamil_names(self) -> None:
        text = f"Name,RA Number,Resume Link\nஅருண் குமார்,RA1,{drive(1)}\n"
        report = load_csv(self.write(b"\xef\xbb\xbf" + text.encode("utf-8")))
        self.assertEqual(report.encoding, "utf-8-sig")
        self.assertEqual(report.rows[0]["name"], "அருண் குமார்")
        self.assertIn("name", report.columns)  # the BOM did not end up in the first header

    def test_utf8_without_bom_keeps_hindi_names(self) -> None:
        report = load_csv(self.write(f"Name,RA Number,Resume Link\nप्रिया शर्मा,RA1,{drive(1)}\n"))
        self.assertEqual(report.encoding, "utf-8")
        self.assertEqual(report.rows[0]["name"], "प्रिया शर्मा")

    def test_cp1252_fallback(self) -> None:
        text = f"Name,RA Number,Resume Link\nJosé D’Souza,RA1,{drive(1)}\n"
        report = load_csv(self.write(text.encode("cp1252")))
        self.assertEqual(report.encoding, "cp1252")
        self.assertEqual(report.rows[0]["name"], "José D’Souza")

    def test_utf16_tab_separated_excel_unicode_text(self) -> None:
        text = f"Name\tRA Number\tResume Link\r\nகவிதா\tRA1\t{drive(1)}\r\n"
        report = load_csv(self.write(text.encode("utf-16")))
        self.assertEqual((report.encoding, report.delimiter), ("utf-16", "\t"))
        self.assertEqual(report.rows[0]["name"], "கவிதா")

    def test_semicolon_delimiter(self) -> None:
        report = load_csv(self.write(f"Name;RA Number;CGPA;Resume Link\nAsha;RA1;8,2;{drive(1)}\n"))
        self.assertEqual(report.delimiter, ";")
        self.assertEqual(report.rows[0]["cgpa"], 8.2)

    def test_quoted_commas_and_newlines_inside_cells(self) -> None:
        report = load_csv(self.write(
            f'Name,RA Number,Skills,Resume Link\n"Iyer, Asha",RA1,"Python, SQL\nDocker",{drive(1)}\n'
        ))
        self.assertEqual(report.delimiter, ",")
        self.assertEqual(report.rows[0]["name"], "Iyer, Asha")
        self.assertEqual(report.rows[0]["skills"], "Python, SQL\nDocker")

    def test_blank_lines_and_row_numbers_match_the_spreadsheet(self) -> None:
        # Excel rows: 1 header, 2 RA1, 3 blank, 4 missing link, 5 RA1 again.
        report = load_csv(self.write(f"RA Number,Resume Link\nRA1,{drive(1)}\n,\nRA2,\nRA1,{drive(9)}\n"))
        self.assertEqual(len(report.rows), 1)
        self.assertEqual([(e.row, e.code) for e in report.errors], [(4, "missing_link"), (5, "duplicate_ra")])
        self.assertEqual(report.summary["rows_read"], 3)

    def test_values_beyond_the_header_are_reported(self) -> None:
        report = load_csv(self.write(f"RA Number,Resume Link\nRA1,{drive(1)},surprise\n"))
        self.assertEqual(len(report.rows), 1)
        self.assertIn("extra_cells", self.codes(report.warnings))


class NormalisationTests(CsvTestCase):
    def test_phone_numbers(self) -> None:
        cases = {
            "9876543210": ("9876543210", None),
            "+91 98765 43210": ("9876543210", None),
            "+91-98765-43210": ("9876543210", None),
            "(+91) 9876543210": ("9876543210", None),
            "919876543210": ("9876543210", None),
            "09876543210": ("9876543210", None),
            "9876543210.0": ("9876543210", None),
            "9.876543210E+09": ("9876543210", None),          # every digit survived
            "9.19876543210E+11": ("9876543210", None),
            "9.19876E+11": ("9.19876E+11", "phone_excel_rounded"),  # Excel dropped digits
            "98765": ("98765", "phone_invalid"),
            "9876543210 / 9123456789": ("9876543210 / 9123456789", "phone_invalid"),
            "call me": ("call me", "phone_invalid"),
            "  ": ("", None),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalise_phone(raw), expected)

    def test_cgpa(self) -> None:
        cases = {
            "8.2": (8.2, None),
            "8.2/10": (8.2, None),
            "8.2 / 10": (8.2, None),
            "82%": (8.2, None),
            "82 %": (8.2, None),
            "8,2": (8.2, None),
            "10": (10.0, None),
            "": (None, None),
            "NA": (None, None),
            "-": (None, None),
            "11": (None, "cgpa_out_of_range"),
            "105%": (None, "cgpa_out_of_range"),
            "3.5/4": (None, "cgpa_unreadable"),
            "eight": (None, "cgpa_unreadable"),
            "-1": (None, "cgpa_unreadable"),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalise_cgpa(raw), expected)

    def test_row_level_normalisation_and_warnings(self) -> None:
        report = load_csv(self.write(
            HEADER + "\n"
            f"  Asha   Iyer ,  ra2011003010001 ,82%,asha@srm.in,A,CSE,+91 98765 43210,,Python,{drive(1)}\n"
            f"Ravi,RA2,12,not-an-email,B,IT,12345,,,{drive(2)}\n"
        ))
        a, b = report.rows
        self.assertEqual(a["ra_number"], "RA2011003010001")
        self.assertEqual(a["name"], "Asha Iyer")
        self.assertEqual((a["cgpa"], a["phone"]), (8.2, "9876543210"))
        self.assertIsNone(b["cgpa"])
        self.assertEqual(b["phone"], "12345")
        self.assertEqual(
            sorted(self.codes(report.warnings)), ["cgpa_out_of_range", "email_invalid", "phone_invalid"]
        )
        self.assertTrue(all(w.ra_number == "RA2" and w.row == 3 for w in report.warnings))


class RowErrorTests(CsvTestCase):
    def test_duplicates_keep_first_case_insensitively(self) -> None:
        report = load_csv(self.write(
            f"RA Number,Name,Resume Link\nRA1,First,{drive(1)}\nra1 ,Second,{drive(2)}\nRA2,Other,{drive(3)}\n"
        ))
        self.assertEqual([r["name"] for r in report.rows], ["First", "Other"])
        self.assertEqual([(e.row, e.ra_number, e.code) for e in report.errors], [(3, "RA1", "duplicate_ra")])
        self.assertIn("row 2", report.errors[0].message)

    def test_missing_ra_or_link_skips_the_row(self) -> None:
        report = load_csv(self.write(f"RA Number,Resume Link\n,{drive(1)}\nRA2,  \nRA3,{drive(3)}\n"))
        self.assertEqual([r["ra_number"] for r in report.rows], ["RA3"])
        self.assertEqual(self.codes(report.errors), ["missing_ra", "missing_link"])

    def test_shared_link_is_a_warning_even_in_another_url_shape(self) -> None:
        report = load_csv(self.write(
            "RA Number,Resume Link\n"
            "RA1,https://drive.google.com/file/d/SAMEFILE123/view?usp=sharing\n"
            "RA2,https://drive.google.com/open?id=SAMEFILE123\n"
        ))
        self.assertEqual(len(report.rows), 2)
        self.assertEqual(self.row_warnings(report), [("RA2", "shared_link")])
        self.assertIn("RA1", report.warnings[-1].message)

    def test_link_without_scheme_is_fine_but_nonsense_warns(self) -> None:
        report = load_csv(self.write("RA Number,Resume Link\nRA1,drive.google.com/file/d/ABC/view\nRA2,my resume\n"))
        self.assertEqual(len(report.rows), 2)
        self.assertEqual(self.row_warnings(report), [("RA2", "link_invalid")])


class ReportTests(CsvTestCase):
    def test_render_report(self) -> None:
        report = load_csv(self.write(
            HEADER + "\n"
            f"A,RA1,8,a@x.in,A,CSE,9876543210,,,{drive(1)}\n"
            f"B,RA1,8,b@x.in,A,CSE,9876543210,,,{drive(2)}\n"
            f"C,RA3,8,c@x.in,A,CSE,9876543210,,,\n"
            f"D,RA4,8,d@x.in,A,CSE,123,,,{drive(1)}\n"
        ))
        text = render_report(report)
        self.assertIn("4 rows read", text)
        self.assertIn("2 ready", text)
        self.assertRegex(text, r"1 duplicate RA numbers\s+→ row 3 \(kept first\)")
        self.assertRegex(text, r"1 missing résumé links\s+→ row 4 \(skipped\)")
        self.assertRegex(text, r"1 links shared by two students\s+→ RA4 \(warning only\)")
        self.assertRegex(text, r"1 phone numbers look wrong\s+\(warning only\)")

    def test_long_lists_are_shortened(self) -> None:
        body = "".join(f"RA{i},\n" for i in range(15))
        text = render_report(load_csv(self.write("RA Number,Resume Link\n" + body)))
        self.assertIn("(+5 more)", text)


class ContractTests(CsvTestCase):
    def test_rows_match_database_fields_and_insert_cleanly(self) -> None:
        self.assertEqual(FIELDS, db_module.CANDIDATE_INPUT_FIELDS)
        report = load_csv(self.write(
            HEADER + "\n" + f"Asha,RA1,8.2,a@x.in,A,CSE,9876543210,SIH,Python,{drive(1)}\n"
        ))
        self.assertEqual(tuple(report.rows[0]), FIELDS)
        with Database(self.dir / "atlas.db") as db:
            run_id = db.create_run("R")
            self.assertEqual(db.add_candidates(run_id, report.rows), 1)
            self.assertEqual(db.list_candidates(run_id)[0]["cgpa"], 8.2)

    def test_five_thousand_rows_under_two_seconds(self) -> None:
        lines = [HEADER] + [
            f"Student {i},RA{i:07d},{7 + (i % 30) / 10},s{i}@x.in,A,CSE,+91 98765 {i % 100000:05d},"
            f"SIH,\"Python, SQL\",{drive(i)}"
            for i in range(5000)
        ]
        path = self.write("\n".join(lines) + "\n")
        started = time.perf_counter()
        report = load_csv(path)
        elapsed = time.perf_counter() - started
        self.assertEqual(len(report.rows), 5000)
        self.assertEqual(report.errors, [])
        self.assertLess(elapsed, 2.0)


if __name__ == "__main__":
    unittest.main()
