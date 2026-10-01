# Atlas — Build Plan

Atlas is a desktop app (macOS + Windows) that screens student résumés with a local LLM.
Input: a recruiter CSV. Output: an in-app results view and an exportable CSV.

The promise we make to the firm is **not** "it can't break". It is:

> No data is ever lost, and any run can be killed at any moment and resumed exactly where it stopped.

Every phase below has **exit criteria**. A phase is not done until they pass.

---

## Phase 1 — Engine (headless, no UI)

The whole screening pipeline, runnable and testable from Python alone.

| Step | File | What |
|---|---|---|
| 1.1 | `engine/db.py` | SQLite schema, WAL, candidate state machine, atomic transitions, crash recovery |
| 1.2 | `engine/buckets.py` | Shortlisted / Cutoff / Rejected computed at view time; min-count fill; ties; overrides |
| 1.3 | `engine/ingest/csv_loader.py` | Flexible headers, encodings, Excel-mangled phones, CGPA parsing, pre-flight report |
| 1.4 | `engine/ingest/downloader.py` | Drive link rewriting, 20 MB streaming cap, `%PDF` check, failure taxonomy, throttling |
| 1.5 | `engine/extract/` | PyMuPDF + OCR fallback (reused), **section extraction** for long résumés |
| 1.6 | `engine/llm/` | Ollama client (reused), fenced prompt, recruiter criteria, claim verification, model pre-check |
| 1.7 | `engine/worker.py` | Resumable job loop, 2-ahead prefetch, pause on system failure, delete-after-commit |
| 1.8 | `engine/export.py` | CSV with UTF-8 BOM and formula-injection escaping |
| 1.9 | `engine/cli.py` | Headless proof: preflight, run, resume, results, export, retry |
| 1.10 | `engine/tests/stubs/`, `test_e2e.py`, `test_live.py` | Local Drive/Ollama stubs, end-to-end run, live-model check |

**Exit criteria**: all met on 2026-09-27 (see `docs/summaries/PHASE1_SUMMARY.md`)
- Kill test: process killed at random points 20 times, every restart resumes with zero lost or duplicated candidates. → `test_kill.py` + `test_worker_kill.py` (real worker, 20 hard kills; run on Windows too)
- Network pulled mid-run → run pauses, zero candidates marked failed because of it. → `test_worker.py` network/Ollama loss tests; `test_e2e.py` Ollama outage
- A 10-page résumé is scored on all its sections, not the first half-page. → `test_extract.py`, `test_llm.py::TenPageTests`, `test_e2e.py` (evidence quoted from page 7)

## Phase 2 — App (local API + Electron UI)

| Step | File | What |
|---|---|---|
| 2.1 | `engine/server.py` | Local API on 127.0.0.1, random port, per-launch token |
| 2.2 | `app/main/` | Electron main: spawns/monitors engine, `powerSaveBlocker`, window chrome |
| 2.3 | `app/renderer/design/` | Design tokens + component kit (built **before** any screen) |
| 2.4 | `app/renderer/screens/` | Welcome → Upload + Model → Criteria → Cutoffs → Timeline/Progress → Results → Settings |

**Exit criteria**: all met on 2026-09-28 on Windows 11; macOS not yet run (see `docs/summaries/PHASE2_SUMMARY.md`)
- Every screen works in light and dark mode, at 1280×800 and full screen. → light/dark screenshots of every screen; `app/e2e/fullscreen.spec.ts` (1280×800, real full screen, 1920×1200: no sideways scroll, centred column, popover inside the window)
- Closing the app mid-run and reopening lands on the same run, paused, resumable. → `app/e2e/flows.spec.ts` flow 3 (0 lost, 0 duplicated)

## Phase 3 — Hardening & shipping

Scope rule (owner): build first, perfect later — installable, safe with real data, honest about speed.

| Step | What |
|---|---|
| 3.0 | graphify: privacy audit, `.graphifyignore`, CLAUDE.md navigation section, graph tools |
| 3.1 | Before real use: redaction that doesn't trust the CSV (1.11a), claim-mismatch fix, cheap speed wins + timing per résumé, pre-check 300 s, captive portals, CLI wording |
| 3.2 | Anchored rubric with `overall_score` computed by code; eval harness `engine/eval/` + fictional set of 8; `docs/EVAL.md` |
| 3.3 | First run: Ollama states (not installed / not running / no model / ready), `engine/hardware.py`, hardware prior in the estimate, "more than 4 hours" warning |
| 3.4 | Native-feel quick wins (title-case headers + sort arrows, right-click menu, multi-select, plain destructive buttons, "Name not given", column widths, popover arrows) |
| 3.5 | Packaging: PyInstaller `atlas-engine` (Python 3.12, no OCR), electron-builder (NSIS per-user; DMG arm64/x64), signing by env vars only, packaged-app test |
| 3.6 | CI on Windows and macOS (`.github/workflows/ci.yml`), installers and macOS screenshots as artifacts |
| 3.7 | Docs for the firm: `INSTALL.md`, `TROUBLESHOOTING.md` (generated + drift test), `DATA_HANDLING.md` |
| 3.8 | Verification: suites, eval, leak check, install → fictional screening → uninstall on Windows; `PHASE3_SUMMARY.md` |

**Exit criteria**
- Installs and runs on a clean Mac (Apple Silicon) and a clean Windows 11 machine with no dev tools.
- `leak_check.py` reports 0 on the smoke-test-1 data; 1.11a is done.

## Deferred (must finish before real use)

Found by the first run on real data (`docs/summaries/smoke-test-1.md`); the detailed spec is the 1.11 appendix of the Phase 3 prompt. Phase 3 (step 3.1) closed most of it.

**Done in Phase 3**
- ~~**1.11a Identity redaction from the résumé itself.**~~ **Done (3.1a).** An identity lexicon per résumé (CSV name, the résumé's own name line, every email local part, profile usernames) is redacted everywhere; ordinary-word names only next to another identity word. `python -m engine.tools.leak_check --data-dir local/atlas-data` → **0** (was 10). No longer blocks real data.
- ~~**Claim mismatches about things never claimed.**~~ **Done (3.1b).** Mismatches must name an item from the student's claims (code drops the rest); duplicate quotes are logged separately from not-found ones.
- ~~**Pre-check limit on CPU-only laptops.**~~ **Done (3.1d).** 300 s cold; slow-but-working models are allowed with "about N résumés an hour".
- ~~**CLI / pre-flight / log wording, Windows redirected output.**~~ **Done (3.1e).** Real data folder in the retry hint, `--include-permanent` when every failure is permanent; "2 résumé links are shared by 20 students (10 each)"; UTF-8 stdout.
- ~~**Captive portals**~~ (Phase 1 risk 6). **Done (3.1e).** The run pauses with "Connected to Wi-Fi that needs a sign-in page" instead of failing everyone.

**Still open**
- **Speed on CPU-only laptops.** The cheap wins are in (3.1c: capped answer, `keep_alive` 30 m); see `docs/summaries/phase3/step-3.1-before-real-use.md` for before/after. Real résumés on this laptop were ~141 s each (smoke test 1). This Ollama build *detects* the Intel Arc iGPU (Vulkan) but drops it unless `OLLAMA_IGPU_ENABLE=1` is set — a system setting the owner may choose to try; not changed by Atlas.
- **Scores bunch at the top.** Addressed by the anchored rubric (3.2a) and measured by the eval harness (3.2b) on fictional résumés only; the real set comes from the owner (`docs/EVAL.md`).
- **Real-data coverage.** Still untested on real files: varied layouts, scanned PDFs (OCR is not in the shipped build), résumés over 10 pages, Drive's virus-scan page, Google Doc and folder links, outages mid-run.

**Non-goals of Phase 3** (kept out on purpose; build later if wanted)
- OCR in the shipped build, and any OCR engine swap (RapidOCR etc.): scanned résumés get "OCR isn't installed".
- Auto-update.
- Native macOS sheets and a native toolbar; the remaining items of PHASE2_SUMMARY §7.
- Running more than one screening at a time.
- A screen-reader pass with NVDA or VoiceOver.
- Tuning scores on real résumés (the harness exists; the real set comes from the owner).
- Any speed target beyond the cheap wins in 3.1c.

---

## Design system — Apple-inspired

Rules, not vibes. Every screen follows these.

**Typography**
- macOS: system font stack (`-apple-system, BlinkMacSystemFont`) → renders SF Pro natively.
- Windows: **Inter** bundled. SF Pro's licence only allows use on Apple platforms; shipping it on Windows is a licence violation.
- Scale (px): 34 large title · 22 title · 17 headline/body · 15 callout · 13 footnote · 11 caption.

**Layout**
- 8-pt grid. Generous whitespace; one primary action per screen.
- Radii: 6 controls · 10 cards · 14 sheets/modals.
- Setup screens (1–5) are a focused stepped flow; Results and Settings use a macOS-style sidebar.

**Colour** (light / dark)
- Accent: `#007AFF` / `#0A84FF`. Success `#34C759` / `#30D158`. Warning `#FF9500` / `#FF9F0A`. Danger `#FF3B30` / `#FF453A`.
- Backgrounds are layered greys, not pure white/black. Follow the OS theme by default.
- **Text meets WCAG AA (4.5:1) in both themes** (built in 2.3, tested from `tokens.css`). Several of Apple's system colours don't reach 4.5:1 as text (white on `#007AFF` is 4.0:1, `#34C759` on white 2.2:1), so the colours above are used for non-text UI (focus ring, toggles, sliders, progress, decorative fills) and text uses tuned variants: filled buttons `#0071E3` / `#0A6FE0`, accent text `#0066CC` / `#4AA3FF`, success/warning/danger text and bucket pills with their own -text colours. Tokens: `app/renderer/design/tokens.css`; gallery: `#/design`.

**Materials & chrome**
- macOS: `titleBarStyle: 'hiddenInset'`, `vibrancy: 'sidebar'` on the sidebar.
- Windows 11: `backgroundMaterial: 'mica'`, native window controls on the **right**. Apple layout, Windows conventions — an app that fakes traffic lights on Windows looks broken.

**Motion**
- Spring-based, 200–350 ms. Nothing decorative. Respect `prefers-reduced-motion`.

**Icons**
- SF Symbols are licensed for Apple platforms only → use Lucide (thin stroke, rounded caps) everywhere.

**Language**
- Plain, calm, specific. "Link is private — ask the candidate to share it with 'Anyone with the link'", never "Error 403".

---

## Progress

A fresh session reads this first. One line per step: date · step · tests · what to know.

- 2026-09-27 · 1.0 baseline · 45 tests, 0 skipped · Dev machine is Windows 11. Python 3.14.7 (uv) at `.venv/`; run tests with `.venv/Scripts/python -m unittest discover -s engine/tests -t .`. Kill tests use `Popen.kill()` and **run on Windows** (not skipped). `Database()` retries transient `SQLITE_IOERR` on open (Windows holds `-shm` briefly after a kill). `legacy/QWENTUS` is untracked on purpose (separate git clone). Files must be written with LF (`.gitattributes`); Python `write_text` on Windows writes CRLF, so use `write_bytes` or `newline="\n"`.
- 2026-09-27 · 1.3 csv_loader · 74 tests · `load_csv` is pure (no DB). `csv_loader.FIELDS` mirrors `db.CANDIDATE_INPUT_FIELDS` (a test enforces it). `ingest/links.py` holds pure link helpers (`drive_file_id`, `link_identity`, `with_scheme`) — the downloader in 1.4 should build on it. Row numbers are Excel row numbers (header = 1).
- 2026-09-27 · 1.4 downloader · 115 tests · All recruiter wording is in `engine/errors.py` (`Reason`, `Pause`, `AUTO_RESUME_REASONS`) — use those constants, never literals. `Downloader(url_rewrite=stub.rewrite)` points Drive at `engine/tests/stubs/drive_stub.py`. On Windows a refused localhost connect takes ~2 s, so stub tests need connect_timeout ≥ 5 s. `TransientError.probe` says which health probe the worker must run.
- 2026-09-27 · 1.5 extract · 144 tests · `PdfExtractor(ocr=…).extract(path)` raises `FileNotFoundError` for a missing file (worker should re-download, not fail). `Extraction.page_count` is the REAL page count; flag "pages 11+ not read" when `page_count > MAX_PAGES`. Sections `header` and `personal` must never reach the LLM; use `PROMPT_PRIORITY` for budget order. Fixtures in `engine/tests/fixtures.py` (`make_ten_page_resume`, `PAGE7_PROJECT_LINE`, `simple_resume_text(grade)` for the Ollama stub).
- 2026-09-27 · 1.6 llm · 200 tests · DB is schema v2 (`evaluations.flags`, `save_evaluation(flags=…)`). Worker must call `redact.scoring_input(candidate_row, rt.text, rt.sections)` then `Scorer.score(ctx, sections, full_text)`; add `Flag.PAGES_NOT_READ` when `page_count > 10`. `Scorer` lets `SystemUnavailable`/`TransientError(probe="ollama")` propagate. `precheck()` returns a digest for caching in settings.
- 2026-09-27 · 1.7 worker · 233 tests (~28 s) · `Worker(db, data_dir, downloader, extractor, scorer_factory, health)`; `start` = filters + recovery + threads; `resume` also restarts a completed run (Retry failed). CLI must call `configure_logging(data_dir)`. Stubs: `engine/tests/stubs/{base,drive_stub,ollama_stub}.py` (`DriveStub(delay=)`, `OllamaStub(delay=)`, `.script("garbage", …)`, `go_offline()`). Stub scores = "grade N out of 100" in the résumé.
- 2026-09-27 · 1.8 export · 245 tests · `export_csv(db.export_rows(run), compute_buckets(db.scored_rows(run), …, overrides=db.latest_overrides(run)).placements, path, view=…)`. Raises `ExportError` (recruiter wording) for a locked file or full disk.
- 2026-09-27 · 1.9 cli · 255 tests (~40 s) · `engine.cli.main(argv, stdout=, stdin=, url_rewrite=, health=, poll_interval=, download_interval=, idle_interval=)` — keyword args are test seams (stubs). Pre-check cache lives in settings key `model_prechecks`. Use `PYTHONIOENCODING=utf-8` on Windows consoles.
- 2026-09-27 · 1.10 e2e · 257 tests (256 run, 1 skipped: live) · **Phase 1 done.** Next session: read `docs/summaries/PHASE1_SUMMARY.md` §6 (risks) and §7 (what Phase 2 needs: expose `Worker.recover()`, add `Worker.cancel()`, clear-filters DB method, model pull). The owner still has to run `ATLAS_LIVE=1` and try real Drive links.
- 2026-09-28 · 2.0 deferred list + engine gaps · 310 tests (309 run, 1 skipped: live) · **Deferred** section added (1.11a blocks real data; `prompts/phase1-11.md` is missing, other items listed from smoke test 1). `Worker.recover()` runs once per worker (the server calls it at boot; `start()` calls it if nobody did). `Worker.cancel()`, `Worker.attach()` + `run_waiting_to_resume(db)` for auto-resume at boot. Filters apply **once**, when a run leaves draft; `Database.clear_filters` (draft/paused) never touches the locked config. One worker = one active run: starting another while one is *running* raises `WorkerBusyError`; paused/completed/cancelled runs are detached. `load_table` reads .csv/.xlsx (`load_csv` wraps it; .xls refused). `OllamaClient.pull()` yields `PullProgress`; the Ollama stub has `/api/pull`. `engine/estimate.py` is pure; scoring times per model live in settings `scoring_seconds`.
- 2026-09-28 · 2.1 server · 349 tests (348 run, 1 skipped: live) · `engine/server.py`: `Engine` (all behaviour, no HTTP) + `create_app(engine, token=, port=)`; tests use `TestClient(app, base_url="http://127.0.0.1:<port>")` because the Host must match. `EngineOptions` = test seams (stub URLs, fast intervals). Token via `ATLAS_TOKEN` env (or `--token`). `--watch-stdin` stops the engine when the app dies (reads fd with `os.read`: a buffered stdin read in a daemon thread crashes Python at exit on Windows). Ready line written as bytes. After changing any route/model run `python -m engine.server --openapi app/src/shared/api-schema.json` or `test_server` fails. Multipart parsed by hand (no python-multipart). Filter rule moved to `engine/filters.py`. Starlette 1.7 warns TestClient wants `httpx2` (not approved; warning silenced in tests).
- 2026-09-28 · 2.2 electron shell · engine 349 (unchanged) · Vitest 33 · Playwright 7 · `app/` (electron-vite 5 + Vite 7: electron-vite doesn't support Vite 8 yet; React via esbuild JSX, no @vitejs/plugin-react). Layout: `main/`, `preload/`, `renderer/`, `src/shared/`. Run from `app/`: `npm test`, `npm run typecheck` (3 tsconfigs: node, web, e2e), `npm run e2e` (builds, then Playwright launches `out/main/index.js`, which spawns `<repo>/.venv` Python). **VS Code sets `ELECTRON_RUN_AS_NODE=1`** in its terminals: `e2e/helpers.ts` removes it, and running `electron` by hand from such a shell starts plain Node. After a blocked navigation Playwright's page context goes stale; ask main (`app.evaluate`) instead. Dev/test env: `ATLAS_USER_DATA`, `ATLAS_E2E=1` (no materials; `globalThis.__atlasTest` hooks in main), `ATLAS_PYTHON`, `ATLAS_ENGINE_MODULE`, `ATLAS_OLLAMA_URL`; all ignored when packaged. Don't run Prettier on `src/shared/api-types.ts` (generated; `.prettierignore`).
- 2026-09-28 · 2.3 design system · engine 349 · Vitest 148 (99 contrast checks) · Playwright 10 · `app/renderer/design/` (import from `./design`). Tokens are scoped to `[data-theme]`, so light and dark can render side by side; `html[data-platform]` and `html[data-material]` are set from `app.info()`. Text uses the `-text` / `-strong` tokens; the PLAN colours are non-text only (contrast test). Modals (`Sheet`, `Alert`, `Popover`) set `inert` on `#root`, trap Tab, answer Esc only when top-most, and return focus. `MotionConfig reducedMotion="user"` at the root. Screenshots: `e2e/screens.ts` `capture(page, name, theme, fullScrollSelector?)` writes `docs/summaries/phase2/screens/<name>-<theme>.png`; `setTheme()` switches like Settings will. TypeScript 7 checks side-effect imports: ambient declarations live in `renderer/assets.d.ts` (a file with no imports/exports). 5 tsconfigs: node, web, e2e, test (+ root).
- 2026-09-28 · 2.4 welcome + upload/model · engine 349 · Vitest 157 · Playwright 17 · Renderer infrastructure: `api(route, {params, query, body})` (typed from `api-types.ts`; throws `ApiFailure` with the engine's words), React Query for engine state, zustand only for navigation (`useNav`) and in-progress setup choices (`useSetup`). E2E harness: `startStubs()` runs `python -m engine.tests.e2e_stubs` (Drive + Ollama stubs, fictional fixtures in a temp dir, control API for offline/online/delay); `launchWithStubs()` sets `ATLAS_ENGINE_MODULE=engine.tests.e2e_engine`; answer native dialogs with `nextOpenDialogReturns` / `nextSaveDialogReturns` / `nextMessageBoxAnswers`. Fixture grades → with shortlist 60, band 50, min 15: 15 shortlisted (7 filled), 3 cutoff, 4 rejected, 3 failed.
- 2026-09-28 · 2.5 criteria + cutoffs + review · engine 349 · Vitest 162 · Playwright 20 · Kit gained `ScoreBand` (two `role="slider"` handles; reuse it in Results' Adjust cutoffs) and `Chip`. Each setup step PATCHes the draft on Continue; Review's Start does PATCH (full config) → `/table/confirm` → `/start`. Filter counts always come from `GET /runs/{id}/filters/preview` (the worker's own rule). Review warns before Start if another run is `running` (one run per engine). `capture()` scrolls `.screen-scroll` to the top before each screenshot.
- 2026-09-28 · 2.6 progress · engine 349 · Vitest 162 · Playwright 24 · Progress screen reads only `GET /runs/{id}/progress` (refetched on run events, debounced 250 ms, plus a 5 s poll) and the run event stream (backlog replays on open). No names on this screen (ids + RA only; a test checks). Engine event wording changed for the feed (`db._status_event`: "Screening started/resumed/complete/cancelled", "Paused: <reason>" or the reason itself when it already starts with "Paused"; "students" not "candidates"). e2e helpers: `startScreening(launched, stubs, {minimum})`, `waitForStatus(page, status)`.
- 2026-09-28 · 2.7 results · engine 350 · Vitest 166 · Playwright 32 · Results reads only `GET /runs/{id}/results`: a summary query (`limit: 1`: counts, notes, histogram, delta, total) and a list query per bucket (`limit: 5000`), both with preview `?shortlist&band&min` (debounced 150 ms, `keepPreviousData`). Nothing saved until Save cutoffs (`PATCH /runs/{id}/cutoffs`). Override via the detail sheet; export via `files.saveExport`; Needs attention retries via `retry-failed` then goes to Progress. Engine: name sort puts nameless rows last. `Popover` has a `width` prop. e2e `results.spec.ts` runs serially on one screening.
- 2026-09-28 · 2.8 settings · engine 351 · Vitest 171 · Playwright 40 · Settings is one column of cards; every change is an optimistic `PUT /settings` of just that field (no Save). Main re-reads keep-awake/notify right after a successful `PUT /settings` or `DELETE /data` (`settingsWrite` → `RunWatcher.preferencesChanged`). `POST /runs` now also applies `default_model`. Delete a run = Alert → `DELETE /runs/{id}` (VACUUM) + `nav.forget`; Delete all = typed DELETE → `DELETE /data` → `resetQueries` → Welcome. `Placeholder` removed (setup on a started run goes to its screen). e2e: `recordShellOpens`/`shellOpened` stand in for Show in folder.
- 2026-09-28 · 2.9 e2e + performance · engine 351 · Vitest 174 · Playwright 52 · **Phase 2 done (Windows).** `e2e/flows.spec.ts` = DoD flows 1–5 (each in a fresh app; cleanup pre-answers "Close Atlas?" or a running screening hangs `close()`). `e2e/keyboard.spec.ts` (Tab-only setup, `:focus-visible` at every stop), `e2e/perf.spec.ts` (2,000 rows seeded by `engine/tests/e2e_seed.py` through `Database` methods; median live-cutoff response 85–93 ms, 0 long tasks), `e2e/fullscreen.spec.ts` (1280×800, full screen, 1920×1200), `e2e/errors.spec.ts`. Rule 16 is a Vitest contract (`tests/contracts.test.ts`). Fixed: `Stepper` wrote a stale value back on blur (shortlist 62 on screen, 61 saved); setup steps now `setQueryData` the PATCH reply before `next()`; About showed Electron's version (`__ATLAS_VERSION__` from package.json); `scrollbar-gutter: stable both-edges`. Preview debounce 80 ms. Next session: read PHASE2_SUMMARY §8–9; 1.11a still blocks real data; macOS untested; packaging is Phase 3.
- 2026-10-01 · 3.0 graph · engine 354 · Vitest 174 · Playwright 52 · Privacy audit of `graphify-out/`: 0 `local/` paths, 0 RA numbers, 0 data file names; the 1 e-mail is the vis-network library's in `graph.html`, the digit runs are mtimes/hashes. `.graphifyignore` (gitignore syntax, read by graphify's `detect.py`) excludes local/, .venv/, node_modules/, app/out/, app/dist/, dist/, build/, legacy/, graphify-out/ — verified with `detect()` with and without `.gitignore`. `graphify update .` (no LLM) pruned 453 legacy nodes → 2,738 nodes. Only `GRAPH_REPORT.md` is committed. Tools: `python -m engine.tools.graph_audit` (must print [OK ] ×3), `python -m engine.tools.graph_query callers|callees|find|file X`.
- 2026-10-01 · 3.1 before real use · engine 378 · Vitest 176 · Playwright 52 · **1.11a done**: identity lexicon (`engine/llm/identity.py`: CSV name + résumé name line + email local parts + profile usernames; ordinary-word names only next to another identity word, list in `common_words.txt`); `leak_check` on smoke-test-1 data 10 → **0**. Mismatches only about claimed items (`verify.names_a_claim`); duplicate vs not-found quotes logged separately. Answer caps in schema + prompt (5 evidence ≤ 20 words, 4 reasons ≤ 25, 5 mismatches); `keep_alive` 30m; schema v3 stores `prompt_eval_seconds`/`eval_seconds`. Speed: no reliable change on the short fictional answers (machine drift ±50% > any effect; prefill only 14%); the caps cut long answers. iGPU: Ollama drops the Arc iGPU unless `OLLAMA_IGPU_ENABLE=1` (not changed). Pre-check 300 s; slow-but-working allowed (`slow` in the API). Captive portals: `HealthProbe.internet_problem()` needs 204 from generate_204 → pause "Connected to Wi-Fi that needs a sign-in page" (auto-resume); the worker also asks before failing "not a PDF". CLI: real data dir in the retry hint, UTF-8 stdout; pre-flight "N résumé links are shared by M students". Test probes point `check_urls` at the Drive stub's `/generate_204`. Fixed flaky `TimingHistoryTests` and the e2e close helper (pre-answers "Close Atlas?").
- 2026-10-01 · 3.2 rubric + eval · engine 386 · Vitest 176 · Playwright 52 · Anchored rubric (`engine/llm/rubric.py`: 90+/70/50/30/10 per sub-score, "90+ is rare"); `overall_score` computed by code (`WEIGHTS`, criteria_fit 0.30), the model's schema (`ModelAnswer`) has none and a stray one is dropped. Eval harness `python -m engine.eval run --set DIR --model NAME` (`engine/eval/`), fictional set of 8 at `engine/eval/sets/fictional/` (regenerate: `make-fictional`). Real qwen3:8b: Spearman 0.99, groups in order, spread 29.8 (10–88), 0 at 95+, stability 0.0, 0 leaks, bucket agreement 88% (off-role ML student shortlisted at 68). Three original samples: 95/75/30 → 87/54/10. `docs/EVAL.md` for the owner's real set in `local/eval/`. Graph audit now judges by indexed files + traceability (the repo's own mentions of local/… pass).
- 2026-10-01 · 3.3 first run + hardware · engine 401 · Vitest 176 · Playwright 57 · Welcome shows Ollama in four states with one action each: not installed → *Open download page* (browser, fixed URL; Atlas never installs), installed but stopped → *Start Ollama* (`POST /ollama/start`: `engine/ollama_setup.py` finds the tray app / `Ollama.app` / `ollama serve` and launches it detached; 404/409 with manual steps), no model → *Get a model* (pull sheet, qwen3:8b), ready. `engine/hardware.py` (CPU name, cores, RAM, OS, arch, Apple silicon, GPU in use from Ollama `/api/ps`) in `/system` and Settings → About. Estimate: hardware prior when nothing else is known (cpu 140 s from smoke test 1; apple_silicon 35, gpu 15 are guesses; range ×0.5–×2). `long_run` (middle of the range > 4 h) → Review asks first; Settings toggle `warn_long_runs` (default on). E2E never touches the real Ollama (stub finder/starter).
- 2026-10-02 · 3.4 native-feel quick wins · engine 402 · Vitest 188 · Playwright 59 · Only the cheap §7 items. Title-case Results headers that sort when clicked (engine `sort` = rank/name/department/cgpa/score, `order` asc/desc or the column's own first direction; blanks last; the response says how it sorted, the arrow follows it). Native right-click menu built in main (`app/main/menus.ts`, `atlas:row-menu` validated by `validateRowMenu`): Show details / Move to ▸ other buckets… / Copy RA number (main writes the clipboard); title case on macOS. Multi-select (click, Shift, Cmd on macOS / Ctrl on Windows, Shift+arrows, Cmd/Ctrl+A) with a selection bar and `MoveSheet`: one note, one override request per candidate, retry only the failed. "Delete all data…" plain; "Name not given" secondary; column max widths (header reserves the scroll-bar gutter); popover arrow (`arrowOffset`). Results screenshots now go to `docs/summaries/phase3/screens/`. E2E answers native menus by replacing `Menu.buildFromTemplate`'s popup (`nextMenuPicks`).
- 2026-10-02 · 3.5 packaging · engine 402 · Vitest 188 · Playwright 59 + 1 packaged · PyInstaller one-folder engine (`packaging/engine.spec`, UTF-8 mode, OCR/tests/eval/tools excluded): Windows 68.5 MB / 99 files; smoke test (`packaging/smoke_engine.py`) ready in 4.8 s, /health, token, /shutdown. **Built locally with Python 3.11.3** in `build/venv-engine` (3.12 isn't installed here; installing it is a stop condition): release builds use 3.12 in CI. electron-builder (`app/electron-builder.yml`, `npm run dist`): NSIS one-click per-user x64, no admin, userData kept on uninstall; DMG per arch in CI; appId com.atlas.screening; en-US language pack only; placeholder icon `packaging/icons/`. Installer **125.0 MB** (131,049,580 bytes), installed 390 MB; unsigned (`docs/SIGNING.md`). Packaged-app Playwright test passes (16 s). VS Code holds `.asar` files open → local builds go outside the repo (`-c.directories.output`).
