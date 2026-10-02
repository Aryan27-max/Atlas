# CI audit: what can behave differently on Windows, macOS and the development laptop

Written 2 October 2026 on branch `ci/hardening`. Goal: CI fully green on Windows and macOS, and robust against whole *classes* of cross-platform problems, not only the failure at hand.

**Method.** I read the full workflow (`.github/workflows/ci.yml`) and everything it runs:
- `packaging/` (build, smoke test, licence check, PyInstaller spec, entry point);
- `app/scripts/`, `app/package.json` and `app/electron-builder.yml`;
- all 21 e2e specs and their helpers;
- the 29 engine test files, searched by hazard class;
- the main-process code that handles paths, URLs and child processes.

For CI, the last five runs on `main`: every job's result, every annotation (warnings included), and the full logs of the latest run.

**Risk:**
- **H** (High): fails now, or would fail on the next unlucky run.
- **M** (Medium): fails when something outside the repository changes, or gives a false pass.
- **L** (Low): cosmetic, or needs an unusual machine.

## Failures in the last five runs

| Run | Commit | Failed | Root cause | Fixed by |
|---|---|---|---|---|
| 36974143072 | `e075027` | engine tests, both OSes | OpenAPI schema test: Python 3.13 renamed HTTP status phrases, and FastAPI copies them into response descriptions, so the committed schema depended on the Python that wrote it | `2f7cbc6` |
| 36975681858 | `2f7cbc6` | Windows engine; macOS e2e | Windows: a 9 ms pre-check timed as 0.0 s by a 15.6 ms clock, then read as "missing". macOS: the window clamped on a small screen; a late first frame stole focus from the slider; the menu hook used Windows wording | `44b85a6`, `a252bac`, `17642b6`, `60b2dc9` |
| 36984624035 | `60b2dc9` | Windows e2e; macOS engine | Windows: the large-display test assumed a 1280 px window (my window fix opened it at 1100 px); perf budget on a shared runner. macOS: the CLI sampled the run status every 0.2 s and missed a short pause | `3a61a6d`, `bb5a01f`, `3dc5051` |
| 37009848835 | `071fefc` | both macOS builds | A missing secret arrives as `CSC_LINK=""`, and electron-builder treated `""` as a certificate path ("…/app not a file") | `63036f0` |
| 37021866877 | `63036f0` | both macOS packaged-app tests | `/var/folders/…` versus `/private/var/folders/…`: a path compared as a string (P1 below) | this branch |

In the last two runs the Windows test job also shows a `[failure]` annotation. That's the report-only performance step failing on a shared runner, by design (`continue-on-error`). Every job also warns that `actions/upload-artifact@v4` runs on the deprecated Node.js 20 (V4).

## Findings

### Paths
| # | Where | What differs | Risk | Kind | Status |
|---|---|---|---|---|---|
| P1 | `app/e2e/packaged.spec.ts:61-62` (now 66-68) | The data folder was compared as a string. The engine reports the folder exactly as main gives it, and main gives `app.getPath('userData')`. Electron (Chromium) makes `--user-data-dir` absolute with `realpath()`, so on macOS a folder from `os.tmpdir()` (`/var/folders/…`) comes back as `/private/var/folders/…`. Windows 8.3 short names (`RUNNER~1`) are the same class | H | test | **fixed**: `samePath()` on both sides; the UI is checked for the engine's exact text |
| P2 | `app/main/index.ts:85-93` (old `isAppUrl`) | The app's own page was recognised by comparing `file://` + a raw path with Chromium's URL. That **never matched on Windows** (`file://C:/…` against `file:///C:/…`; the second comparison replaced `file:///` with itself) or with a space or non-ASCII letter in the path (Chromium percent-encodes it). Latent: nothing navigates to the page itself today, but a reload or same-page navigation would have been refused | M | **product** | **fixed**: `isAppPage()` turns the URL back into a path (`fileURLToPath`) and uses `samePath()`; `main/security.test.ts` covers a user folder named "Kārthik Rao" |
| P3 | `engine/db.py:968-978`, `engine/logs.py:41-44` | Orphan PDFs and the log handler compare `resolve()`d paths on **both** sides | — | product | correct as is |
| P4 | `app/e2e/settings.spec.ts:171` | The logs folder is matched with `/logs$/`, which works with either separator | — | test | correct as is |
| P5 | everywhere | Separators: paths are built with `path.join` / `Path` throughout. Long Windows paths: the deepest CI path (packaged engine `_internal/…`) stays well under 260 characters | L | — | documented |
| P6 | imports, file names | Both CI platforms ignore case by default, so a wrong-case import would pass CI and fail on Linux or a case-sensitive APFS volume | L | — | documented |

**Decision on the data folder.** The engine reports the folder it is given, never resolved (`Path(data_dir)`, `server.py:158`). In the packaged app that's Electron's `userData`. For a recruiter that's `~/Library/Application Support/Atlas` or `%APPDATA%\Atlas`, where the two spellings coincide. Only temporary folders (tests) differ. So the product is unchanged: the Welcome card and Settings show the engine's path verbatim, which is where the data really is, and tests compare *folders* with `samePath()`, never strings.

### The shared helper (`app/main/paths.ts`)
- `realPath(path)`: the canonical path (`realpathSync.native`), or the absolute path if it doesn't exist.
- `samePath(a, b)`: compares real paths, ignoring case on Windows and macOS (their default file systems do), so symlinks, 8.3 names, either slash, trailing separators and relative spellings all name the same folder.
- Used by main (`isAppPage`) and by the e2e tests (`packaged.spec`). `main/paths.test.ts` covers a junction or symlink, the temp folder, separators, case rules and different folders.
- The engine's Python side already follows the same rule (P3).

### Temporary, home and user-data folders
| # | Where | What differs | Risk | Kind | Status |
|---|---|---|---|---|---|
| T1 | `e2e/helpers.ts:16`, `e2e/stubs.ts:38,113`, `e2e/packaged.spec.ts:38` | `os.tmpdir()` is `/var/folders/…` (a symlink) on macOS and can be an 8.3 path on Windows; only P1 compared such paths | L | test | covered by P1 |
| T2 | `e2e/helpers.ts:49`, `e2e/stubs.ts:70` | Windows can't delete files a just-closed process still holds; `rmSync` retries 5 × 200 ms | L | test | correct as is |

### Line endings, encodings, locale, time zone
| # | Where | What differs | Risk | Kind | Status |
|---|---|---|---|---|---|
| E1 | `.gitattributes` | `* text=auto eol=lf` overrides Git for Windows' `core.autocrlf=true`, so byte comparisons against tracked files (`test_server.py:776` schema, TROUBLESHOOTING.md) see LF on both OSes | — | — | correct as is |
| E2 | `engine/tests/test_kill.py:61` | CI runs Python in UTF-8 mode (`PYTHONUTF8=1`), and so does the packaged engine (`engine.spec`); a developer's plain `python` on Windows doesn't. Text I/O without an `encoding=` therefore differs between CI and a laptop. A search of engine, packaging and tests found one case: the kill test's helper script (ASCII today) | L | test | **fixed**: explicit UTF-8 |
| E3 | `e2e/stubs.ts:44-51` | The stubs' ready line was decoded per chunk (`chunk.toString('utf8')`). A non-ASCII letter in the temp path (a user name) split across two chunks would break the JSON ("stubs did not start") | L | test | **fixed**: `setEncoding('utf8')` |
| E4 | `app/main/engine.ts:166-179` | The engine is spawned without a shell (spaces in paths are safe), with `windowsHide`; stdout and stderr are decoded with `setEncoding('utf8')` | — | product | correct as is |
| L1 | `renderer/design/layout.tsx:171` and others | Counts use `toLocaleString()` (the OS locale); runners are en-US and tests check small counts or engine-formatted text | L | — | documented |
| L2 | `engine/server.py:313`, default run names | Local dates; no test compares dates across midnight | L | — | documented |

### Timing on slow shared runners
| # | Where | What differs | Risk | Kind | Status |
|---|---|---|---|---|---|
| W1 | `e2e/fullscreen.spec.ts:112` (old) | A fixed 800 ms wait after full screen, then layout checks; a Mac animates into full screen for about a second | M | test | **fixed**: wait for `enter-full-screen`, then for the page to be laid out at the window's size |
| W2 | `e2e/shell.spec.ts:95-107` | CSP violations were collected for a fixed 1.5 s, then **at least two were required**; a busy runner could report them late and fail | M | test | **fixed**: resolve when both arrive (a 15 s deadline only stops a regression from hanging) |
| W3 | `e2e/shell.spec.ts:185-206` | "Navigation is blocked" waited 1.5 s and checked nothing had changed; on a slow runner it could pass before the attempt even happened | M (false pass) | test | **fixed**: wait until main has seen and refused the navigation, then check |
| W4 | `e2e/screens.ts:18,37`, `e2e/settings.spec.ts:138,141,188` | Fixed waits before screenshots | L | test | unchanged: screenshots only, no assertions |
| W5 | `e2e/perf.spec.ts:119` | Part of the measurement; in CI the `@perf` step is report-only (`bb5a01f`) | — | test | by design |
| W6 | engine tests | Waits poll a condition with a timeout (`wait_until`); fixed sleeps are "nothing happens" checks or kill-test jitter. Earlier timing bugs are fixed: the coarse Windows clock (`44b85a6`), CLI status sampling (`3dc5051`), the focus race (`17642b6`), the outage races (`b3acffb`, `3237767`) | L | — | documented |
| W7 | `e2e/helpers.ts:37`, `packaging/smoke_engine.py:40` | Generous ceilings (engine ready 120 s, smoke 90 s, expect 20 s), all polling, not sleeping | — | — | correct as is |

### Processes, ports, file locks
| # | Where | What differs | Risk | Kind | Status |
|---|---|---|---|---|---|
| X1 | `test_kill.py`, `test_worker_kill.py` | `Popen.kill()` is TerminateProcess on Windows and SIGKILL on macOS: both are hard kills, which is what the tests need | — | — | correct as is |
| X2 | `engine/tests/demo_stubs.py:45` | The demo stubs use fixed ports 47811–47813 (documented in START_CMDS for people to use); if one were taken, `demo.spec` would fail. Everything else binds `127.0.0.1:0` | L | test | documented |
| X3 | Windows networking | A connection to a closed **localhost** port takes ~2 s to be refused on Windows (measured 2.02 s), so outages shorter than ~4 s aren't seen as "down". That caused `3237767`, and the CLI test's outage lasts 6 s for the same reason | — | — | documented for future tests |
| X4 | engine, e2e | Windows can't delete open files: the engine retries orphaned PDFs at the next start (tested), and e2e cleanup retries | — | — | correct as is |

### Packaging, signing, macOS security
| # | Where | What differs | Risk | Kind | Status |
|---|---|---|---|---|---|
| M1 | `ci.yml` installer step | An empty signing secret was treated as a certificate path | H | CI | fixed in `63036f0` |
| M2 | macOS builds | Apple Silicon only launches signed code. CI signs ad-hoc (`identityName=-` in the log), and the packaged app and its PyInstaller engine started on both Macs | — | — | verified in CI |
| M3 | DMG downloads | A downloaded DMG is quarantined ("could not verify", `docs/INSTALL.md`); CI-built apps aren't, so CI can't test this | L | product | documented |
| M4 | `extraResources` | The engine's executable bit survives packaging (it started in the packaged test) | — | — | verified in CI |
| M5 | signing | The first build with a real Developer ID turns on the hardened runtime for the PyInstaller engine; untested until signing secrets exist (`packaging/entitlements.mac.plist`) | M (future) | product | documented |
| M6 | macOS 26 runner | Small screen: the window opens to fit it (`a252bac`), and the large-display test zooms from the real width (`3a61a6d`) | — | — | fixed earlier |
| M7 | the development laptop | Smart App Control blocks electron-builder's unsigned NSIS stub and graphify's launcher; CI is the reference for Windows installers | — | — | documented |

### Files that exist only on the development laptop
| # | What | Status |
|---|---|---|
| F1 | Ignored local files are only `graphify-out/*` (not used by any test); `.venv` is built by CI; `docs/demo/demo-students.xlsx` is tracked; `dist/engine` and `app/out` are built in their jobs | correct as is |
| F2 | `packaged.spec` skips when there is no build, and runs only in the build job, after `npm run dist` | correct as is |

### Unpinned versions
| # | What | Risk | Status |
|---|---|---|---|
| V1 | Runner images `windows-latest` and `macos-latest`. `macos-latest` already moved to macOS 26 (small screen, new tools) without notice | M | **fixed**: `windows-2025`, `macos-26` (and `macos-15-intel`), bumped on purpose |
| V2 | Python packages had lower bounds only, so every run took the newest. In one day that changed the OpenAPI schema (FastAPI) and the test client's needs (Starlette) | H | **fixed**: `engine/constraints.txt` (from CI's green runs); CI installs with `-c`; `test_tools.ConstraintsTests` keeps every requirement pinned |
| V3 | PyInstaller `>=6.10`: the shipped engine's bootloader could change between builds | M | **fixed**: pinned (6.22.3) through the constraints |
| V4 | `actions/upload-artifact@v4` runs on the deprecated Node.js 20 (a warning on every job) and will stop when GitHub removes Node 20 | M | **fixed**: `@v7` (Node 24, same inputs) |
| V5 | Other actions at major tags (`checkout@v5`, `setup-python@v6`, `setup-node@v5`, all Node 24); not pinned to commit SHAs | L | documented |
| V6 | The Python 3.12 patch and the Node 24 minor version float | L | documented |
| V7 | npm is locked (`package-lock.json`, `npm ci`), but Electron's binary (`postinstall`) and electron-builder's downloads (Electron zip, NSIS, icons) come from GitHub at build time; a network blip fails the job | L | documented |
| V8 | `macos-15-intel`: GitHub is retiring Intel macOS images over time | L | documented: move the x64 build when the label goes |
| V9 | npm 11 skips dependencies' install scripts unless approved: `esbuild` (twice), `electron-winstaller` and `fsevents` on macOS (warned on every `npm ci`). esbuild's binary comes from its platform package; `electron-winstaller` (Squirrel) isn't used; `fsevents` only speeds up dev file-watching. Atlas's own `postinstall` (Electron's binary) does run | L | documented |
| V10 | PyInstaller warns `Hidden import "tzdata" not found`. The engine uses no named time zones today; if it ever does, add `tzdata`, because Windows has no system time-zone database and the packaged engine would fail | L | documented |

**Privacy (rule 15), checked:** FastAPI 0.142 depends on `opentelemetry-api`. The API alone records and sends nothing; it needs an SDK and an exporter, and neither is installed. The constraints keep it that way.

## Still risky after this branch
1. **The first signed macOS build (M5)**, whenever Developer ID secrets are added.
2. **Network downloads during CI builds (V7):** a GitHub or CDN blip fails a job.
3. **Intel macOS runner retirement (V8).**
4. **Screenshot timing (W4):** cosmetic, but the macOS screenshots are used for UI review.
5. **Demo stub ports (X2)** on a machine that uses 47811–47813.
