"""A fake Google Drive on 127.0.0.1, for downloader, worker and end-to-end tests.

Each file id is registered with a *behaviour*: a real PDF, Drive's virus-scan
confirm page, the sign-in page at HTTP 200, 404, 429 with ``Retry-After``,
503, a slow drip, an oversized stream, a truncated body, and so on.

The downloader's ``url_rewrite`` hook points real Drive URLs here::

    stub = DriveStub().start()
    downloader = Downloader(url_rewrite=stub.rewrite)

``go_offline()`` closes the listening socket, so connections are *refused*
(like a pulled network cable); ``go_online()`` listens on the same port again.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit

from engine.tests.stubs.base import StubServer

# --------------------------------------------------------------------------- #
# Behaviours
# --------------------------------------------------------------------------- #


@dataclass
class Pdf:
    data: bytes
    send_length: bool = True


@dataclass
class Confirm:
    """Drive's "can't scan this file for viruses" page, then the PDF once confirmed."""
    data: bytes
    always: bool = False   # keep showing the confirm page even when confirmed


@dataclass
class SignIn:
    """What Drive returns for a private file: HTTP 200 with a sign-in page."""


@dataclass
class Status:
    code: int
    body: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)


@dataclass
class RateLimited:
    """HTTP 429 with ``Retry-After`` for the first ``times`` requests, then the PDF."""
    times: int
    data: bytes
    retry_after: str = "1"
    served: int = 0


@dataclass
class Drip:
    """The PDF, ``chunk`` bytes at a time with ``delay`` seconds between them."""
    data: bytes
    chunk: int = 256
    delay: float = 0.2


@dataclass
class Oversized:
    """A PDF header followed by ``total`` bytes, with no Content-Length."""
    total: int


@dataclass
class Truncated:
    """Promises the full Content-Length, sends ``cut`` bytes, then hangs up."""
    data: bytes
    cut: int


@dataclass
class Html:
    body: str
    code: int = 200


SIGNIN_PAGE = """<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head>
<body><form action="https://accounts.google.com/v3/signin/identifier" method="post">
<input type="email" name="identifier"></form></body></html>"""

GOOGLE_DOC_PAGE = """<!DOCTYPE html><html><head><title>Résumé - Google Docs</title></head>
<body><div class="kix-appview-editor">A document, not a PDF.</div></body></html>"""


def confirm_page(file_id: str) -> str:
    return f"""<!DOCTYPE html><html><head><title>Google Drive - Virus scan warning</title></head>
<body><p>Google Drive can't scan this file for viruses.</p>
<form id="download-form" action="https://drive.usercontent.google.com/download" method="get">
<input type="submit" value="Download anyway">
<input type="hidden" name="id" value="{file_id}">
<input type="hidden" name="export" value="download">
<input type="hidden" name="confirm" value="t">
<input type="hidden" name="uuid" value="0f1e2d3c-stub">
</form></body></html>"""


# --------------------------------------------------------------------------- #
# Server
# --------------------------------------------------------------------------- #


class DriveStub(StubServer):
    thread_name = "drive-stub"

    def __init__(self, *, delay: float = 0.0) -> None:
        super().__init__()
        self.behaviours: dict[str, object] = {}
        self.delay = delay            # seconds added to every response (slows a whole run down)

    def start(self) -> "DriveStub":
        super().start()
        return self

    def __enter__(self) -> "DriveStub":
        return self.start()

    # ---- configuration ---------------------------------------------------- #

    def serve(self, file_id: str, behaviour: object) -> str:
        """Register a behaviour; returns the Drive link a student would paste."""
        with self._lock:
            self.behaviours[file_id] = behaviour
        return f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"

    def file_url(self, name: str) -> str:
        """A plain (non-Drive) link to a file on this stub, e.g. a portfolio site."""
        return f"{self.base_url}/files/{name}"

    def rewrite(self, url: str) -> str:
        """``url_rewrite`` hook: send Google hosts to this stub instead."""
        for host in ("https://drive.usercontent.google.com", "https://drive.google.com", "https://docs.google.com"):
            if url.startswith(host):
                return self.base_url + url[len(host):]
        return url

    def count(self, file_id: str) -> int:
        with self._lock:
            return sum(1 for path in self.requests if f"id={file_id}" in path or path.endswith(f"/{file_id}"))

    # ---- request handling ------------------------------------------------- #

    def _handler(self) -> type[BaseHTTPRequestHandler]:
        stub = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.0"   # connection closes after each response

            def log_message(self, *args: object) -> None:  # keep test output clean
                pass

            def do_GET(self) -> None:  # noqa: N802 — http.server naming
                with stub._lock:
                    stub.requests.append(self.path)
                if stub.delay:
                    time.sleep(stub.delay)
                parts = urlsplit(self.path)
                query = parse_qs(parts.query)
                if parts.path.startswith("/document/"):
                    return self._send(200, GOOGLE_DOC_PAGE.encode(), "text/html; charset=utf-8")
                if parts.path in ("/download", "/uc"):
                    file_id = (query.get("id") or [""])[0]
                elif parts.path.startswith("/files/"):
                    file_id = parts.path[len("/files/"):]
                else:
                    return self._send(404, b"Not Found", "text/plain")
                with stub._lock:
                    behaviour = stub.behaviours.get(file_id)
                if behaviour is None:
                    return self._send(404, b"<html><body>Not Found</body></html>", "text/html")
                self._serve(file_id, behaviour, confirmed="confirm" in query)

            def _serve(self, file_id: str, b: object, *, confirmed: bool) -> None:
                if isinstance(b, Pdf):
                    self._send(200, b.data, "application/pdf", length=b.send_length)
                elif isinstance(b, Confirm):
                    if confirmed and not b.always:
                        self._send(200, b.data, "application/pdf")
                    else:
                        self._send(200, confirm_page(file_id).encode(), "text/html; charset=utf-8")
                elif isinstance(b, SignIn):
                    self._send(200, SIGNIN_PAGE.encode(), "text/html; charset=utf-8")
                elif isinstance(b, Status):
                    self._send(b.code, b.body, "text/html", headers=b.headers)
                elif isinstance(b, RateLimited):
                    with stub._lock:
                        b.served += 1
                        limited = b.served <= b.times
                    if limited:
                        self._send(429, b"Too Many Requests", "text/plain", headers={"Retry-After": b.retry_after})
                    else:
                        self._send(200, b.data, "application/pdf")
                elif isinstance(b, Drip):
                    self._head(200, "application/pdf", length=len(b.data))
                    for start in range(0, len(b.data), b.chunk):
                        self.wfile.write(b.data[start:start + b.chunk])
                        self.wfile.flush()
                        time.sleep(b.delay)
                elif isinstance(b, Oversized):
                    self._head(200, "application/pdf")
                    self.wfile.write(b"%PDF-1.7\n")
                    block = b"0" * 65536
                    sent = 0
                    try:
                        while sent < b.total:
                            self.wfile.write(block)
                            sent += len(block)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        pass   # the client stopped reading, as it should
                elif isinstance(b, Truncated):
                    self._head(200, "application/pdf", length=len(b.data))
                    self.wfile.write(b.data[:b.cut])
                    self.wfile.flush()
                    self.close_connection = True
                elif isinstance(b, Html):
                    self._send(b.code, b.body.encode(), "text/html; charset=utf-8")
                else:  # pragma: no cover
                    self._send(500, b"unknown behaviour", "text/plain")

            def _head(self, code: int, ctype: str, *, length: int | None = None,
                      headers: dict[str, str] | None = None) -> None:
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                if length is not None:
                    self.send_header("Content-Length", str(length))
                for key, value in (headers or {}).items():
                    self.send_header(key, value)
                self.end_headers()

            def _send(self, code: int, body: bytes, ctype: str, *, length: bool = True,
                      headers: dict[str, str] | None = None) -> None:
                self._head(code, ctype, length=len(body) if length else None, headers=headers)
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

        return Handler
