# Step 3.5 — Packaging: the engine binary, the installers, signing by secrets

## What was built
- **The engine as one folder with its own Python** (PyInstaller):
  - `packaging/engine.spec` builds `atlas-engine(.exe)` plus `_internal/` from `packaging/atlas_engine.py`, a three-line entry point that calls `engine.server.main`;
  - `packaging/build_engine.py` runs PyInstaller, prints the size, then runs the smoke test; `packaging/requirements-build.txt` = the engine's requirements + PyInstaller (pre-approved, build time only);
  - **OCR is left out** (EasyOCR pulls in PyTorch), and so are the tests, the eval harness and the tools. A scanned résumé gets the existing recruiter reason that OCR isn't installed;
  - the frozen engine runs in **UTF-8 mode** (`X utf8_mode=1` in the spec). Development runs set `PYTHONUTF8=1`, which a frozen build ignores, so without this the two would read text files differently on Windows.
- **The smoke test** (`packaging/smoke_engine.py`, standard library only): starts the binary exactly as the app does (temporary data folder, port 0, the token in the environment, `--watch-stdin`) and checks the `ATLAS_READY` line, `GET /health`, an authenticated `GET /system`, that a call without the token is refused (401), and that `POST /shutdown` stops it.
- **The installers** (`app/electron-builder.yml`, `npm run dist`):
  - app ID `com.atlas.screening`, product name **Atlas**, version from `package.json` (0.2.0);
  - the engine folder goes into `extraResources` as `resources/engine/`, which is where `app/main/engine.ts` already looked for it when packaged (only its comment changed);
  - **Windows:** NSIS **one-click, per-user**, x64. It needs no administrator rights, installs into `%LOCALAPPDATA%\Programs\Atlas`, adds Start-menu and desktop shortcuts, and opens Atlas. It also takes `/S` (silent) and `/D=<folder>`;
  - **macOS:** a DMG. CI builds arm64 and x64 on matching runners, because the engine inside is native code for one architecture;
  - **uninstalling keeps the data:** screenings live in `userData` (`%APPDATA%\Atlas`, `~/Library/Application Support/Atlas`), which the uninstaller leaves alone (`deleteAppDataOnUninstall: false`); only Settings → *Delete all data* empties it;
  - only Chromium's **en-US** language pack is shipped (Atlas is English-only), which saved 8.4 MB of installer and 47 MB on disk;
  - `predist` (`app/scripts/check-engine.mjs`) stops `npm run dist` early, saying what to run, if the engine hasn't been built.
- **Signing only from the environment** (`docs/SIGNING.md`): `CSC_LINK`/`CSC_KEY_PASSWORD` (or `WIN_CSC_*`); a Developer ID certificate plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for macOS notarisation, which electron-builder skips when they're absent. Signed macOS builds use the hardened runtime with `packaging/entitlements.mac.plist`; unsigned ones are ad-hoc signed. SIGNING.md says what to buy, roughly what it costs, and how to add the secrets in GitHub.
- **A placeholder icon** (`packaging/icons/icon.png`, 1024 px, drawn by code) with a note for the owner (`packaging/icons/README.md`).
- **The packaged-app test** (`app/e2e/packaged.spec.ts`): launches the unpacked build (the files the installer puts on disk) with its own `--user-data-dir`, waits for the bundled engine to be ready, checks Welcome, that the app reports itself packaged, `/health`, and that the engine's data folder is the temporary one.

## Numbers (Windows x64, this laptop)
| What | Size |
|---|---|
| Engine folder (`dist/engine/atlas-engine`) | **68.5 MB**, 99 files (sizes here are binary MB, as Windows Explorer shows them); PyMuPDF is 38 MB of it, pydantic-core 5 MB, Python itself 5.5 MB |
| Engine start → `ATLAS_READY` | 4.8 s (first run after the build) |
| Installer `Atlas-Setup-0.2.0-x64.exe` | **125.0 MB** (131,049,580 bytes; 133.4 MB before trimming the language packs) |
| Installed | 390 MB: Electron ~320 MB (the `Atlas.exe` file alone is 234.6 MB), engine 68.5 MB, app 0.9 MB |

macOS sizes come from CI (step 3.6); nothing was built for macOS on this Windows laptop.

## Key decisions and why
- **Built locally with Python 3.11, not 3.12.** The prompt says release builds use 3.12 and "locally, build with 3.12 if it's installed". It isn't, and installing Python is a stop condition. Step 3.8 still needs an installer on this laptop, so the local test build used the Python 3.11.3 that's already installed, in a separate build-only environment (`build/venv-engine`, git-ignored). The build script prints a note whenever it isn't 3.12, and CI pins 3.12 (`.python-version`), so a release can't quietly use the wrong one.
- **One-click per-user installer** rather than a wizard. It's what "per-user, no admin" means in practice, a recruiter just double-clicks, and an IT person can still choose the folder with `/D=`.
- **No architecture list for macOS in the config.** Building both from one Mac would put an arm64 engine inside the x64 app. The default (this machine's architecture) is always right; CI runs one build per architecture.
- **The engine stays a console program.** Its one ready line goes to stdout; Electron starts it with `windowsHide`, so recruiters never see a window.

## Failure handling
| Situation | What happens | Message shown |
|---|---|---|
| `npm run dist` before the engine is built | stops before electron-builder runs | "No engine build at …. Build it first, from the repository root: python packaging/build_engine.py" |
| PyInstaller fails | the build script stops with PyInstaller's exit code | "build: PyInstaller failed" |
| The binary doesn't start, or a check fails | smoke test exit code 1, one line per failure | e.g. "smoke: FAIL no ready line within 90 s" |
| No signing secrets | unsigned (Windows) / ad-hoc signed (macOS) installers | electron-builder's "skipped signing / notarization" log lines |
| The bundled engine can't start in the installed app | the app's existing error screen (2.2) | "Atlas's engine stopped and couldn't be restarted." + Restart Atlas |

## Tests
- `packaging/smoke_engine.py` on the local build: **passed** (ready in 4.8 s, `/health` ok, engine 0.2.0, token required, clean shutdown).
- `app/e2e/packaged.spec.ts` on the final local build: **passed** (16 s). It is skipped in ordinary e2e runs until a build exists, so the 59 existing Playwright tests are unchanged.
- No engine or Vitest changes in this step (402 and 188).

## How to try it yourself
```bash
python -m venv build/venv-engine          # with Python 3.12 for a release
build/venv-engine/Scripts/python -m pip install -r packaging/requirements-build.txt   # bin/ on macOS
build/venv-engine/Scripts/python packaging/build_engine.py
cd app && npm run dist
npx playwright test e2e/packaged.spec.ts
```

## Graph usefulness (this step)
- About 12 files opened: `engine.ts`, `server.py`'s `main`, the e2e helpers, `package.json` and the drafted spec. The graph wasn't consulted; packaging is mostly new files and configuration, which the code graph doesn't model.

## Known limitations
- **Not built for macOS here.** The DMG config, entitlements and ad-hoc signing are untested until CI runs on a Mac; the owner should check the first CI artifacts.
- **Unsigned.** Windows SmartScreen warns, and **Windows 11 with Smart App Control on blocks the app outright**; macOS needs *Open Anyway*. See `docs/SIGNING.md` and `docs/INSTALL.md`.
- **Antivirus false positives.** PyInstaller programs are sometimes flagged by antivirus heuristics, more often when unsigned. Signing helps; nothing in Atlas can fully prevent it.
- **Electron's debugging switches are still on** (Electron "fuses" not flipped), so someone with access to the laptop could start Atlas with a debugger attached. That needs local access anyway; flipping the fuses is a small hardening step for later.
- **Local builds and VS Code:** with this repository open in VS Code on Windows, electron-builder fails with `EPERM`/`EBUSY` inside `app/dist`, because VS Code keeps `.asar` files it has looked at open. Local builds go to a folder outside the repository (`-c.directories.output=…`; CLAUDE.md → Commands). A locked `app/dist/win-unpacked.tmp` from the first attempt can be deleted after restarting VS Code.

## Concepts to learn
- **Freezing a Python program:** PyInstaller copies the interpreter, the libraries and your code into one folder, so the user doesn't need Python.
- **Resources outside the asar archive:** a native program can't run from inside Electron's archive, so it ships next to it (`extraResources`).
- **Per-user installs:** writing only to the user's own profile needs no administrator rights, which matters on managed company laptops.
- **Code signing and notarisation:** a certificate proves who built the app; Apple's notarisation additionally scans each build.
