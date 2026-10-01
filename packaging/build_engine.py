"""Build the engine binary, report its size, and smoke-test it (Phase 3, step 3.5).

    python packaging/build_engine.py            # build + size + smoke test
    python packaging/build_engine.py --no-smoke

Run it with the Python the binary should contain, with the engine's
requirements and PyInstaller installed (``engine/requirements.txt``,
``packaging/requirements-build.txt``). Release builds use Python 3.12 (CI);
any other version is reported so a local test build can't pass for a release.

Output: ``dist/engine/atlas-engine/`` (one folder: the program plus
``_internal/``), which electron-builder ships as ``resources/engine/``.
"""

from __future__ import annotations

import argparse
import platform
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "packaging" / "engine.spec"
DIST = ROOT / "dist" / "engine"
WORK = ROOT / "build" / "pyinstaller"
RELEASE_PYTHON = (3, 12)


def folder_size(folder: Path) -> int:
    return sum(path.stat().st_size for path in folder.rglob("*") if path.is_file())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-smoke", action="store_true", help="skip the smoke test")
    args = parser.parse_args(argv)

    version = sys.version_info[:2]
    print(f"build: Python {platform.python_version()} on {platform.system()} {platform.machine()}")
    if version != RELEASE_PYTHON:
        print(f"build: NOTE release builds use Python {RELEASE_PYTHON[0]}.{RELEASE_PYTHON[1]}; "
              "this one is for local testing only")
    started = time.monotonic()
    result = subprocess.run(
        [sys.executable, "-m", "PyInstaller", str(SPEC), "--noconfirm", "--clean",
         "--distpath", str(DIST), "--workpath", str(WORK)],
        cwd=ROOT, check=False,
    )
    if result.returncode != 0:
        print("build: PyInstaller failed")
        return result.returncode
    folder = DIST / "atlas-engine"
    size = folder_size(folder)
    print(f"build: {folder}: {size / 1024**2:.1f} MB in {sum(1 for p in folder.rglob('*') if p.is_file())} files "
          f"({time.monotonic() - started:.0f} s)")
    if args.no_smoke:
        return 0
    sys.path.insert(0, str(ROOT / "packaging"))
    from smoke_engine import main as smoke  # noqa: E402 — a sibling script, not a package

    return smoke([])


if __name__ == "__main__":
    sys.exit(main())
