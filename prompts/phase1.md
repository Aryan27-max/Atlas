# Phase 1: Build the Atlas engine end to end

You are building **Phase 1 of Atlas**: the complete headless screening engine, with no UI. When you finish, a recruiter's CSV goes in, résumés are downloaded, extracted, scored by a local Ollama model and bucketed, and a CSV comes out. It has to survive crashes, network loss and Ollama loss with zero data loss.

This is a long job. Work through it step by step, commit after each step, and don't stop until Phase 1's exit criteria pass or you hit a **stop condition** (below).

---

## 0.0 Setup check (do this before anything else)

Confirm these exist in the repo root. If any is missing, **stop and tell me exactly which**. Don't guess or recreate them.

- `CLAUDE.md`, `ARCHITECTURE.md`, `PLAN.md`
- `engine/db.py`, `engine/buckets.py`, `engine/tests/`
- `docs/legacy/UNDERSTANDING.md`
- `legacy/qwentus/`, containing the old source (`main.py`, `config.py`, `parsers/`, `llm/`, …)

Also confirm `python --version` is 3.11 or newer, and install the pre-approved dependencies (§1) into a virtual environment at `.venv/`. Add `.venv/`, `__pycache__/` and `*.db*` to `.gitignore`.

## 0. Read first, in this order

1. `CLAUDE.md`: the hard rules. They override anything in this prompt that seems to conflict.
2. `ARCHITECTURE.md`: the design. Each module you build has a section there; build to it.
3. `PLAN.md`: phases and exit criteria.
4. `docs/legacy/UNDERSTANDING.md`: how the old QWENTUS CLI works, and its known bugs (§17).
5. `legacy/qwentus/`: the old source code. **This is reference only; never import from it.** Copy and adapt the good parts into `engine/`: PDF parsing, OCR, the Ollama streaming client and JSON parsing. Leave behind every issue listed in UNDERSTANDING.md §17.
6. `engine/db.py`, `engine/buckets.py` and `engine/tests/`: already built and tested (43 tests). Read them fully. Every new module must use `Database` methods for state changes.

Then run `python -m unittest discover -s engine/tests -t .` and confirm it's green before you change anything.

Once you've read everything, write a short plan (a todo list) covering steps 1.3 to 1.10, and start.

---

## 1. Ground rules for this job

- **Git:** if the repo isn't initialised, run `git init` first. Make one commit per step: `phase1(1.4): downloader with Drive handling`. Never commit a red test suite.
- **Pre-approved dependencies.** Add them to `engine/requirements.txt`:
  - `requests`
  - `PyMuPDF`
  - `pydantic>=2`
  - `easyocr`, as an **optional** extra in `engine/requirements-ocr.txt`, imported lazily. The engine must run and its tests must pass without it installed.

  Anything else is a stop condition. **Do not add FastAPI yet**; `server.py` is Phase 2.
- **Tests:** stdlib `unittest` only. No test may need the internet, a real Ollama, or easyocr. Mock `requests`, use local stub HTTP servers (step 1.10), and patch `time.sleep`. Generate test PDFs with PyMuPDF (`fitz`) in the test itself. Don't commit binary fixtures unless there's no other way.
- **Architecture:**
  - Stage modules (`ingest/`, `extract/`, `llm/`, `export.py`) **never import `db.py`**. They take plain inputs and return results or raise typed errors.
  - Only `worker.py` and `cli.py` touch the database.
  - Inject every external dependency (HTTP session, Ollama client, clock, health probe) through constructors so tests can replace it.
- **Errors:** one module, `engine/errors.py`, used everywhere.
  - `CandidateError(kind, reason)` is a problem with this candidate's file or link. `kind` is `"permanent"` or `"retryable"`, and `reason` is a sentence written for a recruiter.
  - `SystemUnavailable(reason)` is a problem with the machine: network down, Ollama down, disk full.
  - `TransientError` is ambiguous. The worker must run a health probe to decide which of the two it really is (ARCHITECTURE §8).
- **Recruiter-facing text:** every `reason` and pause message uses the wording in ARCHITECTURE §8 and §6. No status codes, no exception class names.
- **Logging:** use the `logging` module to `<data-dir>/logs/engine.log` with `RotatingFileHandler` (5 × 5 MB). **Never log résumé text, names, emails or phone numbers.** Log candidate ids and RA numbers only.
- **After each step:**
  1. The full suite is green, including `test_kill.py`.
  2. Update the Built/Planned markers in `ARCHITECTURE.md` and the `[done]`/`[next]` markers in `CLAUDE.md`.
  3. If the design had to change, update `ARCHITECTURE.md` in the same commit and say why in the commit message.
  4. Append a line to a `## Progress` section at the bottom of `PLAN.md`: step, date, test count, anything a new session must know. **This is how a fresh session picks up if your context runs out.**
  5. Write the step summary (see **Summaries** below) and include it in the step's commit.

### Summaries: document everything you do

The owner of this repo is learning from this build, so summaries must explain *what* and *why*, not just list files.

**Per step:** create `docs/summaries/phase1/step-1.X-<name>.md` with exactly these sections:

```markdown
# Step 1.X — <name>

## What was built
Plain-English description a 3rd-year CS student can follow. 3–6 sentences.

## Files
| File | Purpose | Key functions / classes |
|---|---|---|

## How it works
Numbered walkthrough of the main flow. Name the functions involved. Include a small Mermaid diagram if the flow has branches.

## Key decisions and why
Each decision: what you chose, what you rejected, and the reason. Include any place you deviated from ARCHITECTURE.md.

## Failure handling
Table: situation → what happens → candidate failed / run paused / nothing → message shown.

## Tests
Count added, total count, and one line per test group saying what it proves.

## How to try it yourself
Exact commands to run, with expected output (e.g. a CLI call, a python one-liner, or a single test).

## Known limitations
Honest list of what this step does NOT handle yet.

## Concepts to learn
3–5 concepts this step relies on (e.g. "WAL mode", "compare-and-set", "streaming downloads"), one line each on why they matter here.
```

**At the end of Phase 1:** create `docs/summaries/PHASE1_SUMMARY.md` containing:
1. A one-paragraph overview of what the engine does now.
2. An end-to-end walkthrough of one candidate, from CSV row to exported CSV line, naming every module and database state it passes through, with one Mermaid sequence diagram.
3. A table of every step: what was built, tests added, and a link to its step summary.
4. The final test count, and the evidence for each definition-of-done item.
5. All deviations from ARCHITECTURE.md, in one place.
6. Known weaknesses and risks, ranked by severity.
7. What Phase 2 needs from the engine (the API surface `server.py` will wrap).

Also keep `docs/summaries/CHANGELOG.md`, one line per commit: `YYYY-MM-DD · step · what changed`.

### Stop conditions: stop, explain, and wait for me

- A hard rule in CLAUDE.md and the architecture seem to conflict.
- You need a dependency that isn't pre-approved.
- You want to change the candidate or run state machine beyond what's described below.
- A test fails and the only way to pass it is to weaken the test or a guarantee.
- Anything would send résumé data anywhere except the local Ollama server.

---

## 2. Steps

### 1.3 `engine/ingest/csv_loader.py`: CSV loading and the pre-flight report

Build this to ARCHITECTURE §10.

- `load_csv(path) -> PreflightReport` is **pure** and never writes to the database.
- `PreflightReport` holds:
  - `rows`: normalised dicts whose keys match `db.CANDIDATE_INPUT_FIELDS`
  - `errors` and `warnings`: each has a row number, RA number, code and message
  - `summary`: counts, used to render the report text
- Header aliases are matched case-, space- and punctuation-insensitively. Each field has a list of aliases. Also handle:
  - unknown columns: ignore them with a warning
  - a missing required column (RA number, résumé link): a file-level error
- Handle all of these:
  - encoding: UTF-8-BOM, then UTF-8, then cp1252
  - delimiter sniffing
  - blank lines and trailing empty columns
  - phones in Excel scientific notation, and `+91`, spaces and dashes
  - CGPA written as `8.2`, `8.2/10` or `82%`, plus out-of-range values
  - RA number trimmed and upper-cased
  - duplicate RA numbers: keep the first, report the rest as errors
  - a link shared by two students: warning only
  - an empty file or header only: a file-level error
- `render_report(report) -> str` produces the text block from §10.
- Tests use fixture CSVs written in the tests. Cover every normalisation above, plus a 5,000-row file (check performance under 2 s).

### 1.4 `engine/ingest/downloader.py`: downloading résumés

Build this to ARCHITECTURE §11.

- `Downloader(session, *, max_bytes=20*1024*1024, min_interval=1.0, clock=...)`, with `fetch(link, dest_dir, stem) -> Downloaded(path, sha256, size_bytes)`.
- **Link rewriting:**
  - `drive.google.com/file/d/ID/...`, `open?id=ID` and `uc?id=ID` become the direct-download URL.
  - `docs.google.com/document|spreadsheets|presentation` → `CandidateError(permanent, "This is a Google Doc…")`.
  - `drive.google.com/drive/folders/` → permanent error, folder link.
  - Non-http(s) or malformed links → permanent error.
- **The HTML traps. Status codes alone aren't enough.**
  - The Drive virus-scan confirmation page: parse the form or confirm token, follow it **once**, and don't loop.
  - The Drive sign-in page returned with HTTP 200 → permanent error, "Link is private…".
  - Any other HTML response → permanent error, not a PDF.
- **Streaming:**
  - Write to `<stem>.part` in chunks and abort **as soon as** the running total passes `max_bytes`, even without a `Content-Length` header. Delete the partial file.
  - Check that the first 5 bytes are `%PDF-`.
  - fsync, then atomically rename to `<stem>.pdf`.
  - If the disk is full (`OSError` with `ENOSPC`), raise `SystemUnavailable("Disk is full")`.
- **Status mapping:**
  - 404 and 410 are permanent.
  - 401 and 403 are permanent ("private").
  - 429 is retryable. Honour `Retry-After`, capped at 60 s.
  - 5xx is retryable.
  - Connection errors, timeouts and DNS errors raise `TransientError`. The worker decides.
- **Timeouts:** connect 10 s, read 30 s.
- **Throttle:** at least `min_interval` between request starts.
- Tests use mocked sessions or the stub server from 1.10. Cover every branch above, including a response that grows past 20 MB mid-stream with no `Content-Length`.

### 1.5 `engine/extract/`: text and section extraction

Build this to ARCHITECTURE §12.

- **`pdf.py`:** adapt QWENTUS `PDFParser`. `extract(path) -> Extraction(text, page_texts, page_count, ocr_used, truncated_pages)`.
  - Read at most **10 pages**. If there are more, set `truncated_pages`; don't fail.
  - An encrypted PDF (`needs_pass`) → permanent error, "damaged or password-protected".
  - A corrupt PDF → the same permanent error.
- **`ocr.py`:** adapt QWENTUS `EasyOcrEngine`.
  - Lazy import. If easyocr isn't installed, return a clear "OCR is unavailable" permanent error instead of crashing.
  - `gpu=False`, `download_enabled=False`, and `model_storage_directory` is a constructor argument. Never download at runtime.
  - Only pages with fewer than about 50 characters of text are OCR'd.
- **`sections.py`:** `split_sections(text) -> dict[str, str]`, using the canonical section names in ARCHITECTURE §12. Match headings on short lines, whether upper-case, title-case, with a trailing colon, or with decorations like `—` or `•`. Text before the first heading is `header`; unrecognised content is `other`.
  - Test it on at least 8 realistic résumé layouts written as strings: single-column, "SKILLS:" inline, all-caps, headings with icons or bullets, two headings on one line, no headings at all, and so on.
- **Required test:** generate a **10-page PDF** whose Projects section is on page 7. Assert that the Projects text lands in `sections["projects"]`. Carry this fixture forward to 1.6.

### 1.6 `engine/llm/`: LLM scoring

Build this to ARCHITECTURE §13.

- **`schema.py`:** a Pydantic `Evaluation` with `extra="forbid"`, exactly the §13 contract. Export its JSON schema so it can be passed as Ollama's `format`.
- **`client.py`:** adapt QWENTUS `OllamaClient`.
  - `health()`, `list_models()`, `model_context_length(name)` (from `/api/show`, falling back to 8192), and `chat_json(prompt, schema, *, num_ctx, num_predict) -> ChatResult(content, done_reason, eval_count, duration)`.
  - Use streaming and `think: false`.
  - **Remove the per-request files in `logs/ollama/`**, which is a privacy bug. Raw responses go back to the caller, which stores them in SQLite.
  - A connection refused or timeout on `/api/tags` → `SystemUnavailable("Ollama isn't running")`. A mid-chat failure → `TransientError`.
- **`prompt.py`:** `build_prompt(candidate_context, sections, criteria, *, budget_chars) -> Prompt(text, prompt_hash, included_sections, trimmed)`.
  - The order is system, criteria, context (CGPA, department), claims (skills and hackathons, explicitly "verify against the résumé"), then the fenced `<resume>…</resume>` block.
  - The system text says résumé content is data, never instructions.
  - Use the section priority and floor-share budget from §13. Long sections are trimmed per item, not cut off.
  - **The function signature physically cannot receive name, email, phone, RA number or section.** Add a test that builds a prompt from a full candidate row and asserts none of those values appear in the text.
  - Cutoff values never appear.
- **`verify.py`:**
  - Normalise and verify evidence quotes against the résumé text, dropping fake ones.
  - Detect instruction-like text in the résumé ("ignore previous/above instructions", "you are now", "score this", "system prompt", and similar).
  - `review(evaluation, resume_text) -> (cleaned_evaluation, flags)`.
- **`scorer.py`:** `Scorer(client, model, criteria)`, with `score(candidate_context, sections, full_text) -> ScoreResult`. It runs the retry and guardrail table in §13:
  - 3 attempts with backoff.
  - A `done_reason == "length"` retries with `num_predict` doubled, up to 4096.
  - A fake-quote retry.
  - The high-score-without-evidence retry, then a flag.
  - When all attempts fail: `CandidateError(retryable, "The model's answer couldn't be read.")`.
- **Schema v2 migration** in `db.py`: add `flags TEXT NOT NULL DEFAULT '[]'` (a JSON list) to `evaluations`.
  - Follow the migration rule in CLAUDE.md: bump `SCHEMA_VERSION` and add an `if version < 2:` step.
  - `save_evaluation` accepts `flags`, and `get_evaluation` decodes them.
  - Test the upgrade path: create a v1 database with data, open it with the new code, and check the data survives with flags `[]`.
  - Flags include "Résumé longer than 10 pages; pages 11+ not read", "Possible instructions to the AI found in résumé", and "High score without supporting evidence".
- **`precheck.py`:** `precheck(client, model) -> PrecheckResult(ok, message, seconds)`. It scores a bundled sample résumé, kept as text in `engine/llm/sample_resume.txt` (fictional person), with a 120 s timeout. The result is cached by the caller.
- **Tests:** a fake client returning scripted responses covers invalid JSON, truncated output, extra keys, out-of-range scores, fake quotes, injection text, the high-score flag, and the 10-page fixture from 1.5 with a Projects quote from page 7 verified as real.

### 1.7 `engine/health.py` and `engine/worker.py`: the resumable job loop

Build this to ARCHITECTURE §7, §8, §9 and §6. It's the most important step, so take the time to get it right.

- **`health.py`:** `HealthProbe` with `internet_ok()` (a TCP connection to 2 hosts, where either succeeding counts, with a short timeout) and `ollama_ok()`. It's injectable and fakeable.
- **`worker.py`:** `Worker(db, data_dir, downloader, extractor, scorer_factory, health, *, prefetch=2, clock=...)`.
  - The public API is `start(run_id)`, `pause(run_id, reason="Paused by you")`, `resume(run_id)`, `stop()` (graceful, for app quit, with pause reason "Atlas was closed"), and `wait_idle(timeout)`.
  - It runs 3 threads: fetch, extract and score. **Work is claimed through database transitions only.** Threads never pass candidates to each other in memory; the database is the queue.
  - **On `start`, before anything else:**
    - Apply the hard filters (CGPA, department) with `mark_filtered`.
    - Run `recover_after_crash(downloads_dir)` and delete the orphans it reports.
    - Set the run status to `running`.
  - **Prefetch gate:** fetch claims a new candidate only while `downloading + downloaded + extracted` for this run is below `prefetch`. The gate must be enforced across the threads, and tested.
  - **Delete after commit:** extract deletes the PDF only after `commit_extraction` returns. If extraction raises `CandidateError`, mark the candidate failed **and** delete the PDF.
  - **Failure mapping** (§8):
    - `CandidateError` → `mark_failed`.
    - `SystemUnavailable` → return the work (`return_to_queue` or `return_to_extracted`), then pause the run with the reason.
    - `TransientError` → run the probe. If it fails, treat it as `SystemUnavailable`; if it passes, `mark_failed(retryable, …)`.
  - **Auto-resume:** while paused for "No internet connection" or "Ollama isn't running", poll the probe every 5 s (injected clock) and resume when it's healthy. Never auto-resume any other pause reason.
  - **Completion:** when no candidate is left in a working state, set the run to `completed`. A retryable failure never blocks completion; it's shown as failed with a retry option.
  - **Unexpected exceptions** (bugs): log them with a traceback, mark the candidate `failed(retryable, "Something went wrong while processing this résumé.")`, and keep going. One bad candidate never stops the run. If the same unexpected error hits 5 candidates in a row, pause the run with "Atlas hit repeated errors. See logs." instead of failing everyone.
  - **Timing:** record per-candidate durations (`evaluations.duration_seconds`) for the Phase 3 estimate.
- **Tests, with fakes for every stage:**
  1. The happy path for 20 candidates: all scored, no files left in `downloads/`, and there are never more than 2 PDFs on disk at once (sample the directory during the run).
  2. **Network loss:** the probe goes offline mid-run. The run pauses with "No internet connection" and **0 candidates are failed**. When the probe comes back, the run auto-resumes and completes.
  3. **Ollama loss:** the same, with "Ollama isn't running", and in-flight scoring goes back to `extracted`.
  4. Disk full → paused, no auto-resume, resumes on `resume()`.
  5. A mix of permanent and retryable failures, then `retry_failed`, and the run completes again.
  6. The 5-in-a-row bug guard.
  7. Graceful `stop()` mid-run → paused with "Atlas was closed", and a new `Worker` resumes it to completion.
  8. Hard filters: filtered candidates are never downloaded.
- **`engine/tests/test_worker_kill.py`:** the Phase 1 exit criterion.
  - A subprocess runs a real `Worker` against the stub Drive and stub Ollama servers from 1.10, with 30 candidates. It's SIGKILLed at 20 varied moments, and each round restarts it.
  - After the final uninterrupted run, assert:
    - every candidate is `scored` or `failed` with a correct reason
    - evaluations = scored candidates
    - no PDFs or `.part` files remain
    - `PRAGMA integrity_check` is ok
  - Skip it on Windows, as `test_kill.py` does.

### 1.8 `engine/export.py`: CSV export

Build this to ARCHITECTURE §16.

- `export_csv(rows, placements, path, *, view)`. It takes plain data prepared by the caller and doesn't import `db`.
- It writes the columns in §16, in UTF-8 with a BOM, CRLF line endings and `QUOTE_ALL`.
- Formula-injection escaping applies to `=`, `+`, `-`, `@`, tab and CR.
- Write to a temp file in the same directory, fsync, then `os.replace`.
- Tests:
  - a name `=HYPERLINK("x")` is escaped
  - Tamil and Hindi names round-trip
  - a crash mid-write (patch it to raise) leaves no partial file

### 1.9 `engine/cli.py`: headless proof of Phase 1

`python -m engine.cli` with subcommands:

```text
preflight --csv PATH
run       --csv PATH --model NAME --criteria TEXT|@file.txt --data-dir DIR
          [--shortlist 60] [--band 50] [--min 0] [--cgpa-min X] [--departments CSE,IT]
resume    --run ID --data-dir DIR
results   --run ID --data-dir DIR [--shortlist N --band N --min N]    # live re-bucketing
export    --run ID --data-dir DIR --view all|shortlisted|cutoff|rejected|failed --out PATH
retry     --run ID --data-dir DIR [--include-permanent]
```

- `run` shows the pre-flight report and asks `Continue? [y/N]` (skip the question with `--yes`), runs the model pre-check, then runs the job. It prints one progress line per candidate (ids and RA numbers only) and the pause reason when paused.
- Ctrl+C = graceful `stop()`, and `resume` continues the run.
- Exit codes: 0 completed, 2 paused, 1 error.
- `results` prints counts, the bucket notes (fill and ties), and the top 20.

### 1.10 Stub servers and end-to-end tests

- **`engine/tests/stubs/drive_stub.py`:** a threaded `http.server` on 127.0.0.1:0 that serves:
  - real PDFs
  - the confirm page, then the PDF
  - the sign-in page at HTTP 200
  - a Google Doc URL shape
  - 404, 429 with `Retry-After`, and 503
  - a slow drip, and an oversized stream
  - a switch to "go offline" (refuse connections)
- **`engine/tests/stubs/ollama_stub.py`:** implements `/api/tags`, `/api/show` and streaming `/api/chat`. It returns valid evaluations with quotes taken from the prompt's résumé block, and can be scripted to return garbage, truncate, or go down.
- **Downloader redirect.** The downloader must accept an injectable URL-rewrite hook, so tests can point "Drive" links at the stub without changing production rewriting.
- **`engine/tests/test_e2e.py`:**
  1. A CSV of 25 students (mixed good links, private, Google Doc, oversized, 404, 429-then-OK, and a 10-page résumé) goes through `cli run --yes` against both stubs.
  2. Assert the buckets, the failure reasons word for word, the 10-page candidate's evidence from page 7, the exported CSV contents and escaping, and that no PII appears in `engine.log`.
  3. Stop the Ollama stub mid-run: the run pauses with "Ollama isn't running" and no candidates are failed. Restart the stub and the run completes.
- **`engine/tests/test_live.py`:** runs only when `ATLAS_LIVE=1`. It runs 3 bundled sample résumés against a real local Ollama and the model named in `ATLAS_MODEL`, then prints the scores and timings. It's skipped by default.

---

## 3. Definition of done for Phase 1

All of these must be true. Verify each one yourself and paste the evidence into your final report.

- [ ] The full suite is green: `python -m unittest discover -s engine/tests -t .` (paste the summary line and test count).
- [ ] `test_kill.py` and `test_worker_kill.py` both pass.
- [ ] The network-loss and Ollama-loss tests show **0 failed candidates** and an auto-resume.
- [ ] The 10-page résumé is scored using content from page 7.
- [ ] The identity-leak test proves no name, email, phone, RA number or section appears in any prompt.
- [ ] No résumé text or PII appears in `engine.log` (checked by the e2e test).
- [ ] No module outside `worker.py` and `cli.py` imports `engine.db`: `grep -rnE "from (engine|\.|\.\.)\.?db import|import engine\.db" engine --include=*.py | grep -vE "tests/|worker\.py|cli\.py"` prints nothing.
- [ ] Nothing from `legacy/` is imported.
- [ ] `ARCHITECTURE.md` markers, `CLAUDE.md` markers and the `PLAN.md` Progress section are up to date.
- [ ] One commit per step, all green.
- [ ] Every step has its summary in `docs/summaries/phase1/`, and `docs/summaries/PHASE1_SUMMARY.md` and `CHANGELOG.md` exist and are complete.

## 4. Final report format

When you finish, or when you stop on a stop condition, reply with:

1. **Status:** done, or stopped at step X and why.
2. **Evidence:** the output for each definition-of-done item.
3. **Design changes:** anything that differs from ARCHITECTURE.md, and why.
4. **Known weaknesses:** what you're least confident in. Be blunt; I'd rather know now.
5. **What I need to do:** anything that needs a human (a real CSV sample, real Drive links to test, `ATLAS_LIVE=1` run on my machine).
6. **Where to read more:** a link to `docs/summaries/PHASE1_SUMMARY.md`.
