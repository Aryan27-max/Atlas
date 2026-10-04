"""``engine.server`` that waits for a go-ahead before it starts: a slow engine
on demand, for the app's start-up screen test (``app/e2e/splash.spec.ts``).

The test holds the engine at "starting" for as long as it needs, then lets it
go by creating the file named in ``ATLAS_ENGINE_GATE``. Like ``e2e_engine``,
the app starts it only when ``ATLAS_ENGINE_MODULE`` names it, which main
honours in development only (never in a packaged app).
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from engine.server import main

POLL_SECONDS = 0.05
LIMIT_SECONDS = 120.0


def wait_for_gate(gate: Path, *, limit: float = LIMIT_SECONDS) -> None:
    """Return once ``gate`` exists. Exit after ``limit`` seconds, so a test that never opens it leaves nothing running."""
    deadline = time.monotonic() + limit
    while not gate.exists():
        if time.monotonic() >= deadline:
            raise SystemExit(f"the gate was never opened: {gate}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    gate = os.environ.get("ATLAS_ENGINE_GATE")
    if gate:
        wait_for_gate(Path(gate))
    sys.exit(main(sys.argv[1:]))
