"""Is it the machine, or just this candidate? (ARCHITECTURE §8)

When a download times out or a chat breaks, the worker asks the probe:

* ``internet_ok()`` — a plain TCP connection (no data sent) to two
  well-known hosts; either one answering counts. Host *names* are used, not
  IPs, so broken DNS — which fails every download — also reads as "no
  internet" and pauses the run instead of failing every candidate.
* **Captive portals** (hotel or campus Wi-Fi that wants a sign-in page): the
  TCP connection succeeds, but every download returns the portal's HTML, so
  every candidate would fail as "isn't a PDF". So ``internet_problem()`` also
  GETs a connectivity-check URL that answers **204 No Content** when the
  internet is really there (``connectivitycheck.gstatic.com/generate_204``,
  then ``www.gstatic.com/generate_204``). Any other answer (a 200 page, a
  redirect) means a sign-in page is in the way, and the run pauses with
  "Connected to Wi-Fi that needs a sign-in page" until it's gone. If the check
  URL can't be reached at all but the TCP hosts can, the TCP verdict stands
  (a firewall blocking only the check must not stop screening).
* ``ollama_ok()`` — Ollama answers ``/api/tags``.

All are injectable (``connect``, ``get``, ``check_urls``) and fakeable in tests.
The check request carries no data (ARCHITECTURE §1).
"""

from __future__ import annotations

import socket
from typing import Any, Callable, Protocol

import requests

from engine.errors import Pause

DEFAULT_HOSTS: tuple[tuple[str, int], ...] = (("drive.google.com", 443), ("www.google.com", 443))
DEFAULT_CHECK_URLS: tuple[str, ...] = (
    "http://connectivitycheck.gstatic.com/generate_204",
    "http://www.gstatic.com/generate_204",
)


class _OllamaHealth(Protocol):
    def health(self) -> bool: ...


class HealthProbe:
    def __init__(
        self,
        *,
        hosts: tuple[tuple[str, int], ...] = DEFAULT_HOSTS,
        timeout: float = 3.0,
        ollama: _OllamaHealth | None = None,
        connect: Callable[..., socket.socket] = socket.create_connection,
        check_urls: tuple[str, ...] = DEFAULT_CHECK_URLS,
        get: Callable[..., Any] = requests.get,
    ) -> None:
        self.hosts = hosts
        self.timeout = timeout
        self.ollama = ollama
        self.check_urls = check_urls
        self._connect = connect
        self._get = get

    def internet_ok(self) -> bool:
        return self.internet_problem() is None

    def internet_problem(self) -> str | None:
        """``None`` when the internet works, else the pause reason."""
        if not self._tcp_ok():
            return Pause.NO_INTERNET
        answered = False
        for url in self.check_urls:
            try:
                response = self._get(url, timeout=self.timeout, allow_redirects=False)
            except requests.RequestException:
                continue
            try:
                answered = True
                if response.status_code == 204:
                    return None
            finally:
                close = getattr(response, "close", None)
                if close:
                    close()
        return Pause.CAPTIVE_PORTAL if answered else None

    def _tcp_ok(self) -> bool:
        for host, port in self.hosts:
            try:
                self._connect((host, port), timeout=self.timeout).close()
                return True
            except OSError:
                continue
        return False

    def ollama_ok(self) -> bool:
        return self.ollama is not None and self.ollama.health()
