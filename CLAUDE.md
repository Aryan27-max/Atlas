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
│   ├── legacy/UNDERSTANDING.md   ← how the old QWENTUS CLI worked + its bugs
│   └── summaries/       ← per-step summaries, PHASE*_SUMMARY.md, CHANGELOG.md
├── legacy/qwentus/      ← old source, REFERENCE ONLY, never import
├── engine/              ← Python: all logic
│   ├── db.py            ← SQLite, state machine, crash recovery        [done]
│   ├── buckets.py       ← view-time bucketing, min fill, ties          [done]
│   ├── errors.py        ← CandidateError / SystemUnavailable / TransientError + all recruiter wording [done]
│   ├── ingest/          ← csv_loader.py, links.py, downloader.py      [done]
│   ├── extract/         ← PDF text, OCR fallback, section extraction    [done]
│   ├── llm/             ← Ollama client, redaction, prompt, verify, scorer, pre-check [done]
│   ├── worker.py        ← resumable job loop                            [done]
│   ├── health.py        ← internet / Ollama probes                      [done]
│   ├── logs.py          ← engine.log (rotating, PII scrubbed)           [done]
│   ├── export.py        ← CSV export                                    [done]
│   ├── cli.py           ← headless proof of Phase 1                     [next]
│   ├── server.py        ← local API for the UI
│   └── tests/
└── app/                 ← Electron + React (Phase 2)
```

Update the `[done]` / `[next]` markers when a step lands.

---

## Commands

```bash
# run all engine tests (from repo root)
python -m unittest discover -s engine/tests -t .

# one module
python -m unittest engine.tests.test_db -v
```

Python **3.11+**. Stdlib `unittest` only — no pytest. Tests must not need Ollama or the internet: mock `requests`, the Ollama client, and `time.sleep`.

---

## How to work in this repo

- **Tests with every change.** New behaviour → new test. Bug fix → a test that fails before the fix. Don't mark a step done with failing tests.
- **Failure paths are the feature.** For any new I/O code, write tests for: timeout, connection reset, HTTP 403/404/429/5xx, truncated body, wrong content type, disk full, and process killed mid-operation.
- **Kill tests stay green.** `engine/tests/test_kill.py` kills a DB writer 20× and `engine/tests/test_worker_kill.py` kills the real worker 20×; both check integrity and consistency, and both run on Windows too (`Popen.kill()`). Any change to `db.py` or `worker.py` must keep them passing; extend them when you add states.
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
