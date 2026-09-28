# Phase 2 Summary — the Atlas desktop app

## 1. Overview
Atlas is now a desktop app. A recruiter:
1. opens it, presses **New screening** and drops in a CSV or Excel file;
2. reads a plain pre-flight report and picks a local model, which is pre-checked;
3. writes what they're looking for and sets the score bands (with an optional minimum and CGPA/department filters);
4. sees an honest time estimate and starts.

While it runs, Progress shows counts, a measured finish time and exactly why anything paused. Nothing is lost if Ollama stops, the internet drops or Atlas is closed; the run continues where it stopped.

**Results** sorts everyone into Shortlisted / Cutoff / Rejected:
- the cutoffs can be moved live (nothing is saved until the recruiter says so);
- each candidate opens to show why they scored as they did;
- anyone can be moved with a note;
- a view can be exported as an Excel-safe CSV.

**Settings** holds the theme, defaults, keep-awake and notifications, and deleting data.

It is built as Electron + React (the renderer holds no business logic) talking through a validated bridge to Electron main. Main owns the only copy of a per-launch token and talks to the Python engine, now a local FastAPI server on 127.0.0.1.

- **Tests:** engine 351 (1 opt-in live test skipped), Vitest 174, Playwright 52 (driving the real app against the real engine, with stub Drive and Ollama and fictional students).
- **Screenshots:** 44 (22 screens × light and dark).
- **Platform:** built and tested on Windows 11 only. **macOS has not been run.**
- **Real data:** real student data was not read, printed or committed in this phase. Real use is still blocked by 1.11a (identity redaction from the résumé itself).

## 2. One screening, click by click
Take "Screening 28 Sept": 25 fictional students in `students.xlsx`, minimum 15.

1. **New screening** → `window.atlas.api.request('POST', '/runs', {name})`. Preload forwards it over IPC. Main checks that the sender is Atlas's window and that the route and body are in the engine's own OpenAPI schema (`validate.ts`), then calls the engine with the token (`EngineProcess.request`). The engine's `Guard` checks the Host and token in constant time, and `Engine.create_run` makes a draft with Settings' defaults (cutoffs, minimum, model).
2. **Choose file…** → `files.openTable()`. Main shows the native dialog and keeps the path; the renderer gets only an opaque handle. `files.uploadTable(run, {handle})`: main reads the file (≤ 20 MB) and posts it as multipart to `POST /runs/{id}/table`. The engine runs `load_table` (xlsx or CSV, by magic bytes) and returns the pre-flight report, which the screen shows as-is.
3. **Model** → `GET /models`, then `POST /models/{name}/precheck` (cached per model + digest). **Continue** → `PATCH /runs/{id} {model_name}`, and the reply is stored in the cache before moving on.
4. **Criteria** and **Cutoffs** each `PATCH` their part. Cutoffs previews filters live with `GET …/filters/preview`.
5. **Review** → `GET …/estimate` (pre-check, history or measured). **Start** = `PATCH` (configure) → `POST …/table/confirm` (students inserted, all or nothing) → `POST …/start` (worker; filters applied once).
6. **Progress:**
   - main follows the run's SSE stream (`/runs/{id}/events`, `Last-Event-ID`) and forwards events; the screen refetches `GET …/progress` on each (debounced), with a 5 s poll as a safety net;
   - main also follows the app stream (`/events`): a `run_status` of *running* holds `powerSaveBlocker`, and *completed* or a pause needing the recruiter sends a notification if the window isn't in front.
7. **Ollama stops** → the worker pauses the run ("Ollama isn't running") and hands the in-flight résumé back unscored. The health probe sees Ollama return and resumes; nobody fails.
8. **The window is closed** → "Screening is running. Close Atlas?" → main calls `POST /shutdown`; the engine pauses the run "Atlas was closed" within 8 s and exits. On reopening, Welcome offers **Resume**.
9. **Results** → `GET …/results` twice: counts, notes, histogram and delta (`limit: 1`), and the rows of the chosen bucket (`limit: 5000`). `buckets.compute_buckets` places everyone at request time. Moving a handle re-asks with `?shortlist&band&min` (a preview, saved only by `PATCH …/cutoffs`).
10. **Move to…** → `POST …/candidates/{cid}/override {to_bucket, note}`. **Export** → `files.saveExport(run, view)`: main shows the save dialog, and the engine writes the CSV atomically to that path (UTF-8 with BOM, formula-escaped).

```mermaid
sequenceDiagram
    participant R as Renderer (React)
    participant P as Preload (window.atlas)
    participant M as Electron main
    participant E as Engine (FastAPI, 127.0.0.1)
    participant W as Worker + SQLite
    R->>P: api.request('POST','/runs')
    P->>M: IPC invoke
    M->>M: sender check, route + body vs OpenAPI schema
    M->>E: HTTP + Bearer token (only main has it)
    E->>W: create_run + configure_run (defaults)
    R->>P: files.openTable / uploadTable(handle)
    M->>E: multipart /runs/{id}/table (bytes read in main)
    E-->>R: pre-flight report
    R->>E: PATCH model, criteria, cutoffs (via main)
    R->>E: PATCH, table/confirm, start (via main)
    E->>W: add_candidates, Worker.start
    W-->>E: events rows (Scored N, Paused: …)
    E-->>M: SSE /runs/{id}/events, /events
    M-->>R: forwarded events → refetch /progress
    M->>M: run_status → keep-awake, notification
    R->>E: GET /results?shortlist&band&min (preview)
    E->>W: results_rows → compute_buckets (view time)
    R->>M: files.saveExport → native save dialog
    M->>E: POST /export {view, path}
```

## 3. Screen by screen
All screenshots are 1280×800 at 2× from the real app (engine plus stubs, fictional students), with materials off for repeatability. The one exception is the large-display row, which is 1920×1200 CSS pixels.

| Screen | What it's for | Light | Dark |
|---|---|---|---|
| **Welcome** | Greeting, New screening, whether Ollama is running and how many models are installed, where data lives, recent screenings | ![](phase2/screens/welcome-light.png) | ![](phase2/screens/welcome-dark.png) |
| Welcome, unfinished run | A Resume card with the pause reason, above everything else | ![](phase2/screens/welcome-resume-light.png) | ![](phase2/screens/welcome-resume-dark.png) |
| **1 · Students & model** (empty) | Name the screening; drop or choose a file | ![](phase2/screens/upload-empty-light.png) | ![](phase2/screens/upload-empty-dark.png) |
| 1 · Students & model (checked) | The pre-flight report in plain words; models with pre-check status | ![](phase2/screens/upload-model-light.png) | ![](phase2/screens/upload-model-dark.png) |
| Get another model | Suggested models, with download progress | ![](phase2/screens/model-pull-light.png) | ![](phase2/screens/model-pull-dark.png) |
| **2 · Criteria** | Templates, a free-text box, a length hint, the privacy and lock notes | ![](phase2/screens/criteria-light.png) | ![](phase2/screens/criteria-dark.png) |
| **3 · Cutoffs** | The two-handle score band, a minimum, CGPA and department filters with live counts | ![](phase2/screens/cutoffs-light.png) | ![](phase2/screens/cutoffs-dark.png) |
| **4 · Review** | The estimate first, tips, every choice with Edit, Start screening | ![](phase2/screens/review-light.png) | ![](phase2/screens/review-dark.png) |
| **Progress** | Ring, stages, measured finish time, activity by number and RA only, feed | ![](phase2/screens/progress-light.png) | ![](phase2/screens/progress-dark.png) |
| Progress, paused | The exact reason; "continues automatically" or Resume | ![](phase2/screens/progress-paused-light.png) | ![](phase2/screens/progress-paused-dark.png) |
| Progress, complete | Success, needs attention grouped by reason, View results | ![](phase2/screens/progress-done-light.png) | ![](phase2/screens/progress-done-dark.png) |
| **Results** | Buckets with counts, ranked list, fill/tie/override badges, the engine's notes | ![](phase2/screens/results-light.png) | ![](phase2/screens/results-dark.png) |
| Results on a large display | 300 fictional students at 1920×1200 CSS pixels | ![](phase2/screens/results-large-display-light.png) | ![](phase2/screens/results-large-display-dark.png) |
| Candidate detail | Score, rank, six sub-scores, why, quoted evidence, claims not found, facts, Move to… | ![](phase2/screens/candidate-light.png) | ![](phase2/screens/candidate-dark.png) |
| Adjust cutoffs | Histogram and band; live preview with "−7 from Shortlisted, +7 to Cutoff"; Save | ![](phase2/screens/adjust-cutoffs-light.png) | ![](phase2/screens/adjust-cutoffs-dark.png) |
| Needs attention | Failures grouped by reason, with what to do, Retry failed, Retry all | ![](phase2/screens/needs-attention-light.png) | ![](phase2/screens/needs-attention-dark.png) |
| Export | Choose a view (with counts), then the native save dialog | ![](phase2/screens/export-light.png) | ![](phase2/screens/export-dark.png) |
| **Settings** | Appearance, defaults, while screening | ![](phase2/screens/settings-light.png) | ![](phase2/screens/settings-dark.png) |
| Settings, data | Data folder, storage, screenings with Delete, Delete all data | ![](phase2/screens/settings-data-light.png) | ![](phase2/screens/settings-data-dark.png) |
| Delete all data | Typed confirmation | ![](phase2/screens/delete-all-light.png) | ![](phase2/screens/delete-all-dark.png) |
| Atlas couldn't start | When the engine can't run: a plain sentence and Restart Atlas | ![](phase2/screens/engine-failed-light.png) | ![](phase2/screens/engine-failed-dark.png) |
| Design gallery (`#/design`) | Every component in both themes (development only) | ![](phase2/screens/design-light.png) | ![](phase2/screens/design-dark.png) |

## 4. Steps
| Step | What was built | Tests after the step (engine / Vitest / Playwright) | Summary |
|---|---|---|---|
| 2.0 | Deferred list (1.11a blocks real data); worker `recover`/`attach`/`cancel`, one active run, filters once; `.xlsx` loading; model pull; time estimate; `clear_filters` | 310 / – / – | [step-2.0-engine-gaps.md](phase2/step-2.0-engine-gaps.md) |
| 2.1 | `engine/server.py`: every route, Host + token guard, SSE, OpenAPI export, graceful shutdown, stdin watch | 349 / – / – | [step-2.1-server.md](phase2/step-2.1-server.md) |
| 2.2 | Electron shell: engine process, bridge, IPC validation from the schema, SSE in main, keep-awake, notifications, CSP and lockdown, generated API types | 349 / 33 / 7 | [step-2.2-electron-shell.md](phase2/step-2.2-electron-shell.md) |
| 2.3 | Design system: tokens (light/dark), 24 components, contrast test, gallery | 349 / 148 / 10 | [step-2.3-design-system.md](phase2/step-2.3-design-system.md) |
| 2.4 | Welcome; Students & model (pre-flight, model picker, pull); e2e harness | 349 / 157 / 17 | [step-2.4-welcome-upload-model.md](phase2/step-2.4-welcome-upload-model.md) |
| 2.5 | Criteria, Cutoffs (`ScoreBand`), Review with estimate | 349 / 162 / 20 | [step-2.5-criteria-cutoffs-review.md](phase2/step-2.5-criteria-cutoffs-review.md) |
| 2.6 | Progress; recruiter wording for run events | 349 / 162 / 24 | [step-2.6-progress.md](phase2/step-2.6-progress.md) |
| 2.7 | Results: buckets, list, detail, override, live cutoffs, export, needs attention | 350 / 166 / 32 | [step-2.7-results.md](phase2/step-2.7-results.md) |
| 2.8 | Settings; default model applied by the engine; keep-awake changes reach main at once | 351 / 171 / 40 | [step-2.8-settings.md](phase2/step-2.8-settings.md) |
| 2.9 | Five end-to-end flows, keyboard-only setup, 2,000-row performance, full screen and a large display, error screen, rule-16 test; four bugs fixed | 351 / 174 / 52 | [step-2.9-e2e-performance.md](phase2/step-2.9-e2e-performance.md) |

## 5. Definition of done: evidence
All run on Windows 11 (22 cores), Python 3.14, Node 24, Electron 44, from the repo root or `app/`.

- [x] **All suites green.**
  - Engine: `python -m unittest discover -s engine/tests -t .` → `Ran 351 tests … OK (skipped=1)`. The skip is the opt-in live test. Both kill tests are included: `test_kill` (20 kills of a DB writer) and `test_worker_kill` (20 kills of the real worker).
  - Vitest: `npx vitest run` → `12 files, 174 passed`.
  - Playwright: `npm run e2e` → `52 passed`. It runs the built app, the real engine and the stubs.
  - Also clean: `npm run typecheck` (4 tsconfigs, strict), `npm run lint` and `prettier --check .`.
- [x] **E2E 1–5 pass** (`e2e/flows.spec.ts`, all `ok`):
  1. **XLSX happy path:** 15 shortlisted with 7 "Filled to minimum"; live cutoffs show "−7 from Shortlisted" before saving, then Save; an override with a note. The exported file is read back: BOM, 25 rows, one "Moved by recruiter", 7 Shortlisted, and no cell starting with `= + @ \t \r`.
  2. **Ollama stops mid-run:** paused with "Ollama isn't running … continue automatically"; it resumes by itself and finishes 22 scored + 3 (the three broken links). No failure mentions Ollama.
  3. **Closed mid-run and reopened:** 0 lost, 0 duplicated. The window is closed with "Close Atlas" confirmed, and the run is paused "Atlas was closed". Resume from Welcome, then Progress, and it completes. The test checks that the results total is 25, that all 25 RA numbers are unique, and that each scored candidate has exactly one "Scored" event (the three failures have none). The test prints the counts before closing, after reopening and at the end.
  4. **No link column:** "This file can't be used yet … No column for Résumé link"; Continue is disabled; the run has 0 students.
  5. **Theme across a restart:** Dark is chosen, Atlas quits and reopens, and both `html[data-theme]` and `nativeTheme.themeSource` are `dark`.
- [x] **No scoring or bucketing logic in the renderer.**
  - `tests/contracts.test.ts` ("rule 16") scans every renderer source. No candidate score is compared with anything (`score >= …`, `… < row.score`), and nothing computes buckets, ranks or a sort by score. A throwaway file with `row.score >= 60 ? 'shortlisted' : 'rejected'` was shown to fail it.
  - A manual `grep -rn "'shortlisted'\|'cutoff'\|'rejected'" app/renderer` finds bucket names only as:
    - display labels and icons (sidebar, export sheet, Move to…);
    - colour or tone chosen from the engine's `row.bucket` / `placement.bucket`;
    - the `bucket` filter sent to `GET /results`;
    - the `ScoreBand`'s three coloured zones, which draw the cutoff *values* the recruiter is choosing, not where any candidate lands.
  - The "All candidates" export count is the engine's `total`, not a sum made in the renderer.
- [x] **The token never reaches the renderer.**
  - Playwright `shell.spec.ts › the token never reaches the renderer`: the token (read from main via the test hook) appears nowhere the renderer can see. That covers the bridge object's keys, values and function sources, the responses of `/system`, `/settings`, `app.info` and `engineState`, the DOM, `localStorage`, `sessionStorage` and cookies. "bearer" appears nowhere either, and the bridge exposes exactly `api, app, events, files, notifications`.
  - Vitest `contracts.test.ts › the token stays in main`: no renderer or preload source mentions `ATLAS_TOKEN`, `authorization`, `bearer` or `authHeaders`.
  - Routes only main may call are refused from the renderer (`routes reserved for main are refused`): `/shutdown`, the table upload, both export routes and the SSE streams.
- [x] **CSP and navigation blocking.**
  - `shell.spec.ts › the CSP blocks remote content, inline scripts and eval`: a remote `fetch`, a remote script, an inline script and `eval` (inside `setTimeout`, because DevTools' evaluate is exempt) are all blocked.
  - `› navigation away from the app is blocked`: `location.href = 'https://example.com'` leaves the window on the app.
  - `› no Node in the renderer and no new windows`: `require` and `process` are undefined, and `window.open` returns null.
  - `› the window has … the security preferences`: `contextIsolation`, `sandbox`, no `nodeIntegration`, `webSecurity`.
- [x] **Light and dark screenshots of every screen:** 22 screens × 2 in `docs/summaries/phase2/screens/` (section 3 above), each looked at after capture. Fixes made from looking include:
  - the estimate had fallen below the fold;
  - the cutoff popover overflowed;
  - the detail sheet showed a duplicate score pill;
  - the Needs attention rows were misaligned;
  - the Model select was full width;
  - About showed Electron's version;
  - the Settings column sat off-centre by the scrollbar's width.
- [x] **Contrast and keyboard-only tests.**
  - Contrast: `renderer/design/contrast.test.ts` (99 checks) computes WCAG ratios from `tokens.css` itself. Text is ≥ 4.5:1 and UI parts ≥ 3:1, in both themes, with translucent colours blended over their real surface.
  - Keyboard: `e2e/keyboard.spec.ts` sets up and starts a screening with Tab, Space, Enter, the arrows, typing and Esc only. It checks every focus stop shows a `:focus-visible` ring, and checks the run holds exactly what was chosen. Results' listbox (arrows, Home/End, Page Up/Down, Enter) and sheets and alerts (focus trap, Esc) have their own tests.
- [x] **PLAN's Deferred section, with 1.11a blocking.** PLAN.md → "Deferred (must finish before real use)" opens with **1.11a Identity redaction from the résumé itself — BLOCKS use with real student data**, followed by the smoke-test items.
- [x] **Docs:**
  - ten step summaries in `docs/summaries/phase2/`, each with screenshots where there's a UI;
  - this file;
  - CHANGELOG lines for 2.0–2.9;
  - PLAN Progress lines for 2.0–2.9;
  - CLAUDE.md markers (`server.py`, `app/*` done);
  - ARCHITECTURE updated where the design changed (section 6).
- [x] **Performance** (`e2e/perf.spec.ts`, 2,000 fictional scored students seeded through the state machine):

  | Measure | Result |
  |---|---|
  | Opening Results | 236–289 ms across runs |
  | Long tasks while opening, scrolling and moving cutoffs | 0 |
  | Rows in the DOM | < 60 |
  | Live cutoff response, median | **85–93 ms** across runs (budget 200 ms) |
  | Live cutoff response, worst (the first press, which also shows the preview banner) | 199–222 ms across runs (test limit 300 ms) |
- [x] **PLAN's Phase 2 exit criteria.**
  - *"Every screen works in light and dark, at 1280×800 and full screen":* screenshots of every screen in both themes (above), plus `e2e/fullscreen.spec.ts`. That test visits Welcome, Students & model, Results, the candidate sheet, Adjust cutoffs and Settings at 1280×800, in real full screen (`setFullScreen`) and at 1920×1200 CSS pixels. On each it checks that nothing scrolls sideways, that the content column stays centred and at most 900 px wide, and that the popover stays inside the window.
  - *"Closing mid-run and reopening lands on the same run, paused, resumable":* flow 3 above.

## 6. Design changes vs ARCHITECTURE (all reflected in it now)
**Engine and API**
1. **One active run per engine,** and filters apply once at the first start (2.0). Starting a second screening while one runs → "Another screening is running. Pause it before starting this one." Review says so before Start.
2. **Cancel doesn't wait for the model call** (2.0). The last thread cleans up.
3. **`/table` instead of `/csv`,** because Excel files are accepted too (2.0/2.1). `band` instead of `maybe` in query names.
4. **Export has two routes:** `GET` (download) and `POST {view, path}`, which writes to the path the native save dialog chose (2.1).
5. **A completed run may still change its cutoffs** (only the cutoffs; rule 11 holds for everything else) (2.1).
6. **The token goes in the environment, not the command line.** The engine also watches stdin, so it exits if Electron dies. Shutdown waits 8 s to stay under Electron's 10 s grace (2.1).
7. **The engine applies Settings' defaults,** including the default model, when a draft is created (2.8).
8. **Recruiter wording for run events** in the engine ("Screening started", "Paused: …", "students", not "candidates") (2.6). Name sort puts students without a name last (2.7).

**App**

9. **The route allowlist is derived from the engine's OpenAPI schema,** minus main-only routes. Uploads and exports go by handle, bytes or save dialog, so the renderer never sees a path (2.2).
10. **Setup has four numbered steps** (Students & model, Criteria, Cutoffs, Review), and Welcome is the entry point. The draft run is created at New screening (2.4).
11. **Accessible colour variants.** Apple's accent and label colours are deepened slightly where they fail 4.5:1 as text (2.3).
12. **Results' cutoffs are a popover with a live preview,** not permanently visible sliders. Overrides live in the detail sheet (2.7).
13. **Settings is one column of cards, not a sidebar,** and applies changes at once (2.8).

## 7. What still feels un-Apple-like
Honest, from looking at every screenshot (Windows only):
1. **It's never been seen on a Mac.** SF Pro, the `hiddenInset` traffic lights, sidebar vibrancy and the macOS focus ring are coded but unobserved. On Windows, Mica is coded, but screenshots are taken with materials off.
2. **Sheets are centred dialogs.** On macOS a sheet slides down from the title bar and is attached to the window.
3. **Popovers have no arrow** pointing at the button that opened them.
4. **Toasts at the bottom centre are a web pattern.** A Mac app would confirm inline, or with a notification when in the background.
5. **List column headers are in capitals** ("RANK NAME DEPARTMENT"). macOS tables use title case with sort arrows in the header.
6. **No right-click menus.** Apple apps offer Move to…, Copy RA number and Show résumé on a row.
7. **No multi-select.** Moving ten people means ten sheets.
8. **Rows don't animate between buckets** when cutoffs move; only the counts do.
9. **"Delete all data…" is a filled red button** in Settings. macOS keeps destructive buttons plain until the confirmation.
10. **The native `<select>` opens Chromium's menu on Windows,** which looks less native than the rest.
11. **The toolbar is HTML,** not a unified native toolbar: no customisation, no overflow menu. On Windows the caption buttons overlay it.
12. **"No name"** is shown for a missing name, in the same style as a real name.
13. **On a wide display the Results columns spread far apart.** The name is on the left edge and the score about 1,100 px away (see the large-display screenshot). A Mac table would keep columns at sensible widths, or let them be resized.

## 8. Known weaknesses (most severe first)
1. **Not usable with real student data yet.** 1.11a (redaction using the résumé's own header) is blocking. Smoke test 1 saw a name fragment reach the model.
2. **macOS completely untested.** Every test and screenshot is from Windows 11. POSIX process handling (SIGTERM, the stdin watch), the macOS menu and window chrome, fonts and notifications need a real Mac.
3. **Real-model speed and quality.** CPU-only is about 141 s per résumé, so a 300-student list takes about 12 hours. The pre-check-based estimate is ~2.5× optimistic until 5 résumés are measured. Real scores bunch at the top (one résumé scored 95 ten times). The UI presents the ranking cleanly, but the ranking itself is not yet trustworthy.
4. **Not packaged.** The app runs from the repo with `.venv` Python. electron-builder is approved but not configured; there's no bundled Python, code signing or notarisation. `ATLAS_ENGINE_MODULE`/`ATLAS_PYTHON` are development-only switches.
5. **UI feel.** Clean and consistent, but it reads as "a very tidy web app" more than a native Mac app; see section 7.
6. **Performance measured on one fast machine.** The ~90 ms median and 0 long tasks may not hold on a 4-core laptop. The budgets are in the test, so it will say.
7. **Screen readers untested.** Roles, labels, focus traps and `aria-live` are tested structurally, but not with NVDA or VoiceOver.
8. **Some flows are stub-only.** Drive's real pages, Google Doc and folder links, and outages lasting hours were exercised only against stubs.
9. **One screening at a time.** This is a deliberate simplification, but a second recruiter list has to wait.

## 9. What you need to do
1. **Try it on a Mac:** `cd app && npm ci && npm run e2e`, then `npm run dev`. Check the title bar, traffic lights, sidebar vibrancy, SF Pro, the ⌘, menu item, notifications, and closing mid-run. Send screenshots of anything that looks off.
2. **Review the screenshots** in section 3 (or `docs/summaries/phase2/screens/`). Mark what feels wrong, especially items 2–9 in section 7. Some are one-line changes; others are real design work.
3. **Decide the order before real use.** 1.11a first (blocking). Then the pre-check limit and estimate on CPU laptops, and score bunching (a Phase 3 eval set).
4. **Add `prompts/phase1-11.md`** (it isn't in the repository), so the Deferred list can be numbered 1.11b–g.
5. **Try a real screening only after 1.11a,** on the laptop recruiters will use, with a small list (10 students), to see real speed and scores in the UI.
6. **Say whether packaging** (electron-builder, bundled Python, signing) is the next phase.
