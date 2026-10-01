# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Atlas engine (Phase 3, step 3.5).
#
#   python -m PyInstaller packaging/engine.spec --noconfirm --distpath dist/engine --workpath build/pyinstaller
#
# One folder ("onedir"): dist/engine/atlas-engine/atlas-engine(.exe) + _internal/.
# Electron ships that folder as resources/engine/ (app/electron-builder.yml).
#
# OCR is NOT in the build: EasyOCR pulls in PyTorch (hundreds of MB). A scanned
# résumé gets the engine's existing reason, "This résumé is a scanned image,
# and text recognition (OCR) isn't installed on this computer."
#
# Release builds use Python 3.12 (CI, .python-version).

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parent  # noqa: F821 — SPECPATH is defined by PyInstaller

datas = [
    (str(ROOT / "engine" / "llm" / "common_words.txt"), "engine/llm"),
    (str(ROOT / "engine" / "llm" / "sample_resume.txt"), "engine/llm"),
]

# uvicorn picks its loop, protocol and lifespan modules by name at runtime.
hiddenimports = collect_submodules("uvicorn") + ["engine.server"]

excludes = [
    # OCR and its dependencies: not shipped (see above).
    "easyocr", "torch", "torchvision", "cv2", "scipy", "skimage", "matplotlib",
    # Never needed by the engine at runtime.
    "tkinter", "pytest", "IPython", "notebook",
    "engine.tests", "engine.eval", "engine.tools",
]

a = Analysis(  # noqa: F821
    [str(ROOT / "packaging" / "atlas_engine.py")],
    pathex=[str(ROOT)],
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=excludes,
    noarchive=False,
)
pyz = PYZ(a.pure)  # noqa: F821
# UTF-8 mode, as in development (PYTHONUTF8=1): a frozen build ignores
# PYTHON* environment variables, so it is set here instead.
options = [("X utf8_mode=1", None, "OPTION")]
exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    options,
    exclude_binaries=True,
    name="atlas-engine",
    console=True,          # the ready line goes to stdout; Electron hides the window (windowsHide)
    upx=False,
    disable_windowed_traceback=False,
)
coll = COLLECT(  # noqa: F821
    exe,
    a.binaries,
    a.datas,
    name="atlas-engine",
    upx=False,
)
