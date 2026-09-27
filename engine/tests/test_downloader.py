"""Tests for engine/ingest/links.py and engine/ingest/downloader.py.

Two layers: a fake ``requests`` session for every branch (fast, exact), and
the local Drive stub for what only real sockets show (streaming, truncated
bodies, refused connections).
"""

from __future__ import annotations

import errno
import hashlib
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests
from requests.structures import CaseInsensitiveDict

from engine.errors import CandidateError, Pause, Reason, SystemUnavailable, TransientError
from engine.ingest.downloader import Downloader, is_disk_full
from engine.ingest.links import plan_download
from engine.tests.stubs.drive_stub import (
    Confirm,
    Drip,
    DriveStub,
    Oversized,
    Pdf,
    RateLimited,
    SignIn,
    Status,
    Truncated,
    confirm_page,
)

PDF = b"%PDF-1.7\n" + b"1 0 obj << /Type /Catalog >> endobj\n" * 200 + b"%%EOF\n"
DRIVE_LINK = "https://drive.google.com/file/d/FILE123/view?usp=sharing"
DRIVE_URL = "https://drive.usercontent.google.com/download?id=FILE123&export=download"


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #


class FakeResponse:
    def __init__(self, status: int = 200, body: bytes | list = b"", headers: dict | None = None,
                 url: str = DRIVE_URL, encoding: str = "utf-8") -> None:
        self.status_code = status
        self.headers = CaseInsensitiveDict(headers or {})
        self.url = url
        self.encoding = encoding
        self.closed = False
        self.chunks_read = 0
        if isinstance(body, list):
            self._chunks = body
        else:
            self._chunks = [body[i:i + 1000] for i in range(0, len(body), 1000)]

    def iter_content(self, chunk_size: int = 1):
        for chunk in self._chunks:
            if isinstance(chunk, BaseException):
                raise chunk
            self.chunks_read += 1
            yield chunk

    def close(self) -> None:
        self.closed = True


class FakeSession:
    def __init__(self, *responses: object) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, dict]] = []

    def get(self, url: str, **kwargs: object) -> FakeResponse:
        self.calls.append((url, kwargs))
        item = self.responses.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item  # type: ignore[return-value]


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def html(body: str, status: int = 200, url: str = DRIVE_URL) -> FakeResponse:
    return FakeResponse(status, body.encode(), {"Content-Type": "text/html; charset=utf-8"}, url=url)


def pdf(data: bytes = PDF, **headers: str) -> FakeResponse:
    return FakeResponse(200, data, {"Content-Type": "application/pdf", **headers})


# --------------------------------------------------------------------------- #
# Link planning (pure)
# --------------------------------------------------------------------------- #


class PlanTests(unittest.TestCase):
    def test_drive_shapes_become_the_direct_download_url(self) -> None:
        for link in (
            "https://drive.google.com/file/d/FILE123/view?usp=sharing",
            "https://drive.google.com/file/d/FILE123/edit",
            "https://drive.google.com/file/u/1/d/FILE123/view",
            "https://drive.google.com/open?id=FILE123",
            "https://drive.google.com/uc?id=FILE123&export=download",
            "https://drive.google.com/uc?export=download&id=FILE123",
            "https://docs.google.com/file/d/FILE123/edit",
            "https://drive.usercontent.google.com/download?id=FILE123",
            "drive.google.com/file/d/FILE123/view",
            "  https://drive.google.com/file/d/FILE123/view  ",
        ):
            with self.subTest(link=link):
                plan = plan_download(link)
                self.assertEqual((plan.url, plan.drive_id), (DRIVE_URL, "FILE123"))

    def test_google_editors_are_rejected(self) -> None:
        for kind in ("document", "spreadsheets", "presentation", "forms"):
            with self.subTest(kind=kind), self.assertRaises(CandidateError) as ctx:
                plan_download(f"https://docs.google.com/{kind}/d/ABC/edit?usp=sharing")
            self.assertEqual((ctx.exception.kind, ctx.exception.reason), ("permanent", Reason.GOOGLE_DOC))

    def test_folders_are_rejected(self) -> None:
        for link in (
            "https://drive.google.com/drive/folders/ABC?usp=sharing",
            "https://drive.google.com/drive/u/0/folders/ABC",
            "https://drive.google.com/folderview?id=ABC",
        ):
            with self.subTest(link=link), self.assertRaises(CandidateError) as ctx:
                plan_download(link)
            self.assertEqual(ctx.exception.reason, Reason.FOLDER)

    def test_invalid_links_are_rejected(self) -> None:
        for link in ("", "my resume", "ftp://files.example.com/cv.pdf", "javascript:alert(1)",
                     "mailto:a@x.in", "https://", "http://exa mple.com/cv.pdf", "https://example.com:99999/x"):
            with self.subTest(link=link), self.assertRaises(CandidateError) as ctx:
                plan_download(link)
            self.assertEqual((ctx.exception.kind, ctx.exception.reason), ("permanent", Reason.INVALID_LINK))

    def test_other_links_pass_through(self) -> None:
        plan = plan_download("https://asha.dev/Asha%20Iyer%20CV.pdf")
        self.assertEqual((plan.url, plan.drive_id), ("https://asha.dev/Asha%20Iyer%20CV.pdf", None))


# --------------------------------------------------------------------------- #
# Downloader with a fake session
# --------------------------------------------------------------------------- #


class DownloaderTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name) / "downloads"
        self.clock = FakeClock()

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def downloader(self, *responses: object, **kwargs: object) -> tuple[Downloader, FakeSession]:
        session = FakeSession(*responses)
        options = {"clock": self.clock, "sleep": self.clock.sleep, **kwargs}
        return Downloader(session, **options), session  # type: ignore[arg-type]

    def assert_fails(self, downloader: Downloader, kind: str, reason: str, link: str = DRIVE_LINK) -> None:
        with self.assertRaises(CandidateError) as ctx:
            downloader.fetch(link, self.dir, "7")
        self.assertEqual((ctx.exception.kind, ctx.exception.reason), (kind, reason))
        self.assert_no_files()

    def assert_no_files(self) -> None:
        self.assertEqual(sorted(self.dir.glob("*")) if self.dir.exists() else [], [])


class HappyPathTests(DownloaderTestCase):
    def test_pdf_is_streamed_to_disk_atomically(self) -> None:
        dl, session = self.downloader(pdf(Content_Length=str(len(PDF))))
        result = dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assertEqual(result.path, self.dir / "7.pdf")
        self.assertEqual(result.path.read_bytes(), PDF)
        self.assertEqual(result.sha256, hashlib.sha256(PDF).hexdigest())
        self.assertEqual(result.size_bytes, len(PDF))
        self.assertFalse((self.dir / "7.part").exists())
        url, kwargs = session.calls[0]
        self.assertEqual(url, DRIVE_URL)
        self.assertEqual(kwargs["timeout"], (10.0, 30.0))
        self.assertTrue(kwargs["stream"])

    def test_leftover_part_file_from_a_crash_is_replaced(self) -> None:
        self.dir.mkdir(parents=True)
        (self.dir / "7.part").write_bytes(b"half a file from a killed process")
        dl, _ = self.downloader(pdf())
        self.assertEqual(dl.fetch(DRIVE_LINK, self.dir, "7").path.read_bytes(), PDF)
        self.assertEqual([p.name for p in self.dir.iterdir()], ["7.pdf"])

    def test_url_rewrite_hook_applies_to_every_request(self) -> None:
        page = html(confirm_page("FILE123"))
        dl, session = self.downloader(page, pdf(), url_rewrite=lambda u: u.replace("https://", "http://stub/"))
        dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assertTrue(all(url.startswith("http://stub/") for url, _ in session.calls))

    def test_pdf_served_as_text_html_is_still_a_pdf(self) -> None:
        dl, _ = self.downloader(FakeResponse(200, PDF, {"Content-Type": "text/html"}))
        self.assertEqual(dl.fetch(DRIVE_LINK, self.dir, "7").size_bytes, len(PDF))


class HtmlTrapTests(DownloaderTestCase):
    def test_virus_scan_confirm_form_is_followed_once(self) -> None:
        dl, session = self.downloader(html(confirm_page("FILE123")), pdf())
        self.assertEqual(dl.fetch(DRIVE_LINK, self.dir, "7").path.read_bytes(), PDF)
        confirm_url = session.calls[1][0]
        self.assertTrue(confirm_url.startswith("https://drive.usercontent.google.com/download?"))
        self.assertIn("confirm=t", confirm_url)
        self.assertIn("id=FILE123", confirm_url)

    def test_legacy_confirm_link_is_followed(self) -> None:
        page = '<html><a id="uc-download-link" href="/uc?export=download&amp;confirm=AbC1&amp;id=FILE123">Download</a></html>'
        dl, session = self.downloader(html(page, url="https://drive.google.com/uc?id=FILE123"), pdf())
        dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assertEqual(session.calls[1][0], "https://drive.google.com/uc?export=download&confirm=AbC1&id=FILE123")

    def test_confirm_page_twice_does_not_loop(self) -> None:
        dl, session = self.downloader(html(confirm_page("FILE123")), html(confirm_page("FILE123")))
        self.assert_fails(dl, "permanent", Reason.NOT_PDF)
        self.assertEqual(len(session.calls), 2)

    def test_confirm_forms_are_only_followed_for_drive(self) -> None:
        dl, session = self.downloader(html(confirm_page("X"), url="https://asha.dev/cv"))
        self.assert_fails(dl, "permanent", Reason.NOT_PDF, link="https://asha.dev/cv")
        self.assertEqual(len(session.calls), 1)

    def test_signin_page_at_http_200_means_private(self) -> None:
        page = "<html><head><title>Sign in - Google Accounts</title></head><body>...</body></html>"
        dl, _ = self.downloader(html(page))
        self.assert_fails(dl, "permanent", Reason.PRIVATE)

    def test_redirect_to_a_login_host_means_private(self) -> None:
        dl, _ = self.downloader(html("<html><body>Welcome</body></html>",
                                     url="https://accounts.google.com/ServiceLogin?continue=x"))
        self.assert_fails(dl, "permanent", Reason.PRIVATE)

    def test_request_access_page_means_private(self) -> None:
        dl, _ = self.downloader(html("<html><body><h1>You need access</h1><button>Request access</button></body></html>"))
        self.assert_fails(dl, "permanent", Reason.PRIVATE)

    def test_quota_page_is_retryable(self) -> None:
        page = "<html><body>Sorry, too many users have viewed or downloaded this file recently.</body></html>"
        for status in (200, 403):
            with self.subTest(status=status):
                dl, _ = self.downloader(html(page, status=status))
                self.assert_fails(dl, "retryable", Reason.RATE_LIMITED)

    def test_other_html_and_non_pdf_bytes_are_not_pdfs(self) -> None:
        for response in (
            html("<!DOCTYPE html><html><body>My portfolio</body></html>"),
            FakeResponse(200, b"\x89PNG\r\n\x1a\n...", {"Content-Type": "image/png"}),
            FakeResponse(200, b"PK\x03\x04 a docx", {"Content-Type": "application/octet-stream"}),
            FakeResponse(200, b"", {"Content-Type": "application/pdf"}),
        ):
            with self.subTest(ctype=response.headers.get("Content-Type")):
                dl, _ = self.downloader(response)
                self.assert_fails(dl, "permanent", Reason.NOT_PDF)


class StatusTests(DownloaderTestCase):
    def test_status_mapping(self) -> None:
        cases = {
            404: ("permanent", Reason.NOT_FOUND),
            410: ("permanent", Reason.NOT_FOUND),
            401: ("permanent", Reason.PRIVATE),
            403: ("permanent", Reason.PRIVATE),
            400: ("permanent", Reason.REFUSED),
            500: ("retryable", Reason.HOST_ERROR),
            502: ("retryable", Reason.HOST_ERROR),
            503: ("retryable", Reason.HOST_ERROR),
        }
        for status, (kind, reason) in cases.items():
            with self.subTest(status=status):
                response = FakeResponse(status, b"<html>error</html>", {"Content-Type": "text/html"})
                dl, _ = self.downloader(response)
                self.assert_fails(dl, kind, reason)
                self.assertTrue(response.closed)

    def test_429_honours_retry_after_then_succeeds(self) -> None:
        dl, session = self.downloader(FakeResponse(429, headers={"Retry-After": "7"}), pdf())
        dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assertEqual(len(session.calls), 2)
        self.assertEqual(self.clock.sleeps, [7.0])

    def test_retry_after_is_capped_at_60_seconds(self) -> None:
        dl, _ = self.downloader(FakeResponse(429, headers={"Retry-After": "3600"}), pdf())
        dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assertEqual(self.clock.sleeps, [60.0])

    def test_retry_after_as_http_date(self) -> None:
        dl, _ = self.downloader(FakeResponse(429, headers={"Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT"}), pdf())
        dl.fetch(DRIVE_LINK, self.dir, "7")
        # A date in the past means "retry now": only the normal 1 s spacing remains.
        self.assertEqual(self.clock.sleeps, [1.0])

    def test_repeated_429_is_a_retryable_failure(self) -> None:
        dl, session = self.downloader(*[FakeResponse(429, headers={"Retry-After": "2"}) for _ in range(3)])
        self.assert_fails(dl, "retryable", Reason.RATE_LIMITED)
        self.assertEqual(len(session.calls), 3)


class SizeTests(DownloaderTestCase):
    def test_declared_size_over_the_cap_is_refused_without_reading(self) -> None:
        response = FakeResponse(200, [b"%PDF-1.7"] + [b"x" * 1000] * 50,
                                {"Content-Type": "application/pdf", "Content-Length": str(21 * 1024 * 1024)})
        dl, _ = self.downloader(response)
        self.assert_fails(dl, "permanent", Reason.TOO_LARGE)
        self.assertEqual(response.chunks_read, 1)

    def test_undeclared_stream_is_cut_as_soon_as_it_passes_the_cap(self) -> None:
        chunks = [b"%PDF-1.7\n"] + [b"0" * 1000 for _ in range(1000)]
        response = FakeResponse(200, chunks, {"Content-Type": "application/pdf"})
        dl, _ = self.downloader(response, max_bytes=10_000)
        self.assert_fails(dl, "permanent", Reason.TOO_LARGE)
        self.assertLessEqual(response.chunks_read, 12)  # 9 + 10 x 1000 bytes passes 10 000


class NetworkErrorTests(DownloaderTestCase):
    def assert_transient(self, dl: Downloader, reason: str) -> None:
        with self.assertRaises(TransientError) as ctx:
            dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assertEqual((ctx.exception.probe, ctx.exception.reason), ("internet", reason))
        self.assert_no_files()

    def test_timeouts(self) -> None:
        for exc in (requests.exceptions.ConnectTimeout(), requests.exceptions.ReadTimeout()):
            with self.subTest(exc=type(exc).__name__):
                self.assert_transient(self.downloader(exc)[0], Reason.TIMEOUT)

    def test_dns_failure_and_refused_connection(self) -> None:
        for cause in (socket.gaierror(11001, "getaddrinfo failed"), ConnectionRefusedError(10061, "refused")):
            exc = requests.exceptions.ConnectionError("failed")
            exc.__cause__ = cause
            with self.subTest(cause=type(cause).__name__):
                self.assert_transient(self.downloader(exc)[0], Reason.UNREACHABLE)

    def test_connection_reset_before_response(self) -> None:
        exc = requests.exceptions.ConnectionError("reset")
        exc.__cause__ = ConnectionResetError(10054, "reset by peer")
        self.assert_transient(self.downloader(exc)[0], Reason.TIMEOUT)

    def test_reset_or_truncation_mid_stream_deletes_the_part_file(self) -> None:
        for exc in (requests.exceptions.ChunkedEncodingError("IncompleteRead"),
                    requests.exceptions.ConnectionError("Read timed out")):
            with self.subTest(exc=type(exc).__name__):
                response = FakeResponse(200, [b"%PDF-1.7\n", b"x" * 1000, exc], {"Content-Type": "application/pdf"})
                self.assert_transient(self.downloader(response)[0], Reason.TIMEOUT)

    def test_malformed_url_from_requests_is_permanent(self) -> None:
        dl, _ = self.downloader(requests.exceptions.InvalidURL("bad"))
        self.assert_fails(dl, "permanent", Reason.INVALID_LINK)


class DiskAndThrottleTests(DownloaderTestCase):
    def test_disk_full_pauses_instead_of_failing(self) -> None:
        dl, _ = self.downloader(pdf())
        with patch("engine.ingest.downloader.os.fsync", side_effect=OSError(errno.ENOSPC, "No space left on device")):
            with self.assertRaises(SystemUnavailable) as ctx:
                dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assertEqual(ctx.exception.reason, Pause.DISK_FULL)
        self.assert_no_files()

    def test_disk_full_detection(self) -> None:
        self.assertTrue(is_disk_full(OSError(errno.ENOSPC, "full")))
        windows = OSError("There is not enough space on the disk")
        windows.winerror = 112  # type: ignore[attr-defined]
        self.assertTrue(is_disk_full(windows))
        self.assertFalse(is_disk_full(OSError(errno.EACCES, "denied")))

    def test_other_write_errors_are_not_disk_full(self) -> None:
        dl, _ = self.downloader(pdf())
        with patch("engine.ingest.downloader.os.fsync", side_effect=PermissionError(errno.EACCES, "denied")):
            with self.assertRaises(PermissionError):
                dl.fetch(DRIVE_LINK, self.dir, "7")
        self.assert_no_files()

    def test_requests_are_spaced_by_min_interval(self) -> None:
        dl, _ = self.downloader(pdf(), pdf(), pdf(), min_interval=1.0)
        dl.fetch(DRIVE_LINK, self.dir, "a")
        self.clock.now += 0.25            # the next fetch starts 0.25 s later
        dl.fetch(DRIVE_LINK, self.dir, "b")
        dl.fetch(DRIVE_LINK, self.dir, "c")
        self.assertEqual(self.clock.sleeps, [0.75, 1.0])


# --------------------------------------------------------------------------- #
# Against the Drive stub (real sockets)
# --------------------------------------------------------------------------- #


class StubServerTests(DownloaderTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.stub = DriveStub().start()
        self.addCleanup(self.stub.stop)

    def real(self, **kwargs: object) -> Downloader:
        options = {"clock": self.clock, "sleep": self.clock.sleep, "url_rewrite": self.stub.rewrite, **kwargs}
        return Downloader(requests.Session(), **options)  # type: ignore[arg-type]

    def test_pdf_confirm_and_signin_over_http(self) -> None:
        ok = self.stub.serve("OK1", Pdf(PDF))
        big = self.stub.serve("BIG1", Confirm(PDF))
        private = self.stub.serve("PRIV1", SignIn())
        dl = self.real()
        self.assertEqual(dl.fetch(ok, self.dir, "1").path.read_bytes(), PDF)
        self.assertEqual(dl.fetch(big, self.dir, "2").path.read_bytes(), PDF)
        self.assertEqual(self.stub.count("BIG1"), 2)
        with self.assertRaises(CandidateError) as ctx:
            dl.fetch(private, self.dir, "3")
        self.assertEqual(ctx.exception.reason, Reason.PRIVATE)
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ["1.pdf", "2.pdf"])

    def test_statuses_and_rate_limit_over_http(self) -> None:
        gone = self.stub.serve("GONE", Status(404))
        busy = self.stub.serve("BUSY", Status(503))
        limited = self.stub.serve("LIMIT", RateLimited(times=1, data=PDF, retry_after="3"))
        dl = self.real()
        for link, reason in ((gone, Reason.NOT_FOUND), (busy, Reason.HOST_ERROR)):
            with self.assertRaises(CandidateError) as ctx:
                dl.fetch(link, self.dir, "x")
            self.assertEqual(ctx.exception.reason, reason)
        self.assertEqual(dl.fetch(limited, self.dir, "l").size_bytes, len(PDF))
        self.assertIn(3.0, self.clock.sleeps)

    def test_oversized_stream_without_length_is_aborted(self) -> None:
        # The real 20 MB cap: the stream never says how big it is.
        link = self.stub.serve("HUGE", Oversized(total=25 * 1024 * 1024))
        self.assert_fails(self.real(), "permanent", Reason.TOO_LARGE, link=link)

    def test_truncated_body_is_transient_and_leaves_nothing(self) -> None:
        link = self.stub.serve("CUT", Truncated(PDF, cut=500))
        with self.assertRaises(TransientError) as ctx:
            self.real().fetch(link, self.dir, "c")
        self.assertEqual(ctx.exception.reason, Reason.TIMEOUT)
        self.assert_no_files()

    def test_slow_drip_hits_the_read_timeout(self) -> None:
        link = self.stub.serve("SLOW", Drip(PDF, chunk=100, delay=1.0))
        with self.assertRaises(TransientError) as ctx:
            self.real(read_timeout=0.2).fetch(link, self.dir, "s")
        self.assertEqual(ctx.exception.reason, Reason.TIMEOUT)
        self.assert_no_files()

    def test_offline_refuses_then_recovers(self) -> None:
        link = self.stub.serve("NET", Pdf(PDF))
        # Windows retries a refused localhost SYN for about 2 s before giving up.
        dl = self.real(connect_timeout=5.0)
        self.stub.go_offline()
        with self.assertRaises(TransientError) as ctx:
            dl.fetch(link, self.dir, "n")
        self.assertEqual((ctx.exception.probe, ctx.exception.reason), ("internet", Reason.UNREACHABLE))
        self.stub.go_online()
        self.assertEqual(dl.fetch(link, self.dir, "n").size_bytes, len(PDF))

    def test_google_doc_and_plain_links(self) -> None:
        self.stub.serve("portfolio-cv.pdf", Pdf(PDF, send_length=False))
        dl = self.real()
        with self.assertRaises(CandidateError) as ctx:
            dl.fetch("https://docs.google.com/document/d/DOC1/edit", self.dir, "d")
        self.assertEqual(ctx.exception.reason, Reason.GOOGLE_DOC)
        self.assertEqual(self.stub.requests, [])  # rejected before any request
        self.assertEqual(dl.fetch(self.stub.file_url("portfolio-cv.pdf"), self.dir, "p").size_bytes, len(PDF))


if __name__ == "__main__":
    unittest.main()
