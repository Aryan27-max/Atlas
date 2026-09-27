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

**Exit criteria**
- Kill test: process killed at random points 20 times, every restart resumes with zero lost or duplicated candidates.
- Network pulled mid-run → run pauses, zero candidates marked failed because of it.
- A 10-page résumé is scored on all its sections, not the first half-page.

## Phase 2 — App (local API + Electron UI)

| Step | File | What |
|---|---|---|
| 2.1 | `engine/server.py` | Local API on 127.0.0.1, random port, per-launch token |
| 2.2 | `app/main/` | Electron main: spawns/monitors engine, `powerSaveBlocker`, window chrome |
| 2.3 | `app/renderer/design/` | Design tokens + component kit (built **before** any screen) |
| 2.4 | `app/renderer/screens/` | Welcome → Upload + Model → Criteria → Cutoffs → Timeline/Progress → Results → Settings |

**Exit criteria**
- Every screen works in light and dark mode, at 1280×800 and full screen.
- Closing the app mid-run and reopening lands on the same run, paused, resumable.

## Phase 3 — Hardening & shipping

| Step | What |
|---|---|
| 3.1 | Ollama detection, install guidance, model pull with progress |
| 3.2 | Hardware check + spec-based time estimate (replaced by measured rate after 4–5 résumés) |
| 3.3 | Eval set: 20–30 labelled résumés; score quality measured before each release |
| 3.4 | Packaging: PyInstaller engine + electron-builder; macOS signing + notarization; Windows signing |
| 3.5 | Fault-injection suite in CI |

**Exit criteria**
- Installs and runs on a clean Mac (Apple Silicon) and a clean Windows 11 machine with no dev tools.

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
