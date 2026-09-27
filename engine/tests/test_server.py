"""The local API (engine/server.py): auth, the full flow, locks, cancel, shutdown,
error bodies, uploads, SSE and the OpenAPI export. Fictional data only.

Most tests use FastAPI's TestClient against a real ``Engine`` whose worker
downloads from the local Drive stub and scores with the local Ollama stub.
``LaunchTests`` start the real process and talk to it over a socket.
"""

from __future__ import annotations

import csv
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Any, Callable

import warnings

import openpyxl
import requests

with warnings.catch_warnings():
    # Starlette 1.x suggests httpx2 for its TestClient; httpx is the pre-approved one.
    warnings.simplefilter("ignore")
    from fastapi.testclient import TestClient

from engine.errors import Api, Pause, Reason
from engine.health import HealthProbe
from engine.llm.client import OllamaClient
from engine.server import ApiError, Engine, EngineOptions, create_app, export_openapi, parse_multipart_file
from engine.tests.fixtures import make_pdf, simple_resume_text
from engine.tests.stubs.drive_stub import DriveStub, Pdf, SignIn
from engine.tests.stubs.ollama_stub import OllamaStub

TOKEN = "t" * 43
PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
REPO = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO / "app" / "src" / "shared" / "api-schema.json"
HEADER = ["Name", "RA Number", "CGPA", "Mail ID", "Department", "P.No", "Skills", "Resume Link"]


class ServerTestCase(unittest.TestCase):
    ollama_delay = 0.0

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.data = self.dir / "data"
        self.drive = DriveStub().start()
        self.ollama = OllamaStub(delay=self.ollama_delay).start()
        self.addCleanup(self.drive.stop)
        self.addCleanup(self.ollama.stop)
        self.engine = self.make_engine()
        self.engine.boot()
        self.exited = False
        self.engine.request_exit = lambda: setattr(self, "exited", True)
        self.client = TestClient(create_app(self.engine, token=TOKEN, port=PORT), base_url=BASE,
                                 raise_server_exceptions=False)
        self.client.headers.update(AUTH)

    def make_engine(self) -> Engine:
        client = OllamaClient(self.ollama.base_url)
        options = EngineOptions(
            url_rewrite=self.drive.rewrite,
            health=HealthProbe(hosts=(("127.0.0.1", self.drive.port),), ollama=client),
            poll_interval=0.2, download_interval=0.0, idle_interval=0.01, stop_timeout=5.0,
            keepalive_seconds=0.3, event_poll_seconds=0.05, status_poll_seconds=0.05,
        )
        return Engine(self.data, ollama_url=self.ollama.base_url, options=options)

    def tearDown(self) -> None:
        self.client.close()
        self.engine.shutdown()
        self._tmp.cleanup()

    # ---- helpers ---------------------------------------------------------- #

    def pdf(self, name: str, grade: int) -> bytes:
        return make_pdf(self.dir / f"{name}.pdf", [simple_resume_text(grade, name="Test Student")]).read_bytes()

    def students(self, grades: list[int], *, extra: list[list[str]] | None = None) -> list[list[str]]:
        rows = []
        for i, grade in enumerate(grades, start=1):
            link = self.drive.serve(f"FILE{i:03d}", Pdf(self.pdf(f"s{i}", grade)))
            rows.append([f"Test Student {i}", f"RA{i:06d}", "9.1" if i % 2 else "7.2", f"s{i}@example.com",
                         "CSE" if i % 3 else "ECE", "9876500000", "Python", link])
        return rows + (extra or [])

    def csv_bytes(self, rows: list[list[str]], header: list[str] = HEADER) -> bytes:
        out = io.StringIO()
        writer = csv.writer(out, lineterminator="\r\n")
        writer.writerow(header)
        writer.writerows(rows)
        return ("\ufeff" + out.getvalue()).encode("utf-8")

    def create_run(self, name: str = "Test screening") -> int:
        response = self.client.post("/runs", json={"name": name})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def upload(self, run_id: int, data: bytes, filename: str = "students.csv") -> Any:
        return self.client.post(f"/runs/{run_id}/table", files={"file": (filename, data, "application/octet-stream")})

    def ready_run(self, grades: list[int], *, extra: list[list[str]] | None = None, **config: Any) -> int:
        run_id = self.create_run()
        response = self.upload(run_id, self.csv_bytes(self.students(grades, extra=extra)))
        self.assertEqual(response.status_code, 200, response.text)
        body = {"model_name": "stub-model:latest", "criteria_prompt": "Python projects", **config}
        self.assertEqual(self.client.patch(f"/runs/{run_id}", json=body).status_code, 200)
        self.assertEqual(self.client.post(f"/runs/{run_id}/table/confirm").status_code, 200)
        return run_id

    def wait_for(self, predicate: Callable[[], bool], timeout: float = 30.0, what: str = "") -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.02)
        self.fail(f"timed out waiting for {what}")

    def status(self, run_id: int) -> str:
        return self.client.get(f"/runs/{run_id}").json()["status"]

    def assertError(self, response: Any, status: int, code: str, message: str | None = None) -> None:
        self.assertEqual(response.status_code, status, response.text)
        body = response.json()
        self.assertEqual(set(body), {"code", "message"})
        self.assertEqual(body["code"], code)
        if message is not None:
            self.assertEqual(body["message"], message)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #


class AuthTests(ServerTestCase):
    def test_health_needs_no_token(self) -> None:
        response = self.client.get("/health", headers={"Authorization": ""})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_missing_or_wrong_token_is_refused(self) -> None:
        for header in ("", "Bearer ", f"Bearer {TOKEN[:-1]}", f"Bearer {TOKEN}x", TOKEN, f"bearer {TOKEN}"):
            with self.subTest(header=header):
                self.assertError(self.client.get("/runs", headers={"Authorization": header}),
                                 401, "unauthorized", Api.UNAUTHORIZED)

    def test_wrong_host_is_refused_even_with_the_token(self) -> None:
        for host in ("evil.example", f"localhost:{PORT}", "127.0.0.1", f"127.0.0.1:{PORT + 1}"):
            with self.subTest(host=host):
                self.assertError(self.client.get("/runs", headers={"Host": host}), 403, "wrong_host", Api.WRONG_HOST)
        self.assertError(self.client.get("/health", headers={"Host": "evil.example"}), 403, "wrong_host")

    def test_right_token_and_host(self) -> None:
        self.assertEqual(self.client.get("/runs").status_code, 200)


# --------------------------------------------------------------------------- #
# The full flow
# --------------------------------------------------------------------------- #


class FlowTests(ServerTestCase):
    def test_create_upload_confirm_start_events_results_override_export(self) -> None:
        # Create: defaults come from the preferences.
        run_id = self.create_run("Campus drive")
        run = self.client.get(f"/runs/{run_id}").json()
        self.assertEqual((run["status"], run["shortlist_cutoff"], run["maybe_cutoff"], run["total"]),
                         ("draft", 60, 50, 0))

        # Upload → pre-flight report; nothing stored yet.
        grades = [90, 80, 70, 65, 55, 45, 30, 62]
        private = self.drive.serve("PRIVATE", SignIn())
        extra = [["Test Student P", "RA999001", "9.0", "p@example.com", "CSE", "9876500000", "", private],
                 ["No Link", "RA999002", "8.0", "n@example.com", "CSE", "9876500000", "", ""],
                 ["Dup", "RA000001", "8.0", "d@example.com", "CSE", "9876500000", "", "https://example.com/x.pdf"],
                 ["Test Student S", "RA999003", "9.0", "s@example.com", "CSE", "9876500000", "", private]]
        report = self.upload(run_id, self.csv_bytes(self.students(grades, extra=extra))).json()
        self.assertTrue(report["ok"])
        self.assertEqual(report["summary"], {"rows_read": 12, "ready": 10, "skipped": 2, "warnings": 1})
        groups = {g["code"]: g for g in report["groups"]}
        self.assertEqual((groups["missing_link"]["rows"], groups["missing_link"]["skipped"]), ([11], True))
        self.assertEqual(groups["duplicate_ra"]["ra_numbers"], ["RA000001"])
        self.assertEqual((groups["shared_link"]["severity"], groups["shared_link"]["rows"]), ("warning", [13]))
        self.assertEqual({d["name"]: d["count"] for d in report["departments"]}, {"CSE": 8, "ECE": 2})
        self.assertEqual(self.client.get(f"/runs/{run_id}").json()["total"], 0)
        self.assertTrue(self.client.get(f"/runs/{run_id}").json()["has_upload"])

        # Live filter preview from the pre-flight rows (the worker's own rule).
        preview = self.client.get(f"/runs/{run_id}/filters/preview", params={"cgpa_min": 8.5}).json()
        self.assertEqual((preview["total"], preview["removed_by_cgpa"]), (10, 4))
        preview = self.client.get(f"/runs/{run_id}/filters/preview",
                                  params=[("departments", "cse")]).json()
        self.assertEqual(preview["removed_by_department"], 2)

        # Model: not checked → pre-check → ready.
        models = self.client.get("/models").json()
        self.assertTrue(models["ollama_running"])
        self.assertEqual(models["models"][0]["precheck"]["status"], "not_checked")
        check = self.client.post("/models/stub-model:latest/precheck").json()
        self.assertTrue(check["ok"], check)
        self.assertEqual(self.client.get("/models").json()["models"][0]["precheck"]["status"], "ready")

        # Configure; estimate before confirm uses the pending file and the pre-check.
        body = {"model_name": "stub-model:latest", "criteria_prompt": "Python projects", "min_shortlist": 6}
        self.assertEqual(self.client.patch(f"/runs/{run_id}", json=body).status_code, 200)
        estimate = self.client.get(f"/runs/{run_id}/estimate").json()
        self.assertEqual(estimate["remaining"], 10)
        self.assertEqual(estimate["estimate"]["basis"], "precheck")

        # Confirm inserts the rows; a second confirm is refused.
        self.assertEqual(self.client.post(f"/runs/{run_id}/table/confirm").json(), {"added": 10})
        self.assertError(self.client.post(f"/runs/{run_id}/table/confirm"), 409, "no_upload")
        self.assertEqual(self.client.get(f"/runs/{run_id}").json()["csv_filename"], "students.csv")

        # Start and wait.
        self.assertEqual(self.client.post(f"/runs/{run_id}/start").json()["status"], "running")
        self.wait_for(lambda: self.status(run_id) == "completed", what="completion")
        progress = self.client.get(f"/runs/{run_id}/progress").json()
        self.assertEqual((progress["total"], progress["done"], progress["stages"]["needs_attention"]), (10, 10, 2))
        self.assertEqual(progress["failures"], [{"reason": Reason.PRIVATE, "kind": "permanent", "count": 2}])
        self.assertEqual(progress["activity"], [])

        # Events: backlog, then resume after an id (Last-Event-ID).
        text = self.client.get(f"/runs/{run_id}/events", params={"follow": "false"}).text
        events = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
        messages = [e["message"] for e in events]
        self.assertEqual(sum(1 for m in messages if m.startswith("Scored")), 8)
        self.assertIn(f"Failed (permanent): {Reason.PRIVATE}", messages)
        middle = events[len(events) // 2]["id"]
        later = self.client.get(f"/runs/{run_id}/events", params={"follow": "false"},
                                headers={"Last-Event-ID": str(middle)}).text
        self.assertTrue(all(json.loads(line[6:])["id"] > middle
                            for line in later.splitlines() if line.startswith("data: ")))

        # Results with the saved cutoffs.
        results = self.client.get(f"/runs/{run_id}/results").json()
        self.assertEqual(results["counts"], {"shortlisted": 6, "cutoff": 0, "rejected": 2, "failed": 2,
                                             "filtered": 0, "not_scored": 0})
        self.assertEqual(results["histogram"], [0, 0, 0, 1, 1, 1, 2, 1, 1, 1])
        self.assertEqual(results["filled_to_minimum"], 1)
        how = {r["score"]: r["how_placed"] for r in results["rows"] if r["score"] is not None}
        self.assertEqual(how[55], "fill")

        # Live cutoffs: nothing saved.
        live = self.client.get(f"/runs/{run_id}/results", params={"shortlist": 85, "band": 60, "min": 0}).json()
        self.assertEqual((live["counts"]["shortlisted"], live["counts"]["cutoff"]), (1, 4))
        self.assertEqual(live["delta"], {"shortlisted": -5, "cutoff": 4, "rejected": 1})
        self.assertEqual(self.client.get(f"/runs/{run_id}").json()["shortlist_cutoff"], 60)

        # Save cutoffs on the completed run; the rest of the config stays locked.
        saved = self.client.patch(f"/runs/{run_id}/cutoffs",
                                  json={"shortlist_cutoff": 85, "maybe_cutoff": 60, "min_shortlist": 0}).json()
        self.assertEqual((saved["shortlist_cutoff"], saved["maybe_cutoff"]), (85, 60))
        self.assertError(self.client.patch(f"/runs/{run_id}", json={"criteria_prompt": "Java"}), 409, "locked")

        # Search, bucket filter, sort, paging.
        found = self.client.get(f"/runs/{run_id}/results", params={"q": "ra000003"}).json()
        self.assertEqual([r["ra_number"] for r in found["rows"]], ["RA000003"])
        failed = self.client.get(f"/runs/{run_id}/results", params={"bucket": "failed"}).json()
        self.assertEqual([(r["ra_number"], r["link_kind"]) for r in failed["rows"]],
                         [("RA999001", "drive_file"), ("RA999003", "drive_file")])
        by_name = self.client.get(f"/runs/{run_id}/results", params={"sort": "name", "limit": 2}).json()
        self.assertEqual((by_name["total"], len(by_name["rows"])), (10, 2))

        # Override: recorded, placed, shown in the detail.
        target = next(r for r in results["rows"] if r["score"] == 30)
        detail = self.client.post(f"/runs/{run_id}/candidates/{target['candidate_id']}/override",
                                  json={"to_bucket": "shortlisted", "note": "Strong interview"}).json()
        self.assertEqual((detail["placement"]["bucket"], detail["placement"]["how_placed"]), ("shortlisted", "override"))
        self.assertEqual(detail["overrides"][0]["note"], "Strong interview")
        self.assertTrue(any(e["message"].startswith("Moved by recruiter") for e in detail["events"]))
        self.assertEqual(detail["evaluation"]["overall_score"], 30)
        self.assertEqual(detail["resume"]["pages"], 1)

        failed_detail = self.client.get(f"/runs/{run_id}/candidates/{failed['rows'][0]['candidate_id']}").json()
        self.assertEqual(failed_detail["candidate"]["failure_reason"], Reason.PRIVATE)
        self.assertIsNone(failed_detail["evaluation"])
        self.assertError(self.client.post(
            f"/runs/{run_id}/candidates/{failed['rows'][0]['candidate_id']}/override",
            json={"to_bucket": "shortlisted"}), 409, "not_scored", Api.NOT_SCORED)

        # Export: the download, and straight to a chosen path.
        download = self.client.get(f"/runs/{run_id}/export", params={"view": "shortlisted"})
        self.assertEqual(download.status_code, 200)
        self.assertTrue(download.content.startswith(b"\xef\xbb\xbf"))
        self.assertEqual(len(download.content.decode("utf-8-sig").strip().splitlines()), 1 + 2)
        target_path = self.dir / "out" / "all.csv"
        target_path.parent.mkdir()
        written = self.client.post(f"/runs/{run_id}/export", json={"view": "all", "path": str(target_path)}).json()
        self.assertEqual(written["written"], 10)
        self.assertTrue(target_path.read_bytes().startswith(b"\xef\xbb\xbf"))
        self.assertError(self.client.post(f"/runs/{run_id}/export", json={"view": "all", "path": "relative.csv"}),
                         422, "export_path")

        # Runs list for the Welcome screen.
        listed = self.client.get("/runs").json()
        self.assertEqual([(r["id"], r["status"], r["done"]) for r in listed], [(run_id, "completed", 10)])

    def test_xlsx_upload(self) -> None:
        run_id = self.create_run()
        book = openpyxl.Workbook()
        sheet = book.active
        sheet.append(HEADER)
        for row in self.students([70, 60]):
            row[5] = 919876500000              # a phone stored as a number
            sheet.append(row)
        buffer = io.BytesIO()
        book.save(buffer)
        report = self.upload(run_id, buffer.getvalue(), "students.xlsx").json()
        self.assertEqual((report["ok"], report["summary"]["ready"]), (True, 2))
        self.assertEqual(self.client.post(f"/runs/{run_id}/table/confirm").json(), {"added": 2})

    def test_replacing_the_file_before_confirm(self) -> None:
        run_id = self.create_run()
        self.upload(run_id, self.csv_bytes(self.students([70, 60, 50])))
        report = self.upload(run_id, self.csv_bytes(self.students([70]))).json()
        self.assertEqual(report["summary"]["ready"], 1)
        self.assertEqual(len(list((self.data / "uploads").iterdir())), 1)
        self.assertEqual(self.client.delete(f"/runs/{run_id}/table").status_code, 204)
        self.assertEqual(list((self.data / "uploads").iterdir()), [])
        self.assertError(self.client.post(f"/runs/{run_id}/table/confirm"), 409, "no_upload", Api.NO_UPLOAD)

    def test_a_file_without_a_link_column_cannot_be_confirmed(self) -> None:
        run_id = self.create_run()
        rows = [r[:-1] for r in self.students([70])]
        report = self.upload(run_id, self.csv_bytes(rows, HEADER[:-1])).json()
        self.assertFalse(report["ok"])
        self.assertEqual([e["code"] for e in report["file_errors"]], ["missing_column"])
        self.assertError(self.client.post(f"/runs/{run_id}/table/confirm"), 409, "upload_not_ready")

    def test_retry_failed_and_clear_filters(self) -> None:
        private = self.drive.serve("PRIVATE", SignIn())
        run_id = self.ready_run([70, 60, 50], cgpa_min=8.0,
                                extra=[["P", "RA999001", "9.5", "p@example.com", "CSE", "9876500000", "", private]])
        self.client.post(f"/runs/{run_id}/start")
        self.wait_for(lambda: self.status(run_id) == "completed", what="completion")
        counts = self.client.get(f"/runs/{run_id}").json()["counts"]
        self.assertEqual((counts["scored"], counts["failed"], counts["filtered"]), (2, 1, 1))
        self.assertError(self.client.post(f"/runs/{run_id}/filters/clear"), 409, "locked")
        self.assertEqual(self.client.post(f"/runs/{run_id}/retry-failed", json={}).json(), {"retried": 0})
        self.drive.serve("PRIVATE", Pdf(self.pdf("fixed", 88)))
        self.assertEqual(self.client.post(f"/runs/{run_id}/retry-failed",
                                          json={"include_permanent": True}).json(), {"retried": 1})
        self.wait_for(lambda: self.client.get(f"/runs/{run_id}").json()["counts"]["scored"] == 3, what="retry")


class ConfigLockTests(ServerTestCase):
    ollama_delay = 0.3

    def test_config_is_locked_once_started(self) -> None:
        run_id = self.ready_run([70, 60, 50, 40])
        self.client.post(f"/runs/{run_id}/start")
        for body in ({"model_name": "other"}, {"criteria_prompt": "Java"}, {"shortlist_cutoff": 70},
                     {"cgpa_min": 8.0}):
            with self.subTest(body=body):
                self.assertError(self.client.patch(f"/runs/{run_id}", json=body), 409, "locked",
                                 "A run's model, criteria and cutoffs are locked once it starts.")
        self.assertError(self.client.patch(f"/runs/{run_id}/cutoffs",
                                           json={"shortlist_cutoff": 70, "maybe_cutoff": 50, "min_shortlist": 0}),
                         409, "locked")
        self.assertEqual(self.client.patch(f"/runs/{run_id}", json={"name": "Renamed"}).json()["name"], "Renamed")
        self.assertError(self.upload(run_id, self.csv_bytes(self.students([70]))), 409, "not_draft")

    def test_pause_resume_and_one_run_at_a_time(self) -> None:
        first = self.ready_run([70, 60, 50, 40])
        second = self.ready_run([70])
        self.client.post(f"/runs/{first}/start")
        self.assertError(self.client.post(f"/runs/{second}/start"), 409, "busy")
        paused = self.client.post(f"/runs/{first}/pause").json()
        self.assertEqual((paused["status"], paused["pause_reason"], paused["auto_resume"]),
                         ("paused", Pause.BY_USER, False))
        self.assertError(self.client.post(f"/runs/{first}/pause"), 409, "cant_pause", Api.CANT_PAUSE)
        self.assertEqual(self.client.post(f"/runs/{first}/resume").json()["status"], "running")
        self.wait_for(lambda: self.status(first) == "completed", what="first run")
        self.assertError(self.client.post(f"/runs/{first}/cancel"), 409, "cant_cancel", Api.CANT_CANCEL)


class CancelTests(ServerTestCase):
    ollama_delay = 0.4

    def test_cancel_a_running_run(self) -> None:
        run_id = self.ready_run([70, 60, 50, 40, 30, 20])
        self.client.post(f"/runs/{run_id}/start")
        self.wait_for(lambda: self.client.get(f"/runs/{run_id}").json()["counts"]["scoring"] == 1, what="scoring")
        self.assertEqual(self.client.post(f"/runs/{run_id}/cancel").json()["status"], "cancelled")
        self.wait_for(lambda: not self.client.get(f"/runs/{run_id}/progress").json()["activity"],
                      what="nothing in flight")
        self.wait_for(lambda: not list((self.data / "downloads").glob("*.pdf")), what="PDFs deleted")
        self.assertError(self.client.post(f"/runs/{run_id}/start"), 409, "invalid_state")

    def test_cancel_a_draft_discards_its_upload(self) -> None:
        run_id = self.create_run()
        self.upload(run_id, self.csv_bytes(self.students([70])))
        self.assertEqual(self.client.post(f"/runs/{run_id}/cancel").json()["status"], "cancelled")
        self.assertEqual(list((self.data / "uploads").iterdir()), [])


class ShutdownTests(ServerTestCase):
    ollama_delay = 0.3

    def test_shutdown_pauses_the_running_run_and_exits(self) -> None:
        run_id = self.ready_run([70, 60, 50, 40, 30])
        self.client.post(f"/runs/{run_id}/start")
        self.wait_for(lambda: self.client.get(f"/runs/{run_id}").json()["counts"]["scored"] >= 1, what="a score")
        response = self.client.post("/shutdown")
        self.assertEqual((response.status_code, response.json()), (202, {"status": "stopping"}))
        self.wait_for(lambda: self.exited, what="exit request")
        engine = self.make_engine()
        try:
            run = engine.db.get_run(run_id)
            self.assertEqual((run["status"], run["pause_reason"]), ("paused", Pause.CLOSED))
        finally:
            engine.db.close()


class BootTests(ServerTestCase):
    def test_a_run_paused_for_ollama_resumes_after_a_restart(self) -> None:
        run_id = self.ready_run([70, 60])
        db = self.engine.db
        db.set_run_status(run_id, "running")
        db.set_run_status(run_id, "paused", reason=Pause.OLLAMA_DOWN)
        self.client.close()
        self.engine.shutdown()
        self.engine = self.make_engine()
        self.engine.boot()
        self.client = TestClient(create_app(self.engine, token=TOKEN, port=PORT), base_url=BASE)
        self.client.headers.update(AUTH)
        self.wait_for(lambda: self.status(run_id) == "completed", what="auto-resume after restart")


# --------------------------------------------------------------------------- #
# Errors never show a stack trace
# --------------------------------------------------------------------------- #


class ErrorBodyTests(ServerTestCase):
    def test_every_error_is_code_and_message_only(self) -> None:
        run_id = self.create_run()
        cases = [
            (self.client.get("/no/such/route"), 404),
            (self.client.get("/runs/9999"), 404),
            (self.client.get(f"/runs/{run_id}/candidates/9999"), 404),
            (self.client.post("/runs", json={"name": ""}), 422),
            (self.client.post("/runs", json={"name": "x", "extra": 1}), 422),
            (self.client.patch(f"/runs/{run_id}", json={"shortlist_cutoff": 101}), 422),
            (self.client.patch(f"/runs/{run_id}", json={"shortlist_cutoff": 40, "maybe_cutoff": 50}), 422),
            (self.client.get(f"/runs/{run_id}/results", params={"shortlist": 40, "band": 50}), 422),
            (self.client.get(f"/runs/{run_id}/results", params={"bucket": "nope"}), 422),
            (self.client.post(f"/runs/{run_id}/start"), 409),
            (self.client.post(f"/runs/{run_id}/table", content=b"x" * 10,
                              headers={"Content-Type": "multipart/form-data; boundary=zz"}), 400),
            (self.upload(run_id, b"%PDF-1.7", "resume.pdf"), 415),
            (self.client.post(f"/runs/{run_id}/table", content=b"x" * (21 * 1024 * 1024),
                              headers={"Content-Type": "multipart/form-data; boundary=zz"}), 413),
            (self.client.put("/settings", json={"default_shortlist": 40, "default_band": 60}), 422),
        ]
        for response, status in cases:
            with self.subTest(url=str(response.url), status=status):
                self.assertEqual(response.status_code, status, response.text)
                self.assertClean(response)

    def test_an_unexpected_error_is_a_plain_500(self) -> None:
        def boom(*args: Any, **kwargs: Any) -> Any:
            raise RuntimeError("secret internal detail at C:\\path\\engine.py line 42")

        self.engine.list_runs = boom  # type: ignore[method-assign]
        response = self.client.get("/runs")
        self.assertError(response, 500, "internal", Api.INTERNAL)
        self.assertClean(response)
        self.engine.system = boom      # type: ignore[method-assign]
        self.assertError(self.client.get("/system"), 500, "internal")

    def test_export_of_a_locked_file_says_so(self) -> None:
        run_id = self.ready_run([70])
        self.client.post(f"/runs/{run_id}/start")
        self.wait_for(lambda: self.status(run_id) == "completed", what="completion")
        target = self.dir / "locked.csv"
        from engine import export as export_module
        original = export_module.os.replace

        def locked(src: Any, dst: Any) -> None:
            raise PermissionError(13, "The process cannot access the file")

        export_module.os.replace = locked  # type: ignore[assignment]
        try:
            response = self.client.post(f"/runs/{run_id}/export", json={"view": "all", "path": str(target)})
        finally:
            export_module.os.replace = original  # type: ignore[assignment]
        self.assertError(response, 409, "export_failed")
        self.assertIn("open in another program", response.json()["message"])

    def assertClean(self, response: Any) -> None:
        body = response.json()
        self.assertEqual(set(body), {"code", "message"})
        text = json.dumps(body)
        for leak in ("Traceback", "Exception", "Error:", 'File "', ".py", "secret", "detail\""):
            self.assertNotIn(leak, text)


# --------------------------------------------------------------------------- #
# Settings, deletion, models
# --------------------------------------------------------------------------- #


class SettingsAndDataTests(ServerTestCase):
    def test_settings_defaults_partial_update_and_validation(self) -> None:
        self.assertEqual(self.client.get("/settings").json()["appearance"], "system")
        updated = self.client.put("/settings", json={"appearance": "dark", "default_shortlist": 70}).json()
        self.assertEqual((updated["appearance"], updated["default_shortlist"], updated["keep_awake"]),
                         ("dark", 70, True))
        self.assertEqual(self.client.get("/settings").json()["appearance"], "dark")
        self.assertError(self.client.put("/settings", json={"appearance": "sepia"}), 422, "invalid_request")
        self.assertEqual(self.client.post("/runs", json={"name": "After"}).json()["shortlist_cutoff"], 70)

    def test_delete_a_run_and_all_data(self) -> None:
        keep = self.ready_run([70])
        gone = self.create_run("Gone")
        self.assertEqual(self.client.delete(f"/runs/{gone}").json(), {"deleted": True})
        self.assertError(self.client.get(f"/runs/{gone}"), 404, "not_found")
        self.client.put("/settings", json={"appearance": "dark"})
        self.assertEqual(self.client.delete("/data").json(), {"deleted": True})
        self.assertEqual(self.client.get("/runs").json(), [])
        self.assertEqual(self.client.get("/settings").json()["appearance"], "system")
        self.assertNotEqual(keep, gone)

    def test_a_running_run_cannot_be_deleted(self) -> None:
        self.ollama.delay = 0.3
        run_id = self.ready_run([70, 60, 50])
        self.client.post(f"/runs/{run_id}/start")
        self.assertError(self.client.delete(f"/runs/{run_id}"), 409, "run_active", Api.RUN_ACTIVE)
        self.assertError(self.client.delete("/data"), 409, "run_active", Api.ANY_RUN_ACTIVE)

    def test_system_and_ollama_down(self) -> None:
        system = self.client.get("/system").json()
        self.assertTrue(system["ollama"]["running"])
        self.assertEqual(system["models_installed"], 1)
        self.ollama.go_offline()
        self.assertEqual(self.client.get("/models").json()["ollama_running"], False)
        self.assertEqual(self.client.get("/system").json()["ollama"]["running"], False)

    def test_model_pull_progress_on_the_app_event_stream(self) -> None:
        self.assertEqual(self.client.post("/models/stub-small/pull").json(), {"name": "stub-small", "status": "started"})

        def pull_events() -> list[dict[str, Any]]:
            text = self.client.get("/events", params={"follow": "false"}).text
            return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]

        self.wait_for(lambda: any(e.get("name") == "stub-small" and e.get("done") for e in pull_events()),
                      what="pull done")
        final = [e for e in pull_events() if e.get("name") == "stub-small"][-1]
        self.assertEqual((final["status"], final["error"]), ("success", None))
        self.assertIn("stub-small:latest", [x["name"] for x in self.client.get("/models").json()["models"]])
        self.client.post("/models/nope/pull")
        self.wait_for(lambda: any(e.get("name") == "nope" and e.get("done") for e in pull_events()), what="error")
        error = [e for e in pull_events() if e.get("name") == "nope"][-1]
        self.assertEqual(error["error"], 'There is no model called "nope". Check the name at ollama.com/library.')

    def test_run_status_changes_are_published(self) -> None:
        run_id = self.ready_run([70])
        self.client.post(f"/runs/{run_id}/start")
        self.wait_for(lambda: self.status(run_id) == "completed", what="completion")

        def statuses() -> list[str]:
            text = self.client.get("/events", params={"follow": "false"}).text
            events = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
            return [e["status"] for e in events if e.get("run_id") == run_id]

        self.wait_for(lambda: "completed" in statuses(), what="completed event")


# --------------------------------------------------------------------------- #
# Multipart, OpenAPI
# --------------------------------------------------------------------------- #


class MultipartTests(unittest.TestCase):
    def test_binary_payload_comes_back_exactly(self) -> None:
        payload = bytes(range(256)) * 20 + b"\r\n--notboundary\r\n\r\n"
        body = (b"--XyZ\r\nContent-Disposition: form-data; name=\"other\"\r\n\r\nvalue\r\n"
                b"--XyZ\r\nContent-Disposition: form-data; name=\"file\"; filename=\"C:\\\\Users\\\\me\\\\list.xlsx\"\r\n"
                b"Content-Type: application/octet-stream\r\n\r\n" + payload + b"\r\n--XyZ--\r\n")
        name, data = parse_multipart_file(body, "multipart/form-data; boundary=XyZ")
        self.assertEqual((name, data), ("list.xlsx", payload))

    def test_no_file(self) -> None:
        for body, ctype in ((b"", "multipart/form-data; boundary=a"), (b"x", "application/json"),
                            (b"--a\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\nx\r\n--a--",
                             "multipart/form-data; boundary=a")):
            with self.subTest(ctype=ctype), self.assertRaises(ApiError):
                parse_multipart_file(body, ctype)


class OpenApiTests(unittest.TestCase):
    def test_the_committed_schema_is_current(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fresh = Path(tmp) / "schema.json"
            export_openapi(fresh)
            again = Path(tmp) / "again.json"
            export_openapi(again)
            self.assertEqual(fresh.read_bytes(), again.read_bytes(), "the export must be deterministic")
            self.assertTrue(SCHEMA_PATH.is_file(), f"run: python -m engine.server --openapi {SCHEMA_PATH}")
            self.assertEqual(fresh.read_bytes(), SCHEMA_PATH.read_bytes(),
                             "API changed: run python -m engine.server --openapi app/src/shared/api-schema.json")

    def test_every_error_response_is_documented(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        for path, methods in schema["paths"].items():
            for method, operation in methods.items():
                with self.subTest(path=path, method=method):
                    self.assertIn("401", operation["responses"])


# --------------------------------------------------------------------------- #
# The real process
# --------------------------------------------------------------------------- #


class LaunchTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.data = Path(self._tmp.name) / "data"
        env = {**os.environ, "ATLAS_TOKEN": TOKEN, "PYTHONUTF8": "1"}
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "engine.server", "--data-dir", str(self.data), "--port", "0",
             "--ollama-url", "http://127.0.0.1:9", "--watch-stdin"],
            cwd=REPO, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        self.addCleanup(self._stop_process)      # runs even if the checks below fail
        line = self.proc.stdout.readline().decode()           # type: ignore[union-attr]
        self.assertRegex(line, r"^ATLAS_READY port=\d+\n$")
        self.port = int(line.split("=")[1])
        self.base = f"http://127.0.0.1:{self.port}"

    def _stop_process(self) -> None:
        if self.proc.poll() is None:
            self.proc.kill()
            self.proc.wait(10)
        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            if stream:
                stream.close()
        self._tmp.cleanup()

    def test_ready_line_auth_sse_and_shutdown(self) -> None:
        self.assertEqual(requests.get(f"{self.base}/health", timeout=5).status_code, 200)
        self.assertEqual(requests.get(f"{self.base}/runs", timeout=5).status_code, 401)
        headers = {"Authorization": f"Bearer {TOKEN}"}
        run = requests.post(f"{self.base}/runs", json={"name": "Live"}, headers=headers, timeout=5).json()
        with requests.get(f"{self.base}/runs/{run['id']}/events", headers=headers, stream=True, timeout=10) as stream:
            self.assertEqual(stream.headers["content-type"].split(";")[0], "text/event-stream")
            lines = stream.iter_lines(decode_unicode=True)
            first = next(line for line in lines if line.startswith("data: "))
            self.assertIn("Run created: Live", first)
        response = requests.post(f"{self.base}/shutdown", headers=headers, timeout=5)
        self.assertEqual(response.status_code, 202)
        self.assertEqual(self.proc.wait(15), 0)
        rest = self.proc.stdout.read().decode()               # type: ignore[union-attr]
        self.assertEqual(rest, "", "nothing but the ready line on stdout")
        self.assertTrue((self.data / "logs" / "engine.log").is_file())

    def test_it_stops_when_the_app_goes_away(self) -> None:
        self.proc.stdin.close()                               # type: ignore[union-attr]
        self.assertEqual(self.proc.wait(15), 0)


if __name__ == "__main__":
    unittest.main()
