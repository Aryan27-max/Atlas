"""Shared plumbing for the local stub servers: start, stop, go offline, go online."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class _QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request: object, client_address: object) -> None:
        # Clients that hang up mid-response (a killed worker, a timeout test)
        # are expected here; don't print tracebacks into the test output.
        pass


class StubServer:
    """An HTTP server on 127.0.0.1 in a background thread.

    ``go_offline()`` closes the listening socket, so new connections are
    *refused*, as with a pulled network cable or a stopped service.
    ``go_online()`` listens on the same port again.
    """

    thread_name = "stub"

    def __init__(self) -> None:
        self.port = 0
        self.requests: list[str] = []
        self._lock = threading.Lock()
        self._server: _QuietServer | None = None
        self._thread: threading.Thread | None = None

    def _handler(self) -> type[BaseHTTPRequestHandler]:
        raise NotImplementedError

    def start(self) -> "StubServer":
        self._server = _QuietServer(("127.0.0.1", self.port), self._handler())
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever, name=self.thread_name, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def go_offline(self) -> None:
        self.stop()

    def go_online(self) -> None:
        if self._server is None:
            self.start()

    @property
    def online(self) -> bool:
        return self._server is not None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def __enter__(self) -> "StubServer":
        return self.start()

    def __exit__(self, *exc: object) -> None:
        self.stop()
