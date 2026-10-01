# Step 3.6 — CI on Windows and macOS

## What was built
`.github/workflows/ci.yml`, two jobs, plus `.python-version` (3.12). **Not pushed**: the owner pushes, and the first real run happens then.

**test**: a matrix of `windows-latest` and `macos-latest`, each with Python 3.12 and Node 24. On every push to `main`, every pull request, and manual runs:
1. a `.venv` at the repository root, exactly as in development (the app and the e2e tests start the engine from it), with `engine/requirements-dev.txt`;
2. the engine suite, **including `test_kill` and `test_worker_kill`**, with `-v` so the log names every test;
3. `npm ci`, then typecheck, lint, the formatting check and Vitest;
4. the Electron end-to-end tests (`npm run e2e`) against the local stub Drive and stub Ollama: no real Ollama and no internet;
5. on failure, Playwright traces, test results and screenshots are uploaded (`test-results-<os>`);
6. on macOS, **always**, the screenshot set (`docs/summaries/phase2/screens` and `phase3/screens`, both themes) as `macos-screenshots`, so the owner sees the Mac UI for the first time without owning a Mac.

**build**: after *test* passes, on pushes to `main` and manual runs (not on pull requests):

| Runner | Target |
|---|---|
| `windows-latest` | NSIS installer, x64 |
| `macos-latest` (Apple silicon) | DMG, arm64 |
| `macos-15-intel` | DMG, x64 (the engine inside is native code, so it needs an Intel runner) |

On each runner it:
1. installs `packaging/requirements-build.txt` into Python 3.12 and runs `packaging/build_engine.py` (PyInstaller, then the smoke test);
2. runs `npm run dist`. On macOS without a Developer ID it signs ad-hoc (`-c.mac.identity=- -c.mac.hardenedRuntime=false`), so a downloaded DMG shows "unverified developer" instead of "damaged";
3. runs the packaged-app Playwright test;
4. uploads the installer (`atlas-windows-x64`, `atlas-macos-arm64`, `atlas-macos-x64`).

Signing secrets (`CSC_LINK`, `APPLE_ID`, …; `docs/SIGNING.md`) reach the build job only through `env:`; they are never written into a script or a condition. Without them the installers are unsigned, and electron-builder skips notarisation.

## How it was validated (no push)
- **No `actionlint`** on this laptop, and downloading one would be a new tool. Instead:
  - the YAML was parsed with `js-yaml` (already in `app/node_modules`, from electron-builder);
  - a structural check (a scratch script, not committed) ran over the parsed file. It checks: known job and step keys; exactly one of `uses`/`run` per step; `needs` pointing at a real job; every `${{ matrix.x }}` defined in the matrix; only official `actions/*` pinned to a major version; no `${{ }}` inside `if:`; no secrets in `if:` or in scripts; scalar `with:` values; the runner labels. **No problems found.**
  - Then a careful read against what each step relies on locally: the `.venv` path the e2e tests use (`app/e2e/stubs.ts`), the npm scripts (`typecheck`, `lint`, `format`, `test`, `e2e`, `dist`), the electron-builder output folders the packaged test looks in, and the artifact paths.
- The engine suite was re-run locally with CI's environment (`PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8`): 402 passed, 1 skipped (the OCR test, as in CI).

## Key decisions and why
- **A `.venv` in CI, not the runner's Python directly.** The app's development mode and the e2e tests look for `<repo>/.venv`; building the same layout tests what developers run.
- **Node 24**, the version these suites pass on locally ("Node 20+" in the prompt), rather than an older one nobody has tried.
- **Installers only on `main` and on demand.** Every pull request would otherwise cost three builds, two of them on macOS, whose minutes are billed at ten times the Linux rate on private repositories. Pull requests still run the full test job on both systems.
- **`fail-fast: false`.** A Windows failure shouldn't hide whether macOS passed, and the reverse.
- **No release step.** Nothing is published; installers are workflow artifacts the owner downloads.

## Failure handling
| Situation | What happens |
|---|---|
| A test fails | the job fails; traces, test results and screenshots are uploaded for 14 days |
| The engine binary fails its smoke test | the build job stops before `npm run dist`, with the smoke test's reason in the log |
| No installer produced | the upload step fails (`if-no-files-found: error`) |
| Signing secrets absent | unsigned (Windows) / ad-hoc (macOS) installers, still uploaded |
| GitHub renames `macos-15-intel` | the macOS x64 build can't start; change that one label in `ci.yml` |

## Tests
No new tests: this step runs the existing ones on two systems. Locally: engine 402, Vitest 188, Playwright 59, plus the packaged-app test.

## How to try it yourself
Push to GitHub, then open **Actions → CI**. To check the file before pushing, install `actionlint` and run `actionlint .github/workflows/ci.yml`.

## Graph usefulness (this step)
- About 8 files opened (npm scripts, the e2e Python lookup, the packaged test, the requirements). The graph doesn't model workflows or npm scripts, so it wasn't consulted.

## Known limitations
- **Never run on GitHub yet.** The workflow is checked, not proven: the first push will tell. Likely first-run surprises:
  - e2e tests written and tuned on Windows may need small fixes on macOS (timing, the native title bar, full-screen animations);
  - action major versions (`checkout@v5`, `setup-python@v6`, `setup-node@v5`, `upload-artifact@v4`) may warn as GitHub moves runtimes;
  - the Intel runner label.
- **The macOS screenshots are of the development build**, not the DMG; they show the same UI.
- **The ad-hoc signed DMG still needs System Settings → Privacy & Security → *Open Anyway*** on a Mac (`docs/INSTALL.md`).

## Concepts to learn
- **CI matrix:** one job definition, run once per operating system.
- **Artifacts:** files a CI run keeps for download (installers, screenshots, traces).
- **Secrets through the environment:** a tool reads `CSC_LINK` from its environment; the workflow fills it from encrypted secrets, and an absent secret is just an empty value.
