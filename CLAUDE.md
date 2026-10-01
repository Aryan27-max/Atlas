# CLAUDE.md — Atlas

Atlas is a desktop app (macOS + Windows) for a recruiting firm. A recruiter uploads a CSV of students with résumé links; Atlas downloads each résumé, extracts the text, scores it with a **local** LLM (Ollama) against the recruiter's criteria, and sorts candidates into **Shortlisted / Cutoff / Rejected**.

Read **[ARCHITECTURE.md](ARCHITECTURE.md)** before changing anything structural. Read **[PLAN.md](PLAN.md)** to see which phase and step is current.

---

## The one promise

> **No data is ever lost, and any run can be killed at any moment and resumed exactly where it stopped.**

Every change is judged against this. If a change makes it weaker, it is wrong, however convenient.

---

## Hard rules (never break these)

1. **All state lives in SQLite (`engine/db.py`).** No JSON checkpoints, no Excel as a store, no in-memory-only progress. If it matters after a crash, it's in the DB.
2. **Candidate state changes only through `Database` methods** (`start_download`, `commit_extraction`, `save_evaluation`, `mark_failed`, …). Never `UPDATE candidates SET state = …` anywhere else. Every transition names the state it expects.
3. **Work product and state commit together.** Extracted text + `extracted` in one transaction; evaluation + `scored` in one transaction.
4. **Delete a PDF only after `commit_extraction` returns.** Never before. Never based on counting ("delete #1 when #3 arrives").
5. **System failure ≠ candidate failure.** Internet down, Ollama down, disk full → **pause the run** (`set_run_status(..., "paused", reason=...)`) and return in-flight candidates with `return_to_queue` / `return_to_extracted`. `mark_failed` is only for problems with *that candidate's* file or link.
6. **Every failure has a kind and a human reason.** `kind` is `permanent` (private link, not a PDF, over 20 MB, Google Doc/folder link) or `retryable` (timeout, rate limit, 5xx, invalid LLM JSON). The reason is shown to a recruiter verbatim — write it for them: "Link is private — ask the student to set sharing to 'Anyone with the link'", never "HTTP 403".
7. **Buckets are never stored.** Shortlisted/Cutoff/Rejected are computed at view time by `engine/buckets.py` from raw scores + cutoffs + overrides. Don't add a `bucket` column.
8. **Cutoffs never go into the LLM prompt.** The model scores; code decides.
9. **Identity fields never reach the LLM.** Name, email, phone, RA number, section and photos are stripped from anything sent to the model. The LLM sees résumé content, CGPA, department, and the student's self-reported skills/hackathons *as claims to verify*.
10. **Résumé text is fenced in the prompt** and treated as untrusted data. Instructions inside a résumé ("ignore previous instructions…") must have no effect. Scores are validated (Pydantic, `extra="forbid"`, 0–100 ints).
11. **Run config is locked once a run starts** (model, criteria prompt, cutoffs, filters). `configure_run` enforces this; don't bypass it.
12. **RA number is the candidate key** (unique per run). File names mean nothing.
13. **Long résumés are handled by section extraction, never by truncating to the first N characters.**
14. **CSV export:** UTF-8 **with BOM**, and escape any cell starting with `=`, `+`, `-`, `@`, tab or CR (formula injection).
15. **Nothing leaves the machine except:** HTTP GETs to résumé links and public profile URLs, and model downloads from Ollama. Never send résumé text to any remote service. Never log full résumé text or PII to disk outside SQLite.
16. **The UI holds no business logic.** Electron renderer → local API → engine. Scoring, bucketing, validation and state all live in Python.

---

## Repo layout

```text
atlas/
├── CLAUDE.md            ← this file
├── ARCHITECTURE.md      ← design reference (read before structural changes)
├── PLAN.md              ← phases, steps, exit criteria, design rules
├── prompts/             ← execution prompts per phase (phase1.md, …)
├── docs/
│   ├── INSTALL.md · DATA_HANDLING.md · SIGNING.md · EVAL.md   ← for the firm and the owner
│   ├── TROUBLESHOOTING.md        ← GENERATED from engine/errors.py (python -m engine.tools.troubleshooting)
│   ├── legacy/UNDERSTANDING.md   ← how the old QWENTUS CLI worked + its bugs
│   └── summaries/       ← per-step summaries, PHASE*_SUMMARY.md, CHANGELOG.md
├── legacy/qwentus/      ← old source, REFERENCE ONLY, never import
├── engine/              ← Python: all logic
│   ├── db.py            ← SQLite, state machine, crash recovery        [done]
│   ├── buckets.py       ← view-time bucketing, min fill, ties          [done]
│   ├── errors.py        ← CandidateError / SystemUnavailable / TransientError + all recruiter wording [done]
│   ├── ingest/          ← csv_loader.py (.csv + .xlsx), links.py, downloader.py [done]
│   ├── extract/         ← PDF text, OCR fallback, section extraction    [done]
│   ├── llm/             ← Ollama client, identity lexicon + redaction, anchored rubric, prompt, verify, scorer, pre-check [done]
│   ├── eval/            ← scoring-quality harness + fictional set (`python -m engine.eval run`, docs/EVAL.md) [done]
│   ├── worker.py        ← resumable job loop                            [done]
│   ├── health.py        ← internet / Ollama probes                      [done]
│   ├── logs.py          ← engine.log (rotating, PII scrubbed)           [done]
│   ├── export.py        ← CSV export                                    [done]
│   ├── estimate.py      ← time estimate (measured / history / pre-check / hardware prior) [done]
│   ├── hardware.py      ← what computer this is (CPU, RAM, GPU in use per Ollama) [done]
│   ├── ollama_setup.py  ← find the installed Ollama and start it (never installs) [done]
│   ├── cli.py           ← headless proof of Phase 1                     [done]
│   ├── server.py        ← local API for the app (FastAPI, 127.0.0.1)     [done]
│   ├── api_models.py    ← API request/response shapes → OpenAPI → TS types [done]
│   ├── filters.py       ← CGPA/department filter rule (worker + preview) [done]
│   ├── tools/           ← graph_audit, graph_query, leak_check (counts only), speed_bench, troubleshooting (writes docs/TROUBLESHOOTING.md) [done]
│   └── tests/           ← unittest; stubs/ = local fake Drive + Ollama; fixtures.py = generated PDFs
├── packaging/           ← PyInstaller engine.spec, build_engine.py + smoke_engine.py, icons/ (placeholder), mac entitlements [done]
├── .github/workflows/ci.yml ← test (Windows + macOS) and build (installers) jobs; .python-version = 3.12 [done]
└── app/                 ← Electron + React (Phase 2)
    ├── main/            ← engine process, IPC validation, SSE, window, keep-awake, native menus [done]
    ├── preload/         ← window.atlas bridge (no token, sandboxed)     [done]
    ├── renderer/design/ ← tokens.css + components + #/design gallery   [done]
    ├── renderer/screens/← Welcome, setup flow, Progress, Results, Settings [done]
    ├── src/shared/      ← api-schema.json → api-types.ts (generated), bridge.ts [done]
    └── e2e/, tests/     ← Playwright (Electron: flows, keyboard, perf, full screen) and Vitest [done]
                           Phase 2 done on Windows. Phase 3 done (3.0–3.8; docs/summaries/PHASE3_SUMMARY.md) except installing/uninstalling the Windows installer on this laptop, blocked by Smart App Control [owner's decision]
```

Update the `[done]` / `[next]` markers when a step lands.

---

## Navigating the codebase (graphify)

- **Start every task with `graphify-out/GRAPH_REPORT.md`** (committed, ~30 KB). Use its communities and hubs to pick the few files that matter; don't read whole directories.
- **Specific questions:** `python -m engine.tools.graph_query callers|callees|find|file <name>`, or `graphify query "…" --budget 1000`. **Never read `graph.json` whole** (~4 MB; local only, not committed).
- **The graph is a map, not the source of truth.** Read the real file before editing it. If the graph and the code disagree, the code wins: note that the graph is stale. `ARCHITECTURE.md` stays the design reference; the graph shows the code as it is.
- **Refresh after adding, moving or deleting modules:** `graphify update .` (code only, no LLM, seconds). Don't run a full `/graphify` rebuild for small edits (the first build cost ~745k tokens).
- **Privacy:** `.graphifyignore` keeps `local/` (and `.venv/`, `node_modules/`, build output, `legacy/`) out. After any build or update, run `python -m engine.tools.graph_audit`; every check must print `[OK ]` (no file under `local/` indexed; anything that looks like student data traces to the repo's own fictional files). Counts only, never values.

---

## Commands

```bash
# run all engine tests (from repo root)
python -m unittest discover -s engine/tests -t .

# one module
python -m unittest engine.tests.test_db -v

# the engine without a UI (see ARCHITECTURE §17 → Headless CLI)
python -m engine.cli --help

# the local API; after changing it, regenerate the schema the app's types come from
python -m engine.server --data-dir <dir> --port 0 --token <32+ chars>
python -m engine.server --openapi app/src/shared/api-schema.json

# the app (from app/): unit tests, type checks, end-to-end (builds first)
npm test && npm run typecheck && npm run e2e
npm run gen:api          # after re-exporting the schema
npm run dev              # the app with hot reload

# packaging (docs/SIGNING.md): the engine binary first, then the installer for this OS
python packaging/build_engine.py      # PyInstaller → dist/engine/atlas-engine + smoke test (release: Python 3.12)
npm run dist                          # from app/ → app/dist/ (installer + unpacked app)
npx playwright test e2e/packaged.spec.ts   # the packaged app reaches Welcome with its engine
```

On Windows with VS Code open on this repository, electron-builder can fail with `EPERM`/`EBUSY` on `app/dist/…/default_app.asar`: VS Code (an Electron app) keeps `.asar` files it has looked at open. Build elsewhere: `npx electron-builder --config electron-builder.yml -c.directories.output=<folder outside the repo>`, then `ATLAS_PACKAGED_DIR=<that folder>` for the packaged test. If Windows **Smart App Control** is on, the NSIS step fails with `spawn UNKNOWN`: Windows won't run electron-builder's unsigned uninstaller stub. The unpacked app (`win-unpacked/`) still builds and runs; build the installer in CI or with a signing certificate (docs/SIGNING.md). Never turn Smart App Control off yourself: it's the owner's system setting.

Python **3.11+**. Stdlib `unittest` only — no pytest. Tests must not need Ollama or the internet: mock `requests`, the Ollama client, and `time.sleep`.

---

## How to work in this repo

- **Tests with every change.** New behaviour → new test. Bug fix → a test that fails before the fix. Don't mark a step done with failing tests.
- **Failure paths are the feature.** For any new I/O code, write tests for: timeout, connection reset, HTTP 403/404/429/5xx, truncated body, wrong content type, disk full, and process killed mid-operation.
- **Kill tests stay green.** `engine/tests/test_kill.py` kills a DB writer 20× and `engine/tests/test_worker_kill.py` kills the real worker 20×; both check integrity and consistency, and both run on Windows too (`Popen.kill()`). Any change to `db.py` or `worker.py` must keep them passing; extend them when you add states.
- **Recruiter messages live in `engine/errors.py`.** After adding or rewording one, add its help in `engine/tools/troubleshooting.py` and run `python -m engine.tools.troubleshooting`; `test_tools` fails until `docs/TROUBLESHOOTING.md` matches.
- **Schema changes = migrations.** Bump `SCHEMA_VERSION` in `db.py`, add an `if version < N:` step in `_migrate`. Never edit an existing released schema in place.
- **Small, reviewable steps.** One PLAN.md step per change. Say which step you're on.
- **Summarise every step** in `docs/summaries/` (template in `prompts/phase1.md` → Summaries) and add a line to `docs/summaries/CHANGELOG.md`. The owner learns from these, so explain the *why*.
- **Ask before:** adding a dependency, changing the state machine, changing the promise-level rules above, or anything that sends data off the machine.
- **Style:** type hints everywhere, `from __future__ import annotations`, dataclasses/Pydantic for data, no bare `except:`. Catch specific exceptions and translate them into `failure_kind` + recruiter-readable reason at the boundary.
- **Don't reintroduce QWENTUS problems:** hardcoded paths (use the app data dir passed in), filename-as-identity, UI driven by parsing log strings, logs that store résumé text forever, `num_predict` too small for the JSON schema.

---

## Design rules (Phase 2 UI)

Apple-inspired, native on each OS. Full rules in PLAN.md → *Design system*.

- macOS: system font (SF Pro). Windows: bundled **Inter**. Never ship SF Pro or SF Symbols on Windows (licence).
- Icons: **Lucide**. 8-pt grid. Radii 6 / 10 / 14. Accent `#007AFF` light, `#0A84FF` dark.
- macOS: `hiddenInset` title bar, vibrancy sidebar. Windows 11: Mica, native controls on the right. No fake traffic lights on Windows.
- Spring motion 200–350 ms; respect `prefers-reduced-motion`. Light/dark follows the OS by default.
- Copy is calm, plain and specific. Every error tells the recruiter what happened and what to do next.

---

## Glossary

| Term | Meaning |
|---|---|
| **Run** | One screening job: one CSV, one model, one criteria prompt, one set of cutoffs |
| **Candidate** | One CSV row, keyed by RA number |
| **Bucket** | Shortlisted / Cutoff / Rejected — computed, never stored |
| **Fill** | Shortlisted only to reach the minimum count (labelled in the UI) |
| **Override** | Recruiter manually moved a candidate; logged; always wins |
| **Filtered** | Removed before scoring by a hard filter (CGPA / department) |
| **Pause** | Run stopped because of a system problem; resumes without losing work |
| **QWENTUS** | The old CLI this app grew out of. Its ideas are reused; its bugs are not |
