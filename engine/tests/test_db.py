"""Tests for engine/db.py — schema, state machine, atomicity, crash recovery."""

from __future__ import annotations

import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from engine.db import (
    Database,
    InvalidTransitionError,
    NotFoundError,
    RunLockedError,
    ValidationError,
    criteria_hash,
)


def _rows(n: int, start: int = 1) -> list[dict[str, object]]:
    return [
        {
            "ra_number": f"RA{i:04d}",
            "name": f"Student {i}",
            "email": f"s{i}@example.com",
            "phone": "9876543210",
            "cgpa": 8.1,
            "department": "CSE",
            "skills": "Python, SQL",
            "resume_link": f"https://drive.google.com/file/d/id{i}/view",
        }
        for i in range(start, start + n)
    ]


class DbTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.db = Database(self.dir / "atlas.db")

    def tearDown(self) -> None:
        self.db.close()
        self._tmp.cleanup()

    def new_run(self, n: int = 3) -> tuple[int, list[int]]:
        run_id = self.db.create_run("Campus 2026", csv_filename="students.csv")
        self.db.add_candidates(run_id, _rows(n))
        ids = [c["id"] for c in self.db.list_candidates(run_id)]
        return run_id, ids

    def drive_to_scoring(self, candidate_id: int) -> None:
        pdf = self.dir / f"{candidate_id}.pdf"
        pdf.write_bytes(b"%PDF-1.7 test")
        self.db.start_download(candidate_id)
        self.db.finish_download(candidate_id, pdf)
        self.db.commit_extraction(
            candidate_id, text="Skills: Python", page_count=1, ocr_used=False, pdf_sha256="abc"
        )
        self.db.start_scoring(candidate_id)

    def evaluation(self, score: int = 72) -> dict[str, object]:
        return dict(
            overall_score=score,
            sub_scores={"technical": 70, "projects": 80},
            summary="Solid projects.",
            reasons=["Two full-stack projects matching the criteria"],
            evidence=[{"claim": "React project", "quote": "Built a React dashboard"}],
            claim_mismatches=[],
            model_name="qwen3:8b",
            prompt_hash="p1",
        )


class SchemaTests(DbTestCase):
    def test_pragmas(self) -> None:
        conn = self.db._conn
        self.assertEqual(conn.execute("PRAGMA journal_mode").fetchone()[0].lower(), "wal")
        self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        self.assertEqual(conn.execute("PRAGMA synchronous").fetchone()[0], 2)  # FULL
        self.assertEqual(conn.execute("PRAGMA user_version").fetchone()[0], 1)

    def test_reopen_keeps_data_and_does_not_rerun_schema(self) -> None:
        run_id, _ = self.new_run(2)
        self.db.close()
        self.db = Database(self.dir / "atlas.db")
        self.assertEqual(len(self.db.list_candidates(run_id)), 2)

    def test_newer_schema_is_refused(self) -> None:
        self.db._conn.execute("PRAGMA user_version=99")
        self.db.close()
        with self.assertRaises(Exception):
            Database(self.dir / "atlas.db")
        # restore so tearDown can close a valid handle
        conn = sqlite3.connect(self.dir / "atlas.db")
        conn.execute("PRAGMA user_version=1")
        conn.close()
        self.db = Database(self.dir / "atlas.db")


class RunTests(DbTestCase):
    def test_defaults(self) -> None:
        run = self.db.get_run(self.db.create_run("R"))
        self.assertEqual(run["status"], "draft")
        self.assertEqual((run["shortlist_cutoff"], run["maybe_cutoff"], run["min_shortlist"]), (60, 50, 0))

    def test_configure_and_hash(self) -> None:
        run_id = self.db.create_run("R")
        self.db.configure_run(
            run_id, model_name="qwen3:8b", criteria_prompt="  Strong React projects ",
            shortlist_cutoff=70, maybe_cutoff=55, min_shortlist=300,
            cgpa_min=7.0, departments_allowed=["CSE", " IT ", "CSE"],
        )
        run = self.db.get_run(run_id)
        self.assertEqual(run["criteria_prompt"], "Strong React projects")
        self.assertEqual(run["criteria_hash"], criteria_hash("Strong React projects"))
        self.assertEqual(run["departments_allowed"], ["CSE", "IT"])
        self.assertEqual(run["min_shortlist"], 300)

    def test_bad_cutoffs_rejected(self) -> None:
        run_id = self.db.create_run("R")
        for kwargs in (
            {"shortlist_cutoff": 101},
            {"maybe_cutoff": -1},
            {"shortlist_cutoff": 50, "maybe_cutoff": 60},
            {"shortlist_cutoff": 60.5},
            {"min_shortlist": -3},
            {"cgpa_min": 11},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValidationError):
                self.db.configure_run(run_id, **kwargs)

    def test_config_locked_after_start(self) -> None:
        run_id = self.db.create_run("R")
        self.db.configure_run(run_id, model_name="qwen3:8b")
        self.db.set_run_status(run_id, "running")
        with self.assertRaises(RunLockedError):
            self.db.configure_run(run_id, criteria_prompt="changed mid-run")
        with self.assertRaises(RunLockedError):
            self.db.add_candidates(run_id, _rows(1))

    def test_cannot_start_without_model(self) -> None:
        run_id = self.db.create_run("R")
        with self.assertRaises(ValidationError):
            self.db.set_run_status(run_id, "running")

    def test_run_status_transitions(self) -> None:
        run_id = self.db.create_run("R")
        self.db.configure_run(run_id, model_name="m")
        self.db.set_run_status(run_id, "running")
        self.db.set_run_status(run_id, "paused", reason="No internet connection")
        self.assertEqual(self.db.get_run(run_id)["pause_reason"], "No internet connection")
        self.db.set_run_status(run_id, "running")
        self.assertIsNone(self.db.get_run(run_id)["pause_reason"])
        self.db.set_run_status(run_id, "completed")
        with self.assertRaises(InvalidTransitionError):
            self.db.set_run_status(run_id, "draft")

    def test_delete_run_cascades(self) -> None:
        run_id, ids = self.new_run(2)
        self.db.delete_run(run_id)
        with self.assertRaises(NotFoundError):
            self.db.get_candidate(ids[0])


class CandidateInputTests(DbTestCase):
    def test_duplicate_ra_rolls_back_whole_batch(self) -> None:
        run_id = self.db.create_run("R")
        rows = _rows(3) + _rows(1)  # RA0001 twice
        with self.assertRaises(ValidationError) as ctx:
            self.db.add_candidates(run_id, rows)
        self.assertIn("RA0001", str(ctx.exception))
        self.assertEqual(self.db.list_candidates(run_id), [])

    def test_missing_link_or_ra_rejected(self) -> None:
        run_id = self.db.create_run("R")
        with self.assertRaises(ValidationError):
            self.db.add_candidates(run_id, [{"ra_number": "RA1", "resume_link": " "}])
        with self.assertRaises(ValidationError):
            self.db.add_candidates(run_id, [{"ra_number": "", "resume_link": "https://x"}])

    def test_bad_cgpa_rejected(self) -> None:
        run_id = self.db.create_run("R")
        with self.assertRaises(ValidationError):
            self.db.add_candidates(run_id, [{"ra_number": "RA1", "resume_link": "https://x", "cgpa": 42}])

    def test_same_ra_allowed_in_different_runs(self) -> None:
        a = self.db.create_run("A")
        b = self.db.create_run("B")
        self.db.add_candidates(a, _rows(1))
        self.db.add_candidates(b, _rows(1))


class StateMachineTests(DbTestCase):
    def test_happy_path(self) -> None:
        _, ids = self.new_run(1)
        cid = ids[0]
        self.drive_to_scoring(cid)
        self.db.save_evaluation(cid, **self.evaluation())
        cand = self.db.get_candidate(cid)
        self.assertEqual(cand["state"], "scored")
        self.assertEqual(cand["attempts"], 1)
        self.assertIsNone(cand["pdf_path"])
        ev = self.db.get_evaluation(cid)
        self.assertEqual(ev["overall_score"], 72)
        self.assertEqual(ev["reasons"], ["Two full-stack projects matching the criteria"])

    def test_skipping_states_is_refused(self) -> None:
        _, ids = self.new_run(1)
        with self.assertRaises(InvalidTransitionError):
            self.db.start_scoring(ids[0])  # queued → scoring
        with self.assertRaises(InvalidTransitionError):
            self.db.commit_extraction(ids[0], text="x", page_count=1, ocr_used=False, pdf_sha256="h")
        self.assertIsNone(self.db.get_resume_text(ids[0]))

    def test_double_start_is_refused(self) -> None:
        _, ids = self.new_run(1)
        self.db.start_download(ids[0])
        with self.assertRaises(InvalidTransitionError):
            self.db.start_download(ids[0])

    def test_empty_extraction_refused(self) -> None:
        _, ids = self.new_run(1)
        self.db.start_download(ids[0])
        self.db.finish_download(ids[0], self.dir / "x.pdf")
        with self.assertRaises(ValidationError):
            self.db.commit_extraction(ids[0], text="   ", page_count=1, ocr_used=False, pdf_sha256="h")
        self.assertEqual(self.db.get_candidate(ids[0])["state"], "downloaded")

    def test_invalid_evaluation_leaves_state_untouched(self) -> None:
        _, ids = self.new_run(1)
        self.drive_to_scoring(ids[0])
        bad = self.evaluation()
        for key, value in (("overall_score", 140), ("overall_score", True), ("reasons", [])):
            with self.subTest(key=key, value=value):
                with self.assertRaises(ValidationError):
                    self.db.save_evaluation(ids[0], **{**bad, key: value})
                self.assertEqual(self.db.get_candidate(ids[0])["state"], "scoring")
                self.assertIsNone(self.db.get_evaluation(ids[0]))
        with self.assertRaises(ValidationError):
            self.db.save_evaluation(ids[0], **{**bad, "sub_scores": {"technical": 300}})

    def test_failure_needs_kind_and_reason(self) -> None:
        _, ids = self.new_run(1)
        with self.assertRaises(ValidationError):
            self.db.mark_failed(ids[0], kind="fatal", reason="x")
        with self.assertRaises(ValidationError):
            self.db.mark_failed(ids[0], kind="permanent", reason="  ")
        self.db.mark_failed(ids[0], kind="permanent", reason="Link is private")
        cand = self.db.get_candidate(ids[0])
        self.assertEqual((cand["state"], cand["failure_kind"]), ("failed", "permanent"))

    def test_scored_is_terminal(self) -> None:
        _, ids = self.new_run(1)
        self.drive_to_scoring(ids[0])
        self.db.save_evaluation(ids[0], **self.evaluation())
        with self.assertRaises(InvalidTransitionError):
            self.db.mark_failed(ids[0], kind="retryable", reason="x")

    def test_retry_failed_routes_by_progress(self) -> None:
        run_id, ids = self.new_run(3)
        a, b, c = ids
        self.db.mark_failed(a, kind="retryable", reason="Drive rate limit")   # never downloaded
        self.drive_to_scoring(b)
        self.db.mark_failed(b, kind="retryable", reason="Model returned invalid JSON")  # has text
        self.db.mark_failed(c, kind="permanent", reason="Link is private")

        self.assertEqual(self.db.retry_failed(run_id), 2)
        self.assertEqual(self.db.get_candidate(a)["state"], "queued")
        self.assertEqual(self.db.get_candidate(b)["state"], "extracted")
        self.assertIsNone(self.db.get_candidate(b)["failure_kind"])
        self.assertEqual(self.db.get_candidate(c)["state"], "failed")

        self.assertEqual(self.db.retry_failed(run_id, include_permanent=True), 1)
        self.assertEqual(self.db.get_candidate(c)["state"], "queued")

    def test_system_pause_returns_work(self) -> None:
        _, ids = self.new_run(2)
        self.db.start_download(ids[0])
        self.db.return_to_queue(ids[0])
        self.assertEqual(self.db.get_candidate(ids[0])["state"], "queued")
        self.drive_to_scoring(ids[1])
        self.db.return_to_extracted(ids[1])
        self.assertEqual(self.db.get_candidate(ids[1])["state"], "extracted")

    def test_filtered(self) -> None:
        run_id, ids = self.new_run(1)
        self.db.mark_filtered(ids[0], reason="CGPA below 7.0")
        self.assertEqual(self.db.state_counts(run_id)["filtered"], 1)

    def test_concurrent_claims_only_one_wins(self) -> None:
        _, ids = self.new_run(1)
        wins: list[bool] = []

        def claim() -> None:
            try:
                self.db.start_download(ids[0])
                wins.append(True)
            except InvalidTransitionError:
                wins.append(False)

        threads = [threading.Thread(target=claim) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(wins.count(True), 1)
        self.assertEqual(self.db.get_candidate(ids[0])["attempts"], 1)


class RecoveryTests(DbTestCase):
    def test_recover_after_crash(self) -> None:
        run_id = self.db.create_run("R")
        self.db.add_candidates(run_id, _rows(5))
        self.db.configure_run(run_id, model_name="qwen3:8b")
        self.db.set_run_status(run_id, "running")
        a, b, c, d, e = [x["id"] for x in self.db.list_candidates(run_id)]

        downloads = self.dir / "downloads"
        downloads.mkdir()
        # a: crashed mid-download
        self.db.start_download(a)
        # b: downloaded, file still on disk → keep
        kept = downloads / "b.pdf"
        kept.write_bytes(b"%PDF")
        self.db.start_download(b)
        self.db.finish_download(b, kept)
        # c: downloaded, but file vanished → requeue
        self.db.start_download(c)
        self.db.finish_download(c, downloads / "gone.pdf")
        # d: crashed mid-LLM call
        self.drive_to_scoring(d)
        # e: untouched; plus an orphan left from a crash after commit
        orphan = downloads / "orphan.pdf"
        orphan.write_bytes(b"%PDF")
        (downloads / "notes.txt").write_text("not ours")  # never reported

        # Simulate the process dying: close without any cleanup, reopen.
        self.db.close()
        self.db = Database(self.dir / "atlas.db")
        report = self.db.recover_after_crash(downloads)

        self.assertEqual(report.runs_paused, 1)
        self.assertEqual(report.candidates_requeued, 2)
        self.assertEqual(report.candidates_rewound_to_extracted, 1)
        self.assertEqual(report.orphan_pdf_paths, (str(orphan),))
        states = {x["id"]: x["state"] for x in self.db.list_candidates(run_id)}
        self.assertEqual(states, {a: "queued", b: "downloaded", c: "queued", d: "extracted", e: "queued"})
        run = self.db.get_run(run_id)
        self.assertEqual(run["status"], "paused")
        self.assertIn("closed unexpectedly", run["pause_reason"])

    def test_recovery_is_idempotent(self) -> None:
        self.new_run(1)
        first = self.db.recover_after_crash()
        second = self.db.recover_after_crash()
        self.assertEqual(second.candidates_requeued, 0)
        self.assertEqual(first.runs_paused, 0)


class OverrideAndSettingsTests(DbTestCase):
    def test_latest_override_wins(self) -> None:
        run_id, ids = self.new_run(1)
        with self.assertRaises(InvalidTransitionError):
            self.db.add_override(ids[0], from_bucket="cutoff", to_bucket="shortlisted")
        self.drive_to_scoring(ids[0])
        self.db.save_evaluation(ids[0], **self.evaluation(55))
        self.db.add_override(ids[0], from_bucket="cutoff", to_bucket="shortlisted", note="Strong interview")
        self.db.add_override(ids[0], from_bucket="shortlisted", to_bucket="rejected")
        self.assertEqual(self.db.latest_overrides(run_id), {ids[0]: "rejected"})
        with self.assertRaises(ValidationError):
            self.db.add_override(ids[0], from_bucket="x", to_bucket="maybe")

    def test_settings_roundtrip(self) -> None:
        self.assertEqual(self.db.get_setting("theme", "system"), "system")
        self.db.set_setting("theme", "dark")
        self.db.set_setting("theme", "light")
        self.assertEqual(self.db.get_setting("theme"), "light")

    def test_events_are_logged(self) -> None:
        run_id, ids = self.new_run(1)
        self.db.mark_failed(ids[0], kind="permanent", reason="Not a PDF")
        messages = [e["message"] for e in self.db.events(run_id)]
        self.assertTrue(any("Not a PDF" in m for m in messages))


if __name__ == "__main__":
    unittest.main()
