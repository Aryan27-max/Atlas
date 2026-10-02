"""The resumable job loop (ARCHITECTURE §6–§9).

Three threads — fetch, extract, score — connected **through the database**,
never through in-memory queues. Each thread claims work with a state
transition, so if the process dies at any instant every candidate is in a
known state, and ``recover_after_crash`` puts the in-flight ones back.

::

    queued ──fetch──▶ downloading ──▶ downloaded ──extract──▶ extracted ──score──▶ scoring ──▶ scored
                 (≤ prefetch in downloading + downloaded + extracted)

Whose problem is it? (§8)

* ``CandidateError``   → ``mark_failed(kind, reason)``; the run goes on.
* ``SystemUnavailable`` → put the work back, pause the run with the reason.
* ``TransientError``    → ask the health probe. Machine down → as above.
  Machine fine → ask again ``recheck_delay`` seconds later (an outage that
  is just starting can look healthy for a moment); fine both times → this
  candidate fails as retryable.
* anything else (a bug) → logged with a traceback, the candidate fails as
  retryable, the run goes on — unless the *same* bug hits 5 candidates in a
  row, then the run pauses instead of failing everyone.

Only runs paused for "No internet connection", "Connected to Wi-Fi that needs
a sign-in page" or "Ollama isn't running" (``AUTO_RESUME_REASONS``) resume on their own, when the probe (polled every 5 s) says so. After an
app restart, ``attach`` watches such a run again (``run_waiting_to_resume``).

One worker processes one run at a time. Starting another run is refused
while the current one is running; a paused, finished or cancelled run is
detached first (it keeps its status).
"""

from __future__ import annotations

import hashlib
import logging
import re
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator, Protocol

from engine.db import Database, DatabaseError, InvalidTransitionError, RecoveryReport
from engine.errors import (
    AUTO_RESUME_REASONS,
    INTERNET_PAUSES,
    CandidateError,
    Flag,
    Pause,
    Reason,
    SystemUnavailable,
    TransientError,
)
from engine.estimate import TIMING_SETTING, remember
from engine.extract.pdf import MAX_PAGES, Extraction
from engine.extract.sections import split_sections
from engine.filters import filter_reason
from engine.ingest.downloader import Downloaded
from engine.llm.redact import CandidateContext, scoring_input
from engine.llm.scorer import ScoreResult

log = logging.getLogger("atlas.worker")

WORKING_STATES = ("queued", "downloading", "downloaded", "extracted", "scoring")
IN_FLIGHT_STATES = ("downloading", "downloaded", "scoring")
DETACH_TIMEOUT = 10.0       # seconds to wait for the previous run's threads to finish their item


class DownloaderLike(Protocol):
    def fetch(self, link: str, dest_dir: Path | str, stem: str) -> Downloaded: ...


class ExtractorLike(Protocol):
    def extract(self, path: Path | str) -> Extraction: ...


class ScorerLike(Protocol):
    def score(self, candidate_context: CandidateContext, sections: dict[str, str], full_text: str) -> ScoreResult: ...


class HealthLike(Protocol):
    def internet_ok(self) -> bool: ...
    def ollama_ok(self) -> bool: ...


class WorkerBusyError(RuntimeError):
    """This worker is already processing another run."""


class Worker:
    def __init__(
        self,
        db: Database,
        data_dir: Path | str,
        downloader: DownloaderLike,
        extractor: ExtractorLike,
        scorer_factory: Callable[[dict[str, Any]], ScorerLike],
        health: HealthLike,
        *,
        prefetch: int = 2,
        clock: Callable[[], float] = time.monotonic,
        poll_interval: float = 5.0,
        idle_interval: float = 0.2,
        repeated_error_limit: int = 5,
        recheck_delay: float = 5.0,     # the probe's own rhythm (as poll_interval)
    ) -> None:
        self.db = db
        self.data_dir = Path(data_dir)
        self.downloads_dir = self.data_dir / "downloads"
        self.downloader = downloader
        self.extractor = extractor
        self.scorer_factory = scorer_factory
        self.health = health
        self.prefetch = prefetch
        self._clock = clock
        self.poll_interval = poll_interval
        self.idle_interval = idle_interval
        self.repeated_error_limit = repeated_error_limit
        self.recheck_delay = recheck_delay

        self._run_id: int | None = None
        self._scorer: ScorerLike | None = None
        self._threads: list[threading.Thread] = []
        self._stop = threading.Event()
        self._control = threading.RLock()         # start / pause / resume / stop
        self._state = threading.Lock()            # busy flags, error streak, poll time
        self._busy: dict[str, bool] = {"fetch": False, "extract": False, "score": False}
        self._alive = 0                           # threads still inside _loop
        self._recovered = False
        # Per stage: (signature of the last unexpected error, how many in a row).
        self._streaks: dict[str, tuple[tuple[str, ...] | None, int]] = {}
        self._last_poll: float | None = None

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def start(self, run_id: int) -> None:
        """Begin or continue a run: filters (when it leaves draft), crash
        recovery (once per worker), then the threads."""
        with self._control:
            if self._threads_alive():
                if self._run_id == run_id and not self._stop.is_set():
                    self.resume(run_id)
                    return
                self._detach()
            run = self.db.get_run(run_id)
            if run["status"] == "cancelled":
                raise InvalidTransitionError("A cancelled run can't be started.")
            if run["status"] == "draft":
                # Once, when the run leaves draft. Later starts (resume, Retry
                # failed) must not re-filter candidates the recruiter put back
                # with clear_filters.
                self._apply_filters(run)
            if not self._recovered:
                self.recover()
            if self.db.get_run(run_id)["status"] in ("draft", "paused", "completed"):
                self.db.set_run_status(run_id, "running")
            log.info("run %d started", run_id)
            self._launch(run_id)

    def recover(self) -> RecoveryReport:
        """Crash recovery. Run once when the engine boots, before any run starts.

        Puts in-flight candidates back (``recover_after_crash``), deletes
        orphaned downloads, and releases whatever a cancelled run still holds
        (a PDF downloaded just before the cancel). ``start`` calls it too if it
        hasn't run yet, so the CLI needs no extra step.
        """
        with self._control:
            if self._threads_alive():
                raise WorkerBusyError("Recovery runs before any screening starts.")
            report = self.db.recover_after_crash(self.downloads_dir)
            for orphan in report.orphan_pdf_paths:
                _delete(orphan)
            released = sum(self._release_in_flight(run["id"])
                           for run in self.db.list_runs() if run["status"] == "cancelled")
            if (report.candidates_requeued or report.candidates_rewound_to_extracted
                    or report.orphan_pdf_paths or released):
                log.info("recovered: %d re-queued, %d back to extracted, %d orphan files deleted, "
                         "%d released from cancelled runs",
                         report.candidates_requeued, report.candidates_rewound_to_extracted,
                         len(report.orphan_pdf_paths), released)
            self._recovered = True
            return report

    def attach(self, run_id: int) -> None:
        """Watch a run paused for "No internet connection" or "Ollama isn't
        running", so it resumes by itself when the probe succeeds. Used when the
        engine boots; the run stays paused until then."""
        with self._control:
            run = self.db.get_run(run_id)
            if run["status"] != "paused" or run["pause_reason"] not in AUTO_RESUME_REASONS:
                raise InvalidTransitionError("Only a run paused for a connection problem resumes by itself.")
            if self._threads_alive():
                if self._run_id == run_id and not self._stop.is_set():
                    return
                self._detach()
            if not self._recovered:
                self.recover()
            log.info("run %d: waiting to resume (%s)", run_id, run["pause_reason"])
            self._launch(run_id)

    def cancel(self, run_id: int, timeout: float = 5.0) -> None:
        """Cancel a run, whether it is running, paused or a draft.

        Stops claiming its work, hands back what is in flight and deletes its
        downloaded PDFs. Results already scored are kept. If a thread is still
        mid-item after ``timeout`` (a model call can take minutes on a CPU),
        this returns anyway and the last thread to exit does the clean-up;
        ``recover`` does it at the next boot if the app is closed first.
        """
        with self._control:
            if self.db.get_run(run_id)["status"] != "cancelled":
                self.db.set_run_status(run_id, "cancelled")   # a completed run raises: nothing to cancel
            mine = self._run_id == run_id and self._threads_alive()
            if mine:
                self._stop.set()
        log.info("run %d cancelled", run_id)
        if mine:
            self._join(timeout)       # the last thread out calls _release_in_flight
        else:
            self._release_in_flight(run_id)

    def pause(self, run_id: int, reason: str = Pause.BY_USER) -> None:
        """Stop claiming new work. Anything mid-flight finishes normally."""
        with self._control:
            self._set_paused(run_id, reason)

    def resume(self, run_id: int) -> None:
        with self._control:
            if not self._threads_alive() or self._run_id != run_id or self._stop.is_set():
                self.start(run_id)
                return
            try:
                # "completed" too: that's how "Retry failed" restarts a finished run.
                if self.db.get_run(run_id)["status"] in ("paused", "completed"):
                    self.db.set_run_status(run_id, "running")
                    log.info("run %d resumed", run_id)
            except InvalidTransitionError:
                pass

    def stop(self, timeout: float = 30.0) -> None:
        """Graceful shutdown (app quit): pause with "Atlas was closed", finish the
        current items, stop the threads. Anything still in flight after
        ``timeout`` is put back by ``recover_after_crash`` on the next start."""
        with self._control:
            if self._run_id is not None:
                try:
                    if self.db.get_run(self._run_id)["status"] == "running":
                        self._set_paused(self._run_id, Pause.CLOSED)
                except DatabaseError:
                    log.exception("could not mark the run paused while stopping")
            self._stop.set()
            self._join(timeout)
            log.info("worker stopped")

    def wait_idle(self, timeout: float | None = None) -> bool:
        """Wait until the run is not ``running`` and no stage is mid-item."""
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            if self._run_id is None or (self.db.get_run(self._run_id)["status"] != "running" and not self._any_busy()):
                return True
            if deadline is not None and time.monotonic() >= deadline:
                return False
            time.sleep(min(self.idle_interval, 0.05))

    @property
    def run_id(self) -> int | None:
        return self._run_id

    # ------------------------------------------------------------------ #
    # Thread loop
    # ------------------------------------------------------------------ #

    def _launch(self, run_id: int) -> None:
        self._run_id = run_id
        self._scorer = None
        with self._state:
            self._streaks.clear()
            self._last_poll = None
        self._stop.clear()
        self._threads = [
            threading.Thread(target=self._loop, args=(name, step), name=f"atlas-{name}", daemon=True)
            for name, step in (("fetch", self._fetch_step), ("extract", self._extract_step),
                               ("score", self._score_step))
        ]
        with self._state:
            self._alive = len(self._threads)
        for thread in self._threads:
            thread.start()

    def _join(self, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        for thread in self._threads:
            thread.join(max(0.0, deadline - time.monotonic()))
        self._threads = [t for t in self._threads if t.is_alive()]

    def _detach(self) -> None:
        """Stop the current run's threads so another run can start. The run
        keeps its status (paused, completed or cancelled)."""
        assert self._run_id is not None
        before = self.db.get_run(self._run_id)
        if before["status"] == "running" and not self._stop.is_set():
            raise WorkerBusyError("Another screening is running. Pause it before starting this one.")
        self._stop.set()
        self._join(DETACH_TIMEOUT)
        if self._threads_alive():
            raise WorkerBusyError("Atlas is still finishing the previous screening. Try again in a minute.")
        # An auto-resume may have flipped the old run to running just before the stop.
        if before["status"] == "paused" and self.db.get_run(self._run_id)["status"] == "running":
            self.db.set_run_status(self._run_id, "paused", reason=before["pause_reason"])

    def _loop(self, name: str, step: Callable[[], bool]) -> None:
        try:
            self._loop_body(name, step)
        finally:
            self._thread_exited()

    def _thread_exited(self) -> None:
        """The last thread out finishes a cancel: release what the run still holds."""
        with self._state:
            self._alive -= 1
            last = self._alive == 0
        if not last or self._run_id is None:
            return
        try:
            if self.db.get_run(self._run_id)["status"] == "cancelled":
                self._release_in_flight(self._run_id)
        except (DatabaseError, sqlite3.Error):
            log.exception("could not release a cancelled run's work; recovery will at the next start")

    def _loop_body(self, name: str, step: Callable[[], bool]) -> None:
        while not self._stop.is_set():
            try:
                did_work = step()
            except sqlite3.OperationalError as exc:
                # The database itself failed (disk full, file locked…). The
                # transaction rolled back; the candidate is still in its last
                # committed state. Pause if we can, and back off.
                log.error("%s: database error: %s", name, exc)
                if "full" in str(exc).lower() and self._run_id is not None:
                    self._pause_quietly(Pause.DISK_FULL)
                self._stop.wait(self.poll_interval)
                continue
            except Exception:  # noqa: BLE001 — last line of defence; per-candidate errors are handled in the steps
                log.exception("%s: unexpected error outside a candidate", name)
                self._stop.wait(self.poll_interval)
                continue
            if not did_work:
                self._stop.wait(self.idle_interval)

    def _running(self) -> bool:
        return self._run_id is not None and self.db.get_run(self._run_id)["status"] == "running"

    @contextmanager
    def _working(self, stage: str) -> Iterator[None]:
        with self._state:
            self._busy[stage] = True
        try:
            yield
        finally:
            with self._state:
                self._busy[stage] = False

    def _any_busy(self) -> bool:
        with self._state:
            return any(self._busy.values())

    def _threads_alive(self) -> bool:
        return any(t.is_alive() for t in self._threads)

    # ------------------------------------------------------------------ #
    # Stage 1: fetch (also watches for auto-resume and completion)
    # ------------------------------------------------------------------ #

    def _fetch_step(self) -> bool:
        assert self._run_id is not None
        run = self.db.get_run(self._run_id)
        if run["status"] == "paused":
            self._maybe_auto_resume(run)
            return False
        if run["status"] != "running":
            return False
        with self._working("fetch"):
            candidate = self.db.claim_next_download(self._run_id, max_in_flight=self.prefetch)
            if candidate is not None:
                self._guarded("fetch", candidate, self._fetch, self.db.return_to_queue)
                return True
        self._reconcile()
        self._maybe_complete()
        return False

    def _fetch(self, candidate: dict[str, Any]) -> None:
        cid, ra = candidate["id"], candidate["ra_number"]
        log.info("candidate %d (%s): downloading", cid, ra)
        try:
            downloaded = self.downloader.fetch(candidate["resume_link"], self.downloads_dir, str(cid))
        except CandidateError as exc:
            # Behind a Wi-Fi sign-in page every download is the portal's HTML,
            # which looks like "not a PDF". Ask before failing the student (rule 5).
            if exc.reason == Reason.NOT_PDF and self._internet_problem() == Pause.CAPTIVE_PORTAL:
                self.db.return_to_queue(cid)
                self._pause_system(Pause.CAPTIVE_PORTAL)
                return
            self._fail("fetch", cid, exc.kind, exc.reason)
            return
        except SystemUnavailable as exc:
            self.db.return_to_queue(cid)
            self._pause_system(exc.reason)
            return
        except TransientError as exc:
            self._transient("fetch", cid, exc, self.db.return_to_queue)
            return
        except Exception as exc:  # noqa: BLE001 — a bug; see _unexpected
            self._unexpected("fetch", cid, exc, self.db.return_to_queue)
            return
        try:
            self.db.finish_download(cid, downloaded.path)
        except DatabaseError:
            _delete(downloaded.path)       # nobody references it; don't leave it behind
            raise
        log.info("candidate %d (%s): downloaded %d bytes", cid, ra, downloaded.size_bytes)
        self._success("fetch")

    # ------------------------------------------------------------------ #
    # Stage 2: extract
    # ------------------------------------------------------------------ #

    def _extract_step(self) -> bool:
        if not self._running():
            return False
        assert self._run_id is not None
        with self._working("extract"):
            found = self.db.list_candidates(self._run_id, states=["downloaded"], limit=1)
            if not found:
                return False
            self._guarded("extract", found[0], self._extract, self._give_back_download)
        return True

    def _extract(self, candidate: dict[str, Any]) -> None:
        cid, ra, pdf = candidate["id"], candidate["ra_number"], candidate["pdf_path"]
        if not pdf or not Path(pdf).is_file():
            log.warning("candidate %d (%s): PDF missing on disk; downloading again", cid, ra)
            self.db.return_to_queue(cid)
            return
        try:
            extraction = self.extractor.extract(pdf)
            sections = split_sections(extraction.text)
            sha256 = _sha256(Path(pdf))
        except FileNotFoundError:
            self.db.return_to_queue(cid)
            return
        except CandidateError as exc:
            self._fail("extract", cid, exc.kind, exc.reason)
            _delete(pdf)
            return
        except SystemUnavailable as exc:
            self.db.return_to_queue(cid)
            _delete(pdf)
            self._pause_system(exc.reason)
            return
        except Exception as exc:  # noqa: BLE001 — a bug; see _unexpected
            self._unexpected("extract", cid, exc, self.db.return_to_queue)
            _delete(pdf)
            return
        self.db.commit_extraction(
            cid,
            text=extraction.text,
            page_count=extraction.page_count,
            ocr_used=extraction.ocr_used,
            pdf_sha256=sha256,
            sections=sections,
        )
        # Only now is the PDF safe to delete (CLAUDE.md rule 4). If we die
        # before the next line, recovery finds an unreferenced orphan.
        _delete(pdf)
        log.info("candidate %d (%s): extracted %d pages (ocr=%s)", cid, ra, extraction.page_count, extraction.ocr_used)
        self._success("extract")

    # ------------------------------------------------------------------ #
    # Stage 3: score
    # ------------------------------------------------------------------ #

    def _score_step(self) -> bool:
        if not self._running():
            return False
        assert self._run_id is not None
        with self._working("score"):
            candidate = self.db.claim_next_scoring(self._run_id)
            if candidate is None:
                return False
            self._guarded("score", candidate, self._score, self.db.return_to_extracted)
        return True

    def _score(self, candidate: dict[str, Any]) -> None:
        cid, ra = candidate["id"], candidate["ra_number"]
        try:
            resume = self.db.get_resume_text(cid)
            if resume is None:
                raise RuntimeError("extracted candidate has no stored text")
            prepared = scoring_input(candidate, resume["text"], resume["sections"])
            result = self._get_scorer().score(prepared.context, prepared.sections, prepared.full_text)
        except CandidateError as exc:
            self._fail("score", cid, exc.kind, exc.reason)
            return
        except SystemUnavailable as exc:
            self.db.return_to_extracted(cid)
            self._pause_system(exc.reason)
            return
        except TransientError as exc:
            self._transient("score", cid, exc, self.db.return_to_extracted)
            return
        except Exception as exc:  # noqa: BLE001 — a bug; see _unexpected
            self._unexpected("score", cid, exc, self.db.return_to_extracted)
            return

        evaluation = result.evaluation
        flags = list(result.flags)
        if resume["page_count"] > MAX_PAGES:
            flags.insert(0, Flag.PAGES_NOT_READ)
        self.db.save_evaluation(
            cid,
            overall_score=evaluation.overall_score,
            sub_scores=evaluation.sub_scores.model_dump(),
            summary=evaluation.summary,
            reasons=list(evaluation.reasons),
            evidence=[item.model_dump() for item in evaluation.evidence],
            claim_mismatches=list(evaluation.claim_mismatches),
            model_name=result.model,
            prompt_hash=result.prompt_hash,
            raw_response=result.raw_response,
            duration_seconds=result.duration_seconds,
            flags=flags,
            prompt_eval_seconds=result.prompt_eval_seconds,
            eval_seconds=result.eval_seconds,
        )
        assert self._run_id is not None
        self.db.log_event(self._run_id, f"Scored {evaluation.overall_score}", candidate_id=cid)
        self._remember_duration(result.model, result.duration_seconds)
        timing = ""
        if result.prompt_eval_seconds is not None and result.eval_seconds is not None:
            timing = f" (prefill {result.prompt_eval_seconds:.1f}s, generation {result.eval_seconds:.1f}s)"
        log.info("candidate %d (%s): scored %d in %.1fs%s", cid, ra, evaluation.overall_score,
                 result.duration_seconds, timing)
        self._success("score")

    def _remember_duration(self, model: str, seconds: float) -> None:
        """Keep recent scoring times per model for the next run's estimate."""
        try:
            self.db.set_setting(TIMING_SETTING, remember(self.db.get_setting(TIMING_SETTING), model, seconds))
        except (DatabaseError, sqlite3.Error):
            log.warning("could not record the scoring time")

    def _get_scorer(self) -> ScorerLike:
        if self._scorer is None:
            assert self._run_id is not None
            self._scorer = self.scorer_factory(self.db.get_run(self._run_id))
        return self._scorer

    # ------------------------------------------------------------------ #
    # Failure mapping (§8)
    # ------------------------------------------------------------------ #

    def _guarded(
        self,
        stage: str,
        candidate: dict[str, Any],
        work: Callable[[dict[str, Any]], None],
        give_back: Callable[[int], None],
    ) -> None:
        """Run one stage for one claimed candidate. Whatever goes wrong, the
        candidate must end up in a state some thread will pick up again —
        never stuck in ``downloading`` or ``scoring``."""
        try:
            work(candidate)
        except sqlite3.OperationalError:
            raise                      # the database itself is failing: the loop pauses and backs off
        except Exception as exc:  # noqa: BLE001 — unforeseen: treat as a bug in this candidate's processing
            try:
                self._unexpected(stage, candidate["id"], exc, give_back)
            except DatabaseError:
                log.exception("candidate %d: could not record the unexpected error", candidate["id"])

    def _give_back_download(self, cid: int) -> None:
        pdf = self.db.get_candidate(cid)["pdf_path"]
        self.db.return_to_queue(cid)
        if pdf:
            _delete(pdf)

    def _reconcile(self) -> None:
        """Hand back candidates stuck mid-stage with no thread working on them.

        Only runs while no stage is busy (checked under the same lock the
        stages take *before* claiming), so it can never undo a live claim.
        """
        if self._run_id is None:
            return
        with self._state:
            if any(self._busy.values()):
                return
            for candidate in self.db.list_candidates(self._run_id, states=["downloading", "scoring"]):
                if candidate["state"] == "downloading":
                    self.db.return_to_queue(candidate["id"])
                    _delete(self.downloads_dir / f"{candidate['id']}.part")
                else:
                    self.db.return_to_extracted(candidate["id"])
                log.warning("candidate %d: was stuck in %s; handed back", candidate["id"], candidate["state"])

    def _fail(self, stage: str, cid: int, kind: str, reason: str) -> None:
        self.db.mark_failed(cid, kind=kind, reason=reason)
        log.info("candidate %d: failed (%s): %s", cid, kind, reason)
        self._success(stage)   # a *handled* failure breaks a run of unexpected errors

    def _transient(self, stage: str, cid: int, exc: TransientError, give_back: Callable[[int], None]) -> None:
        what = exc.detail or exc.reason
        problem = self._system_problem(exc.probe)
        if problem is not None:
            log.info("candidate %d: %s; the probe says: %s", cid, what, problem)
        else:
            # One healthy answer is one instant. An outage that is just starting
            # can still look healthy (the network half down, a server closing:
            # TCP connects, nothing answers), so look again before blaming the
            # student (rule 5). The student is not downloaded again here.
            if self._stop.wait(self.recheck_delay):
                give_back(cid)          # stopping: decide nothing
                return
            problem = self._system_problem(exc.probe)
            if problem is None:
                log.info("candidate %d: %s (probe ok twice, so it's this candidate)", cid, what)
                self._fail(stage, cid, "retryable", exc.reason)
                return
            log.info("candidate %d: %s; the probe looked fine, then %.1f s later: %s (not the student's fault)",
                     cid, what, self.recheck_delay, problem)
        give_back(cid)
        self._pause_system(problem)

    def _system_problem(self, probe: str) -> str | None:
        """The pause reason for the part of the system ``probe`` names, or ``None``."""
        if probe == "internet":
            return self._internet_problem()
        return None if self.health.ollama_ok() else Pause.OLLAMA_DOWN

    def _internet_problem(self) -> str | None:
        """The internet pause reason, or ``None``; captive portals if the probe can tell."""
        check = getattr(self.health, "internet_problem", None)
        if callable(check):
            return check()
        return None if self.health.internet_ok() else Pause.NO_INTERNET

    def _unexpected(self, stage: str, cid: int, exc: Exception, give_back: Callable[[int], None]) -> None:
        log.error("candidate %d: unexpected error in %s", cid, stage, exc_info=exc)
        # "The same error": same exception type and message, ignoring numbers
        # (ids, counts). Counted per stage, so successes in *other* stages
        # don't hide a scorer that fails every candidate.
        signature = (type(exc).__name__, re.sub(r"\d+", "#", str(exc))[:200])
        with self._state:
            last, count = self._streaks.get(stage, (None, 0))
            count = count + 1 if signature == last else 1
            repeated = count >= self.repeated_error_limit
            self._streaks[stage] = (None, 0) if repeated else (signature, count)
        if repeated:
            give_back(cid)
            self._pause_system(Pause.REPEATED_ERRORS)
        else:
            self.db.mark_failed(cid, kind="retryable", reason=Reason.UNEXPECTED)

    def _success(self, stage: str) -> None:
        with self._state:
            self._streaks.pop(stage, None)

    # ------------------------------------------------------------------ #
    # Run status
    # ------------------------------------------------------------------ #

    def _pause_system(self, reason: str) -> None:
        assert self._run_id is not None
        self._set_paused(self._run_id, reason)

    def _set_paused(self, run_id: int, reason: str) -> None:
        try:
            if self.db.get_run(run_id)["status"] == "running":
                self.db.set_run_status(run_id, "paused", reason=reason)
                log.warning("run %d paused: %s", run_id, reason)
                with self._state:
                    self._last_poll = self._clock()
        except InvalidTransitionError:
            pass   # another thread paused it first

    def _pause_quietly(self, reason: str) -> None:
        try:
            assert self._run_id is not None
            self._set_paused(self._run_id, reason)
        except (DatabaseError, sqlite3.Error):
            log.error("could not record the pause (%s)", reason)

    def _maybe_auto_resume(self, run: dict[str, Any]) -> None:
        reason = run["pause_reason"]
        if reason not in AUTO_RESUME_REASONS:
            return
        now = self._clock()
        with self._state:
            if self._last_poll is not None and now - self._last_poll < self.poll_interval:
                return
            self._last_poll = now
        internet = reason in INTERNET_PAUSES
        healthy = self._internet_problem() is None if internet else self.health.ollama_ok()
        if healthy and not self._stop.is_set():
            try:
                self.db.set_run_status(run["id"], "running")
                log.info("run %d resumed automatically (%s is back)", run["id"], "internet" if internet else "Ollama")
            except InvalidTransitionError:
                pass

    def _maybe_complete(self) -> None:
        assert self._run_id is not None
        counts = self.db.state_counts(self._run_id)
        if any(counts[state] for state in WORKING_STATES):
            return
        try:
            if self.db.get_run(self._run_id)["status"] == "running":
                self.db.set_run_status(self._run_id, "completed")
                log.info("run %d completed: %s", self._run_id,
                         {k: v for k, v in counts.items() if v})
        except InvalidTransitionError:
            pass

    # ------------------------------------------------------------------ #
    # Start-up work
    # ------------------------------------------------------------------ #

    def _apply_filters(self, run: dict[str, Any]) -> None:
        """Hard filters (CGPA, department) — before any download or LLM call."""
        cgpa_min = run["cgpa_min"]
        allowed = run["departments_allowed"] or []
        if cgpa_min is None and not allowed:
            return
        filtered = 0
        for candidate in self.db.list_candidates(run["id"], states=["queued"]):
            reason = filter_reason(candidate["cgpa"], candidate["department"], cgpa_min=cgpa_min, departments=allowed)
            if reason:
                self.db.mark_filtered(candidate["id"], reason=reason)
                filtered += 1
        if filtered:
            self.db.log_event(run["id"], f"{filtered} students filtered out before scoring")
            log.info("run %d: %d candidates filtered", run["id"], filtered)

    def _release_in_flight(self, run_id: int) -> int:
        """Hand back a stopped run's in-flight candidates and delete their PDFs.

        Only call when no thread is working on this run. The database is
        updated first; a crash before the delete leaves an unreferenced file,
        which recovery deletes as an orphan.
        """
        released = 0
        for candidate in self.db.list_candidates(run_id, states=IN_FLIGHT_STATES):
            cid = candidate["id"]
            try:
                if candidate["state"] == "scoring":
                    self.db.return_to_extracted(cid)
                else:
                    self.db.return_to_queue(cid)
            except InvalidTransitionError:
                continue                   # moved on in the meantime
            if candidate["pdf_path"]:
                _delete(candidate["pdf_path"])
            _delete(self.downloads_dir / f"{cid}.part")
            released += 1
        return released


def run_waiting_to_resume(db: Database) -> int | None:
    """At boot: the run to ``attach`` (the most recent one paused for a reason
    that resumes by itself), or ``None``."""
    waiting = [r for r in db.list_runs() if r["status"] == "paused" and r["pause_reason"] in AUTO_RESUME_REASONS]
    if not waiting:
        return None
    return max(waiting, key=lambda r: (r["updated_at"], r["id"]))["id"]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 16), b""):
            digest.update(block)
    return digest.hexdigest()


def _delete(path: Path | str) -> None:
    try:
        Path(path).unlink(missing_ok=True)
    except OSError as exc:
        # e.g. Windows still has it open. It's unreferenced, so the next
        # start's crash recovery reports it as an orphan and deletes it.
        log.warning("could not delete %s now (%s); it will be cleaned up at next start",
                    Path(path).name, type(exc).__name__)
