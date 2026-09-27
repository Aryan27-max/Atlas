"""Download one résumé PDF safely (ARCHITECTURE §11).

``Downloader.fetch(link, dest_dir, stem)`` either returns a complete,
verified PDF on disk or raises a typed error from ``engine.errors``:

* :class:`CandidateError` — this link's problem (private, not a PDF, 404, …)
* :class:`SystemUnavailable` — the disk is full
* :class:`TransientError` — network trouble; the worker probes to decide

Status codes alone can't be trusted: a private Google Drive file comes back
as **HTTP 200 with a sign-in page**. So every response is sniffed, and the
``%PDF-`` magic bytes are the final gate.

Bytes stream to ``<stem>.part`` and are renamed to ``<stem>.pdf`` only after
the whole file is written and fsynced, so a half-downloaded file can never be
mistaken for a real PDF. The partial file is deleted on every failure path.
"""

from __future__ import annotations

import email.utils
import errno
import hashlib
import logging
import os
import re
import socket
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable, Iterator
from urllib.parse import urlencode, urljoin, urlsplit

import requests

from engine.errors import CandidateError, Pause, Reason, SystemUnavailable, TransientError
from engine.ingest.links import plan_download

log = logging.getLogger("atlas.downloader")

MAX_BYTES = 20 * 1024 * 1024
_HTML_LIMIT = 2 * 1024 * 1024          # never hold more than this of an HTML page in memory
_USER_AGENT = "Mozilla/5.0 (compatible; Atlas résumé screening)"

# Hosts that only ever answer with a sign-in page.
_LOGIN_HOSTS = ("accounts.google.com", "login.microsoftonline.com", "login.live.com")
_SIGNIN_MARKERS = (
    "accounts.google.com/servicelogin",
    "accounts.google.com/v3/signin",
    "accounts.google.com/signin",
    "<title>sign in",
    "<title>google drive: sign-in",
    "you need access",
    "you need permission",
    "request access",
)
_QUOTA_MARKERS = (
    "too many users have viewed or downloaded this file recently",
    "download quota",
    "quota exceeded",
)


@dataclass(frozen=True)
class Downloaded:
    path: Path
    sha256: str
    size_bytes: int


class Downloader:
    """Fetch résumé PDFs with Drive handling, a size cap and a polite throttle.

    Every external dependency is injectable: ``session`` (a ``requests``
    session or a fake), ``clock``/``sleep`` (for the throttle and 429
    back-off), and ``url_rewrite``, which is applied to every URL right before
    the request. Production leaves it ``None``; tests use it to point "Drive"
    at a local stub server without touching the real link rewriting.
    """

    def __init__(
        self,
        session: requests.Session | None = None,
        *,
        max_bytes: int = MAX_BYTES,
        min_interval: float = 1.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        url_rewrite: Callable[[str], str] | None = None,
        connect_timeout: float = 10.0,
        read_timeout: float = 30.0,
        max_rate_limit_retries: int = 2,
        max_retry_after: float = 60.0,
        chunk_size: int = 64 * 1024,
    ) -> None:
        self._session = session if session is not None else requests.Session()
        self.max_bytes = max_bytes
        self.min_interval = min_interval
        self._clock = clock
        self._sleep = sleep
        self._rewrite = url_rewrite or (lambda url: url)
        self._timeout = (connect_timeout, read_timeout)
        self._max_429 = max_rate_limit_retries
        self._max_retry_after = max_retry_after
        self._chunk = chunk_size
        self._lock = threading.Lock()
        self._next_start = float("-inf")

    # ---- public ----------------------------------------------------------- #

    def fetch(self, link: str, dest_dir: Path | str, stem: str) -> Downloaded:
        plan = plan_download(link)
        dest_dir = Path(dest_dir)
        url = plan.url
        followed_confirm = False
        rate_limited = 0

        while True:
            response = self._get(url)
            try:
                status = response.status_code
                if status == 429:
                    rate_limited += 1
                    if rate_limited > self._max_429:
                        raise CandidateError("retryable", Reason.RATE_LIMITED)
                    self._back_off(self._retry_after(response))
                    continue
                if status in (404, 410):
                    raise CandidateError("permanent", Reason.NOT_FOUND)
                if status in (401, 403):
                    page = self._read_html(response).lower()
                    if any(marker in page for marker in _QUOTA_MARKERS):
                        raise CandidateError("retryable", Reason.RATE_LIMITED)
                    raise CandidateError("permanent", Reason.PRIVATE)
                if status >= 500:
                    raise CandidateError("retryable", Reason.HOST_ERROR)
                if status >= 300:
                    raise CandidateError("permanent", Reason.REFUSED)

                chunks = self._chunks(response)
                head = _read_head(chunks, 5)
                if head.startswith(b"%PDF-"):
                    return self._save(response, head, chunks, dest_dir, stem)

                if not _looks_like_html(response, head):
                    raise CandidateError("permanent", Reason.NOT_PDF)
                page = self._read_html(response, head, chunks)
                lowered = page.lower()
                if any(marker in lowered for marker in _QUOTA_MARKERS):
                    raise CandidateError("retryable", Reason.RATE_LIMITED)
                if plan.drive_id and not followed_confirm:
                    confirm = _confirm_url(page, response.url or url)
                    if confirm:
                        # Drive's "can't scan this file for viruses" page: follow
                        # its confirm link exactly once, never in a loop.
                        followed_confirm = True
                        url = confirm
                        continue
                if _is_signin(response.url or url, lowered):
                    raise CandidateError("permanent", Reason.PRIVATE)
                raise CandidateError("permanent", Reason.NOT_PDF)
            finally:
                response.close()

    # ---- requests --------------------------------------------------------- #

    def _get(self, url: str) -> requests.Response:
        target = self._rewrite(url)
        self._throttle()
        try:
            return self._session.get(
                target,
                stream=True,
                timeout=self._timeout,
                headers={"User-Agent": _USER_AGENT},
                allow_redirects=True,
            )
        except (requests.exceptions.InvalidURL, requests.exceptions.MissingSchema,
                requests.exceptions.InvalidSchema, requests.exceptions.InvalidHeader):
            raise CandidateError("permanent", Reason.INVALID_LINK) from None
        except requests.exceptions.TooManyRedirects:
            raise CandidateError("permanent", Reason.REFUSED) from None
        except requests.exceptions.Timeout as exc:
            raise TransientError("internet", Reason.TIMEOUT, f"timeout: {type(exc).__name__}") from exc
        except requests.exceptions.ConnectionError as exc:
            raise _connection_error(exc) from exc
        except requests.exceptions.RequestException as exc:
            raise TransientError("internet", Reason.TIMEOUT, f"request failed: {type(exc).__name__}") from exc

    def _chunks(self, response: requests.Response) -> Iterator[bytes]:
        """``iter_content`` with streaming failures translated to typed errors."""
        try:
            for chunk in response.iter_content(chunk_size=self._chunk):
                if chunk:
                    yield chunk
        except (requests.exceptions.ChunkedEncodingError, requests.exceptions.ConnectionError,
                requests.exceptions.Timeout) as exc:
            # Connection reset, truncated body, or read timeout mid-stream.
            raise TransientError("internet", Reason.TIMEOUT, f"stream broke: {type(exc).__name__}") from exc
        except requests.exceptions.ContentDecodingError:
            raise CandidateError("retryable", Reason.HOST_ERROR) from None

    def _read_html(
        self, response: requests.Response, head: bytes = b"", chunks: Iterator[bytes] | None = None
    ) -> str:
        """Read (at most 2 MB of) an HTML page into memory."""
        body = bytearray(head)
        for chunk in chunks if chunks is not None else self._chunks(response):
            body.extend(chunk)
            if len(body) >= _HTML_LIMIT:
                break
        return bytes(body[:_HTML_LIMIT]).decode(response.encoding or "utf-8", errors="replace")

    # ---- writing ---------------------------------------------------------- #

    def _save(
        self, response: requests.Response, head: bytes, chunks: Iterator[bytes], dest_dir: Path, stem: str
    ) -> Downloaded:
        declared = response.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > self.max_bytes:
            raise CandidateError("permanent", Reason.TOO_LARGE)

        part = dest_dir / f"{stem}.part"
        final = dest_dir / f"{stem}.pdf"
        digest = hashlib.sha256()
        total = 0
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
            with open(part, "wb") as handle:
                for chunk in _prepend(head, chunks):
                    total += len(chunk)
                    if total > self.max_bytes:
                        # Stop reading the moment we pass the cap, even when
                        # the server never said how big the file is.
                        raise CandidateError("permanent", Reason.TOO_LARGE)
                    digest.update(chunk)
                    handle.write(chunk)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(part, final)
            _fsync_dir(dest_dir)
        except OSError as exc:
            if is_disk_full(exc):
                raise SystemUnavailable(Pause.DISK_FULL) from exc
            raise
        finally:
            part.unlink(missing_ok=True)
        return Downloaded(final, digest.hexdigest(), total)

    # ---- pacing ----------------------------------------------------------- #

    def _throttle(self) -> None:
        """At least ``min_interval`` seconds between request starts."""
        with self._lock:
            wait = self._next_start - self._clock()
            if wait > 0:
                self._sleep(wait)
            self._next_start = self._clock() + self.min_interval

    def _back_off(self, seconds: float) -> None:
        """Delay the next request start (used for HTTP 429 ``Retry-After``)."""
        with self._lock:
            self._next_start = max(self._next_start, self._clock() + seconds)

    def _retry_after(self, response: requests.Response) -> float:
        value = (response.headers.get("Retry-After") or "").strip()
        seconds = 5.0
        if value:
            try:
                seconds = float(value)
            except ValueError:
                try:
                    when = email.utils.parsedate_to_datetime(value)
                    seconds = (when - datetime.now(timezone.utc)).total_seconds()
                except (TypeError, ValueError):
                    seconds = 5.0
        return min(max(seconds, 0.0), self._max_retry_after)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def is_disk_full(exc: OSError) -> bool:
    """ENOSPC on POSIX; ERROR_DISK_FULL / ERROR_HANDLE_DISK_FULL on Windows."""
    return exc.errno == errno.ENOSPC or getattr(exc, "winerror", None) in (39, 112)


def _connection_error(exc: requests.exceptions.ConnectionError) -> TransientError:
    """DNS failure or refused connection → "couldn't be reached"; reset → "timed out"."""
    seen: set[int] = set()
    stack: list[BaseException] = [exc]
    while stack:
        current = stack.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        if isinstance(current, (socket.gaierror, ConnectionRefusedError)) or type(current).__name__ in (
            "NameResolutionError",
        ):
            return TransientError("internet", Reason.UNREACHABLE, f"unreachable: {type(current).__name__}")
        for nested in (current.__cause__, current.__context__, getattr(current, "reason", None),
                       *[a for a in current.args if isinstance(a, BaseException)]):
            if isinstance(nested, BaseException):
                stack.append(nested)
    return TransientError("internet", Reason.TIMEOUT, "connection error")


def _read_head(chunks: Iterator[bytes], size: int) -> bytes:
    head = b""
    while len(head) < size:
        chunk = next(chunks, None)
        if chunk is None:
            break
        head += chunk
    return head


def _prepend(head: bytes, chunks: Iterator[bytes]) -> Iterator[bytes]:
    if head:
        yield head
    yield from chunks


def _looks_like_html(response: requests.Response, head: bytes) -> bool:
    content_type = (response.headers.get("Content-Type") or "").lower()
    start = head.lstrip().lower()
    return "html" in content_type or start.startswith((b"<!doc", b"<html", b"<head", b"<!--", b"<"))


def _is_signin(url: str, lowered_page: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return host in _LOGIN_HOSTS or any(marker in lowered_page for marker in _SIGNIN_MARKERS)


class _FormScanner(HTMLParser):
    """Collects forms (action + named inputs) and links from an HTML page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.forms: list[tuple[str, dict[str, str]]] = []
        self.links: list[str] = []
        self._current: tuple[str, dict[str, str]] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {k.lower(): (v or "") for k, v in attrs}
        if tag == "form":
            self._current = (values.get("action", ""), {})
            self.forms.append(self._current)
        elif tag == "input" and self._current is not None and values.get("name"):
            self._current[1][values["name"]] = values.get("value", "")
        elif tag == "a" and values.get("href"):
            self.links.append(values["href"])

    def handle_endtag(self, tag: str) -> None:
        if tag == "form":
            self._current = None


def _confirm_url(page: str, base_url: str) -> str | None:
    """The URL behind Drive's virus-scan warning, if this page is one.

    Current Drive: a ``<form action=".../download">`` with hidden ``id``,
    ``export``, ``confirm`` and ``uuid`` inputs. Older Drive: a link whose
    query contains ``confirm=<token>``.
    """
    scanner = _FormScanner()
    try:
        scanner.feed(page)
        scanner.close()
    except Exception:  # noqa: BLE001 — a malformed page is just "not a confirm page"
        return None
    for action, inputs in scanner.forms:
        if "confirm" in inputs or {"id", "export"} <= inputs.keys():
            target = urljoin(base_url, action or base_url)
            return f"{target.split('?', 1)[0]}?{urlencode(inputs)}"
    for href in scanner.links:
        if re.search(r"[?&]confirm=", href):
            return urljoin(base_url, unescape(href))
    return None


def _fsync_dir(directory: Path) -> None:
    """Make the rename durable (POSIX only; Windows can't open a directory)."""
    if os.name == "nt":
        return
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
