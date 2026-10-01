"""Tests for engine/worker.py with a fake for every stage.

The fakes behave like the real stages (the downloader really writes a file,
the extractor really needs it to exist) but are scriptable per candidate, so
each test can stage exactly one kind of trouble.
"""

from __future__ import annotations

import re
import tempfile
import threading
import time
import unittest
from pathlib import Path
from typing import Any, Callable
from unittest.mock import patch

from engine.db import Database
from engine.errors import (
    CandidateError,
    Flag,
    Pause,
    Reason,
    SystemUnavailable,
    TransientError,
)
from engine.extract.pdf import Extraction
from engine.ingest.downloader import Downloaded
from engine.llm.schema import Evaluation
from engine.llm.scorer import ScoreResult
from engine.worker import Worker

LINK = "https://files.example/{}.pdf"


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #


class Once:
    """Raise ``exc`` the first ``times`` calls, then succeed."""

    def __init__(self, exc: BaseException, times: int = 1) -> None:
        self.exc, self.left = exc, times

    def __call__(self) -> None:
        if self.left > 0:
            self.left -= 1
            raise self.exc


class FakeDownloader:
    def __init__(self) -> None:
        self.actions: dict[str, Any] = {}      # link → exception or callable
        self.calls: list[str] = []
        self.online = True
        self.portal = False                     # behind a Wi-Fi sign-in page: every file is its HTML
        self.max_files_seen = 0
        self._lock = threading.Lock()

    def fetch(self, link: str, dest_dir: Path | str, stem: str) -> Downloaded:
        with self._lock:
            self.calls.append(link)
        if not self.online:
            raise TransientError("internet", Reason.TIMEOUT, "fake: offline")
        if self.portal:
            raise CandidateError("permanent", Reason.NOT_PDF)
        action = self.actions.get(link)
        if isinstance(action, BaseException):
            raise action
        if callable(action):
            action()
        dest = Path(dest_dir)
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / f"{stem}.pdf"
        data = b"%PDF-1.7 fake " + link.encode()
        path.write_bytes(data)
        with self._lock:
            self.max_files_seen = max(self.max_files_seen, _files_in(dest))
        return Downloaded(path, "sha", len(data))


class FakeExtractor:
    def __init__(self) -> None:
        self.actions: dict[str, BaseException] = {}   # candidate id (file stem) → exception
        self.page_counts: dict[str, int] = {}
        self.gate: threading.Event | None = None
        self.seen: list[str] = []

    def extract(self, path: Path | str) -> Extraction:
        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(path)
        if self.gate is not None:
            self.gate.wait(10)
        stem = path.stem
        self.seen.append(stem)
        if stem in self.actions:
            raise self.actions[stem]
        text = (f"PROJECTS\nProject for candidate {stem}\n- Built a useful tool for candidate {stem}\n"
                "SKILLS\nPython, SQL")
        pages = self.page_counts.get(stem, 2)
        return Extraction(text, (text,), pages, False, max(0, pages - 10))


def result_for(score: int) -> ScoreResult:
    evaluation = Evaluation.model_validate({
        "overall_score": score,
        "sub_scores": {k: score for k in ("technical", "projects", "experience", "achievements",
                                          "communication", "criteria_fit")},
        "summary": "Fine.", "reasons": ["Relevant project"], "claim_mismatches": [],
        "evidence": [{"claim": "tool", "quote": "Built a useful tool"}],
    })
    return ScoreResult(evaluation, (), '{"raw": true}', "prompt-hash", "fake-model", 0.25, 1, ("projects",), ())


class FakeScorer:
    def __init__(self) -> None:
        self.calls = 0
        self.delay = 0.0
        self.action: Callable[[int], ScoreResult | None] | None = None   # candidate id → result, or raise
        self._lock = threading.Lock()

    def score(self, context, sections, full_text) -> ScoreResult:
        with self._lock:
            self.calls += 1
        if self.delay:
            time.sleep(self.delay)
        cid = int(re.search(r"candidate (\d+)", full_text).group(1))
        if self.action is not None:
            result = self.action(cid)
            if result is not None:
                return result
        return result_for(40 + cid % 60)


class FakeHealth:
    def __init__(self) -> None:
        self.internet = True
        self.captive = False
        self.ollama = True
        self.checks: list[str] = []

    def internet_ok(self) -> bool:
        return self.internet_problem() is None

    def internet_problem(self) -> str | None:
        self.checks.append("internet")
        if not self.internet:
            return Pause.NO_INTERNET
        return Pause.CAPTIVE_PORTAL if self.captive else None

    def ollama_ok(self) -> bool:
        self.checks.append("ollama")
        return self.ollama


class ManualClock:
    def __init__(self) -> None:
        self.now = 0.0
        self._lock = threading.Lock()

    def __call__(self) -> float:
        with self._lock:
            return self.now

    def advance(self, seconds: float) -> None:
        with self._lock:
            self.now += seconds


def _files_in(directory: Path) -> int:
    return sum(1 for p in directory.iterdir() if p.suffix in (".pdf", ".part")) if directory.exists() else 0


# --------------------------------------------------------------------------- #
# Base
# --------------------------------------------------------------------------- #


class WorkerTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.db = Database(self.dir / "atlas.db")
        self.downloader = FakeDownloader()
        self.extractor = FakeExtractor()
        self.scorer = FakeScorer()
        self.health = FakeHealth()
        self.clock = ManualClock()
        self.workers: list[Worker] = []

    def tearDown(self) -> None:
        for worker in self.workers:
            worker.stop(timeout=10)
        self.db.close()
        self._tmp.cleanup()

    def worker(self, **kwargs: Any) -> Worker:
        options = {"clock": self.clock, "idle_interval": 0.005, "poll_interval": 5.0, **kwargs}
        worker = Worker(self.db, self.dir, self.downloader, self.extractor, lambda run: self.scorer,
                        self.health, **options)
        self.workers.append(worker)
        return worker

    def make_run(self, n: int, **config: Any) -> tuple[int, list[int]]:
        run_id = self.db.create_run("Test run")
        self.db.configure_run(run_id, model_name="fake-model", criteria_prompt="Python projects", **config)
        rows = [{"ra_number": f"RA{i:04d}", "name": f"Student {i}", "email": f"s{i}@example.com",
                 "phone": "9876543210", "resume_link": LINK.format(i), "cgpa": 8.0, "department": "CSE"}
                for i in range(1, n + 1)]
        self.db.add_candidates(run_id, rows)
        return run_id, [c["id"] for c in self.db.list_candidates(run_id)]

    def wait_until(self, predicate: Callable[[], bool], timeout: float = 15.0, what: str = "") -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.005)
        self.fail(f"timed out waiting for {what or predicate}")

    def status(self, run_id: int) -> tuple[str, str | None]:
        run = self.db.get_run(run_id)
        return run["status"], run["pause_reason"]

    def counts(self, run_id: int) -> dict[str, int]:
        return {k: v for k, v in self.db.state_counts(run_id).items() if v}

    def downloads(self) -> list[str]:
        folder = self.dir / "downloads"
        return sorted(p.name for p in folder.iterdir()) if folder.exists() else []


# --------------------------------------------------------------------------- #
# 1. Happy path, prefetch gate, delete-after-commit
# --------------------------------------------------------------------------- #


class HappyPathTests(WorkerTestCase):
    def test_twenty_candidates_all_scored_with_at_most_two_pdfs_on_disk(self) -> None:
        run_id, ids = self.make_run(20)
        self.scorer.delay = 0.01            # a slower scorer backs up the pipeline
        samples = {"files": 0, "in_flight": 0}
        stop = threading.Event()

        def sample() -> None:
            while not stop.is_set():
                counts = self.db.state_counts(run_id)
                samples["in_flight"] = max(samples["in_flight"],
                                           counts["downloading"] + counts["downloaded"] + counts["extracted"])
                samples["files"] = max(samples["files"], _files_in(self.dir / "downloads"))
                time.sleep(0.001)

        sampler = threading.Thread(target=sample)
        sampler.start()
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")
        stop.set()
        sampler.join()

        self.assertEqual(self.counts(run_id), {"scored": 20})
        self.assertEqual(self.downloads(), [])
        self.assertLessEqual(samples["files"], 2)
        self.assertLessEqual(self.downloader.max_files_seen, 2)
        self.assertLessEqual(samples["in_flight"], 2)
        self.assertEqual(self.downloader.calls, [LINK.format(i) for i in range(1, 21)])   # CSV order
        ev = self.db.get_evaluation(ids[4])
        self.assertEqual((ev["overall_score"], ev["duration_seconds"], ev["flags"]), (40 + ids[4] % 60, 0.25, []))
        self.assertEqual(sum(1 for e in self.db.events(run_id, limit=500) if e["message"].startswith("Scored")), 20)
        self.assertTrue(worker.wait_idle(5))

    def test_prefetch_gate_stops_downloads_while_extraction_is_blocked(self) -> None:
        run_id, _ = self.make_run(6)
        self.extractor.gate = threading.Event()
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: len(self.downloader.calls) == 2, what="two downloads")
        time.sleep(0.2)                                   # plenty of time to overstep, if it could
        self.assertEqual(len(self.downloader.calls), 2)
        self.extractor.gate.set()
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 6})

    def test_pdf_is_deleted_only_after_the_text_is_committed(self) -> None:
        run_id, ids = self.make_run(1)
        observed: dict[str, Any] = {}
        real_commit = self.db.commit_extraction

        def commit(cid: int, **kwargs: Any) -> None:
            observed["file_during_commit"] = (self.dir / "downloads" / f"{cid}.pdf").exists()
            real_commit(cid, **kwargs)

        with patch.object(self.db, "commit_extraction", side_effect=commit):
            self.worker().start(run_id)
            self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertTrue(observed["file_during_commit"])
        self.assertEqual(self.downloads(), [])
        self.assertIn("Project for candidate", self.db.get_resume_text(ids[0])["text"])

    def test_a_pdf_that_cannot_be_deleted_now_is_cleaned_up_next_start(self) -> None:
        run_id, _ = self.make_run(2)
        real_unlink = Path.unlink
        with patch.object(Path, "unlink", autospec=True,
                          side_effect=lambda p, missing_ok=False: (_ for _ in ()).throw(PermissionError(13, "locked"))
                          if p.suffix == ".pdf" else real_unlink(p, missing_ok=missing_ok)):
            worker = self.worker()
            worker.start(run_id)
            self.wait_until(lambda: self.status(run_id)[0] == "completed")
            worker.stop()
        self.assertEqual(len(self.downloads()), 2)          # left behind, but unreferenced
        run_2, _ = self.make_run(1)
        self.worker().start(run_2)                          # a fresh start runs crash recovery
        self.wait_until(lambda: self.status(run_2)[0] == "completed")
        self.assertEqual(self.downloads(), [])

    def test_long_resume_is_flagged(self) -> None:
        run_id, ids = self.make_run(1)
        self.extractor.page_counts[str(ids[0])] = 14
        self.worker().start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.db.get_evaluation(ids[0])["flags"], [Flag.PAGES_NOT_READ])


# --------------------------------------------------------------------------- #
# 2–4. System problems pause the run; nobody is failed
# --------------------------------------------------------------------------- #


class SystemProblemTests(WorkerTestCase):
    def test_network_loss_pauses_with_zero_failures_then_auto_resumes(self) -> None:
        run_id, _ = self.make_run(12)

        def pull_the_cable() -> None:
            self.downloader.online = False
            self.health.internet = False

        self.downloader.actions[LINK.format(5)] = pull_the_cable
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id) == ("paused", Pause.NO_INTERNET), what="network pause")
        self.assertTrue(worker.wait_idle(5))
        counts = self.counts(run_id)
        self.assertNotIn("failed", counts)
        self.assertEqual(counts.get("downloading", 0), 0)
        self.assertGreater(counts.get("queued", 0), 0)

        # Cable back in: nothing happens until the next 5-second poll.
        self.downloader.online = True
        self.health.internet = True
        time.sleep(0.1)
        self.assertEqual(self.status(run_id)[0], "paused")
        self.clock.advance(5.0)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="auto-resume and completion")
        self.assertEqual(self.counts(run_id), {"scored": 12})

    def test_a_wifi_sign_in_page_pauses_instead_of_failing_everyone(self) -> None:
        # The TCP probe passes behind a captive portal and every "download" is its HTML page.
        run_id, _ = self.make_run(10)

        def join_hotel_wifi() -> None:
            self.downloader.portal = True
            self.health.captive = True

        self.downloader.actions[LINK.format(4)] = join_hotel_wifi
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id) == ("paused", Pause.CAPTIVE_PORTAL), what="captive pause")
        self.assertTrue(worker.wait_idle(5))
        self.assertNotIn("failed", self.counts(run_id))

        self.downloader.portal = False             # the recruiter signed in
        self.health.captive = False
        self.clock.advance(5.0)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="auto-resume after sign-in")
        self.assertEqual(self.counts(run_id), {"scored": 10})

    def test_a_real_non_pdf_still_fails_that_student(self) -> None:
        run_id, _ = self.make_run(3)
        self.downloader.actions[LINK.format(2)] = CandidateError("permanent", Reason.NOT_PDF)
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed", what="completion")
        self.assertEqual(self.counts(run_id), {"scored": 2, "failed": 1})

    def test_ollama_loss_returns_scoring_to_extracted_and_auto_resumes(self) -> None:
        run_id, ids = self.make_run(8)
        tripped = {"done": False}

        def maybe_down(cid: int) -> None:
            if cid == ids[3] and not tripped["done"]:    # Ollama dies while scoring the 4th, once
                tripped["done"] = True
                self.health.ollama = False
            if not self.health.ollama:
                raise TransientError("ollama", Reason.MODEL_STOPPED, "fake: connection refused")
            return None

        self.scorer.action = maybe_down
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id) == ("paused", Pause.OLLAMA_DOWN), what="Ollama pause")
        self.assertTrue(worker.wait_idle(5))
        counts = self.counts(run_id)
        self.assertNotIn("failed", counts)
        self.assertEqual(counts.get("scoring", 0), 0)
        self.assertEqual(self.db.get_candidate(ids[3])["state"], "extracted")   # the in-flight one went back

        self.health.ollama = True
        self.clock.advance(5.0)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 8})

    def test_disk_full_pauses_and_waits_for_the_user(self) -> None:
        run_id, _ = self.make_run(5)
        self.downloader.actions[LINK.format(3)] = Once(SystemUnavailable(Pause.DISK_FULL))
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id) == ("paused", Pause.DISK_FULL))
        self.clock.advance(60.0)
        time.sleep(0.1)
        self.assertEqual(self.status(run_id)[0], "paused")          # never resumes on its own
        self.assertNotIn("failed", self.counts(run_id))
        worker.resume(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 5})

    def test_transient_error_with_healthy_probe_fails_only_that_candidate(self) -> None:
        run_id, ids = self.make_run(4)
        self.downloader.actions[LINK.format(2)] = TransientError("internet", Reason.UNREACHABLE, "fake: dns")
        self.worker().start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 3, "failed": 1})
        failed = self.db.get_candidate(ids[1])
        self.assertEqual((failed["failure_kind"], failed["failure_reason"]), ("retryable", Reason.UNREACHABLE))
        self.assertIn("internet", self.health.checks)

    def test_paused_by_user_never_resumes_on_its_own(self) -> None:
        run_id, _ = self.make_run(30)
        self.scorer.delay = 0.02
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.db.state_counts(run_id)["scored"] >= 2)
        worker.pause(run_id)
        self.assertTrue(worker.wait_idle(5))
        done = self.db.state_counts(run_id)["scored"]
        self.clock.advance(60)
        time.sleep(0.15)
        self.assertEqual(self.status(run_id), ("paused", Pause.BY_USER))
        self.assertEqual(self.db.state_counts(run_id)["scored"], done)
        worker.resume(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 30})


# --------------------------------------------------------------------------- #
# 5. Candidate failures, then "Retry failed"
# --------------------------------------------------------------------------- #


class CandidateFailureTests(WorkerTestCase):
    def test_mixed_failures_then_retry(self) -> None:
        run_id, ids = self.make_run(8)
        self.downloader.actions[LINK.format(2)] = CandidateError("permanent", Reason.PRIVATE)
        self.downloader.actions[LINK.format(3)] = Once(CandidateError("retryable", Reason.HOST_ERROR))
        self.extractor.actions[str(ids[4])] = CandidateError("permanent", Reason.DAMAGED)
        flaky = {ids[6]}
        self.scorer.action = lambda cid: (_ for _ in ()).throw(
            CandidateError("retryable", Reason.MODEL_UNREADABLE)) if cid in flaky else None

        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 4, "failed": 4})
        reasons = {c["id"]: (c["failure_kind"], c["failure_reason"])
                   for c in self.db.list_candidates(run_id, states=["failed"])}
        self.assertEqual(reasons, {
            ids[1]: ("permanent", Reason.PRIVATE),
            ids[2]: ("retryable", Reason.HOST_ERROR),
            ids[4]: ("permanent", Reason.DAMAGED),
            ids[6]: ("retryable", Reason.MODEL_UNREADABLE),
        })
        self.assertEqual(self.downloads(), [])              # the damaged PDF was deleted too

        # "Retry failed": retryable only. The scoring failure keeps its text (no re-download).
        flaky.clear()
        downloads_before = len(self.downloader.calls)
        self.assertEqual(self.db.retry_failed(run_id), 2)
        self.assertEqual(self.db.get_candidate(ids[6])["state"], "extracted")
        worker.start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 6, "failed": 2})
        self.assertEqual(self.downloader.calls[downloads_before:], [LINK.format(3)])

    def test_missing_pdf_at_extraction_is_downloaded_again(self) -> None:
        run_id, ids = self.make_run(1)
        real_extract = self.extractor.extract
        state = {"removed": False}

        def vanish_once(path: Path | str) -> Extraction:
            if not state["removed"]:
                state["removed"] = True
                Path(path).unlink()
            return real_extract(path)

        self.extractor.extract = vanish_once  # type: ignore[method-assign]
        self.worker().start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 1})
        self.assertEqual(len(self.downloader.calls), 2)
        self.assertEqual(self.db.get_candidate(ids[0])["attempts"], 2)


# --------------------------------------------------------------------------- #
# 6. Bugs: one bad candidate never stops the run; five in a row pause it
# --------------------------------------------------------------------------- #


class UnexpectedErrorTests(WorkerTestCase):
    def test_a_bug_fails_one_candidate_and_the_run_goes_on(self) -> None:
        run_id, ids = self.make_run(4)
        self.downloader.actions[LINK.format(2)] = ValueError("bug in candidate 2")
        with self.assertLogs("atlas.worker", level="ERROR") as logs:
            self.worker().start(run_id)
            self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 3, "failed": 1})
        failed = self.db.get_candidate(ids[1])
        self.assertEqual((failed["failure_kind"], failed["failure_reason"]), ("retryable", Reason.UNEXPECTED))
        self.assertTrue(any("Traceback" in line for line in logs.output))

    def test_the_same_bug_five_times_in_a_row_pauses_the_run(self) -> None:
        run_id, ids = self.make_run(12)
        broken = set(ids[:3]) | set(ids[4:9])            # a success (ids[3]) breaks the streak

        def action(cid: int) -> None:
            if cid in broken:
                raise KeyError(f"missing field for {cid}")
            return None

        self.scorer.action = action
        with self.assertLogs("atlas.worker", level="ERROR"):
            worker = self.worker()
            worker.start(run_id)
            self.wait_until(lambda: self.status(run_id) == ("paused", Pause.REPEATED_ERRORS))
            self.assertTrue(worker.wait_idle(5))
        failed = [c["id"] for c in self.db.list_candidates(run_id, states=["failed"])]
        self.assertEqual(failed, ids[:3] + ids[4:8])      # 3, then 4 more; the 5th in a row is handed back
        self.assertEqual(self.db.get_candidate(ids[8])["state"], "extracted")
        self.assertEqual(self.db.get_candidate(ids[3])["state"], "scored")
        self.assertEqual(self.db.state_counts(run_id)["scoring"], 0)

    def test_a_failure_after_the_claim_never_leaves_a_candidate_stuck(self) -> None:
        run_id, ids = self.make_run(3)
        real_save = self.db.save_evaluation
        calls = {"n": 0}

        def save_once_broken(cid: int, **kwargs: Any) -> None:
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("bug while saving")
            real_save(cid, **kwargs)

        with patch.object(self.db, "save_evaluation", side_effect=save_once_broken), \
                self.assertLogs("atlas.worker", level="ERROR"):
            self.worker().start(run_id)
            self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 2, "failed": 1})
        self.assertEqual(self.db.get_candidate(ids[0])["failure_reason"], Reason.UNEXPECTED)

    def test_reconcile_hands_back_unheld_candidates_only_when_idle(self) -> None:
        run_id, ids = self.make_run(3)
        self.db.start_download(ids[0])
        self.db.start_download(ids[1])
        self.db.finish_download(ids[1], self.dir / "x.pdf")
        self.db.commit_extraction(ids[1], text="t", page_count=1, ocr_used=False, pdf_sha256="h")
        self.db.start_scoring(ids[1])
        worker = self.worker()
        worker._run_id = run_id
        worker._busy["score"] = True                     # someone is mid-claim: hands off
        worker._reconcile()
        self.assertEqual(self.db.get_candidate(ids[0])["state"], "downloading")
        worker._busy["score"] = False
        worker._reconcile()
        self.assertEqual(self.db.get_candidate(ids[0])["state"], "queued")
        self.assertEqual(self.db.get_candidate(ids[1])["state"], "extracted")


# --------------------------------------------------------------------------- #
# 7. Graceful stop, then a new worker finishes the run
# --------------------------------------------------------------------------- #


class StopAndRecoveryTests(WorkerTestCase):
    def test_stop_pauses_and_a_new_worker_resumes_to_completion(self) -> None:
        run_id, _ = self.make_run(25)
        self.scorer.delay = 0.02
        worker = self.worker()
        worker.start(run_id)
        self.wait_until(lambda: self.db.state_counts(run_id)["scored"] >= 3)
        worker.stop()
        self.assertEqual(self.status(run_id), ("paused", Pause.CLOSED))
        counts = self.db.state_counts(run_id)
        self.assertEqual(counts["downloading"] + counts["scoring"], 0)   # current items were finished

        second = self.worker()
        second.resume(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 25})
        evaluations = self.db._conn.execute("SELECT COUNT(*) FROM evaluations").fetchone()[0]
        self.assertEqual(evaluations, 25)
        self.assertEqual(self.downloads(), [])

    def test_start_recovers_what_a_crash_left_behind(self) -> None:
        run_id, ids = self.make_run(4)
        self.db.set_run_status(run_id, "running")
        downloads = self.dir / "downloads"
        downloads.mkdir()
        self.db.start_download(ids[0])                       # died mid-download
        (downloads / f"{ids[0]}.part").write_bytes(b"%PDF-half")
        self.db.start_download(ids[1])                       # died mid-scoring
        self.db.finish_download(ids[1], downloads / "x.pdf")
        (downloads / "x.pdf").write_bytes(b"%PDF")
        self.db.commit_extraction(ids[1], text="PROJECTS\nProject for candidate 99\n- Built a useful tool",
                                  page_count=1, ocr_used=False, pdf_sha256="h")
        self.db.start_scoring(ids[1])
        (downloads / "orphan.pdf").write_bytes(b"%PDF")       # committed but not yet deleted

        self.worker().start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 4})
        self.assertEqual(self.downloads(), [])


# --------------------------------------------------------------------------- #
# 8. Hard filters
# --------------------------------------------------------------------------- #


class FilterTests(WorkerTestCase):
    def test_filtered_candidates_are_never_downloaded(self) -> None:
        run_id = self.db.create_run("Filters")
        self.db.configure_run(run_id, model_name="fake-model", cgpa_min=7.5, departments_allowed=["CSE", "IT"])
        rows = [
            {"ra_number": "RA1", "resume_link": LINK.format(1), "cgpa": 8.2, "department": "CSE"},
            {"ra_number": "RA2", "resume_link": LINK.format(2), "cgpa": 6.9, "department": "CSE"},
            {"ra_number": "RA3", "resume_link": LINK.format(3), "cgpa": 9.0, "department": "ECE"},
            {"ra_number": "RA4", "resume_link": LINK.format(4), "cgpa": None, "department": "c.s.e."},
            {"ra_number": "RA5", "resume_link": LINK.format(5), "cgpa": 7.5, "department": ""},
        ]
        self.db.add_candidates(run_id, rows)
        self.worker().start(run_id)
        self.wait_until(lambda: self.status(run_id)[0] == "completed")
        self.assertEqual(self.counts(run_id), {"scored": 3, "filtered": 2})
        self.assertEqual(sorted(self.downloader.calls), [LINK.format(1), LINK.format(4), LINK.format(5)])
        reasons = {c["ra_number"]: c["filter_reason"] for c in self.db.list_candidates(run_id, states=["filtered"])}
        self.assertEqual(reasons, {
            "RA2": "CGPA 6.9 is below the minimum of 7.5.",
            "RA3": "Department ECE isn't one of the selected departments (CSE, IT).",
        })


if __name__ == "__main__":
    unittest.main()
