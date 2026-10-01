"""The engine for the app's Playwright tests: ``engine.server`` with Google
Drive pointed at the local Drive stub, the health probe pointed at the stubs,
and short intervals.

The app starts it instead of ``engine.server`` when ``ATLAS_ENGINE_MODULE``
names it, which main only honours in development (never in a packaged app).

Environment: ``ATLAS_STUB_DRIVE_URL`` (the Drive stub), ``ATLAS_OLLAMA_URL``,
``ATLAS_STUB_CONTROL_URL`` (the stubs' control API) and
``ATLAS_STUB_OLLAMA_INSTALLED`` ("0" = Ollama not installed; default "1").

Finding and starting Ollama are *always* stubbed here, so a test can never
launch the real Ollama on the machine running the tests: "Start Ollama" just
brings the stub online through the control API.
"""

from __future__ import annotations

import os
import sys
import urllib.request
from urllib.parse import urlsplit

from engine.health import HealthProbe
from engine.llm.client import DEFAULT_URL, OllamaClient
from engine.ollama_setup import OllamaInstall
from engine.server import EngineOptions, main


def stub_ollama_finder() -> OllamaInstall:
    if os.environ.get("ATLAS_STUB_OLLAMA_INSTALLED", "1") == "1":
        return OllamaInstall(True, "stub-ollama", "app")
    return OllamaInstall(False)


def stub_ollama_starter(install: OllamaInstall) -> bool:
    control = os.environ.get("ATLAS_STUB_CONTROL_URL", "").rstrip("/")
    if not control or not install.installed:
        return False
    with urllib.request.urlopen(urllib.request.Request(f"{control}/ollama/online", method="POST"), timeout=5):
        return True

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
        health=HealthProbe(hosts=((parts.hostname or "127.0.0.1", parts.port or 80),), ollama=OllamaClient(ollama),
                           check_urls=(f"{drive}/generate_204",)),
        poll_interval=float(os.environ.get("ATLAS_STUB_POLL", "1.0")),
        download_interval=0.0,
        idle_interval=0.05,
        event_poll_seconds=0.2,
        status_poll_seconds=0.25,
        ollama_finder=stub_ollama_finder,
        ollama_starter=stub_ollama_starter,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], options=options_from_env()))
