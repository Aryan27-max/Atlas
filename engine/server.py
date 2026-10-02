"""The local API the desktop app talks to (ARCHITECTURE §2, §17).

    python -m engine.server --data-dir DIR --port 0 --token TOKEN [--ollama-url URL]
    python -m engine.server --openapi PATH          # write the OpenAPI schema and exit

* Binds **127.0.0.1 only**. Every route except ``/health`` needs
  ``Authorization: Bearer <token>`` (compared in constant time), and every
  request's ``Host`` must be exactly ``127.0.0.1:<port>`` (DNS-rebinding guard).
* At boot: crash recovery (``Worker.recover``), then a run paused for "No
  internet connection" / "Ollama isn't running" gets a worker again
  (``Worker.attach``) so it still resumes by itself.
* Prints exactly one line to stdout, ``ATLAS_READY port=<n>``, once it is
  listening. Everything else goes to ``<data-dir>/logs/engine.log``.
* Errors are always ``{"code", "message"}`` with a recruiter-readable message
  (``engine/errors.py``): never a stack trace or an exception name.

The token can also come from the ``ATLAS_TOKEN`` environment variable, which
the app uses so it doesn't show up in the process list.
"""

from __future__ import annotations

import argparse
import asyncio
import hmac
import json
import logging
import os
import platform
import re
import socket
import sys
import threading
import time
import uuid
from collections import Counter, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Iterable, Literal

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from engine import api_models as m
from engine.buckets import BucketResult, compute_buckets
from engine.db import (
    Database,
    DatabaseError,
    InvalidTransitionError,
    NotFoundError,
    RunLockedError,
)
from engine.db import ValidationError as DbValidationError
from engine.errors import AUTO_RESUME_REASONS, Api, Pull, PullError, SystemUnavailable
from engine.estimate import TIMING_SETTING, estimate
from engine.export import ExportError, export_csv
from engine.extract.ocr import EasyOcrEngine
from engine.extract.pdf import PdfExtractor
from engine.filters import department_counts
from engine.filters import preview as filter_preview
from engine.health import HealthProbe
from engine.ingest.csv_loader import PreflightReport, issue_groups, load_table
from engine.ingest.downloader import Downloader
from engine.ingest.links import link_kind
from engine.llm.client import DEFAULT_URL, OllamaClient, local_only
from engine.llm.precheck import CANT_USE, READY, precheck
from engine.hardware import Hardware
from engine.hardware import profile as hardware_profile
from engine.ollama_setup import OllamaInstall, find_ollama, start_ollama
from engine.llm.scorer import Scorer
from engine.logs import configure_logging
from engine.worker import WORKING_STATES, Worker, WorkerBusyError, run_waiting_to_resume

log = logging.getLogger("atlas.server")

ENGINE_VERSION = "0.2.0"
PRECHECK_SETTING = "model_prechecks"          # shared with the CLI
PREFERENCES_SETTING = "preferences"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
UPLOAD_SUFFIXES = (".csv", ".txt", ".tsv", ".xlsx", ".xlsm", ".xls")
SUGGESTED_MODELS = ("qwen3:8b", "qwen3:4b", "llama3.1:8b", "gemma3:4b")
NOT_CHECKED = "Not tested on this computer yet."
DEFAULT_PREFERENCES: dict[str, Any] = {
    "appearance": "system",
    "default_shortlist": 60,
    "default_band": 50,
    "default_min": 0,
    "default_model": None,
    "keep_awake": True,
    "notify_done": True,
    "warn_long_runs": True,
}
RESULT_BUCKETS = ("all", "shortlisted", "cutoff", "rejected", "failed", "filtered", "not_scored")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@dataclass
class EngineOptions:
    """Test seams: local stub servers and fast intervals."""

    url_rewrite: Callable[[str], str] | None = None
    health: Any = None
    poll_interval: float = 5.0
    download_interval: float = 1.0
    idle_interval: float = 0.2
    stop_timeout: float = 8.0          # < the app's 10 s grace on quit
    keepalive_seconds: float = 15.0
    event_poll_seconds: float = 0.5
    status_poll_seconds: float = 1.0
    ollama_finder: Callable[[], OllamaInstall] | None = None              # where Ollama is installed
    ollama_starter: Callable[[OllamaInstall], bool] | None = None         # how to start it


@dataclass
class PendingTable:
    path: Path
    report: PreflightReport


class AppEvents:
    """App-level events (model pulls, run status changes) behind ``GET /events``."""

    def __init__(self, keep: int = 500) -> None:
        self._items: deque[dict[str, Any]] = deque(maxlen=keep)
        self._next = 1
        self._lock = threading.Lock()

    def publish(self, kind: str, data: dict[str, Any]) -> None:
        with self._lock:
            self._items.append({"id": self._next, "kind": kind, "data": data})
            self._next += 1

    def after(self, event_id: int) -> list[dict[str, Any]]:
        with self._lock:
            return [item for item in self._items if item["id"] > event_id]


# --------------------------------------------------------------------------- #
# Engine: everything the routes do, with no HTTP in it
# --------------------------------------------------------------------------- #


class Engine:
    def __init__(self, data_dir: Path | str, *, ollama_url: str = DEFAULT_URL,
                 options: EngineOptions | None = None) -> None:
        self.data_dir = Path(data_dir)
        self.options = options or EngineOptions()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir = self.data_dir / "uploads"
        self.exports_dir = self.data_dir / "exports"
        self.logs_dir = self.data_dir / "logs"
        self.db = Database(self.data_dir / "atlas.db")
        self.client = OllamaClient(ollama_url)
        self.worker = Worker(
            self.db, self.data_dir,
            Downloader(min_interval=self.options.download_interval, url_rewrite=self.options.url_rewrite),
            PdfExtractor(ocr=EasyOcrEngine(self.data_dir / "ocr-models")),
            lambda run: Scorer(self.client, run["model_name"], run["criteria_prompt"]),
            self.options.health or HealthProbe(ollama=self.client),
            poll_interval=self.options.poll_interval,
            idle_interval=self.options.idle_interval,
        )
        self.events = AppEvents()
        self.request_exit: Callable[[], None] = lambda: None
        self._uploads: dict[int, PendingTable] = {}
        self._uploads_lock = threading.Lock()
        self._precheck_lock = threading.Lock()
        self._pulls: dict[str, threading.Event] = {}
        self._pulls_lock = threading.Lock()
        self._watch_stop = threading.Event()
        self._watcher: threading.Thread | None = None
        self._closed = False
        self._close_lock = threading.Lock()

    # ---- lifecycle -------------------------------------------------------- #

    def boot(self) -> None:
        """Recovery, clean-up of transient files, auto-resume watch, status watcher."""
        report = self.worker.recover()
        for folder in (self.uploads_dir, self.exports_dir):
            _empty_folder(folder)
        waiting = run_waiting_to_resume(self.db)
        if waiting is not None:
            self.worker.attach(waiting)
        log.info("engine ready (recovered: %d runs paused, %d re-queued; watching run %s)",
                 report.runs_paused, report.candidates_requeued, waiting)
        self._statuses = {r["id"]: (r["status"], r["pause_reason"]) for r in self.db.list_runs()}
        self._watcher = threading.Thread(target=self._watch_statuses, name="atlas-status", daemon=True)
        self._watcher.start()

    def shutdown(self) -> None:
        """Graceful stop: pause a running run ("Atlas was closed"), stop threads, close the DB."""
        with self._close_lock:
            if self._closed:
                return
            self._closed = True
        with self._pulls_lock:
            for cancel in self._pulls.values():
                cancel.set()
        self._watch_stop.set()
        try:
            self.worker.stop(timeout=self.options.stop_timeout)
        finally:
            _empty_folder(self.uploads_dir)
            if self._watcher is not None:
                self._watcher.join(timeout=5)
            self.db.close()
        log.info("engine stopped")

    def stop_and_exit(self) -> None:
        self.shutdown()
        self.request_exit()

    def _watch_statuses(self) -> None:
        """Publish run status changes on the app event stream (the app's
        keep-awake and notifications follow them)."""
        while not self._watch_stop.wait(self.options.status_poll_seconds):
            try:
                runs = self.db.list_runs()
            except Exception:  # noqa: BLE001 — the DB may be closing; try again next tick
                continue
            for run in runs:
                current = (run["status"], run["pause_reason"])
                if self._statuses.get(run["id"]) != current:
                    self._statuses[run["id"]] = current
                    self.events.publish("run_status", {
                        "run_id": run["id"], "name": run["name"], "status": run["status"],
                        "pause_reason": run["pause_reason"],
                        "auto_resume": run["status"] == "paused" and run["pause_reason"] in AUTO_RESUME_REASONS,
                    })

    # ---- system and models ------------------------------------------------ #

    def system(self) -> m.SystemOut:
        running, version, installed = False, None, 0
        try:
            installed = len(self.client.list_models())
            running = True
            version = self.client.version()
        except SystemUnavailable:
            pass
        on_disk = running or self._find_ollama().installed
        return m.SystemOut(
            engine_version=ENGINE_VERSION, data_dir=str(self.data_dir), logs_dir=str(self.logs_dir),
            storage_bytes=_folder_size(self.data_dir), platform=platform.system(), cpu_count=os.cpu_count() or 1,
            ollama=m.OllamaStatusOut(running=running, url=self.client.base_url, version=version, installed=on_disk),
            models_installed=installed,
            hardware=m.HardwareOut(**self.hardware().as_dict()),
        )

    def hardware(self) -> Hardware:
        return hardware_profile(self.client)

    def _find_ollama(self) -> OllamaInstall:
        return (self.options.ollama_finder or find_ollama)()

    def start_ollama(self) -> m.OllamaStartOut:
        """Launch the installed Ollama (never downloads or installs anything)."""
        install = self._find_ollama()
        if not install.installed:
            raise ApiError(404, "ollama_not_installed", Api.OLLAMA_NOT_INSTALLED)
        started = (self.options.ollama_starter or start_ollama)(install)
        log.info("start Ollama (%s): %s", install.how, "launched" if started else "failed")
        if not started:
            raise ApiError(409, "ollama_start_failed", Api.OLLAMA_START_FAILED)
        return m.OllamaStartOut(started=True, message="Starting Ollama…")

    def models(self) -> m.ModelsOut:
        try:
            installed = self.client.list_models()
        except SystemUnavailable:
            return m.ModelsOut(ollama_running=False, models=[], suggestions=list(SUGGESTED_MODELS))
        cache = self.db.get_setting(PRECHECK_SETTING, {}) or {}
        return m.ModelsOut(
            ollama_running=True,
            models=[m.ModelOut(name=i.name, size_bytes=i.size, digest=i.digest,
                               precheck=self._precheck_status(cache.get(i.name), i.digest))
                    for i in sorted(installed, key=lambda i: i.name)],
            suggestions=[s for s in SUGGESTED_MODELS if s not in {i.name for i in installed}],
        )

    @staticmethod
    def _precheck_status(entry: dict[str, Any] | None, digest: str) -> m.PrecheckStatusOut:
        if not entry or entry.get("digest") != digest:
            return m.PrecheckStatusOut(status="not_checked", message=NOT_CHECKED, seconds=None, checked=None)
        ok = bool(entry.get("ok"))
        return m.PrecheckStatusOut(
            status="ready" if ok else "cant_use", message=str(entry.get("message") or (READY if ok else CANT_USE)),
            seconds=entry.get("seconds"), checked=entry.get("checked"), slow=ok and bool(entry.get("slow")),
        )

    def precheck_model(self, name: str) -> m.PrecheckOut:
        if not self._precheck_lock.acquire(blocking=False):
            raise ApiError(409, "precheck_busy", Api.PRECHECK_BUSY)
        try:
            info = self.client.find_model(name)
            result = precheck(self.client, info.name if info else name)
            key = info.name if info else name
            cache = self.db.get_setting(PRECHECK_SETTING, {}) or {}
            cache[key] = {"ok": result.ok, "digest": result.digest or (info.digest if info else ""),
                          "seconds": round(result.seconds, 3), "checked": date.today().isoformat(),
                          "message": result.message, "slow": result.slow}
            self.db.set_setting(PRECHECK_SETTING, cache)
            return m.PrecheckOut(ok=result.ok, status="ready" if result.ok else "cant_use",
                                 message=result.message, seconds=round(result.seconds, 1), slow=result.slow)
        finally:
            self._precheck_lock.release()

    def start_pull(self, name: str) -> m.PullStartOut:
        with self._pulls_lock:
            if name in self._pulls:
                return m.PullStartOut(name=name, status="already_running")
            cancel = threading.Event()
            self._pulls[name] = cancel
        threading.Thread(target=self._pull, args=(name, cancel), name="atlas-pull", daemon=True).start()
        return m.PullStartOut(name=name, status="started")

    def cancel_pull(self, name: str) -> None:
        with self._pulls_lock:
            cancel = self._pulls.get(name)
        if cancel is None:
            raise ApiError(404, "not_found", Api.NOT_FOUND)
        cancel.set()

    def _pull(self, name: str, cancel: threading.Event) -> None:
        def publish(status: str, completed: int = 0, total: int = 0, *, done: bool = False,
                    error: str | None = None) -> None:
            self.events.publish("pull", {"name": name, "status": status, "completed": completed, "total": total,
                                         "done": done, "error": error})

        last_sent, last_status = 0.0, ""
        progress = self.client.pull(name)
        try:
            for step in progress:
                if cancel.is_set():
                    progress.close()
                    publish("cancelled", done=True)
                    return
                now = time.monotonic()
                if step.status != last_status or now - last_sent >= 0.25 or step.status == "success":
                    publish(step.status, step.completed, step.total, done=step.status == "success")
                    last_sent, last_status = now, step.status
        except PullError as exc:
            publish("error", done=True, error=exc.message)
        except SystemUnavailable as exc:
            publish("error", done=True, error=exc.reason)
        except Exception:  # noqa: BLE001 — a thread's last line of defence
            log.exception("model pull failed")
            publish("error", done=True, error=Pull.FAILED)
        finally:
            with self._pulls_lock:
                self._pulls.pop(name, None)

    # ---- runs ------------------------------------------------------------- #

    def run_out(self, run: dict[str, Any]) -> m.RunOut:
        counts = self.db.state_counts(run["id"])
        with self._uploads_lock:
            has_upload = run["id"] in self._uploads
        return m.RunOut(
            id=run["id"], name=run["name"], status=run["status"], pause_reason=run["pause_reason"],
            auto_resume=run["status"] == "paused" and run["pause_reason"] in AUTO_RESUME_REASONS,
            created_at=run["created_at"], updated_at=run["updated_at"], started_at=run["started_at"],
            completed_at=run["completed_at"], model_name=run["model_name"], criteria_prompt=run["criteria_prompt"],
            shortlist_cutoff=run["shortlist_cutoff"], maybe_cutoff=run["maybe_cutoff"],
            min_shortlist=run["min_shortlist"], cgpa_min=run["cgpa_min"],
            departments_allowed=_departments(run["departments_allowed"]), csv_filename=run["csv_filename"],
            counts=m.CountsOut(**counts), total=sum(counts.values()),
            done=counts["scored"] + counts["failed"] + counts["filtered"], has_upload=has_upload,
        )

    def get_run(self, run_id: int) -> m.RunOut:
        return self.run_out(self.db.get_run(run_id))

    def list_runs(self) -> list[m.RunOut]:
        return [self.run_out(run) for run in self.db.list_runs()]

    def create_run(self, body: m.RunCreateIn) -> m.RunOut:
        run_id = self.db.create_run(" ".join(body.name.split()))
        prefs = self.preferences()
        # Settings' defaults; the model is only preselected, the recruiter can change it.
        self.db.configure_run(run_id, model_name=prefs.default_model, shortlist_cutoff=prefs.default_shortlist,
                              maybe_cutoff=min(prefs.default_band, prefs.default_shortlist),
                              min_shortlist=prefs.default_min)
        return self.get_run(run_id)

    def patch_run(self, run_id: int, body: m.RunPatchIn) -> m.RunOut:
        given = body.model_fields_set
        if "name" in given and body.name is not None:
            self.db.update_run_info(run_id, name=body.name)
        config: dict[str, Any] = {}
        for key in ("model_name", "criteria_prompt", "shortlist_cutoff", "maybe_cutoff", "min_shortlist"):
            if key in given and getattr(body, key) is not None:
                config[key] = getattr(body, key)
        for key in ("cgpa_min", "departments_allowed"):
            if key in given:
                config[key] = getattr(body, key)
        if config:
            self.db.configure_run(run_id, **config)
        return self.get_run(run_id)

    def save_cutoffs(self, run_id: int, body: m.CutoffsIn) -> m.RunOut:
        if body.maybe_cutoff > body.shortlist_cutoff:
            raise ApiError(422, "invalid_cutoffs", Api.CUTOFF_ORDER)
        self.db.configure_run(run_id, shortlist_cutoff=body.shortlist_cutoff, maybe_cutoff=body.maybe_cutoff,
                              min_shortlist=body.min_shortlist)
        return self.get_run(run_id)

    def delete_run(self, run_id: int) -> None:
        run = self.db.get_run(run_id)
        if run["status"] == "running":
            raise ApiError(409, "run_active", Api.RUN_ACTIVE)
        if self.worker.run_id == run_id:
            self.worker.stop(timeout=self.options.stop_timeout)
        self.discard_upload(run_id)
        pdfs = [c["pdf_path"] for c in self.db.list_candidates(run_id, states=["downloading", "downloaded"])]
        self.db.delete_run(run_id)
        for pdf in pdfs:
            _unlink(pdf)
        self.db.vacuum()

    def delete_all(self) -> None:
        runs = self.db.list_runs()
        if any(r["status"] == "running" for r in runs):
            raise ApiError(409, "run_active", Api.ANY_RUN_ACTIVE)
        self.worker.stop(timeout=self.options.stop_timeout)
        with self._uploads_lock:
            self._uploads.clear()
        for run in runs:
            self.db.delete_run(run["id"])
        self.db.clear_settings()
        self.db.vacuum()
        for folder in (self.uploads_dir, self.exports_dir, self.data_dir / "downloads"):
            _empty_folder(folder)
        _clear_logs(self.logs_dir)
        log.info("all data deleted")

    # ---- upload and pre-flight -------------------------------------------- #

    def accept_upload(self, run_id: int, filename: str, data: bytes) -> m.PreflightOut:
        run = self.db.get_run(run_id)
        if run["status"] != "draft":
            raise ApiError(409, "not_draft", Api.NOT_DRAFT)
        if sum(self.db.state_counts(run_id).values()):
            raise ApiError(409, "already_confirmed", Api.ALREADY_CONFIRMED)
        suffix = Path(filename).suffix.lower()
        if suffix not in UPLOAD_SUFFIXES:
            raise ApiError(415, "unsupported_file", Api.UPLOAD_TYPE)
        if not data:
            raise ApiError(400, "no_file", Api.UPLOAD_EMPTY)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        path = self.uploads_dir / f"run{run_id}-{uuid.uuid4().hex}{suffix}"
        path.write_bytes(data)
        report = load_table(path)
        report.source = filename
        with self._uploads_lock:
            previous = self._uploads.get(run_id)
            self._uploads[run_id] = PendingTable(path, report)
        if previous is not None:
            _unlink(previous.path)
        return preflight_out(report)

    def discard_upload(self, run_id: int) -> None:
        with self._uploads_lock:
            pending = self._uploads.pop(run_id, None)
        if pending is not None:
            _unlink(pending.path)

    def confirm(self, run_id: int) -> m.ConfirmOut:
        run = self.db.get_run(run_id)
        if run["status"] != "draft":
            raise ApiError(409, "not_draft", Api.NOT_DRAFT)
        with self._uploads_lock:
            pending = self._uploads.get(run_id)
        if pending is None:
            raise ApiError(409, "no_upload", Api.NO_UPLOAD)
        if not pending.report.ok:
            raise ApiError(409, "upload_not_ready", Api.UPLOAD_NOT_READY)
        if sum(self.db.state_counts(run_id).values()):
            raise ApiError(409, "already_confirmed", Api.ALREADY_CONFIRMED)
        added = self.db.add_candidates(run_id, pending.report.rows)
        self.db.update_run_info(run_id, csv_filename=pending.report.source)
        self.discard_upload(run_id)
        return m.ConfirmOut(added=added)

    def _preview_rows(self, run_id: int) -> list[dict[str, Any]]:
        candidates = self.db.list_candidates(run_id)
        if candidates:
            return candidates
        with self._uploads_lock:
            pending = self._uploads.get(run_id)
        return list(pending.report.rows) if pending else []

    def filters_preview(self, run_id: int, cgpa_min: float | None, departments: list[str] | None) -> m.FilterPreviewOut:
        self.db.get_run(run_id)
        p = filter_preview(self._preview_rows(run_id), cgpa_min=cgpa_min, departments=departments or None)
        return m.FilterPreviewOut(total=p.total, removed=p.removed, removed_by_cgpa=p.removed_by_cgpa,
                                  removed_by_department=p.removed_by_department, remaining=p.remaining)

    # ---- lifecycle -------------------------------------------------------- #

    def start(self, run_id: int) -> m.RunOut:
        if not sum(self.db.state_counts(run_id).values()):
            raise ApiError(409, "no_candidates", Api.NO_CANDIDATES)
        self.worker.start(run_id)
        return self.get_run(run_id)

    def pause(self, run_id: int) -> m.RunOut:
        if self.db.get_run(run_id)["status"] != "running":
            raise ApiError(409, "cant_pause", Api.CANT_PAUSE)
        self.worker.pause(run_id)
        return self.get_run(run_id)

    def resume(self, run_id: int) -> m.RunOut:
        if self.db.get_run(run_id)["status"] not in ("paused", "running"):
            raise ApiError(409, "cant_resume", Api.CANT_RESUME)
        self.worker.resume(run_id)
        return self.get_run(run_id)

    def cancel(self, run_id: int) -> m.RunOut:
        if self.db.get_run(run_id)["status"] == "completed":
            raise ApiError(409, "cant_cancel", Api.CANT_CANCEL)
        self.worker.cancel(run_id)
        self.discard_upload(run_id)
        return self.get_run(run_id)

    def retry_failed(self, run_id: int, include_permanent: bool) -> m.RetryOut:
        count = self.db.retry_failed(run_id, include_permanent=include_permanent)
        if count and self.db.get_run(run_id)["status"] in ("completed", "paused"):
            self.worker.start(run_id)
        return m.RetryOut(retried=count)

    def clear_filters(self, run_id: int) -> m.ClearFiltersOut:
        return m.ClearFiltersOut(cleared=self.db.clear_filters(run_id))

    # ---- estimate and progress -------------------------------------------- #

    def estimate(self, run_id: int, count: int | None = None) -> m.EstimateOut:
        run = self.db.get_run(run_id)
        counts = self.db.state_counts(run_id)
        if count is not None:
            remaining = count
        elif sum(counts.values()):
            if run["status"] == "draft":
                remaining = filter_preview(self.db.list_candidates(run_id), cgpa_min=run["cgpa_min"],
                                           departments=run["departments_allowed"]).remaining
            else:
                remaining = sum(counts[s] for s in WORKING_STATES)
        else:
            rows = self._preview_rows(run_id)
            remaining = filter_preview(rows, cgpa_min=run["cgpa_min"],
                                       departments=run["departments_allowed"]).remaining
        model = run["model_name"]
        history = (self.db.get_setting(TIMING_SETTING, {}) or {}).get(model, []) if model else []
        check = (self.db.get_setting(PRECHECK_SETTING, {}) or {}).get(model) if model else None
        precheck_seconds = check.get("seconds") if check and check.get("ok") else None
        measured = self.db.scoring_durations(run_id)
        kind = None if (measured or history or precheck_seconds is not None) else self.hardware().kind
        result = estimate(remaining, measured=measured, history=history, precheck_seconds=precheck_seconds,
                          hardware=kind)
        warn = bool(result and result.long_run and self.preferences().warn_long_runs)
        return m.EstimateOut(remaining=remaining,
                             estimate=m.EstimateBodyOut(**result.as_dict()) if result else None, long_run=warn)

    def progress(self, run_id: int) -> m.ProgressOut:
        run = self.db.get_run(run_id)
        counts = self.db.state_counts(run_id)
        stage_of = {"downloading": "downloading", "downloaded": "reading", "scoring": "scoring"}
        activity = [m.ActivityOut(stage=stage_of[c["state"]], candidate_id=c["id"], ra_number=c["ra_number"])  # type: ignore[arg-type]
                    for c in self.db.list_candidates(run_id, states=list(stage_of))]
        failures = _failure_groups(self.db.list_candidates(run_id, states=["failed"]))
        return m.ProgressOut(
            run_id=run_id, name=run["name"], status=run["status"], pause_reason=run["pause_reason"],
            auto_resume=run["status"] == "paused" and run["pause_reason"] in AUTO_RESUME_REASONS,
            total=sum(counts.values()), done=counts["scored"] + counts["failed"] + counts["filtered"],
            counts=m.CountsOut(**counts),
            stages=m.StagesOut(waiting=counts["queued"], downloading=counts["downloading"],
                               reading=counts["downloaded"], scoring=counts["extracted"] + counts["scoring"],
                               done=counts["scored"] + counts["filtered"], needs_attention=counts["failed"]),
            activity=activity, failures=failures, estimate=self.estimate(run_id).estimate,
            last_event_id=self.db.last_event_id(run_id),
        )

    # ---- results ---------------------------------------------------------- #

    def _buckets(self, run_id: int, shortlist: int, band: int, minimum: int,
                 rows: list[dict[str, Any]] | None = None) -> BucketResult:
        if not 0 <= band <= shortlist <= 100:
            raise ApiError(422, "invalid_cutoffs", Api.CUTOFF_ORDER)
        rows = self.db.results_rows(run_id) if rows is None else rows
        scored = [{"candidate_id": r["candidate_id"], "ra_number": r["ra_number"], "overall_score": r["overall_score"]}
                  for r in rows if r["state"] == "scored" and r["overall_score"] is not None]
        return compute_buckets(scored, shortlist_cutoff=shortlist, maybe_cutoff=band, min_shortlist=minimum,
                               overrides=self.db.latest_overrides(run_id))

    def results(self, run_id: int, *, shortlist: int | None, band: int | None, minimum: int | None,
                bucket: str, q: str, sort: str, offset: int, limit: int,
                order: str | None = None) -> m.ResultsOut:
        run = self.db.get_run(run_id)
        saved = (run["shortlist_cutoff"], run["maybe_cutoff"], run["min_shortlist"])
        cut = (saved[0] if shortlist is None else shortlist, saved[1] if band is None else band,
               saved[2] if minimum is None else minimum)
        rows = self.db.results_rows(run_id)
        live = self._buckets(run_id, *cut, rows=rows)
        base = live if cut == saved else self._buckets(run_id, *saved, rows=rows)
        placed = {p.candidate_id: p for p in live.placements}
        shared_ranks = Counter(p.rank for p in live.placements)
        histogram = [0] * 10
        for p in live.placements:
            histogram[min(p.score // 10, 9)] += 1

        out: list[m.ResultRowOut] = []
        states = Counter(r["state"] for r in rows)
        for r in rows:
            p = placed.get(r["candidate_id"])
            if p is not None:
                row_bucket = p.bucket
            elif r["state"] in ("failed", "filtered"):
                row_bucket = r["state"]
            else:
                row_bucket = "not_scored"
            out.append(m.ResultRowOut(
                candidate_id=r["candidate_id"], rank=p.rank if p else None, ra_number=r["ra_number"],
                name=r["name"], department=r["department"], cgpa=r["cgpa"],
                score=r["overall_score"] if p else None, bucket=row_bucket,
                auto_bucket=p.auto_bucket if p else None, how_placed=p.reason if p else None,
                tie=bool(p and shared_ranks[p.rank] > 1), flags=len(r["flags"]),
                failure_kind=r["failure_kind"], failure_reason=r["failure_reason"],
                filter_reason=r["filter_reason"], link_kind=link_kind(r["resume_link"]),
            ))
        if bucket != "all":
            out = [row for row in out if row.bucket == bucket]
        needle = q.casefold().strip()
        if needle:
            out = [row for row in out if needle in row.name.casefold() or needle in row.ra_number.casefold()]
        order = order or FIRST_ORDER[sort]
        out = sort_rows(out, sort, order)

        failed = [r for r in rows if r["state"] == "failed"]
        return m.ResultsOut(
            run_id=run_id, status=run["status"],
            cutoffs=m.CutoffsOut(shortlist=cut[0], band=cut[1], min=cut[2]),
            saved_cutoffs=m.CutoffsOut(shortlist=saved[0], band=saved[1], min=saved[2]),
            counts=m.BucketCountsOut(
                shortlisted=live.counts["shortlisted"], cutoff=live.counts["cutoff"], rejected=live.counts["rejected"],
                failed=states["failed"], filtered=states["filtered"],
                not_scored=sum(states[s] for s in WORKING_STATES),
            ),
            delta=m.BucketDeltaOut(**{b: live.counts[b] - base.counts[b] for b in ("shortlisted", "cutoff", "rejected")}),
            notes=list(live.notes), histogram=histogram, filled_to_minimum=live.filled_to_minimum,
            tie_extra=live.tie_extra, shortfall=live.shortfall,
            failure_groups=_failure_groups([{"failure_reason": r["failure_reason"], "failure_kind": r["failure_kind"]}
                                            for r in failed]),
            bucket=bucket, sort=sort, order=order, total=len(out), offset=offset, limit=limit, rows=out[offset:offset + limit],
        )

    def candidate(self, run_id: int, candidate_id: int) -> m.CandidateOut:
        c = self.db.get_candidate(candidate_id)
        if c["run_id"] != run_id:
            raise NotFoundError(f"Candidate {candidate_id} is not in run {run_id}.")
        run = self.db.get_run(run_id)
        placement = None
        if c["state"] == "scored":
            result = self._buckets(run_id, run["shortlist_cutoff"], run["maybe_cutoff"], run["min_shortlist"])
            shared = Counter(p.rank for p in result.placements)
            p = next((p for p in result.placements if p.candidate_id == candidate_id), None)
            if p is not None:
                placement = m.PlacementOut(rank=p.rank, bucket=p.bucket, auto_bucket=p.auto_bucket,
                                           how_placed=p.reason, tie=shared[p.rank] > 1)
        ev = self.db.get_evaluation(candidate_id)
        evaluation = None
        if ev is not None:
            evaluation = m.EvaluationOut(
                overall_score=ev["overall_score"], sub_scores=ev["sub_scores"], summary=ev["summary"],
                reasons=ev["reasons"], evidence=[m.EvidenceOut(**e) for e in ev["evidence"]],
                claim_mismatches=ev["claim_mismatches"], flags=ev["flags"], model_name=ev["model_name"],
                duration_seconds=ev["duration_seconds"],
            )
        text = self.db.get_resume_text(candidate_id)
        return m.CandidateOut(
            candidate=m.CandidateInfoOut(
                id=c["id"], run_id=c["run_id"], ra_number=c["ra_number"], name=c["name"], email=c["email"],
                phone=c["phone"], section=c["section"], department=c["department"], cgpa=c["cgpa"],
                skills=c["skills"], hackathons=c["hackathons"], state=c["state"], failure_kind=c["failure_kind"],
                failure_reason=c["failure_reason"], filter_reason=c["filter_reason"],
                link_kind=link_kind(c["resume_link"]), attempts=c["attempts"],
            ),
            evaluation=evaluation, placement=placement,
            resume=m.ResumeMetaOut(pages=text["page_count"], ocr_used=bool(text["ocr_used"]),
                                   characters=len(text["text"])) if text else None,
            overrides=[m.OverrideOut(from_bucket=o["from_bucket"], to_bucket=o["to_bucket"], note=o["note"],
                                     created_at=o["created_at"]) for o in self.db.overrides_for(candidate_id)],
            events=[m.EventOut(**_event_fields(e)) for e in self.db.candidate_events(candidate_id)],
        )

    def override(self, run_id: int, candidate_id: int, body: m.OverrideIn) -> m.CandidateOut:
        current = self.candidate(run_id, candidate_id)
        if current.placement is None:
            raise ApiError(409, "not_scored", Api.NOT_SCORED)
        self.db.add_override(candidate_id, from_bucket=current.placement.bucket, to_bucket=body.to_bucket,
                             note=body.note)
        return self.candidate(run_id, candidate_id)

    # ---- export ----------------------------------------------------------- #

    def _placements(self, run_id: int) -> tuple[Any, ...]:
        run = self.db.get_run(run_id)
        return self._buckets(run_id, run["shortlist_cutoff"], run["maybe_cutoff"], run["min_shortlist"]).placements

    def export_to(self, run_id: int, view: str, path: Path) -> int:
        return export_csv(self.db.export_rows(run_id), self._placements(run_id), path, view=view)

    def export_file(self, run_id: int, view: str) -> Path:
        run = self.db.get_run(run_id)
        self.exports_dir.mkdir(parents=True, exist_ok=True)
        path = self.exports_dir / f"{_safe_filename(run['name'])} - {view}.csv"
        self.export_to(run_id, view, path)
        return path

    # ---- settings --------------------------------------------------------- #

    def preferences(self) -> m.SettingsOut:
        stored = self.db.get_setting(PREFERENCES_SETTING, {}) or {}
        merged = {**DEFAULT_PREFERENCES, **{k: v for k, v in stored.items() if k in DEFAULT_PREFERENCES}}
        return m.SettingsOut(**merged)

    def update_preferences(self, body: m.SettingsIn) -> m.SettingsOut:
        changes = body.model_dump(exclude_unset=True)
        changes = {k: v for k, v in changes.items() if v is not None or k == "default_model"}
        merged = {**self.preferences().model_dump(), **changes}
        if merged["default_band"] > merged["default_shortlist"]:
            raise ApiError(422, "invalid_cutoffs", Api.CUTOFF_ORDER)
        result = m.SettingsOut(**merged)
        self.db.set_setting(PREFERENCES_SETTING, result.model_dump())
        return result


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def preflight_out(report: PreflightReport) -> m.PreflightOut:
    summary = report.summary or {}
    return m.PreflightOut(
        source=report.source, ok=report.ok,
        summary=m.PreflightSummaryOut(rows_read=summary.get("rows_read", 0), ready=summary.get("ready", 0),
                                      skipped=summary.get("skipped", 0), warnings=summary.get("warnings", 0)),
        file_errors=[_issue(i) for i in report.errors if i.row is None],
        notes=[_issue(i) for i in report.warnings if i.row is None],
        groups=[m.IssueGroupOut(**g) for g in issue_groups(report)],
        columns=dict(report.columns),
        departments=[m.DepartmentCountOut(name=n, count=c) for n, c in department_counts(report.rows)],
    )


def _issue(issue: Any) -> m.IssueOut:
    return m.IssueOut(row=issue.row, ra_number=issue.ra_number, code=issue.code, message=issue.message)


# The direction a column sorts in when its header is first clicked: best first
# for rank, score and CGPA; A to Z for names and departments.
FIRST_ORDER: dict[str, str] = {"rank": "asc", "score": "desc", "cgpa": "desc", "name": "asc", "department": "asc"}

_SORT_VALUE: dict[str, Callable[[m.ResultRowOut], Any]] = {
    "rank": lambda row: row.rank,
    "score": lambda row: row.score,
    "cgpa": lambda row: row.cgpa,
    "name": lambda row: row.name.strip().casefold() or None,
    "department": lambda row: row.department.strip().casefold() or None,
}


def sort_rows(rows: list[m.ResultRowOut], column: str, order: str) -> list[m.ResultRowOut]:
    """Rows sorted by one column. Rows without a value (no name, no CGPA, not
    ranked) go last in either direction; ties keep RA-number order."""
    value = _SORT_VALUE[column]
    known = sorted((row for row in rows if value(row) is not None), key=lambda row: (row.ra_number, row.candidate_id))
    unknown = sorted((row for row in rows if value(row) is None), key=lambda row: (row.ra_number, row.candidate_id))
    known.sort(key=value, reverse=order == "desc")      # stable: equal values stay in RA order
    return known + unknown


def _failure_groups(rows: Iterable[dict[str, Any]]) -> list[m.FailureGroupOut]:
    counts = Counter((r["failure_reason"] or "", r["failure_kind"] or "retryable") for r in rows)
    return [m.FailureGroupOut(reason=reason, kind=kind, count=n)  # type: ignore[arg-type]
            for (reason, kind), n in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]


def _event_fields(event: dict[str, Any]) -> dict[str, Any]:
    return {k: event[k] for k in ("id", "run_id", "candidate_id", "level", "message", "created_at")}


def _departments(value: Any) -> list[str] | None:
    if value is None:
        return None
    return list(value) if isinstance(value, list) else list(json.loads(value))


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", name).strip(" .")
    return " ".join(cleaned.split())[:80] or "Atlas"


def _folder_size(folder: Path) -> int:
    total = 0
    for path in folder.rglob("*"):
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total


def _unlink(path: Path | str | None) -> None:
    if not path:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        log.warning("could not delete %s", Path(path).name)


def _empty_folder(folder: Path) -> None:
    if not folder.is_dir():
        return
    for path in folder.iterdir():
        if path.is_file():
            _unlink(path)


def _clear_logs(logs_dir: Path) -> None:
    """Start the log afresh and remove old rotated logs."""
    for handler in logging.getLogger("atlas").handlers:
        if isinstance(handler, RotatingFileHandler):
            handler.doRollover()
    for path in logs_dir.glob("engine.log.*"):
        _unlink(path)


def parse_multipart_file(body: bytes, content_type: str, field: str = "file") -> tuple[str, bytes]:
    """The one uploaded file in a ``multipart/form-data`` body: ``(filename, bytes)``.

    FastAPI's form parsing needs the python-multipart package, which isn't a
    pre-approved dependency; one file field is easy to read by hand, and the
    bytes come back exactly as sent (a .xlsx is binary).
    """
    match = re.search(r'boundary="?([^";]+)"?', content_type, re.IGNORECASE)
    if not content_type.lower().startswith("multipart/form-data") or not match:
        raise ApiError(400, "no_file", Api.UPLOAD_EMPTY)
    boundary = b"--" + match.group(1).strip().encode("latin-1")
    for part in body.split(boundary)[1:]:
        if part.startswith(b"--"):
            break
        if part.startswith(b"\r\n"):
            part = part[2:]
        head, sep, payload = part.partition(b"\r\n\r\n")
        if not sep:
            continue
        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        headers = head.decode("utf-8", errors="replace")
        disposition = re.search(r"^content-disposition:\s*form-data\s*;(.*)$", headers, re.IGNORECASE | re.MULTILINE)
        if not disposition:
            continue
        params = disposition.group(1)
        name = re.search(r'\bname="([^"]*)"', params)
        filename = re.search(r'\bfilename="([^"]*)"', params)
        if name and name.group(1) == field and filename:
            clean = re.split(r"[\\/]", filename.group(1))[-1].strip()
            return clean, payload
    raise ApiError(400, "no_file", Api.UPLOAD_EMPTY)


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #


class Guard:
    """Host check, token check and the last-resort error body, as raw ASGI
    middleware (safe for streaming responses)."""

    def __init__(self, app: ASGIApp, *, token: str, host: str) -> None:
        self.app = app
        self.expected = f"Bearer {token}".encode()
        self.host = host.encode("latin-1")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        if headers.get(b"host", b"") != self.host:
            await _send_json(send, 403, "wrong_host", Api.WRONG_HOST)
            return
        if scope["path"] != "/health" and not hmac.compare_digest(headers.get(b"authorization", b""), self.expected):
            await _send_json(send, 401, "unauthorized", Api.UNAUTHORIZED)
            return
        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:  # noqa: BLE001 — anything unhandled becomes a plain 500, never a trace
            log.exception("unhandled error: %s %s", scope.get("method"), scope.get("path"))
            if not started:
                await _send_json(send, 500, "internal", Api.INTERNAL)


async def _send_json(send: Send, status: int, code: str, message: str) -> None:
    body = json.dumps({"code": code, "message": message}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"code": code, "message": message}, status_code=status)


# Every declared error response names its own description. Left out, FastAPI
# copies Python's HTTP status phrase, which changed in Python 3.13 (413 "Request
# Entity Too Large" → "Content Too Large", 422 "Unprocessable Entity" →
# "Unprocessable Content"), so the exported schema would depend on the Python
# that wrote it.
ERROR_DESCRIPTIONS: dict[int, str] = {
    400: "Bad request: no file in the upload",
    401: "Missing or wrong API token",
    403: "Request not sent to 127.0.0.1:<port>",
    404: "Not found",
    409: "Not possible in the current state",
    413: "File is too large",
    415: "Unsupported file type",
    422: "Invalid request",
    500: "Engine error",
    503: "Ollama or the network is unavailable",
}
ERRORS: dict[int | str, dict[str, Any]] = {
    status: {"model": m.ErrorOut, "description": description} for status, description in ERROR_DESCRIPTIONS.items()
}


def create_app(engine: Engine | None = None, *, token: str = "", port: int = 0) -> FastAPI:
    """The FastAPI app. ``engine`` may be None only to export the OpenAPI schema."""

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        if engine is not None:
            await run_in_threadpool(engine.shutdown)

    app = FastAPI(title="Atlas engine", version=ENGINE_VERSION, lifespan=lifespan, responses=ERRORS,
                  docs_url=None, redoc_url=None, openapi_url="/openapi.json")
    app.add_middleware(Guard, token=token, host=f"127.0.0.1:{port}")

    def eng() -> Engine:
        assert engine is not None, "no engine attached"
        return engine

    # ---- error mapping ---------------------------------------------------- #

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _error(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [str(e["loc"][-1]) for e in exc.errors() if e.get("loc")]
        detail = f' Check "{fields[0]}".' if fields else ""
        return _error(422, "invalid_request", Api.INVALID + detail)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return _error(404, "not_found", Api.NOT_FOUND)
        return _error(exc.status_code, "invalid_request", Api.INVALID)

    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return _error(404, "not_found", Api.NOT_FOUND)

    @app.exception_handler(RunLockedError)
    async def _locked(_: Request, exc: RunLockedError) -> JSONResponse:
        return _error(409, "locked", str(exc))

    @app.exception_handler(DbValidationError)
    async def _db_invalid(_: Request, exc: DbValidationError) -> JSONResponse:
        return _error(422, "invalid", str(exc))

    @app.exception_handler(InvalidTransitionError)
    async def _transition(_: Request, exc: InvalidTransitionError) -> JSONResponse:
        text = str(exc)
        message = text if text.startswith(("A ", "Only ")) else Api.CANT_RESUME
        return _error(409, "invalid_state", message)

    @app.exception_handler(WorkerBusyError)
    async def _busy(_: Request, exc: WorkerBusyError) -> JSONResponse:
        return _error(409, "busy", str(exc))

    @app.exception_handler(ExportError)
    async def _export(_: Request, exc: ExportError) -> JSONResponse:
        return _error(409, "export_failed", str(exc))

    @app.exception_handler(SystemUnavailable)
    async def _unavailable(_: Request, exc: SystemUnavailable) -> JSONResponse:
        return _error(503, "unavailable", exc.reason)

    @app.exception_handler(DatabaseError)
    async def _db(_: Request, exc: DatabaseError) -> JSONResponse:
        log.error("database error: %s", exc)
        return _error(500, "database", Api.INTERNAL)

    # ---- health, system, models ------------------------------------------- #

    @app.get("/health", response_model=m.HealthOut)
    def health() -> m.HealthOut:
        return m.HealthOut(status="ok", version=ENGINE_VERSION)

    @app.get("/system", response_model=m.SystemOut)
    def system() -> m.SystemOut:
        return eng().system()

    @app.post("/ollama/start", response_model=m.OllamaStartOut)
    def ollama_start() -> m.OllamaStartOut:
        return eng().start_ollama()

    @app.get("/models", response_model=m.ModelsOut)
    def models() -> m.ModelsOut:
        return eng().models()

    @app.post("/models/{name:path}/precheck", response_model=m.PrecheckOut)
    def model_precheck(name: str) -> m.PrecheckOut:
        return eng().precheck_model(name)

    @app.post("/models/{name:path}/pull", response_model=m.PullStartOut, status_code=202)
    def model_pull(name: str) -> m.PullStartOut:
        return eng().start_pull(name)

    @app.delete("/models/{name:path}/pull", status_code=204)
    def model_pull_cancel(name: str) -> None:
        eng().cancel_pull(name)

    # ---- runs ------------------------------------------------------------- #

    @app.get("/runs", response_model=list[m.RunOut])
    def runs() -> list[m.RunOut]:
        return eng().list_runs()

    @app.post("/runs", response_model=m.RunOut, status_code=201)
    def run_create(body: m.RunCreateIn) -> m.RunOut:
        return eng().create_run(body)

    @app.get("/runs/{run_id}", response_model=m.RunOut)
    def run_get(run_id: int) -> m.RunOut:
        return eng().get_run(run_id)

    @app.patch("/runs/{run_id}", response_model=m.RunOut)
    def run_patch(run_id: int, body: m.RunPatchIn) -> m.RunOut:
        return eng().patch_run(run_id, body)

    @app.delete("/runs/{run_id}", response_model=m.DeletedOut)
    def run_delete(run_id: int) -> m.DeletedOut:
        eng().delete_run(run_id)
        return m.DeletedOut(deleted=True)

    @app.patch("/runs/{run_id}/cutoffs", response_model=m.RunOut)
    def run_cutoffs(run_id: int, body: m.CutoffsIn) -> m.RunOut:
        return eng().save_cutoffs(run_id, body)

    upload_body = {"requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {
        "type": "object", "required": ["file"],
        "properties": {"file": {"type": "string", "format": "binary"}}}}}}}

    @app.post("/runs/{run_id}/table", response_model=m.PreflightOut, openapi_extra=upload_body)
    async def run_table(run_id: int, request: Request) -> m.PreflightOut:
        length = request.headers.get("content-length")
        limit = MAX_UPLOAD_BYTES + 64 * 1024
        if length and length.isdigit() and int(length) > limit:
            raise ApiError(413, "file_too_large", Api.UPLOAD_TOO_LARGE)
        body = bytearray()
        async for chunk in request.stream():
            body += chunk
            if len(body) > limit:
                raise ApiError(413, "file_too_large", Api.UPLOAD_TOO_LARGE)
        filename, data = parse_multipart_file(bytes(body), request.headers.get("content-type", ""))
        if len(data) > MAX_UPLOAD_BYTES:
            raise ApiError(413, "file_too_large", Api.UPLOAD_TOO_LARGE)
        result: m.PreflightOut = await run_in_threadpool(eng().accept_upload, run_id, filename, data)
        return result

    @app.delete("/runs/{run_id}/table", status_code=204)
    def run_table_discard(run_id: int) -> None:
        eng().db.get_run(run_id)
        eng().discard_upload(run_id)

    @app.post("/runs/{run_id}/table/confirm", response_model=m.ConfirmOut)
    def run_table_confirm(run_id: int) -> m.ConfirmOut:
        return eng().confirm(run_id)

    @app.get("/runs/{run_id}/filters/preview", response_model=m.FilterPreviewOut)
    def run_filters_preview(run_id: int, cgpa_min: float | None = Query(default=None, ge=0, le=10),
                            departments: list[str] | None = Query(default=None)) -> m.FilterPreviewOut:
        return eng().filters_preview(run_id, cgpa_min, departments)

    @app.post("/runs/{run_id}/filters/clear", response_model=m.ClearFiltersOut)
    def run_filters_clear(run_id: int) -> m.ClearFiltersOut:
        return eng().clear_filters(run_id)

    @app.get("/runs/{run_id}/estimate", response_model=m.EstimateOut)
    def run_estimate(run_id: int, count: int | None = Query(default=None, ge=0)) -> m.EstimateOut:
        return eng().estimate(run_id, count)

    @app.post("/runs/{run_id}/start", response_model=m.RunOut)
    def run_start(run_id: int) -> m.RunOut:
        return eng().start(run_id)

    @app.post("/runs/{run_id}/pause", response_model=m.RunOut)
    def run_pause(run_id: int) -> m.RunOut:
        return eng().pause(run_id)

    @app.post("/runs/{run_id}/resume", response_model=m.RunOut)
    def run_resume(run_id: int) -> m.RunOut:
        return eng().resume(run_id)

    @app.post("/runs/{run_id}/cancel", response_model=m.RunOut)
    def run_cancel(run_id: int) -> m.RunOut:
        return eng().cancel(run_id)

    @app.post("/runs/{run_id}/retry-failed", response_model=m.RetryOut)
    def run_retry(run_id: int, body: m.RetryIn) -> m.RetryOut:
        return eng().retry_failed(run_id, body.include_permanent)

    @app.get("/runs/{run_id}/progress", response_model=m.ProgressOut)
    def run_progress(run_id: int) -> m.ProgressOut:
        return eng().progress(run_id)

    @app.get("/runs/{run_id}/results", response_model=m.ResultsOut)
    def run_results(
        run_id: int,
        shortlist: int | None = Query(default=None, ge=0, le=100),
        band: int | None = Query(default=None, ge=0, le=100),
        min: int | None = Query(default=None, ge=0, le=100000),  # noqa: A002 — the API's parameter name
        bucket: Literal["all", "shortlisted", "cutoff", "rejected", "failed", "filtered", "not_scored"] = "all",
        q: str = Query(default="", max_length=200),
        sort: m.SortColumn = "rank",
        order: m.SortOrder | None = None,                 # None: the column's own first direction
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=200, ge=1, le=5000),
    ) -> m.ResultsOut:
        return eng().results(run_id, shortlist=shortlist, band=band, minimum=min, bucket=bucket, q=q, sort=sort,
                             order=order, offset=offset, limit=limit)

    @app.get("/runs/{run_id}/candidates/{candidate_id}", response_model=m.CandidateOut)
    def run_candidate(run_id: int, candidate_id: int) -> m.CandidateOut:
        return eng().candidate(run_id, candidate_id)

    @app.post("/runs/{run_id}/candidates/{candidate_id}/override", response_model=m.CandidateOut)
    def run_override(run_id: int, candidate_id: int, body: m.OverrideIn) -> m.CandidateOut:
        return eng().override(run_id, candidate_id, body)

    @app.get("/runs/{run_id}/export", response_class=FileResponse,
             responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}})
    def run_export(run_id: int,
                   view: Literal["all", "shortlisted", "cutoff", "rejected", "failed"] = "all") -> FileResponse:
        path = eng().export_file(run_id, view)
        return FileResponse(path, media_type="text/csv; charset=utf-8", filename=path.name)

    @app.post("/runs/{run_id}/export", response_model=m.ExportOut)
    def run_export_to(run_id: int, body: m.ExportIn) -> m.ExportOut:
        target = Path(body.path)
        if not target.is_absolute() or target.suffix.lower() != ".csv" or not target.parent.is_dir():
            raise ApiError(422, "export_path", Api.EXPORT_PATH)
        written = eng().export_to(run_id, body.view, target)
        return m.ExportOut(written=written, path=str(target))

    # ---- events ----------------------------------------------------------- #

    sse = {"content": {"text/event-stream": {"schema": {"type": "string"}}}}

    @app.get("/runs/{run_id}/events", response_class=StreamingResponse, responses={200: sse})
    async def run_events(run_id: int, request: Request, follow: bool = True,
                         after: int = Query(default=0, ge=0)) -> StreamingResponse:
        await run_in_threadpool(eng().db.get_run, run_id)
        header = request.headers.get("last-event-id", "")
        start = int(header) if header.isdigit() else after
        return _sse(_run_event_stream(eng(), request, run_id, start, follow))

    @app.get("/events", response_class=StreamingResponse, responses={200: sse})
    async def app_events(request: Request, follow: bool = True,
                         after: int = Query(default=0, ge=0)) -> StreamingResponse:
        header = request.headers.get("last-event-id", "")
        start = int(header) if header.isdigit() else after
        return _sse(_app_event_stream(eng(), request, start, follow))

    # ---- settings, data, shutdown ------------------------------------------ #

    @app.get("/settings", response_model=m.SettingsOut)
    def settings_get() -> m.SettingsOut:
        return eng().preferences()

    @app.put("/settings", response_model=m.SettingsOut)
    def settings_put(body: m.SettingsIn) -> m.SettingsOut:
        return eng().update_preferences(body)

    @app.delete("/data", response_model=m.DeletedOut)
    def data_delete() -> m.DeletedOut:
        eng().delete_all()
        return m.DeletedOut(deleted=True)

    @app.post("/shutdown", response_model=m.StoppingOut, status_code=202)
    def shutdown() -> m.StoppingOut:
        threading.Thread(target=eng().stop_and_exit, name="atlas-shutdown", daemon=True).start()
        return m.StoppingOut(status="stopping")

    return app


def _sse(stream: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def _run_event_stream(engine: Engine, request: Request, run_id: int, last: int,
                            follow: bool) -> AsyncIterator[str]:
    quiet_since = time.monotonic()
    while True:
        try:
            batch = await run_in_threadpool(_events_after, engine, run_id, last)
        except DatabaseError:
            return
        for event in batch:
            last = event["id"]
            yield f"id: {event['id']}\nevent: run\ndata: {json.dumps(_event_fields(event))}\n\n"
        if batch:
            quiet_since = time.monotonic()
        elif not follow:
            return
        if await request.is_disconnected():
            return
        if time.monotonic() - quiet_since >= engine.options.keepalive_seconds:
            yield ": keep-alive\n\n"
            quiet_since = time.monotonic()
        await asyncio.sleep(engine.options.event_poll_seconds)


def _events_after(engine: Engine, run_id: int, last: int) -> list[dict[str, Any]]:
    return engine.db.events(run_id, after_id=last, limit=200)


async def _app_event_stream(engine: Engine, request: Request, last: int, follow: bool) -> AsyncIterator[str]:
    quiet_since = time.monotonic()
    while True:
        batch = engine.events.after(last)
        for item in batch:
            last = item["id"]
            yield f"id: {item['id']}\nevent: {item['kind']}\ndata: {json.dumps(item['data'])}\n\n"
        if batch:
            quiet_since = time.monotonic()
        elif not follow:
            return
        if await request.is_disconnected():
            return
        if time.monotonic() - quiet_since >= engine.options.keepalive_seconds:
            yield ": keep-alive\n\n"
            quiet_since = time.monotonic()
        await asyncio.sleep(min(engine.options.event_poll_seconds, 0.25))


# --------------------------------------------------------------------------- #
# Launch
# --------------------------------------------------------------------------- #


def export_openapi(path: Path | str) -> None:
    """Write the API schema the app's TypeScript types are generated from."""
    schema = create_app().openapi()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes((json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m engine.server", description="Atlas local API")
    parser.add_argument("--data-dir", type=Path, help="folder for atlas.db, downloads and logs")
    parser.add_argument("--port", type=int, default=0, help="0 = any free port")
    parser.add_argument("--token", help="API token (or set ATLAS_TOKEN)")
    parser.add_argument("--ollama-url", default=os.environ.get("ATLAS_OLLAMA_URL", DEFAULT_URL))
    parser.add_argument("--watch-stdin", action="store_true",
                        help="stop when stdin closes (the app that started us has gone)")
    parser.add_argument("--openapi", type=Path, help="write the OpenAPI schema to this file and exit")
    return parser


def main(argv: list[str] | None = None, *, options: EngineOptions | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.openapi:
        export_openapi(args.openapi)
        return 0
    token = args.token or os.environ.get("ATLAS_TOKEN", "")
    if not args.data_dir or len(token) < 16:
        print("Atlas engine: --data-dir and a token of 16+ characters are required.", file=sys.stderr)
        return 1
    try:
        local_only(args.ollama_url)
    except ValueError as exc:
        print(f"Atlas engine: {exc}", file=sys.stderr)
        return 1

    import uvicorn  # the only place the HTTP server is needed

    args.data_dir.mkdir(parents=True, exist_ok=True)
    handler = configure_logging(args.data_dir)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers = [handler]
        logger.propagate = False

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", args.port))
    port = sock.getsockname()[1]

    engine = Engine(args.data_dir, ollama_url=args.ollama_url, options=options)
    engine.boot()
    app = create_app(engine, token=token, port=port)
    server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False, lifespan="on",
                                           timeout_graceful_shutdown=3))
    engine.request_exit = lambda: setattr(server, "should_exit", True)

    def announce() -> None:
        while not server.started and not server.should_exit:
            time.sleep(0.02)
        if server.started:
            # Bytes, so Windows text mode can't turn the newline into CRLF.
            sys.stdout.buffer.write(f"ATLAS_READY port={port}\n".encode("ascii"))
            sys.stdout.buffer.flush()
            log.info("listening on 127.0.0.1:%d", port)

    def watch_stdin() -> None:
        # os.read on the raw descriptor: a daemon thread blocked in
        # sys.stdin.buffer.read holds the buffer's lock, and Python aborts at
        # exit when it can't take that lock ("_enter_buffered_busy").
        try:
            fd = sys.stdin.fileno()
            while os.read(fd, 1024):
                pass
        except (OSError, ValueError):
            pass
        log.info("the app has gone (stdin closed); stopping")
        engine.stop_and_exit()

    threading.Thread(target=announce, name="atlas-announce", daemon=True).start()
    if args.watch_stdin:
        threading.Thread(target=watch_stdin, name="atlas-stdin", daemon=True).start()
    try:
        server.run(sockets=[sock])
    finally:
        engine.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
