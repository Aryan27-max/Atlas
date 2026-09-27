"""Tests for engine/export.py — encoding, escaping, views, atomic writes."""

from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from engine.buckets import compute_buckets
from engine.db import Database
from engine.export import COLUMNS, ExportError, export_csv


def row(cid: int, ra: str, *, name: str = "Student", score: int | None = 70, state: str = "scored",
        **extra: object) -> dict:
    data = {
        "candidate_id": cid, "ra_number": ra, "name": name, "email": f"{ra.lower()}@example.com",
        "phone": "9876543210", "section": "A", "department": "CSE", "cgpa": 8.25, "state": state,
        "failure_reason": None, "filter_reason": None, "overall_score": score,
        "sub_scores": {"technical": 71, "projects": 72, "experience": 73, "achievements": 74,
                       "communication": 75, "criteria_fit": 76} if score is not None else None,
        "reasons": ["Strong projects", "Good Python"] if score is not None else None,
        "claim_mismatches": ["Claims Docker; not in the résumé"] if score is not None else None,
        "flags": [], "model_name": "qwen3:8b" if score is not None else None,
    }
    data.update(extra)
    return data


def placements(rows: list[dict], **cutoffs: object):
    scored = [r for r in rows if r["state"] == "scored"]
    options = {"shortlist_cutoff": 60, "maybe_cutoff": 50, **cutoffs}
    return compute_buckets(
        [{"candidate_id": r["candidate_id"], "ra_number": r["ra_number"], "overall_score": r["overall_score"]}
         for r in scored], **options,
    ).placements


class ExportTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.path = self.dir / "export.csv"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def read(self) -> list[dict[str, str]]:
        with open(self.path, encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))


class FormatTests(ExportTestCase):
    def test_bom_crlf_quote_all_and_columns(self) -> None:
        rows = [row(1, "RA1", score=80)]
        self.assertEqual(export_csv(rows, placements(rows), self.path, view="all"), 1)
        raw = self.path.read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
        self.assertTrue(raw[3:].startswith(b'"Rank","RA Number","Name"'))
        self.assertEqual(raw.count(b"\r\n"), 2)
        self.assertNotIn(b"\n", raw.replace(b"\r\n", b""))
        line = self.read()[0]
        self.assertEqual(list(line), list(COLUMNS))
        self.assertEqual((line["Rank"], line["Overall Score"], line["Criteria Fit"], line["CGPA"]), ("1", "80", "76", "8.25"))
        self.assertEqual((line["Bucket"], line["How placed"]), ("Shortlisted", "Score"))
        self.assertEqual(line["Reasons"], "Strong projects | Good Python")
        self.assertEqual(line["Claim mismatches"], "Claims Docker; not in the résumé")

    def test_formula_injection_is_escaped(self) -> None:
        nasty = {
            1: '=HYPERLINK("http://evil.example","Click")',
            2: "+91 98765 43210",
            3: "-2+3",
            4: "@SUM(A1:A2)",
            5: "\tcmd",
            6: "\r=1+1",
            7: "   =1+1",
        }
        rows = [row(cid, f"RA{cid}", name=name) for cid, name in nasty.items()]
        export_csv(rows, placements(rows), self.path, view="all")
        names = {line["RA Number"]: line["Name"] for line in self.read()}
        for cid, name in nasty.items():
            self.assertEqual(names[f"RA{cid}"], "'" + name)
        self.assertIn(b'"\'=HYPERLINK(""http://evil.example"",""Click"")"', self.path.read_bytes())

    def test_ordinary_values_are_not_escaped(self) -> None:
        rows = [row(1, "RA1", name="Asha Iyer", department="CSE-AI")]
        export_csv(rows, placements(rows), self.path, view="all")
        line = self.read()[0]
        self.assertEqual((line["Name"], line["Department"]), ("Asha Iyer", "CSE-AI"))

    def test_tamil_and_hindi_names_round_trip(self) -> None:
        rows = [row(1, "RA1", name="அருண் குமார்"), row(2, "RA2", name="प्रिया शर्मा")]
        export_csv(rows, placements(rows), self.path, view="all")
        self.assertEqual({line["Name"] for line in self.read()}, {"அருண் குமார்", "प्रिया शर्मा"})


class ViewTests(ExportTestCase):
    def rows(self) -> list[dict]:
        return [
            row(1, "RA1", score=90), row(2, "RA2", score=55), row(3, "RA3", score=20), row(4, "RA4", score=62),
            row(5, "RA5", score=None, state="failed", failure_reason="Link is private."),
            row(6, "RA6", score=None, state="filtered", filter_reason="CGPA 6 is below the minimum of 7."),
            row(7, "RA7", score=None, state="queued"),
        ]

    def test_all_has_every_candidate_with_a_bucket(self) -> None:
        rows = self.rows()
        self.assertEqual(export_csv(rows, placements(rows), self.path, view="all"), 7)
        lines = self.read()
        self.assertEqual([(l["RA Number"], l["Bucket"]) for l in lines], [
            ("RA1", "Shortlisted"), ("RA4", "Shortlisted"), ("RA2", "Cutoff"), ("RA3", "Rejected"),
            ("RA5", "Failed"), ("RA6", "Filtered"), ("RA7", "Not scored yet"),
        ])
        self.assertEqual(lines[4]["Failure reason"], "Link is private.")
        self.assertEqual(lines[5]["Failure reason"], "CGPA 6 is below the minimum of 7.")
        self.assertEqual(lines[4]["Rank"], "")

    def test_bucket_views_have_no_bucket_column_and_follow_rank(self) -> None:
        rows = self.rows()
        self.assertEqual(export_csv(rows, placements(rows), self.path, view="shortlisted"), 2)
        lines = self.read()
        self.assertNotIn("Bucket", lines[0])
        self.assertEqual([l["RA Number"] for l in lines], ["RA1", "RA4"])
        export_csv(rows, placements(rows), self.path, view="rejected")
        self.assertEqual([l["RA Number"] for l in self.read()], ["RA3"])
        export_csv(rows, placements(rows), self.path, view="failed")
        self.assertEqual([l["RA Number"] for l in self.read()], ["RA5"])

    def test_fill_and_override_are_labelled(self) -> None:
        rows = self.rows()
        placed = compute_buckets(
            [{"candidate_id": r["candidate_id"], "ra_number": r["ra_number"], "overall_score": r["overall_score"]}
             for r in rows if r["state"] == "scored"],
            shortlist_cutoff=60, maybe_cutoff=50, min_shortlist=3, overrides={3: "cutoff"},
        ).placements
        export_csv(rows, placed, self.path, view="all")
        how = {l["RA Number"]: (l["Bucket"], l["How placed"]) for l in self.read()}
        self.assertEqual(how["RA2"], ("Shortlisted", "Filled to minimum"))
        self.assertEqual(how["RA3"], ("Cutoff", "Moved by recruiter"))

    def test_unknown_view(self) -> None:
        with self.assertRaises(ValueError):
            export_csv([], [], self.path, view="maybe")


class AtomicWriteTests(ExportTestCase):
    def test_crash_mid_write_leaves_no_partial_file(self) -> None:
        rows = [row(i, f"RA{i}") for i in range(1, 6)]
        real_writer = csv.writer

        def exploding_writer(*args, **kwargs):
            inner = real_writer(*args, **kwargs)

            class Writer:
                def __init__(self) -> None:
                    self.count = 0

                def writerow(self, values):
                    self.count += 1
                    if self.count == 3:
                        raise RuntimeError("power cut")
                    return inner.writerow(values)

            return Writer()

        with patch("engine.export.csv.writer", side_effect=exploding_writer), self.assertRaises(RuntimeError):
            export_csv(rows, placements(rows), self.path, view="all")
        self.assertEqual(list(self.dir.iterdir()), [])

    def test_crash_keeps_the_previous_export_intact(self) -> None:
        rows = [row(1, "RA1")]
        export_csv(rows, placements(rows), self.path, view="all")
        before = self.path.read_bytes()
        with patch("engine.export.os.fsync", side_effect=OSError(5, "I/O error")), self.assertRaises(OSError):
            export_csv([row(2, "RA2")], placements([row(2, "RA2")]), self.path, view="all")
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual([p.name for p in self.dir.iterdir()], ["export.csv"])

    def test_file_open_in_excel_gives_a_readable_error(self) -> None:
        rows = [row(1, "RA1")]
        with patch("engine.export.os.replace", side_effect=PermissionError(13, "in use")):
            with self.assertRaises(ExportError) as ctx:
                export_csv(rows, placements(rows), self.path, view="all")
        self.assertIn("open in another program", str(ctx.exception))
        self.assertEqual(list(self.dir.iterdir()), [])


class DatabaseRowsTests(ExportTestCase):
    def test_export_rows_from_a_real_database(self) -> None:
        with Database(self.dir / "atlas.db") as db:
            run_id = db.create_run("R")
            db.add_candidates(run_id, [{"ra_number": "RA1", "name": "=cmd", "resume_link": "https://x"},
                                       {"ra_number": "RA2", "resume_link": "https://y"}])
            first, second = [c["id"] for c in db.list_candidates(run_id)]
            db.start_download(first)
            db.finish_download(first, self.dir / "f.pdf")
            db.commit_extraction(first, text="t", page_count=1, ocr_used=False, pdf_sha256="h")
            db.start_scoring(first)
            db.save_evaluation(first, overall_score=66, sub_scores={"technical": 60}, summary="s", reasons=["r"],
                               evidence=[], claim_mismatches=[], model_name="m", prompt_hash="p", flags=["f"])
            db.mark_failed(second, kind="permanent", reason="Link is private.")
            rows = db.export_rows(run_id)
            placed = compute_buckets(db.scored_rows(run_id), shortlist_cutoff=60, maybe_cutoff=50).placements
        export_csv(rows, placed, self.path, view="all")
        lines = self.read()
        self.assertEqual([(l["RA Number"], l["Name"], l["Bucket"], l["Flags"]) for l in lines],
                         [("RA1", "'=cmd", "Shortlisted", "f"), ("RA2", "", "Failed", "")])


if __name__ == "__main__":
    unittest.main()
