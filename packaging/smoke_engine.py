"""Smoke test for the packaged engine (Phase 3, step 3.5).

    python packaging/smoke_engine.py [path/to/atlas-engine(.exe)]

Starts the binary the way the app does: a temporary data folder, port 0, the
token in the environment (never on the command line) and ``--watch-stdin``.
Then it checks that:

1. the one ready line ``ATLAS_READY port=<n>`` arrives on stdout;
2. ``GET /health`` answers ``{"status": "ok"}``;
3. an authenticated call (``GET /system``) works with the token and is
   refused without it;
4. ``POST /shutdown`` stops it cleanly.

Standard library only, so it runs before anything else is installed. Exit
code 0 when every check passes. Nothing leaves the machine: every request
goes to 127.0.0.1.
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
BINARY = "atlas-engine.exe" if os.name == "nt" else "atlas-engine"
DEFAULT = ROOT / "dist" / "engine" / "atlas-engine" / BINARY
READY_TIMEOUT = 90.0      # a cold start of a one-folder build can take a while on a slow disk


def _request(url: str, *, token: str | None = None, method: str = "GET") -> tuple[int, Any]:
    request = urllib.request.Request(url, method=method, data=b"" if method == "POST" else None)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"null")


def _ready_line(process: subprocess.Popen[bytes], timeout: float) -> str:
    """The first stdout line, or '' if none arrives in time."""
    line: list[bytes] = []

    def read() -> None:
        assert process.stdout is not None
        line.append(process.stdout.readline())

    reader = threading.Thread(target=read, daemon=True)
    reader.start()
    reader.join(timeout)
    return line[0].decode("ascii", "replace").strip() if line else ""


def smoke(binary: Path) -> list[str]:
    """Run the checks; return the failures (empty = all good)."""
    if not binary.is_file():
        return [f"no engine binary at {binary}"]
    failures: list[str] = []
    token = secrets.token_hex(32)
    with tempfile.TemporaryDirectory(prefix="atlas-smoke-") as data:
        started = time.monotonic()
        process = subprocess.Popen(
            [str(binary), "--data-dir", data, "--port", "0", "--watch-stdin"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={**os.environ, "ATLAS_TOKEN": token},
        )
        try:
            line = _ready_line(process, READY_TIMEOUT)
            if not line.startswith("ATLAS_READY port="):
                return [f"no ready line within {READY_TIMEOUT:.0f} s (got {line!r})"]
            port = int(line.split("=", 1)[1])
            print(f"smoke: ready on port {port} after {time.monotonic() - started:.1f} s")
            base = f"http://127.0.0.1:{port}"

            status, body = _request(f"{base}/health")
            if status != 200 or not isinstance(body, dict) or body.get("status") != "ok":
                failures.append(f"/health answered {status} {body!r}")
            else:
                print(f"smoke: /health ok (engine {body.get('version')})")

            status, body = _request(f"{base}/system", token=token)
            if status != 200 or not isinstance(body, dict) or "engine_version" not in body:
                failures.append(f"/system with the token answered {status}")
            if _request(f"{base}/system")[0] != 401:
                failures.append("/system without the token was not refused")

            status, _ = _request(f"{base}/shutdown", token=token, method="POST")
            if status != 202:
                failures.append(f"/shutdown answered {status}")
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                failures.append("the engine did not exit after /shutdown")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
    return failures


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    failures = smoke(Path(args[0]) if args else DEFAULT)
    for failure in failures:
        print(f"smoke: FAIL {failure}")
    print("smoke: passed" if not failures else f"smoke: {len(failures)} check(s) failed")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
