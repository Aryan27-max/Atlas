# QWENTUS: How the Codebase Works

This is a reference for anyone working on this repository, whether a person or an AI assistant. It describes how the code actually behaves as of commit `2ec2ba0`. Where the older notes (`implementation.md`, `report.md`, `testingReports.md`, parts of `README.md`) disagree with the code, this file follows the code and lists the differences in [§17](#17-known-issues-risks-and-doc-drift).

For diagrams of everything described here, see [architecture.md](architecture.md).

---

## Contents

1. [What it is](#1-what-it-is)
2. [Quick facts](#2-quick-facts)
3. [Repository map](#3-repository-map)
4. [Where files live at runtime](#4-where-files-live-at-runtime)
5. [Run modes](#5-run-modes)
6. [Lifecycle of one résumé](#6-lifecycle-of-one-résumé)
7. [Data models](#7-data-models)
8. [LLM integration (Ollama)](#8-llm-integration-ollama)
9. [Scoring and decisions](#9-scoring-and-decisions)
10. [Links, scraping and network resilience](#10-links-scraping-and-network-resilience)
11. [Excel report](#11-excel-report)
12. [Persistence and re-runs](#12-persistence-and-re-runs)
13. [Logging and the terminal UI](#13-logging-and-the-terminal-ui)
14. [Failure handling](#14-failure-handling)
15. [Configuration reference](#15-configuration-reference)
16. [Testing](#16-testing)
17. [Known issues, risks and doc drift](#17-known-issues-risks-and-doc-drift)
18. [Recipes for common changes](#18-recipes-for-common-changes)
19. [Glossary](#19-glossary)

---

## 1. What it is

QWENTUS is a single-process Python command-line tool that screens PDF résumés on the local machine. For each PDF placed in the `Incoming` folder it:

1. extracts text with PyMuPDF, falling back to EasyOCR when the PDF has no text layer;
2. collects URLs from the visible text and from embedded PDF hyperlinks;
3. fetches the candidate's public GitHub, LinkedIn and portfolio pages, if it can reach the internet;
4. builds a compact `CandidateProfile` using regular expressions and keyword heuristics;
5. asks a local LLM (`qwen3:8b` served by Ollama) for a score card in strict JSON;
6. validates that JSON with Pydantic and fills in any missing sub-scores with fixed formulas;
7. turns `overall_score` into a decision: **Shortlisted** (60 or more), **Maybe** (50–59) or **Rejected** (below 50);
8. rewrites the Excel report and moves the PDF into the matching decision folder.

Résumé text only ever goes to the local Ollama server. The tool makes three kinds of outbound network traffic: a TCP connectivity probe to `1.1.1.1:53`, HTTP GETs of the URLs found in résumés, and a one-time download of the EasyOCR model the first time OCR runs (see [§17](#17-known-issues-risks-and-doc-drift)).

**Naming.** The project was first called **Atlas**. The repository, README and startup banner now say QWENTUS, but nearly every identifier still says Atlas: `AtlasPipeline`, `AtlasConfig`, `AtlasPaths`, `AtlasTerminalUI`, the logger named `"atlas"`, `atlas.log`, `atlas_checkpoint.json`, and the LLM prompt itself, which begins "You are Atlas." The two names refer to the same thing.

---

## 2. Quick facts

| Item | Value |
|---|---|
| Language | Python 3. The code needs 3.9 or later. The `numpy>=2.5.0` pin means in practice you need a recent interpreter (3.11+). |
| Entry point | `python main.py [--watch] [--debug-one PATH]` ([main.py](main.py)) |
| LLM | Ollama at `http://127.0.0.1:11434`, model `qwen3:8b`, `POST /api/chat` with streaming and `format: "json"` |
| Tests | `python -m unittest discover -s tests -v`: 32 tests using stdlib `unittest` and `unittest.mock`. No live Ollama or network needed. |
| Data root | **Hardcoded** to `c:\this is dekstop\atlas`, which is *not* the repository folder (see [§4](#4-where-files-live-at-runtime)) |
| Outputs | `workspace/Reports/Candidates.xlsx`, PDFs sorted into decision folders, `logs/atlas.log`, `logs/ollama/*` |
| Concurrency | Sequential: one résumé at a time. Watch mode adds a watchdog observer thread, but that thread only puts paths on a queue. |
| Persistence | No database. State lives in the Excel workbook, a JSON checkpoint, and the folder each PDF is in. |
| License | Apache-2.0 |

---

## 3. Repository map

| Path | Role | Key symbols |
|---|---|---|
| [main.py](main.py) | CLI entry point. Parses flags, builds the UI, sends work to run-once, watch or debug mode. | `parse_args`, `run_once`, `main` |
| [config.py](config.py) | All constants, filesystem paths, and the score-to-decision mapping | `WORKSPACE_ROOT`, `AtlasPaths`, `AtlasConfig`, `DEFAULT_CONFIG`, `decision_for_score` |
| [core/pipeline.py](core/pipeline.py) | Orchestration: batch loop, watch loop, moving files, checkpoint, dashboard log lines, debug artifacts | `AtlasPipeline`, `PipelineStats`, `ProcessOutcome`, `_ResumeWatchHandler`, `run_watch_mode` |
| [core/queue.py](core/queue.py) | Thread-safe queue of PDF paths used by watch mode | `ResumePathQueue`, `QueueItem` |
| [agents/evaluator.py](agents/evaluator.py) | Builds the candidate profile (parse, links, scrape, heuristics), builds the prompt, calls the LLM with a retry, validates and enriches the result | `CandidateEvaluator`, `EvaluationOutcome`, `FatalEvaluationError`, `ProfileParseError` |
| [parsers/pdf_parser.py](parsers/pdf_parser.py) | Extracts PDF text with PyMuPDF and falls back to OCR | `PDFParser`, `PDFExtractionResult`, `PDFParseError` |
| [parsers/ocr.py](parsers/ocr.py) | Lazily created EasyOCR wrapper. Renders each page to an image and reads it. | `EasyOcrEngine`, `get_ocr_engine`, `OcrResult`, `OcrUnavailableError` |
| [parsers/link_extractor.py](parsers/link_extractor.py) | Finds URLs in text and in PDF link annotations, normalises and de-duplicates them | `LinkExtractor` |
| [scrapers/common.py](scrapers/common.py) | HTTP fetch with retries, a circuit breaker for repeated network failures, the connectivity probe, an optional DNS override, and HTML-to-summary conversion | `fetch_html`, `FetchOutcome`, `NetworkMonitor`, `has_internet_connectivity`, `parse_page_summary`, `compact_url_summary` |
| [scrapers/github.py](scrapers/github.py), [linkedin.py](scrapers/linkedin.py), [portfolio.py](scrapers/portfolio.py) | Thin per-site scrapers, each exposing `can_handle(url)` and `scrape(url, ...)` | `GitHubScraper`, `LinkedInScraper`, `PortfolioScraper` |
| [llm/ollama.py](llm/ollama.py) | HTTP client for Ollama: health check, streaming chat, JSON parsing with fallbacks, per-request log files | `OllamaClient`, `OllamaHealth` |
| [llm/prompts.py](llm/prompts.py) | The only prompt template | `build_evaluation_prompt` |
| [models/candidate.py](models/candidate.py) | Pydantic v2 models, all with `extra="forbid"` | `SocialLinks`, `CandidateProfile`, `CandidateEvaluation`, `ScreeningRecord`, `RunSummary` |
| [exporters/excel.py](exporters/excel.py) | Rebuilds `Candidates.xlsx` from scratch and reloads earlier rows when a run starts | `ExcelExporter` |
| [ui/terminal.py](ui/terminal.py) | Rich/pyfiglet terminal output, driven entirely by log records | `AtlasTerminalUI`, `AtlasConsoleHandler`, `ResumeResult` |
| [utils/logger.py](utils/logger.py) | Sets up the `atlas` logger with a file handler and a pluggable console handler | `configure_logging`, `set_console_handler_factory`, `ConciseConsoleHandler` |
| [tests/](tests/) | 10 test modules, 32 tests (see [§16](#16-testing)) | |
| `README.md`, `implementation.md`, `report.md`, `testingReports.md`, `startCmds.md`, `prompts.md` | Older human-written notes. Some are out of date (see [§17](#17-known-issues-risks-and-doc-drift)). | |

Every package `__init__.py` holds only a docstring. There are no re-exports and no plugin registration.

---

## 4. Where files live at runtime

> **Read this before running anything.** Runtime data does **not** go into the repository folder.

[`config.py:13`](config.py#L13) hardcodes:

```python
WORKSPACE_ROOT = Path(r"c:\this is dekstop\atlas")
```

Every runtime path hangs off that root (`AtlasPaths`, [`config.py:47-100`](config.py#L47-L100)):

```text
c:\this is dekstop\atlas\
├── workspace\
│   ├── Incoming\        ← drop PDFs here
│   ├── Processing\      ← created but never used
│   ├── Shortlisted\     ← decision folders (PDFs are moved, not copied)
│   ├── Maybe\
│   ├── Rejected\
│   ├── Failed\          ← unparseable PDFs and fatal LLM failures
│   ├── Reports\
│   │   ├── Candidates.xlsx          ← the recruiter report
│   │   └── atlas_checkpoint.json    ← {filename: decision} for completed résumés
│   └── Debug\<pdf-stem>\            ← only written by --debug-one
├── logs\
│   ├── atlas.log                    ← full application log, including tracebacks
│   └── ollama\                      ← one set of files per LLM request (see §8)
└── docs\                ← created but never used
```

`AtlasConfig.ensure_directories()` creates all of these on start-up. It is called from `run_once`, `run_debug_one`, `run_watch_mode` and `ExcelExporter.export`.

**Moving to another machine.** Edit `WORKSPACE_ROOT`. To keep data inside the repository, use `Path(__file__).resolve().parent`. `.gitignore` already excludes `workspace/` and `logs/`.

**How the path override works.** `AtlasPaths` is a frozen dataclass. Its `__post_init__` checks every field that still has its default value; if `root` differs from `WORKSPACE_ROOT`, it rewrites that field to sit under the new `root`. So `AtlasPaths(root=tmp)` alone moves *every* path, which is how the tests isolate themselves. Fields you pass explicitly are left alone.

---

## 5. Run modes

### 5.1 Start-up (all modes) — [main.py:46-59](main.py#L46-L59)

1. `parse_args()` accepts `--watch` and `--debug-one PATH`.
2. Creates `AtlasTerminalUI(config, watch_mode)`.
3. `set_console_handler_factory(ui.create_log_handler)` registers the UI as the logger's console handler. **This must happen before `configure_logging` runs**, because `configure_logging` attaches handlers only once per process.
4. Shows the banner and the processing header, which includes a count of `Incoming/*.pdf`.
5. Opens `ui.progress_scope(count)`. A Rich progress bar appears only if `count > 0` at start-up.
6. Sends control to `run_watch_mode(...)` or `run_once(...)`. `run_once` in turn sends `--debug-one` to `pipeline.run_debug_one`.

### 5.2 Run once (`python main.py`) — [`AtlasPipeline.run_once`](core/pipeline.py#L177)

1. `ensure_directories()`. Then `ollama.ensure_ready()`, which checks `GET /api/tags` and **raises `RuntimeError` if Ollama is down or the model is missing**. Nothing catches that error in this mode.
2. Logs a warning if the connectivity probe (run once in `AtlasPipeline.__init__`) failed. Scraping is then skipped for the whole run.
3. **Loads earlier results.** `exporter.load_existing_records()` reads the `ALL CANDIDATES` sheet of the existing workbook. The report is therefore cumulative across runs.
4. Lists `Incoming/*.pdf`, sorted by name, and **skips**:
   - any file whose *name* already appears in the workbook. The file is left in `Incoming` untouched.
   - any file whose name is in the checkpoint but not in the workbook. That file is moved to its recorded decision folder without being evaluated again.
5. Builds a `PipelineStats` seeded with the counts from the earlier records, and writes the workbook once.
6. For each remaining PDF, in order:
   - `_process_pdf` → `evaluator.evaluate_with_timing(pdf)`. All exceptions are caught here and turned into a `ProcessOutcome` with `evaluation=None`.
   - **Failure:** update stats, move the PDF to `Failed`, rewrite the workbook, log the dashboard line.
   - **Success:** `_to_record`, which applies `decision_for_score`; re-rank all records; **move the PDF**; rewrite the workbook; save the checkpoint; log the dashboard line.
7. Writes the workbook a final time and returns a `RunSummary`. Note that `processed = len(records)`, which *includes* records from earlier runs.
8. `main` calls `ui.show_completion(summary)`.

### 5.3 Watch mode (`python main.py --watch`) — [`run_watch_mode`](core/pipeline.py#L443)

- Calls `ensure_ready()` inside a `try`. If it fails, it logs the error and returns exit code `1`.
- Starts a watchdog `Observer` on `Incoming` (non-recursive). `_ResumeWatchHandler.on_created` puts `.pdf` paths on a `ResumePathQueue`.
- De-duplicates by a **signature** `(name, size, mtime_ns)` kept in three sets (queued, active, completed) guarded by a `threading.Lock`. Repeated filesystem events for the same file are ignored.
- Queues the PDFs already in `Incoming` at start-up.
- Main loop: `queue.get(timeout=1.0)`. When the queue is empty and something new has been processed since the last summary, it calls `completion_callback(summary)`, which is `ui.show_completion`.
- Each PDF is processed with the same `pipeline._process_pdf` and `_to_record`, but the order differs from run-once mode: **workbook export, then checkpoint, then move**, so a failed move cannot lose the result.
- Differences from run-once mode worth knowing: it does **not** load earlier workbook rows, and it does **not** consult the checkpoint (see [§17](#17-known-issues-risks-and-doc-drift)).
- Stops on `Ctrl+C` (`KeyboardInterrupt`); the observer is stopped and joined.

### 5.4 Debug one (`python main.py --debug-one PATH`) — [`run_debug_one`](core/pipeline.py#L385)

- Evaluates **any** PDF path; it does not have to be in `Incoming`. The PDF is **not** moved.
- Calls `evaluator.evaluate_path_with_details`, which uses `evaluate_json_with_metrics` so it can capture Ollama's timing metrics.
- Writes `Candidates.xlsx` containing **only this one record** (see [§17](#17-known-issues-risks-and-doc-drift)).
- Writes three files to `workspace/Debug/<stem>/`:
  - `prompt.txt`: the exact prompt sent.
  - `raw-llm-response.json`: the parsed dict Ollama returned, before validation.
  - `validated-json.json`: extracted text, source summaries, prompt, raw response, validated evaluation, timings and prompt statistics. The extracted text, source summaries and prompt are truncated to 20,000 characters.
- Returns `0` on success and `1` if the evaluation is `None`. In practice exceptions propagate instead, because `evaluate_path_with_details` raises rather than returning `None`.

---

## 6. Lifecycle of one résumé

The work happens in `CandidateEvaluator.build_profile` and `.evaluate` ([agents/evaluator.py](agents/evaluator.py)).

| # | Step | Where | Details |
|---|---|---|---|
| 1 | Read PDF | `PDFParser.extract_text` | Reads the bytes, then `fitz.open(stream=...)` and `page.get_text("text")` for every page, joined with newlines. Any exception becomes `PDFParseError`. |
| 2 | OCR fallback | `EasyOcrEngine.extract_text` | Runs **only if the whole document produced no text**. Renders each page at 1.25× zoom, then `easyocr.Reader(["en"], gpu=False)`. The reader is created lazily and cached with `lru_cache`. If OCR fails or finds no text, the result is `PDFParseError`. |
| 3 | Visible URLs | `LinkExtractor.extract` | Regex `https?://[^\s<>()\[\]{}"']+`, trailing `.,);]` removed, only http(s) with a host kept, order preserved, duplicates removed. |
| 4 | Embedded URLs | `LinkExtractor.extract_pdf_annotations` | Reads `page.get_links()` URIs. Filtered the same way. Returns `[]` on any error. |
| 5 | Merge | `LinkExtractor.merge` | Visible links first, then annotations, de-duplicated, then **cut to the first 5** (`MAX_LINKS_PER_RESUME`). |
| 6 | Classify | `_classify_links` | Checked by host, in this order: the first `github.com` link becomes `github_url`; the first `linkedin.com` link becomes `linkedin_url`; the first host that is not a known platform (leetcode, codeforces, hackerrank, geeksforgeeks, medium, dev.to, kaggle, behance) becomes `portfolio_url`; everything else goes to `other_urls`. |
| 7 | Scrape | `_scrape_links` → `_scrape_single` | For each of github, linkedin and portfolio that has a URL: if the run is offline, the result is "Internet connection unavailable". Otherwise the scraper is chosen by URL (GitHub, then LinkedIn, then Portfolio, which accepts any http(s) URL). A success gives `compact_url_summary(url) + "\n" + text`. A failure stores the literal string `"Unavailable"` and logs a warning. If anything failed, a `"failures"` key holding a JSON string of reasons is also added to `source_summaries`. |
| 8 | Heuristics | `_deterministic_analysis` | **Skills:** substring matches against 18 fixed keywords (python, java, c++, sql, aws, azure, docker, kubernetes, react, node, typescript, javascript, pandas, machine learning, nlp, data analysis, spring boot, fastapi). **Projects:** lines that contain "project" or start with `- `, `* ` or `• ` (up to 8). **Achievements, leadership, communication:** the *keywords* found, not text snippets. **github_signals:** the GitHub URL plus the whole GitHub summary. **Summary:** a one-line digest. |
| 9 | Identity | `_find_*` regexes | Email; phone (a US-style 3-3-4 pattern); college (text after "college", "university" and similar); degree (B.Tech, B.E., M.Tech, M.S., BSc, MSc, MBA and similar). Name: the first of the first 5 non-empty lines that contains no `@` and has 6 words or fewer. |
| 10 | Profile | `CandidateProfile(...)` | `resume_excerpt` is the first 2,500 characters. `deterministic_context` also stores `pdf_time`, `ocr_time`, `ocr_used`, `ocr_reason`, `source_timings` and `source_failures`. |
| 11 | Prompt | `_build_prompt` | Builds the payload (see [§8](#8-llm-integration-ollama)) and renders the template. If the prompt is longer than 5,000 characters, it shrinks the résumé limit by 400 (down to 400) and the source limit by 200 (down to 200), up to 8 times. |
| 12 | LLM call | `_evaluate_profile` | Calls `ollama.evaluate_json(prompt)` then `CandidateEvaluation.model_validate`. **Any** exception is retried; there are `OLLAMA_MAX_RETRIES + 1 = 2` attempts in total, with no delay between them. After the last attempt it raises `FatalEvaluationError`. |
| 13 | Enrich | `_align_identifiers`, `_enrich_scores` | Blank name or email is filled from the regex profile. `skills_score`, `experience_score` and `resume_quality_score` are calculated with formulas when they are 0 (see [§9](#9-scoring-and-decisions)). |
| 14 | Record | `AtlasPipeline._to_record` | `decision = config.decision_for_score(overall_score)`. Strengths and weaknesses are joined with `, `. Phone, college and degree come from the regex profile; name and email come from the enriched evaluation. |
| 15 | Persist | pipeline | Re-rank by `overall_score` (descending), rewrite the workbook, write `atlas_checkpoint.json`, move the PDF to its decision folder. |

**Timing keys.** Per-résumé timings are a `dict[str, float]` with keys `github`, `linkedin`, `portfolio`, `pdf`, `ocr`, `ocr_used` (a 0/1 flag), `llm`, and, added by the pipeline, `scrape`, `move`, `excel`, `total`, and `folder` in watch mode. `llm` is wall-clock time for prompt building plus all attempts.

---

## 7. Data models

All models are in [models/candidate.py](models/candidate.py). They are Pydantic v2 models with `extra="forbid"`, so any unexpected key fails validation. That includes keys an LLM might invent.

| Model | Produced by | Consumed by | Notes |
|---|---|---|---|
| `SocialLinks` | `_classify_links` | profile, `_to_record` | `all_urls`, `github_url`, `linkedin_url`, `portfolio_url`, `other_urls` |
| `CandidateProfile` | `build_profile` | prompt builder, `_to_record`, debug artifacts | The heuristic view of the résumé. `resume_file` is the full path; `resume_name` is the file name only. |
| `CandidateEvaluation` | LLM JSON, then `model_validate` | `_to_record` | The strict contract with the model. Required: `overall_score`, `technical_score`, `github_score`, `projects_score`, `leadership_score`, `communication_score`, `achievements_score` (all integers 0–100), `recommendation` (one of `"Shortlisted"`, `"Maybe"`, `"Rejected"`), and `summary`. Optional, defaulting to 0 or empty: `name`, `email`, `skills_score`, `experience_score`, `resume_quality_score`, `strengths`, `weaknesses`. |
| `ScreeningRecord` | `_to_record`, `ExcelExporter.load_existing_records` | Excel exporter, checkpoint, stats | One report row. `resume_file` holds the **file name**, which is the de-duplication key everywhere. |
| `RunSummary` | `run_once`, watch loop | `ui.show_completion` | Counts plus the report path. |

These are not Pydantic models but carry data between stages:

- `PDFExtractionResult` (in `pdf_parser`). It delegates unknown attributes to `.text`, so tests can treat it like a string, e.g. `"x" in result`.
- `OcrResult`, `FetchOutcome`, `ScrapedPage`, `OllamaHealth`, `EvaluationOutcome`, `ProcessOutcome`, `PipelineStats`, `ResumeResult`, `QueueItem`. All are dataclasses.

---

## 8. LLM integration (Ollama)

### Request — [llm/ollama.py:64-140](llm/ollama.py#L64-L140)

```jsonc
POST {OLLAMA_BASE_URL}/api/chat          // timeout 60 s, stream=True
{
  "model": "qwen3:8b",
  "stream": true,
  "format": "json",            // Ollama JSON mode
  "think": false,              // disables Qwen3 "thinking" output
  "options": { "temperature": 0.0, "top_p": 0.9, "top_k": 40, "num_ctx": 8192, "num_predict": 256 },
  "messages": [{ "role": "user", "content": "<prompt>" }]
}
```

- There is only one user message and no system message. The prompt text lives in [llm/prompts.py](llm/prompts.py).
- The client reads the stream line by line as NDJSON, joins the `message.content` pieces, and stops at `done: true`.
- If no content arrived, it tries in turn: `message.content` of the final payload, then `message.thinking`, then `response`. If all are empty it raises `ValueError`.
- `_parse_json_payload` tries `orjson.loads`. If that fails, it strips Markdown code fences and parses the text between the first `{` and the last `}`.
- **Every request is logged** to `logs/ollama/` under a `YYYYMMDD_HHMMSS_ffffff` prefix: `_request.json`, `_raw_response.ndjson`, `_parsed_response.json`, `_timings.json`, and `_error.txt` when there is an error. Nothing ever deletes these files.
- `health_check()` calls `GET /api/tags` and needs an **exact** match on the model name (so `qwen3:8b` does not match `qwen3:latest`).

### Prompt — [llm/prompts.py](llm/prompts.py)

The prompt says, in short: "Return only valid JSON with exactly these 16 keys; scores are integers from 0 to 100; the recommendation follows the thresholds; keep the summary, strengths and weaknesses short." The threshold values are inserted into the text. The profile payload is appended as compact JSON:

```jsonc
{
  "file": "...", "name": "...", "email": "...", "phone": "...", "college": "...", "degree": "...",
  "summary":        "<heuristic digest, ≤ source_limit>",
  "excerpt":        "<first N chars of résumé text, ≤ resume_limit>",
  "skills":         ["≤10"], "projects": ["≤6"], "achievements": ["≤6"],
  "leadership":     ["≤6"],  "communication": ["≤6"], "github_signals": ["≤6"],
  "sources":        { "github": "...", "linkedin": "...", "portfolio": "...", "failures": "{json}" },
  "ocr_used":       false
}
```

Estimated tokens are calculated as `len(prompt) / 4` and logged as `Prompt stats for ...`.

---

## 9. Scoring and decisions

### Decision (authoritative) — [config.py:156-163](config.py#L156-L163)

| `overall_score` | Decision and folder |
|---|---|
| 60 or more (`SHORTLIST_THRESHOLD`) | `Shortlisted` |
| 50–59 (`MAYBE_THRESHOLD`) | `Maybe` |
| below 50 | `Rejected` |

Two fields in each record carry a verdict, and they can disagree:

- **`decision`**: calculated by code from `overall_score`. It decides the folder, which sheet the record goes on, and the checkpoint.
- **`recommendation`**: whatever the LLM returned. It is only displayed, except that the SUMMARY sheet counts by it (see [§17](#17-known-issues-risks-and-doc-drift)).

The prompt tells the model the threshold rule, so the two usually agree.

### Derived sub-scores — [agents/evaluator.py:469-487](agents/evaluator.py#L469-L487)

These formulas apply only when the LLM's value is `0` or missing. All results are clamped to 0–100.

| Score | Formula |
|---|---|
| `skills_score` | `0.6·technical + 5·count(profile.skills) + 3·count(profile.github_signals)` |
| `experience_score` | `0.4·projects + 0.3·leadership + 0.3·achievements` |
| `resume_quality_score` | `0.4·communication + 0.4·technical + 4·count of non-empty (name, email, phone, college, degree)` |

`overall_score` is **never** recalculated. It always comes from the LLM.

---

## 10. Links, scraping and network resilience

### Two layers of "offline"

1. **Per run.** `has_internet_connectivity()` tries a TCP connection to `1.1.1.1:53` with a 1-second timeout, once, in `AtlasPipeline.__init__`. If it fails, `internet_available=False` and no scraper is called for the whole run; every source becomes `"Unavailable"`.
2. **Circuit breaker.** `NetworkMonitor` ([scrapers/common.py:64-95](scrapers/common.py#L64-L95)) counts **consecutive failed attempts**. Each retry counts, so one failing URL adds 3. On the 5th, scraping is disabled for 300 seconds. After that it probes connectivity again: if the probe succeeds the breaker resets, otherwise it stays disabled for another 300 seconds. While disabled, `fetch_html` returns `Unavailable` at once.

### `fetch_html` — [scrapers/common.py:192-221](scrapers/common.py#L192-L221)

- Up to 3 attempts, with sleeps of 0, 1 and 2 seconds before each one (patched out in tests). Uses `requests.get` with `timeout=20`, `allow_redirects=True`, and a custom User-Agent `AtlasResumeScreening/1.0`.
- **It never raises.** It returns a `FetchOutcome(available=False, reason=...)`. DNS errors are rewritten to a readable message.
- It optionally wraps the request in `_dns_resolution_override`, which **temporarily monkey-patches `socket.getaddrinfo` for the whole process** to resolve through 1.1.1.1 and 8.8.8.8. This only happens if `dnspython` can be imported. It is *not* in `requirements.txt`, so by default this override does nothing.

### Page summaries

`parse_page_summary` uses BeautifulSoup to get `title | meta description | visible text` with whitespace collapsed. The GitHub and LinkedIn scrapers keep 1,500 characters and the portfolio scraper keeps 1,800. The evaluator then caps at `MAX_SCRAPED_TEXT_CHARS=2500`, a limit that never takes effect because the scrapers already cut shorter. The prompt builder then trims again to `source_limit`.

Expect LinkedIn to serve an authentication wall to anonymous clients. The "LinkedIn summary" is therefore often login-page boilerplate rather than profile data.

---

## 11. Excel report

[exporters/excel.py](exporters/excel.py). The workbook is **rebuilt from scratch and saved after every résumé**, plus once before and once after the loop.

| Sheet | Contents |
|---|---|
| `ALL CANDIDATES` | Every record, sorted by `overall_score` descending, with `rank` recalculated |
| `SHORTLISTED`, `MAYBE`, `REJECTED` | Records split by **`decision`** |
| `SUMMARY` | Processed, Shortlisted, Maybe, Rejected (counted by **`recommendation`**), Failed, highest/lowest/average score, average processing/OCR/scrape/LLM/Excel time, total runtime, timestamp |

The record sheets have 18 columns, in this order:

> Rank, Candidate Name, Email, Phone, Degree, Overall Score, GitHub Score, Skills Score, Projects Score, Experience Score, Achievements Score, Leadership Score, Communication Score, Resume Quality Score, Recommendation, Decision, Summary, Resume Filename

Formatting: the header row has a dark fill (`1F2937`) and bold white text; panes are frozen at `A2`; auto-filter is on; column widths are sized automatically up to 45.

`ScreeningRecord` fields that are **not** columns, and so are lost when the workbook is reloaded: `technical_score`, `college`, `strengths`, `weaknesses`, `github_url`, `linkedin_url`, `portfolio_url`, `processing_time_seconds`.

`_save_workbook` makes 3 attempts and checks each save by reopening the file (see [§17](#17-known-issues-risks-and-doc-drift) for a bug in the retry). If the workbook is open in Excel on Windows, the save fails with `PermissionError`, and after 3 attempts that error escapes the run.

---

## 12. Persistence and re-runs

State that survives a restart:

| Store | Written | Read | Used for |
|---|---|---|---|
| `Candidates.xlsx` (`ALL CANDIDATES`) | After every résumé | At the start of `run_once` | Cumulative report; skipping file names already processed |
| `atlas_checkpoint.json` | After every successful résumé | `AtlasPipeline.__init__` | Moving a file to its decision folder without re-evaluating it, when the workbook no longer has its row |
| Folder location of each PDF | Moves | Listing `Incoming` | Anything no longer in `Incoming` is never looked at again |

Checkpoint format:

```json
{
  "completed": { "jane_doe.pdf": { "decision": "Shortlisted", "destination": "Shortlisted" } },
  "updated": "2026-09-26T21:30:00"
}
```

**The identity key is the file name only.** Two different candidates who both submit `resume.pdf` collide. A candidate who resubmits an updated file under the same name is skipped in run-once mode. The file stays in `Incoming` and is never re-scored.

**To re-screen everything:** delete `Candidates.xlsx` and `atlas_checkpoint.json` and move the PDFs back into `Incoming`. `startCmds.md` has a PowerShell clean-up command; it assumes the working directory is the workspace root.

---

## 13. Logging and the terminal UI

### Logger — [utils/logger.py](utils/logger.py)

- One logger, `logging.getLogger("atlas")`, at level INFO with `propagate=False`.
- `FileHandler` writes to `logs/atlas.log` in UTF-8. It receives **everything**, including tracebacks.
- The console handler is `AtlasConsoleHandler` if `main.py` registered a factory; otherwise it is `ConciseConsoleHandler`, which strips tracebacks.
- `configure_logging` returns early if handlers are already attached, so calling it more than once is harmless. That is also why the factory must be registered first.

### The UI is driven by log messages

The pipeline never calls the UI directly while processing. **The UI reads the progress of the run from log message text**, in [`AtlasTerminalUI.handle_log`](ui/terminal.py#L135):

| Log message (exact wording matters) | Emitted by | UI reaction |
|---|---|---|
| `Starting batch with N PDF(s)` | `run_once` | Sets the planned total |
| `Processing <file>` | `_process_pdf` | Updates the progress-bar label |
| `[i/N] file \| ocr \| github \| linkedin \| portfolio \| Overall S \| Decision D \| Time T sec \| ETA E sec` | `_render_dashboard` | Parsed by `DASHBOARD_PATTERN` into a `ResumeResult`, then a figlet decision card and status panels are drawn and the counters updated |
| Any `ERROR` | anywhere | "Failed" panel; failed count +1 |
| `WARNING` containing unavailable, missing, fallback, moving or internet connection (but not retrying) | anywhere | Warning panel, de-duplicated. "moving" together with "failed" adds 1 to the failed count. |
| `No PDFs found in Incoming.` / `Atlas watch mode started.` / `...stopped...` | pipeline | Info panels |
| Any other INFO | | Not shown on the console (still written to the file) |

> ⚠️ If you change the wording of `_render_dashboard`, `"Processing "` or `"Starting batch with "`, you must update `DASHBOARD_PATTERN` and `handle_log` too, or the UI will quietly stop updating.

The completion panel (`show_completion`) takes its numbers from the UI's **own counters** (built from parsed log lines), not from `RunSummary`, apart from `report_file`.

---

## 14. Failure handling

| Situation | Where it is caught | Result |
|---|---|---|
| Ollama down or model missing (run-once, debug) | nowhere | `RuntimeError` crashes the process |
| Ollama down or model missing (watch) | `run_watch_mode` | error logged, exit code `1` |
| PDF corrupt or unreadable | `PDFParser` → `PDFParseError` → `ProfileParseError` | PDF moved to **Failed** |
| No text layer and OCR finds nothing or fails | `PDFParseError` | PDF moved to **Failed** |
| One scrape fails (DNS, SSL, timeout, 4xx/5xx, reset) | `fetch_html` | source = `"Unavailable"`, warning logged, **evaluation continues** |
| No internet at start-up | `AtlasPipeline.__init__` | one warning; scraping skipped for the run |
| Repeated network failures | `NetworkMonitor` | scraping paused for 300 s |
| LLM HTTP error, timeout, empty response or bad JSON | `_evaluate_profile` | 1 retry, then `FatalEvaluationError` → **Failed** |
| JSON fails the Pydantic schema (missing key, extra key, out-of-range score, bad recommendation) | `_evaluate_profile` | same as above → **Failed** |
| Any other exception inside `evaluate_with_timing` | `_process_pdf` | `logger.exception` → **Failed** |
| PDF move fails (file missing, target locked, Windows error 5 or 32) | `_move_pdf` | up to 4 attempts, 0.5 s apart; target deleted first if it exists; failure is **only a warning** |
| Workbook save fails 3 times | nowhere | exception escapes and the run ends |
| Checkpoint JSON corrupt | `_load_checkpoint` | treated as empty |
| Existing workbook unreadable | `load_existing_records` | treated as empty (and then overwritten) |

---

## 15. Configuration reference

Everything is in [config.py](config.py). There are no environment variables, no CLI overrides beyond the two flags, and no config file. `DEFAULT_CONFIG` is a module-level singleton.

| Constant / field | Default | Used by | Status |
|---|---|---|---|
| `WORKSPACE_ROOT` | `c:\this is dekstop\atlas` | `AtlasPaths` | **Edit on a new machine** |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://127.0.0.1:11434` / `qwen3:8b` | `OllamaClient`, UI banner | used |
| `SHORTLIST_THRESHOLD` / `MAYBE_THRESHOLD` | 60 / 50 | `decision_for_score`, prompt | used |
| `OLLAMA_TIMEOUT_SECONDS` | 60 | `/api/chat` request | used |
| `OLLAMA_MAX_RETRIES` | 1 (2 attempts in total) | `_evaluate_profile` | used |
| `OLLAMA_TEMPERATURE`, `_TOP_P`, `_TOP_K`, `_NUM_CTX`, `_NUM_PREDICT`, `_THINK` | 0.0, 0.9, 40, 8192, 256, False | request options | used |
| `REQUEST_TIMEOUT_SECONDS` | 20 | scrapers, `/api/tags` | used |
| `MAX_RESUME_EXCERPT_CHARS` | 2500 | excerpt, starting prompt limit | used |
| `MAX_SOURCE_SUMMARY_CHARS` | 1500 | starting prompt source limit | used |
| `MAX_SCRAPED_TEXT_CHARS` | 2500 | `_scrape_links` | used (never takes effect; scrapers cut at 1500–1800) |
| `MAX_LINKS_PER_RESUME` | 5 | `build_profile` | used |
| `MAX_PROMPT_CHARS` | 5000 | `_build_prompt` | used |
| `MAX_PROMPT_ESTIMATED_TOKENS` | 1300 | only caps the *logged* token estimate | cosmetic |
| `MAX_DEBUG_ARTIFACT_CHARS` | 20000 | debug artifacts | used |
| `NETWORK_FAILURE_THRESHOLD` / `NETWORK_RECOVERY_SECONDS` | 5 / 300 | `NetworkMonitor` | used |
| `DNS_RESOLVERS` | 1.1.1.1, 8.8.8.8 | DNS override | used only if `dnspython` is installed |
| `PREPROCESS_WORKERS` | 6 | — | **unused** |
| `OLLAMA_RETRY_DELAYS` | (0, 1) | — | **unused** (no delay between LLM retries) |
| `OCR_TIMEOUT_SECONDS`, `OCR_MAX_RETRIES`, `OCR_RETRY_DELAYS` | 60, 1, (0, 1) | — | **unused** |
| `PROGRESS_REFRESH_SECONDS` | 1.0 | — | **unused** |
| `paths.processing`, `paths.docs` | | `ensure_directories` only | created but never used |

The connectivity probe target `1.1.1.1:53` is hardcoded in `has_internet_connectivity`. It does not come from `DNS_RESOLVERS`.

---

## 16. Testing

```bash
python -m unittest discover -s tests -v
```

The tests need the packages in `requirements.txt` installed, because they import `fitz`, `openpyxl`, `rich` and so on. They do **not** need Ollama or internet access.

| File | Tests | What it covers |
|---|---|---|
| `test_imports.py` | 1 | Every module imports, including `main` (so `rich`, `pyfiglet` and `colorama` must be installed) |
| `test_models.py` | 3 | Pydantic validation of evaluation, profile and record |
| `test_parsers.py` | 7 | PDF text extraction; visible, annotation, merged, de-duplicated, malformed and missing links. Builds PDFs on the fly with `fitz`. |
| `test_evaluator_links.py` | 1 | `build_profile` classifies github, linkedin and portfolio and logs link counts |
| `test_ollama.py` | 2 | `health_check` parsing; `evaluate_json` with a mocked session |
| `test_excel.py` | 1 | Workbook file is created |
| `test_logging.py` | 1 | `atlas.log` is written. Explicitly closes handlers so Windows can clean up the temp folder. |
| `test_pipeline.py` | 1 | End-to-end `run_once`: PDF → Shortlisted, report exists |
| `test_pipeline_resilience.py` | 3 | Broken scrapes don't fail a résumé while a corrupt PDF goes to Failed; repeated LLM exception → Failed; schema-invalid JSON → Failed |
| `test_scraper_resilience.py` | 12 | Success; 404; invalid URL; SSL; timeout; connection reset; LinkedIn and portfolio failures; offline means no HTTP calls; connectivity probe returns false |

**Mocking patterns to reuse:**

```python
paths  = AtlasPaths(root=Path(tmp))                   # __post_init__ moves every path under tmp
config = AtlasConfig(paths=paths)
client = OllamaClient(config)
client.ensure_ready  = MagicMock(return_value=None)
client.evaluate_json = MagicMock(return_value={...})  # the pipeline calls evaluate_json, not _with_metrics
patch("core.pipeline.has_internet_connectivity", return_value=True)   # patch where it is imported
patch("scrapers.common.requests.get", side_effect=...)
patch("scrapers.common.time.sleep", return_value=None)                  # skip retry delays
```

**Side effect to know about:** tests that build `AtlasConfig()` with default paths, such as `test_ollama.py`, create `logs/ollama/` under the **hardcoded** `WORKSPACE_ROOT`. On non-Windows systems that string is a relative path, so you get a folder literally named `c:\this is dekstop\atlas` in the current directory.

Not covered by tests: watch mode, `--debug-one`, the terminal UI, the OCR path, the checkpoint and seeding logic, the Excel retry logic, and the DNS override.

`report.md` records a 32/32 pass. The suite was **not** re-run while this document was written, because no Python interpreter was available on this machine.

---

## 17. Known issues, risks and doc drift

These were found by reading the code; they are not reproduced bugs. Severity is a rough guide.

### Behaviour and bugs

| # | Severity | Issue | Where |
|---|---|---|---|
| 1 | High | **The workspace root is hardcoded** to one developer's path, outside the repo. The README's project tree suggests `workspace/` sits inside the repo. | [config.py:13](config.py#L13) |
| 2 | High | **Watch mode overwrites the report.** It starts with `records = []` and never calls `_seed_existing_records`, so its first export replaces `Candidates.xlsx` with only the current session's candidates. It also ignores the checkpoint. | [core/pipeline.py:492](core/pipeline.py#L492) |
| 3 | High | **`--debug-one` overwrites the report** with a single row. | [core/pipeline.py:400](core/pipeline.py#L400) |
| 4 | Medium | **The workbook save retry writes an empty workbook.** After a failed attempt, `_save_workbook` rebuilds with `self._build_workbook([], None)`. If the retry succeeds, the saved report is empty until the next export. | [exporters/excel.py:214](exporters/excel.py#L214) |
| 5 | Medium | A workbook locked by Excel ends the whole run-once batch, because export is outside the per-résumé `try`. | [core/pipeline.py:226](core/pipeline.py#L226) |
| 6 | Medium | If Ollama is not ready in run-once or debug mode, the process exits with a raw traceback. There is no friendly message. | [core/pipeline.py:181](core/pipeline.py#L181) |
| 7 | Medium | Re-runs identify résumés by **file name** only. A file name already in the workbook is skipped silently and left in `Incoming`. Different candidates with the same file name collide. | [core/pipeline.py:187-193](core/pipeline.py#L187-L193) |
| 8 | Medium | `OLLAMA_NUM_PREDICT = 256` is tight for 16 keys plus a summary and two arrays. If the output is cut off, the JSON is invalid, the call is retried, and the résumé ends up in **Failed**. Watch for this if many résumés fail. | [config.py:28](config.py#L28) |
| 9 | Low | The SUMMARY sheet counts Shortlisted, Maybe and Rejected by the LLM's `recommendation`, while the sheets and folders use the calculated `decision`. | [exporters/excel.py:166](exporters/excel.py#L166) |
| 10 | Low | `technical_score` is never written to Excel. `college`, strengths, weaknesses, URLs and timing are not columns either, so rows reloaded on a later run lose them. | [exporters/excel.py:23-42](exporters/excel.py#L23-L42) |
| 11 | Low | A *second* GitHub or LinkedIn link, such as a repo URL, is classified as the **portfolio**, because github.com and linkedin.com are not in the platform exclusion list. | [agents/evaluator.py:266-300](agents/evaluator.py#L266-L300) |
| 12 | Low | A genuine LLM score of `0` for skills, experience or résumé quality is replaced by the formula value, because the code uses `or`. | [agents/evaluator.py:471-473](agents/evaluator.py#L471-L473) |
| 13 | Low | `PipelineStats.run_started` defaults to `time.perf_counter()`, which is evaluated **once when the module is imported**, not per instance. "Total Runtime" is therefore measured from the import. | [core/pipeline.py:54](core/pipeline.py#L54) |
| 14 | Low | Watch mode listens only for `on_created`. Files renamed or moved into `Incoming` (for example, browser downloads that finish with a rename) are not seen until the next restart. A large file can be picked up before copying has finished and then fail to parse. | [core/pipeline.py:431](core/pipeline.py#L431) |
| 15 | Low | `RunSummary.processed` counts records from earlier runs too. | [core/pipeline.py:235](core/pipeline.py#L235) |
| 16 | Low | The whole GitHub summary goes into the prompt twice (`sources.github` and `github_signals`), and `github_signals` is not reduced by the prompt-shrinking loop. | [agents/evaluator.py:356-360](agents/evaluator.py#L356-L360) |
| 17 | Low | The heuristics are rough. Skills are substring matches, so `java` also matches inside `javascript`. The phone regex is US-style. Achievement, leadership and communication "signals" are bare keywords. | [agents/evaluator.py:385-427](agents/evaluator.py#L385-L427) |
| 18 | Info | Watch mode shows no progress bar if `Incoming` was empty at start-up. | [ui/terminal.py:113](ui/terminal.py#L113) |

### Privacy and "offline" caveats

- `logs/ollama/` keeps every prompt and response, which means résumé excerpts and personal details, forever. Nothing rotates or deletes them.
- EasyOCR is created with `download_enabled=True`, so the **first OCR run downloads model weights** from the internet. On a fully offline machine OCR fails until the weights are cached.
- Scraping sends requests to URLs taken from résumés, meaning third-party sites the candidate chose. Only the URL is sent, never résumé content.
- The DNS override (if `dnspython` is installed) patches `socket.getaddrinfo` for the whole process while each request is in flight.

### Dead code and unused dependencies

- Unused config: `PREPROCESS_WORKERS`, `OLLAMA_RETRY_DELAYS`, `OCR_TIMEOUT_SECONDS`, `OCR_MAX_RETRIES`, `OCR_RETRY_DELAYS`, `PROGRESS_REFRESH_SECONDS`. Unused folders: `Processing/`, `docs/`.
- Unused code: `CandidateEvaluator._profile_payload`, `FetchOutcome.as_summary`, `ResumePathQueue.close` / `__iter__` / `get_nowait`.
- `tqdm` is in `requirements.txt` but is never imported. `dnspython` is imported but is **not** in `requirements.txt`. PyTorch arrives indirectly through `easyocr`.

### Where the older docs disagree with the code

| Doc says | Code does |
|---|---|
| `implementation.md`: "parallelizes preprocessing" | Everything is sequential; `PREPROCESS_WORKERS` is unused |
| `implementation.md`: `main.py` "verifies the environment" | `AtlasPipeline.run_once` / `run_watch_mode` call `ensure_ready()` |
| `report.md`: checkpoint and workbook are persisted **before** the move | True only in watch mode. Run-once mode moves first. |
| `testingReports.md`: report is `atlas_screening_report.xlsx`; 26 tests | Report is `Candidates.xlsx`; there are 32 tests |
| `README.md`: OCR engine is configurable in `config.py` | EasyOCR is hardcoded |
| `README.md`: project tree shows `workspace/` and `logs/` in the repo | They live under `WORKSPACE_ROOT` |
| `report.md` links | Point to `c:\this is dekstop\atlas\...`, not repository-relative paths |

---

## 18. Recipes for common changes

**Use a different model.** Set `OLLAMA_MODEL` and run `ollama pull <tag>`. The tag must match `/api/tags` exactly. Check that the model follows `format: "json"` well and consider raising `OLLAMA_NUM_PREDICT`.

**Change the thresholds.** Edit `SHORTLIST_THRESHOLD` / `MAYBE_THRESHOLD`. The new values reach both `decision_for_score` and the prompt. Rows already in the workbook keep their old `decision`.

**Add a score dimension (e.g. `culture_score`).**
1. `CandidateEvaluation`: add `culture_score: int = Field(default=0, ge=0, le=100)`. The default keeps it optional for the LLM.
2. `llm/prompts.py`: add the key to the "exactly these keys" list.
3. `ScreeningRecord`: add the field. In `AtlasPipeline._to_record`, map it.
4. `ExcelExporter`: add it to `HEADERS` **and** to the `values` list in `_write_records` at the same position, and to `load_existing_records`.
5. Optional: add a formula in `_enrich_scores`.

**Add a new external source (e.g. LeetCode).**
1. Create `scrapers/leetcode.py` with `can_handle(url)` and `scrape(url, timeout, monitor, config) -> FetchOutcome`, built on `fetch_html` and `parse_page_summary`.
2. Add a `SocialLinks` field and classify the URL in `_classify_links`, before the portfolio branch.
3. Instantiate the scraper in `CandidateEvaluator.__init__` and dispatch to it in `_scrape_single` **before** `PortfolioScraper`, which accepts every http(s) URL.
4. Add the label to the `(label, url)` tuple in `_scrape_links`.
5. The source names `github`, `linkedin` and `portfolio` are hardcoded in the timing sums in `core/pipeline.py`, in `_prompt_stats`, and in the dashboard line. The UI regex expects **exactly three** source statuses. Update all of them together.

**Add an Excel column.** Update `HEADERS`, the `values` list in `_write_records` (same order), and `load_existing_records`.

**Change the dashboard log line.** Update `DASHBOARD_PATTERN` in `ui/terminal.py` at the same time.

**Keep data inside the repo.** Set `WORKSPACE_ROOT = Path(__file__).resolve().parent`.

**Debug a bad score.** Run `python main.py --debug-one path/to.pdf` and read `workspace/Debug/<stem>/prompt.txt` and `validated-json.json`, or the matching `logs/ollama/<timestamp>_*` files.

---

## 19. Glossary

| Term | Meaning |
|---|---|
| **Atlas** | The project's original name; same as QWENTUS |
| **Decision** | Folder and sheet bucket calculated by code from `overall_score` |
| **Recommendation** | The LLM's own verdict string. Only displayed. |
| **Source** | One of `github`, `linkedin` or `portfolio`; the external pages that get scraped |
| **Unavailable** | The placeholder string stored in `source_summaries` when a source could not be fetched |
| **Signature** | `(name, size, mtime_ns)`, used by watch mode to de-duplicate filesystem events |
| **Checkpoint** | `atlas_checkpoint.json`, mapping file name to decision for completed résumés |
| **Seeding** | Loading earlier rows from `Candidates.xlsx` into memory when `run_once` starts |
| **Dashboard line** | The pipe-separated INFO log line that `AtlasTerminalUI` parses to draw result cards |
| **Fatal failure** | Anything that sends a PDF to `Failed`: parse or OCR failure, LLM or validation failure after retries, or an unexpected exception |
