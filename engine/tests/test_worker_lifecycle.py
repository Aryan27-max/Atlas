"""Worker lifecycle added for the app (Phase 2, step 2.0b).

``recover()`` at boot, ``cancel()``, ``attach()`` (auto-resume after a
restart), filters applied once plus ``clear_filters``, one run at a time,
and the per-model timing history the estimate reads.
"""

from __future__ import annotations

import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from engine.db import InvalidTransitionError
from engine.errors import Pause
from engine.estimate import TIMING_SETTING
from engine.tests.test_worker import LINK, WorkerTestCase
from engine.worker import WorkerBusyError, run_waiting_to_resume


class LifecycleTestCase(WorkerTestCase):
    def downloaded_candidate(self, run_id: int) -> tuple[int, Path]:
        """Leave one candidate ``downloaded`` with its PDF on disk, as a crash or cancel would."""
        candidate = self.db.claim_next_download(run_id, max_in_flight=5)
        assert candidate is not None
        pdf = self.dir / "downloads" / f"{candidate['id']}.pdf"
        pdf.parent.mkdir(parents=True, exist_ok=True)
        pdf.write_bytes(b"%PDF-1.7 left behind")
        self.db.finish_download(candidate["id"], pdf)
        return candidate["id"], pdf

    def in_flight(self, run_id: int) -> int:
        counts = self.db.state_counts(run_id)
        return counts["downloading"] + counts["downloaded"] + counts["scoring"]


class RecoverTests(LifecycleTestCase):
    def test_recover_runs_once_and_start_does_not_repeat_it(self) -> None:
        run_id, _ = self.make_run(3)
        worker = self.worker()
        with patch.object(self.db, "recover_after_crash", wraps=self.db.recover_after_crash) as spy:
            worker.recover()
            worker.start(run_id)
            self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")
        self.assertEqual(spy.call_count, 1)

    def test_start_still_recovers_when_nobody_called_recover(self) -> None:
        run_id, ids = self.make_run(2)
        self.db.set_run_status(run_id, "running")
        cid, pdf = self.downloaded_candidate(run_id)
        pdf.unlink()                                   # the crash lost the file
        self.worker().start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")
        self.assertEqual(self.counts(run_id), {"scored": 2})

    def test_recover_releases_what_a_cancelled_run_still_holds(self) -> None:
        run_id, _ = self.make_run(2)
        cid, pdf = self.downloaded_candidate(run_id)
        self.db.set_run_status(run_id, "cancelled")    # cancelled, then the app closed before clean-up
        self.worker().recover()
        self.assertEqual(self.db.get_candidate(cid)["state"], "queued")
        self.assertIsNone(self.db.get_candidate(cid)["pdf_path"])
        self.assertFalse(pdf.exists())

    def test_recover_refuses_while_threads_run(self) -> None:
        run_id, _ = self.make_run(3)
        self.scorer.delay = 0.2
        worker = self.worker()
        worker.start(run_id)
        with self.assertRaises(WorkerBusyError):
            worker.recover()


class CancelTests(LifecycleTestCase):
    def test_cancel_a_running_run_keeps_scores_and_leaves_nothing_in_flight(self) -> None:
        run_id, ids = self.make_run(8)
        self.scorer.delay = 0.1
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.db.state_counts(run_id)["scored"] >= 1, what="first score")
        worker.cancel(run_id, timeout=10)
        self.assertEqual(self.status(run_id)[0], "cancelled")
        self.assertFalse(any(t.is_alive() for t in worker._threads))
        self.assertEqual(self.in_flight(run_id), 0)
        self.assertEqual(self.downloads(), [])
        self.assertGreaterEqual(self.db.state_counts(run_id)["scored"], 1)
        calls = self.scorer.calls
        time.sleep(0.1)
        self.assertEqual(self.scorer.calls, calls, "no work after cancel")

    def test_cancel_a_paused_run_with_no_threads_deletes_its_pdf(self) -> None:
        run_id, _ = self.make_run(3)
        self.db.set_run_status(run_id, "running")
        self.db.set_run_status(run_id, "paused", reason=Pause.CLOSED)
        cid, pdf = self.downloaded_candidate(run_id)
        self.worker().cancel(run_id)
        self.assertEqual(self.status(run_id)[0], "cancelled")
        self.assertEqual(self.db.get_candidate(cid)["state"], "queued")
        self.assertFalse(pdf.exists())

    def test_cancel_a_draft(self) -> None:
        run_id, _ = self.make_run(2)
        self.worker().cancel(run_id)
        self.assertEqual(self.status(run_id)[0], "cancelled")

    def test_cancel_returns_quickly_and_the_last_thread_out_cleans_up(self) -> None:
        run_id, _ = self.make_run(6)
        release = threading.Event()
        started = threading.Event()

        def slow(cid: int) -> None:
            started.set()
            release.wait(10)                  # a long model call
            return None

        self.scorer.action = slow
        worker = self.worker()
        worker.start(run_id)
        self.assertTrue(started.wait(10))
        self.wait_until(lambda: self.db.state_counts(run_id)["downloaded"] >= 1
                        or self.db.state_counts(run_id)["extracted"] >= 1, what="prefetch")
        began = time.monotonic()
        worker.cancel(run_id, timeout=0.2)
        self.assertLess(time.monotonic() - began, 3)
        self.assertEqual(self.status(run_id)[0], "cancelled")
        release.set()
        self.wait_until(lambda: not any(t.is_alive() for t in worker._threads), what="threads to exit")
        self.assertEqual(self.in_flight(run_id), 0)
        self.assertEqual(self.downloads(), [])
        self.assertEqual(self.db.state_counts(run_id)["scored"], 1, "the item in progress still finished")

    def test_a_completed_run_cannot_be_cancelled(self) -> None:
        run_id, _ = self.make_run(1)
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")
        with self.assertRaises(InvalidTransitionError):
            worker.cancel(run_id)

    def test_a_cancelled_run_cannot_start_again(self) -> None:
        run_id, _ = self.make_run(1)
        worker = self.worker()
        worker.cancel(run_id)
        with self.assertRaises(InvalidTransitionError):
            worker.start(run_id)


class AttachTests(LifecycleTestCase):
    def paused_for(self, reason: str, n: int = 3) -> int:
        run_id, _ = self.make_run(n)
        self.db.set_run_status(run_id, "running")
        self.db.set_run_status(run_id, "paused", reason=reason)
        return run_id

    def test_a_run_paused_for_ollama_resumes_by_itself_after_a_restart(self) -> None:
        run_id = self.paused_for(Pause.OLLAMA_DOWN)
        self.assertEqual(run_waiting_to_resume(self.db), run_id)
        self.health.ollama = False
        worker = self.worker()
        worker.recover()
        worker.attach(run_id)
        self.wait_until(lambda: "ollama" in self.health.checks, what="first probe")
        self.assertEqual(self.status(run_id), ("paused", Pause.OLLAMA_DOWN))
        self.health.ollama = True
        self.clock.advance(5.0)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="auto-resume and completion")
        self.assertEqual(self.counts(run_id), {"scored": 3})

    def test_no_internet_is_watched_too(self) -> None:
        run_id = self.paused_for(Pause.NO_INTERNET)
        self.worker().attach(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")

    def test_manual_pause_reasons_are_not_attached(self) -> None:
        for reason in (Pause.CLOSED, Pause.BY_USER, Pause.DISK_FULL, "Atlas closed unexpectedly. Press Resume to continue."):
            with self.subTest(reason=reason):
                run_id = self.paused_for(reason)
                self.assertIsNone(run_waiting_to_resume(self.db))
                with self.assertRaises(InvalidTransitionError):
                    self.worker().attach(run_id)
                self.db.set_run_status(run_id, "cancelled")

    def test_the_most_recently_paused_run_is_chosen(self) -> None:
        first = self.paused_for(Pause.OLLAMA_DOWN)
        time.sleep(0.01)
        second = self.paused_for(Pause.NO_INTERNET)
        self.assertEqual(run_waiting_to_resume(self.db), second)
        self.assertNotEqual(first, second)


class OneRunAtATimeTests(LifecycleTestCase):
    def test_starting_another_run_while_one_is_running_is_refused(self) -> None:
        first, _ = self.make_run(5)
        second, _ = self.make_run(2)
        self.scorer.delay = 0.1
        worker = self.worker()
        worker.start(first)
        with self.assertRaises(WorkerBusyError):
            worker.start(second)
        self.assertEqual(self.status(second)[0], "draft")

    def test_a_paused_run_is_detached_and_keeps_its_reason(self) -> None:
        first, _ = self.make_run(5)
        second, _ = self.make_run(2)
        self.scorer.delay = 0.05
        worker = self.worker()
        worker.start(first)
        worker.pause(first)
        self.assertTrue(worker.wait_idle(10))
        worker.start(second)
        self.wait_until(lambda: self.status(second)[0] == "completed", what="second run")
        self.assertEqual(self.status(first), ("paused", Pause.BY_USER))
        self.assertEqual(self.db.state_counts(first)["downloading"] + self.db.state_counts(first)["scoring"], 0)
        worker.resume(first)
        self.wait_until(lambda: self.status(first)[0] == "completed", what="first run after switching back")

    def test_a_finished_run_does_not_block_the_next(self) -> None:
        first, _ = self.make_run(2)
        second, _ = self.make_run(2)
        worker = self.worker()
        worker.start(first)
        self.wait_until(lambda: self.status(first)[0] == "completed", what="first run")
        worker.start(second)
        self.wait_until(lambda: self.status(second)[0] == "completed", what="second run")


class FiltersTests(LifecycleTestCase):
    def make_mixed_run(self) -> int:
        run_id = self.db.create_run("Filters")
        self.db.configure_run(run_id, model_name="fake-model", criteria_prompt="Python", cgpa_min=8.5)
        rows = [{"ra_number": f"RA{i:04d}", "name": f"S {i}", "resume_link": LINK.format(i),
                 "cgpa": 9.0 if i % 2 else 7.0, "department": "CSE"} for i in range(1, 7)]
        self.db.add_candidates(run_id, rows)
        return run_id

    def test_filters_apply_once_and_cleared_candidates_are_screened_after_resume(self) -> None:
        run_id = self.make_mixed_run()
        self.scorer.delay = 0.05
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.db.state_counts(run_id)["filtered"] == 3, what="filtering")
        worker.pause(run_id)
        self.assertTrue(worker.wait_idle(10))
        self.assertEqual(self.db.clear_filters(run_id), 3)
        worker.resume(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")
        self.assertEqual(self.counts(run_id), {"scored": 6})
        self.assertEqual(self.db.get_run(run_id)["cgpa_min"], 8.5, "the locked config is untouched")


class TimingHistoryTests(LifecycleTestCase):
    def test_scoring_times_are_remembered_per_model(self) -> None:
        run_id, _ = self.make_run(4)
        self.worker().start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")
        # The time is recorded just after the evaluation is saved, so the run can
        # read "completed" a moment before the 4th time lands: wait for it.
        self.wait_until(lambda: len((self.db.get_setting(TIMING_SETTING) or {}).get("fake-model", [])) == 4,
                        what="all four scoring times remembered")
        history = self.db.get_setting(TIMING_SETTING)
        self.assertEqual(len(history["fake-model"]), 4)
        self.assertEqual(self.db.scoring_durations(run_id), [0.25] * 4)


if __name__ == "__main__":
    unittest.main()
