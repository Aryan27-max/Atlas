"""Engine pieces added for the local API (step 2.1): the completed-run cutoff
exception, run info, filters, link kinds, pre-flight groups, Ollama version."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from engine.db import Database, NotFoundError, RunLockedError, ValidationError
from engine.filters import department_counts, department_key, filter_reason, match_department, preview
from engine.ingest.csv_loader import Issue, PreflightReport, issue_groups
from engine.ingest.links import link_kind
from engine.llm.client import OllamaClient
from engine.tests.stubs.ollama_stub import OllamaStub


class DbTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.db = Database(Path(self._tmp.name) / "atlas.db")
        self.run_id = self.db.create_run("Run")
        self.db.configure_run(self.run_id, model_name="m", criteria_prompt="Python")

    def tearDown(self) -> None:
        self.db.close()
        self._tmp.cleanup()


class CompletedRunCutoffTests(DbTestCase):
    def test_a_completed_run_may_change_only_its_cutoffs(self) -> None:
        self.db.set_run_status(self.run_id, "running")
        with self.assertRaises(RunLockedError):
            self.db.configure_run(self.run_id, shortlist_cutoff=70)
        self.db.set_run_status(self.run_id, "completed")
        self.db.configure_run(self.run_id, shortlist_cutoff=75, maybe_cutoff=55, min_shortlist=4)
        run = self.db.get_run(self.run_id)
        self.assertEqual((run["shortlist_cutoff"], run["maybe_cutoff"], run["min_shortlist"]), (75, 55, 4))
        for change in ({"model_name": "other"}, {"criteria_prompt": "Java"}, {"cgpa_min": 8.0},
                       {"departments_allowed": ["CSE"]}, {"shortlist_cutoff": 70, "criteria_prompt": "x"}):
            with self.subTest(change=change), self.assertRaises(RunLockedError):
                self.db.configure_run(self.run_id, **change)
        with self.assertRaises(ValidationError):
            self.db.configure_run(self.run_id, shortlist_cutoff=40, maybe_cutoff=50)

    def test_run_info_changes_in_any_status(self) -> None:
        self.db.set_run_status(self.run_id, "running")
        self.db.update_run_info(self.run_id, name="  Campus   drive ", csv_filename="list.xlsx")
        run = self.db.get_run(self.run_id)
        self.assertEqual((run["name"], run["csv_filename"]), ("Campus drive", "list.xlsx"))
        with self.assertRaises(ValidationError):
            self.db.update_run_info(self.run_id, name="  ")
        with self.assertRaises(NotFoundError):
            self.db.update_run_info(999, name="x")

    def test_settings_can_be_cleared_and_the_file_vacuumed(self) -> None:
        self.db.set_setting("a", 1)
        self.db.clear_settings()
        self.assertIsNone(self.db.get_setting("a"))
        self.db.vacuum()


class FilterTests(unittest.TestCase):
    def test_reasons(self) -> None:
        self.assertEqual(filter_reason(7.5, "CSE", cgpa_min=8.0, departments=None),
                         "CGPA 7.5 is below the minimum of 8.")
        self.assertIsNone(filter_reason(None, "CSE", cgpa_min=8.0, departments=None), "no CGPA is never removed")
        self.assertIsNone(filter_reason(8.0, "C.S.E.", cgpa_min=8.0, departments=["cse"]))
        self.assertIn("isn't one of", filter_reason(9.0, "ECE", cgpa_min=None, departments=["CSE"]) or "")
        self.assertIsNone(filter_reason(9.0, "", cgpa_min=None, departments=["CSE"]), "no department is kept")
        self.assertEqual(department_key("c.s.e"), "CSE")

    def test_preview_counts_each_student_once(self) -> None:
        rows = [{"cgpa": 7.0, "department": "ECE"}, {"cgpa": 9.0, "department": "ECE"},
                {"cgpa": 9.0, "department": "CSE"}, {"cgpa": None, "department": "cse"}]
        p = preview(rows, cgpa_min=8.0, departments=["CSE"])
        self.assertEqual((p.total, p.removed, p.removed_by_cgpa, p.removed_by_department, p.remaining),
                         (4, 2, 1, 1, 2))

    def test_department_counts_merge_spellings(self) -> None:
        rows = [{"department": d} for d in ("CSE", "C.S.E.", "CSE", "ECE", "", "Mech")]
        self.assertEqual(department_counts(rows), [("CSE", 3), ("ECE", 1), ("Mech", 1)])


    def test_match_department_uses_the_filters_matching(self) -> None:
        rows = [{"department": d} for d in ("CSE", "C.S.E.", "CSE", "ECE", "", "Mech")]
        self.assertEqual(match_department("cse", rows), ("CSE", 3))
        self.assertEqual(match_department(" c.s.e ", rows), ("CSE", 3))
        self.assertEqual(match_department("MECH", rows), ("Mech", 1))
        self.assertIsNone(match_department("Civil", rows))
        self.assertIsNone(match_department("...", rows), "nothing to match")
        self.assertIsNone(match_department("CSE", []), "no file, no departments")


class LinkKindTests(unittest.TestCase):
    def test_kinds(self) -> None:
        cases = {
            "https://drive.google.com/file/d/abc_123/view?usp=sharing": "drive_file",
            "drive.google.com/open?id=abc123": "drive_file",
            "https://docs.google.com/document/d/abc/edit": "google_doc",
            "https://drive.google.com/drive/folders/abc": "folder",
            "https://portfolio.example.com/cv.pdf": "web",
            "not a link at all": "invalid",
            "": "invalid",
        }
        for link, kind in cases.items():
            with self.subTest(link=link):
                self.assertEqual(link_kind(link), kind)


class IssueGroupTests(unittest.TestCase):
    def test_groups_in_display_order_with_labels(self) -> None:
        report = PreflightReport(source="x.csv")
        report.warnings += [Issue(5, "RA2", "shared_link", "Same résumé link as RA1 (row 2)."),
                            Issue(None, "", "unknown_column", 'Column "Notes" isn\'t used.')]
        report.errors += [Issue(7, "RA1", "duplicate_ra", "…"), Issue(9, "", "missing_ra", "…"),
                          Issue(4, "", "missing_ra", "…")]
        groups = issue_groups(report)
        self.assertEqual([g["code"] for g in groups], ["missing_ra", "duplicate_ra", "shared_link"])
        self.assertEqual(groups[0]["rows"], [9, 4])
        self.assertEqual((groups[0]["severity"], groups[0]["skipped"]), ("error", True))
        self.assertEqual(groups[2]["label"], "Résumé link also used by another student")
        self.assertEqual(groups[2]["ra_numbers"], ["RA2"])


class OllamaVersionTests(unittest.TestCase):
    def test_version_and_down(self) -> None:
        stub = OllamaStub().start()
        try:
            self.assertEqual(OllamaClient(stub.base_url).version(), "0.0.0-stub")
            stub.go_offline()
            self.assertIsNone(OllamaClient(stub.base_url, connect_timeout=5).version())
        finally:
            stub.stop()


if __name__ == "__main__":
    unittest.main()


class PrecheckStatusTests(unittest.TestCase):
    def test_a_slow_but_working_model_shows_its_own_message(self) -> None:
        from engine.server import Engine

        slow = "This model works, but it's slow on this computer: about 24 résumés an hour."
        status = Engine._precheck_status({"ok": True, "digest": "d", "message": slow, "seconds": 150.0, "slow": True}, "d")
        self.assertEqual((status.status, status.message, status.slow), ("ready", slow, True))
        stale = Engine._precheck_status({"ok": True, "digest": "old", "message": slow}, "new")
        self.assertEqual(stale.status, "not_checked")
