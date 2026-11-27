# Starting Atlas: commands

Copy-paste commands for developing, demoing, testing and building Atlas. **Windows PowerShell first**; where macOS (zsh) differs, a second block follows. Run everything from the repository root unless a step says `cd app`.

In Windows PowerShell, `curl` is a different command: always type **`curl.exe`**. Windows PowerShell 5.1 has no `&&`; use `;` or separate lines.

---

## Quick start (Windows PowerShell)

**Just want to use Atlas?** Install it from the [v0.3.0 release](https://github.com/Aryan27-max/Atlas/releases/tag/v0.3.0) and follow its `INSTALL.md`. The steps below are for running it from the source.

1. **Install the tools once:** Python 3.12, Node.js 20+, Git, and [Ollama](https://ollama.com/download). Then get the model (about 5 GB):
   ```powershell
   ollama pull qwen3:8b
   ```
2. **Set up the project once:**
   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r engine/requirements-dev.txt -c engine/constraints.txt
   cd app; npm ci; cd ..
   ```
3. **Start Ollama:** open it from the Start menu (it sits in the tray). Check it: `curl.exe http://127.0.0.1:11434/api/tags`.
4. **Run Atlas:**
   ```powershell
   cd app; npm run dev
   ```
   This one command starts everything. The app builds, Electron opens, and Electron starts the Python engine itself. "hello" appears, then **Welcome**. Close the window to stop it all.
5. **Try it with fictional students** (no Ollama or internet needed): `cd app; npm run demo:fast`.
6. **Check everything works:**
   ```powershell
   .\.venv\Scripts\python.exe -m unittest discover -s engine/tests -t .
   cd app; npm test; npm run e2e
   ```
7. **Build the installer:** section 9.

On a Mac it's the same, with `python3.12`, `.venv/bin/python` and `&&` in place of `;`. Details and fixes for every step are in the sections below.

---

## 1. Prerequisites
**What for:** the tools Atlas is built with, and Ollama with the model it screens with.

| Tool | Version | Check |
|---|---|---|
| Python | **3.12** (what CI and releases use; 3.11 or newer works) | `py -3.12 --version` or `python --version` |
| Node.js | 20 or newer (CI uses 24) | `node --version` |
| Git | any recent | `git --version` |
| Ollama | any recent ([ollama.com/download](https://ollama.com/download)) | `ollama --version` |

Then download the model once (about 5.2 GB):
```powershell
ollama pull qwen3:8b
ollama list            # shows qwen3:8b
```
**You should see** `qwen3:8b` in `ollama list`. If Ollama wasn't running, `ollama list` starts it first (on Windows, the tray app), which takes a few seconds.
**Common error:** `ollama: The term 'ollama' is not recognized` → Ollama isn't installed, or the terminal was open before you installed it: open a new terminal.

---

## 2. First-time setup
**What for:** the engine's Python environment (`.venv`, which the app looks for) and the app's packages.

```powershell
py -3.12 -m venv .venv                 # or: python -m venv .venv, if python --version says 3.11+
.\.venv\Scripts\Activate.ps1
pip install -r engine/requirements-dev.txt -c engine/constraints.txt   # the engine's requirements + the test client, at the versions CI uses
cd app; npm ci; cd ..
```
```zsh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r engine/requirements-dev.txt -c engine/constraints.txt
(cd app && npm ci)
```
**You should see** `Successfully installed …` from pip (about a minute), and from npm `> atlas@0.3.0 postinstall`, `Downloading Electron binary...` (first time only; Atlas's `postinstall` fetches it, because current npm no longer runs packages' own install scripts) and `added … packages` (under a minute).

npm 11 also prints `npm warn allow-scripts … esbuild … (postinstall: node install.js)` (and `electron-winstaller`). **That's expected and harmless:** npm now asks before running packages' install scripts; esbuild works without its script, and `electron-winstaller` is only for an installer type Atlas doesn't build.

Optional, for scanned résumés in development only (several GB, PyTorch): `pip install -r engine/requirements-ocr.txt`. The installer never includes it.

**Common errors**
- `Activate.ps1 cannot be loaded because running scripts is disabled on this system` → allow scripts for this window only: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again. (Or skip activating and call `.\.venv\Scripts\python.exe` directly; the app finds `.venv` by itself.)
- `py: No suitable Python runtime found` → Python 3.12 isn't installed; install it from python.org, or use any Python 3.11+ with `python -m venv .venv`.
- `npm ci` fails with `EBADENGINE` or odd syntax errors → Node is too old: install Node 20 or newer.
- `npm run dev` says **`Electron uninstall`** → Electron's binary wasn't downloaded (for example `npm ci --ignore-scripts`): run `cd app; node -e "require('electron')"` once.

---

## 3. Start Ollama
**What for:** Atlas reads résumés with the model that Ollama runs on this computer.

Windows: open **Ollama** from the Start menu (it sits in the taskbar tray), or run `ollama serve` in a separate window. macOS: open **Ollama** from Applications.
```powershell
curl.exe http://127.0.0.1:11434/api/tags
```
**You should see** JSON listing your models, including `qwen3:8b`.
**Common errors:** `Failed to connect to 127.0.0.1 port 11434` → Ollama isn't running: start it as above. `ollama serve` says `address already in use` → it's already running (the tray app); nothing to do.

---

## 4. Run the app (development)
**What for:** working on Atlas, with hot reload.
```powershell
cd app; npm run dev
```
**What starts:**
1. electron-vite builds main and preload and serves the renderer with hot reload;
2. Electron starts, and its main process starts the engine: `.venv\Scripts\python.exe -m engine.server --data-dir <data folder> --port 0 --watch-stdin`, with a fresh random token in the environment;
3. when the engine prints `ATLAS_READY port=…`, the window shows **Welcome**.

**Your data:** development uses the same data folder as an installed Atlas (section 10). To keep development data apart, set one first: `$env:ATLAS_USER_DATA = "$env:TEMP\atlas-dev"` (zsh: `export ATLAS_USER_DATA=/tmp/atlas-dev`). It only works in development.

**Common error:** a screen saying **Atlas couldn't start its engine** → `.venv` is missing or incomplete (section 2). The reason is in the engine log (section 10).

---

## 5. Demo mode: every screen, no real data
**What for:** seeing all of Atlas with 20 **fictional** students, without real résumés or the internet.

```powershell
cd app
npm run demo:fast      # the stub Ollama "scores" each résumé in ~1.5 s: every screen in about a minute
npm run demo           # your real Ollama + qwen3:8b scores them: slow (about a minute or more each) but real
npm run demo:reset     # delete the demo's data
```
**What it does:** builds the app, starts local stand-ins for Google Drive (`127.0.0.1:47811`), the Ollama stub (`:47812`, `demo:fast` only) and a small control API (`:47813`), then opens Atlas with its own data folder, **Atlas Demo** (next to the real one, never mixed with it). The student list is `docs/demo/demo-students.xlsx`. Its links look like Google Drive links, but in the demo they're answered by the local stand-in; three are broken on purpose. Close the Atlas window to stop everything.

**You should see** in the terminal: `Atlas demo (stub Ollama, instant scores). Fictional students only.`, the paths, and the pause commands; then the Atlas window.

**The click path that shows every screen**
1. **Welcome** → **New screening**.
2. **Students & model:** *Choose file…* → `docs/demo/demo-students.xlsx` (20 ready) → pick **qwen3:8b** (it's tested once) → *Continue*.
3. **Criteria:** pick the *SWE intern* template → *Continue*.
4. **Cutoffs:** leave the defaults → *Continue*.
5. **Review** → *Start screening*.
6. **Progress.** To see a pause, in a second terminal:
   ```powershell
   curl.exe -X POST http://127.0.0.1:47813/drive/offline     # "No internet connection"
   curl.exe -X POST http://127.0.0.1:47813/drive/online      # it continues by itself
   ```
   With `demo:fast` you can also stop the model: `…/ollama/offline`, then `…/ollama/online` ("Ollama isn't running").
7. **Results** (*View results*): **Adjust cutoffs** (live preview) · click a student for the **Candidate detail** · **right-click** a row (native menu: Move to, Copy RA number) · **Ctrl-click** (Cmd-click on a Mac) or Shift-click several for the selection bar and *Move to…* · **Export** → *All candidates*.
8. **Needs attention** (in the sidebar): the three broken links, grouped by reason.
9. **Settings** (Ctrl+, / Cmd+,): appearance, defaults, keep awake; scroll to **Data** and **About**.
10. **The design gallery:** View → *Toggle Developer Tools* (Ctrl+Shift+I; Alt+Cmd+I on a Mac; development and demo only), then in its Console type `location.hash = '#/design'`. `location.hash = ''` goes back.

**Common errors:** `a demo port (47811–47813) is busy: is another demo running?` → close the other demo window. `No Python environment at …\.venv\…` → do section 2 first.

`app/e2e/demo.spec.ts` clicks through this whole path automatically (section 7). It uses a temporary data folder; to keep its screening for the CLI examples in section 6, run it with `$env:ATLAS_DEMO_DATA_DIR = "$env:APPDATA\Atlas Demo"`.

---

## 6. The engine on its own
### The headless CLI
**What for:** screening without the app (scripts, servers, debugging).
```powershell
python -m engine.cli --help
python -m engine.cli preflight --csv docs/demo/demo-students.xlsx
```
**You should see** `20 rows read` and `20 ready`. Nothing is saved.

After a demo screening has finished (section 5), look at it and export it from the demo data:
```powershell
python -m engine.cli results --run 1 --data-dir "$env:APPDATA\Atlas Demo"
python -m engine.cli export --run 1 --data-dir "$env:APPDATA\Atlas Demo" --view all --out "$env:TEMP\demo-all.csv"
```
```zsh
python -m engine.cli results --run 1 --data-dir ~/Library/Application\ Support/Atlas\ Demo
```
A full screening from the command line (`run`, then `resume` or `retry`) needs your own list with real résumé links, and Ollama running:
```powershell
python -m engine.cli run --csv <your-list.csv> --model qwen3:8b --criteria "@engine/eval/sets/fictional/criteria.txt" --data-dir "$env:TEMP\atlas-cli"
```
Exit codes: 0 finished, 2 paused (`resume` later), 1 error. (The demo list's links only work inside the demo, where the app redirects them.)

### The local API server alone
**What for:** API work. The engine only accepts requests carrying its token, sent to `127.0.0.1` (not `localhost`).
```powershell
$env:ATLAS_TOKEN = "dev-token-0123456789abcdef0123456789"      # 16+ characters; the app uses 32 random bytes
python -m engine.server --data-dir "$env:TEMP\atlas-api" --port 8765
```
**You should see** `ATLAS_READY port=8765`. In a second terminal:
```powershell
curl.exe http://127.0.0.1:8765/health                                         # no token needed
curl.exe -H "Authorization: Bearer dev-token-0123456789abcdef0123456789" http://127.0.0.1:8765/system
curl.exe -H "Authorization: Bearer dev-token-0123456789abcdef0123456789" http://127.0.0.1:8765/openapi.json -o openapi.json
```
```zsh
export ATLAS_TOKEN=dev-token-0123456789abcdef0123456789
python -m engine.server --data-dir /tmp/atlas-api --port 8765
```
There is **no `/docs` page**: interactive docs are switched off in the engine. The full API description is `/openapi.json` (with the token) and the committed copy `app/src/shared/api-schema.json`. Stop the server with Ctrl+C.

**Common errors:** `401 This request didn't come from the Atlas app` → missing or wrong token. `Atlas only accepts requests from this computer` → you used `localhost`; use `127.0.0.1`. `Atlas only uses an Ollama running on this computer` → `--ollama-url`/`ATLAS_OLLAMA_URL` points elsewhere; Atlas refuses remote models.

---

## 7. Tests
| What | Command | Takes (this laptop) |
|---|---|---|
| Engine suite | `python -m unittest discover -s engine/tests -t .` | ~2 min |
| One module | `python -m unittest engine.tests.test_db -v` | seconds |
| Both kill tests (20 kills each) | `python -m unittest engine.tests.test_kill engine.tests.test_worker_kill -v` | ~20 s |
| Vitest | `cd app; npm test` | ~3 s |
| Typecheck · lint · formatting | `cd app; npm run typecheck; npm run lint; npm run format` | ~10 s |
| Playwright (all; builds first) | `cd app; npm run e2e` | ~5–6 min |
| One Playwright spec | `cd app; npx electron-vite build; npx playwright test e2e/results.spec.ts` | ~1 min |
| The demo walkthrough | `cd app; npx electron-vite build; npx playwright test e2e/demo.spec.ts` | ~1 min |
| Performance budgets only (2,000 students; tagged `@perf`) | `cd app; npx electron-vite build; npx playwright test --grep "@perf"` | ~40 s |
| Live test with the real model | `$env:ATLAS_LIVE = "1"; $env:ATLAS_MODEL = "qwen3:8b"; python -m unittest engine.tests.test_live -v` (zsh: `ATLAS_LIVE=1 ATLAS_MODEL=qwen3:8b python -m unittest engine.tests.test_live -v`) | ~5 min, needs Ollama |
| Third-party licences | `python packaging/check_licenses.py` | seconds |
| TROUBLESHOOTING.md is current | `python -m engine.tools.troubleshooting --check` | seconds |

**You should see** `OK` (one skip: the OCR test, unless EasyOCR is installed), and `passed` from npm and Playwright. Playwright drives Atlas's own Electron: **no `npx playwright install` is needed**. Two Playwright tests are skipped unless a packaged build or an install exists (section 9). The `@perf` budgets are strict here. In CI they run in their own report-only step, with the timings in the job summary, because shared runners' timing is noise.

---

## 8. Eval and privacy tools
```powershell
python -m engine.eval run --set engine/eval/sets/fictional --model qwen3:8b   # ~25 min on a CPU laptop; writes report.md
python -m engine.tools.leak_check --data-dir "$env:APPDATA\Atlas Demo"        # identity leaks in prompts: counts only
python -m engine.tools.graph_audit                                            # every check must print [OK ]
graphify update .                                                             # refresh the code graph (seconds, no AI)
```
`docs/EVAL.md` explains the eval and how to build a real labelled set. `graphify` is a separate tool; it's needed only for the graph.

---

## 9. Build the installer
**What for:** the Windows installer (or a macOS DMG on a Mac). Release builds come from CI (`.github/workflows/ci.yml`).
```powershell
py -3.12 -m venv build/venv-engine
build/venv-engine/Scripts/python -m pip install -r packaging/requirements-build.txt -c engine/constraints.txt
build/venv-engine/Scripts/python packaging/build_engine.py     # engine binary + smoke test (~1 min)
cd app; npm run dist                                            # ~2 min
npx playwright test e2e/packaged.spec.ts                        # the packaged app reaches Welcome
```
```zsh
python3.12 -m venv build/venv-engine
build/venv-engine/bin/python -m pip install -r packaging/requirements-build.txt -c engine/constraints.txt
build/venv-engine/bin/python packaging/build_engine.py
cd app && npm run dist -- -c.mac.identity=- -c.mac.hardenedRuntime=false     # unsigned: ad-hoc signed
```
**You should see** `smoke: passed`, then `app/dist/Atlas-Setup-0.3.0-x64.exe` (about 127 MB) and `app/dist/win-unpacked/` (macOS: `app/dist/Atlas-0.3.0-arm64.dmg` and `app/dist/mac-arm64/`).

**Common errors**
- `No engine build at …` → run `build_engine.py` first.
- `EPERM`/`EBUSY` on `app\dist\…\default_app.asar` → **VS Code has the repository open** and keeps `.asar` files it looked at open. Build outside the repository: `npx electron-builder --config electron-builder.yml --publish never -c.directories.output=$env:TEMP\atlas-dist`, then run the packaged test with `$env:ATLAS_PACKAGED_DIR = "$env:TEMP\atlas-dist"`.
- `spawn UNKNOWN` at the NSIS step → **Windows Smart App Control** refused electron-builder's unsigned helper. Build in CI or with a signing certificate; don't turn Smart App Control off on someone's laptop to get past it.

**The app icon** comes from `app/renderer/assets/brand/logo.svg`. After changing the logo, re-render the icons before building, from the repository root: `node packaging/icons/render-icons.mjs` (check without writing: `--check`). It draws with the Electron already in `app/node_modules`; see [packaging/icons/README.md](packaging/icons/README.md).

**Unsigned builds:** Windows shows SmartScreen's "Windows protected your PC" (*More info → Run anyway*); with Smart App Control on, an unsigned installer may not run at all. macOS needs System Settings → Privacy & Security → *Open Anyway*. Signing comes only from environment variables (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`): see [docs/SIGNING.md](docs/SIGNING.md).

---

## 10. Where data lives
| | Windows | macOS |
|---|---|---|
| Atlas (installed, and development) | `%APPDATA%\Atlas` | `~/Library/Application Support/Atlas` |
| Demo mode | `%APPDATA%\Atlas Demo` | `~/Library/Application Support/Atlas Demo` |
| Engine log | `<data folder>\logs\engine.log` | `<data folder>/logs/engine.log` |

Open it: Settings → Data → **Show in folder**, or `explorer "$env:APPDATA\Atlas"` (macOS: `open ~/Library/Application\ Support/Atlas`). The log never contains résumé text or student details.

**Reset everything:** in the app, Settings → Data → **Delete all data…** (type DELETE). Or, with Atlas closed:
```powershell
Remove-Item -Recurse -Force "$env:APPDATA\Atlas"      # WARNING: deletes every screening, permanently
```
```zsh
rm -rf ~/Library/Application\ Support/Atlas          # WARNING: deletes every screening, permanently
```
CSV exports you saved elsewhere are never touched. Uninstalling Atlas keeps this folder.

---

## 11. Troubleshooting top 10
1. **"Ollama isn't running"** in Atlas → start Ollama (section 3); Welcome's *Start Ollama* does it for you.
2. **No model / "The model … is no longer installed"** → `ollama pull qwen3:8b`.
3. **`ModuleNotFoundError: No module named 'fastapi'`** → the venv isn't active, or packages aren't installed: `.\.venv\Scripts\Activate.ps1`, then `pip install -r engine/requirements-dev.txt -c engine/constraints.txt`.
4. **Atlas couldn't start its engine** → check `.venv` exists, then read `engine.log` (section 10).
5. **Port in use:** `python -m engine.server … --port 8765` fails → choose another port, or `--port 0` (the engine picks one and prints it). Demo ports: close the other demo.
6. **`npm ci` fails** → Node 20+ (`node --version`); with `EPERM` on Windows, close programs using `app\node_modules` (VS Code, a running Atlas) and run it again.
7. **"export.csv is open in another program"** when exporting → close the file in Excel and export again.
8. **Activate.ps1 is blocked** → `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` (this window only).
9. **`curl` behaves strangely in PowerShell** → use `curl.exe` (in Windows PowerShell, `curl` means `Invoke-WebRequest`).
10. **Playwright** → no browser download is needed. If Electron starts as plain Node ("bad option: --remote-debugging-port"), the terminal has `ELECTRON_RUN_AS_NODE` set (some editors set it): `Remove-Item Env:ELECTRON_RUN_AS_NODE`. The tests remove it themselves.

Every message Atlas shows a recruiter, and what to do about it: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
