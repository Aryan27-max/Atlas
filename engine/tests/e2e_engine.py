"""The engine for the app's Playwright tests: ``engine.server`` with Google
Drive pointed at the local Drive stub, the health probe pointed at the stubs,
and short intervals.

The app starts it instead of ``engine.server`` when ``ATLAS_ENGINE_MODULE``
names it, which main only honours in development (never in a packaged app).

Environment: ``ATLAS_STUB_DRIVE_URL`` (the Drive stub), ``ATLAS_OLLAMA_URL``.
"""

from __future__ import annotations

import os
import sys
from urllib.parse import urlsplit

from engine.health import HealthProbe
from engine.llm.client import DEFAULT_URL, OllamaClient
from engine.server import EngineOptions, main

GOOGLE = ("https://drive.usercontent.google.com", "https://drive.google.com", "https://docs.google.com")


def options_from_env() -> EngineOptions:
    drive = os.environ["ATLAS_STUB_DRIVE_URL"].rstrip("/")
    ollama = os.environ.get("ATLAS_OLLAMA_URL", DEFAULT_URL)
    parts = urlsplit(drive)

    def rewrite(url: str) -> str:
        for host in GOOGLE:
            if url.startswith(host):
                return drive + url[len(host):]
        return url

    return EngineOptions(
        url_rewrite=rewrite,
        health=HealthProbe(hosts=((parts.hostname or "127.0.0.1", parts.port or 80),), ollama=OllamaClient(ollama)),
        poll_interval=float(os.environ.get("ATLAS_STUB_POLL", "1.0")),
        download_interval=0.0,
        idle_interval=0.05,
        event_poll_seconds=0.2,
        status_poll_seconds=0.25,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], options=options_from_env()))
