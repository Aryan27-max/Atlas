"""Is it the machine, or just this candidate? (ARCHITECTURE §8)

When a download times out or a chat breaks, the worker asks the probe:

* ``internet_ok()`` — a plain TCP connection (no data sent) to two
  well-known hosts; either one answering counts. Host *names* are used, not
  IPs, so broken DNS — which fails every download — also reads as "no
  internet" and pauses the run instead of failing every candidate.
* ``ollama_ok()`` — Ollama answers ``/api/tags``.

Both are injectable (``connect``) and trivially fakeable in tests.
"""

from __future__ import annotations

import socket
from typing import Callable, Protocol

DEFAULT_HOSTS: tuple[tuple[str, int], ...] = (("drive.google.com", 443), ("www.google.com", 443))


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
    ) -> None:
        self.hosts = hosts
        self.timeout = timeout
        self.ollama = ollama
        self._connect = connect

    def internet_ok(self) -> bool:
        for host, port in self.hosts:
            try:
                self._connect((host, port), timeout=self.timeout).close()
                return True
            except OSError:
                continue
        return False

    def ollama_ok(self) -> bool:
        return self.ollama is not None and self.ollama.health()
