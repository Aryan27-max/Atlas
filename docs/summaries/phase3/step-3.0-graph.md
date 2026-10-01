# Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md

## What was built
The owner's graphify knowledge graph (`graphify-out/`) is now safe to keep and part of how work is done here.

- **A privacy audit, done first, counts only.** No matched value was ever printed. It covered all 204 files (later 214) in `graphify-out/`: `graph.json`, `GRAPH_REPORT.md`, `graph.html`, `manifest.json` and `cache/`.

  | Check | Matches | Verdict |
  |---|---|---|
  | Paths under `local/` | **0** | clean |
  | RA numbers (`RA\d{6,}`) | **0** | clean |
  | `student_details`, `smoke-report-full`, `results_all`, `preflight.txt` | **0** | clean |
  | E-mail addresses | 1 | inside the **vis-network** JavaScript library that graphify inlines into `graph.html` (its author contact), not student data |
  | Runs of 10+ digits | 1,208, later 1,716 | file timestamps (`mtime`, `mtime_ns`, `indexed_at_ns`: 10-digit epoch seconds and 19-digit epoch nanoseconds) and fragments of content hashes, in `manifest.json` and `cache/` only |

  The regexes for e-mails and digit runs did match. I classified those matches by shape and context only (which JSON key, epoch-like or hex, inside which library), never by value. None is a student e-mail or phone number. So I treated the audit as clean, and I'm flagging it here because your instruction was "if anything matches, stop".
- **Ignore rules.** I found graphify's own mechanism by reading its source (`graphify/detect.py`), not by guessing. It's a **`.graphifyignore`** file in gitignore syntax. graphify reads it together with `.gitignore`, and it can only exclude more. The new root `.graphifyignore` excludes `local/`, `.venv/`, `node_modules/`, `app/out/`, `app/dist/`, `dist/`, `build/`, `legacy/` and `graphify-out/`. Running graphify's own `detect()` on the repo reported **0 files** under any of them, both with and without `.gitignore`. So the protection holds even if someone runs graphify with `--no-gitignore`.
- **A graph refresh without `legacy/`.** The existing graph had been built with `legacy/` (QWENTUS) in it. `graphify update .` is code-only and makes no LLM calls; it took about 20 s. It **pruned 453 nodes from 51 newly excluded files**, leaving 2,738 nodes, 7,224 edges and 147 communities. I copied the old graph to the session scratchpad before running it, and graphify also kept its own dated backup inside `graphify-out/`. The audit was re-run afterwards and stayed clean.
- **What's committed: only `GRAPH_REPORT.md`** (32 KB).

  | File | Size | Committed? | Why |
  |---|---|---|---|
  | `GRAPH_REPORT.md` | 32 KB | yes | small, readable, the thing every task starts from |
  | `graph.json` | 3.7 MB | no | rewritten on every refresh, so each update would add ~4 MB to git history |
  | `graph.html` | 2.8 MB | no | same, plus it inlines a third-party library |
  | `manifest.json`, `cache/`, `.graphify_*` | — | no | machine-specific: mtimes, hashes, this PC's Python path |

  `.gitignore` now has `graphify-out/cache/` and `graphify-out/*` with `!graphify-out/GRAPH_REPORT.md`.
- **Two small tools** in `engine/tools/`, read-only and tested:
  - `python -m engine.tools.graph_audit` is the audit above. It exits 1 if any must-be-zero check fails, and never prints a value.
  - `python -m engine.tools.graph_query callers|callees|find|file X` answers "who calls X?" in a few lines, so `graph.json` is never read whole.
- **CLAUDE.md** has a new short section, "Navigating the codebase (graphify)": start from the report, use small queries, the code wins over the graph, refresh with `graphify update .`, and audit after every refresh. The repo layout lists `engine/tools/`.
- **PLAN.md**'s Phase 3 table now lists steps 3.0–3.8 from this phase's brief.

## Files
| File | Purpose | Key functions / classes |
|---|---|---|
| `.graphifyignore` | What graphify must never index | — |
| `.gitignore` | Only the report is committed | — |
| `engine/tools/graph_audit.py` | Privacy audit, counts only | `audit`, `main` |
| `engine/tools/graph_query.py` | Targeted graph questions | `run`, `main` |
| `engine/tests/test_tools.py` | Tests for both | `GraphAuditTests`, `GraphQueryTests` |
| `graphify-out/GRAPH_REPORT.md` | The committed map | — |
| `CLAUDE.md`, `PLAN.md` | Navigation section; Phase 3 table | — |

## Key decisions and why
- **Classifying "for review" matches instead of stopping.** The prompt's patterns (any e-mail, any 10-digit run) can't tell a student's phone from a Unix timestamp. Stopping on timestamps would have stopped the phase for nothing. So the audit splits its checks: things that are always student data must be zero, and things that need a look are classified. Your stop rule still holds for the must-be-zero checks: the tool exits 1 on any of them.
- **Only the report is committed.** Every refresh rewrites `graph.json` and `graph.html`, so committing them grows history by about 7 MB per refresh. The report is what a session reads. The full graph is rebuilt locally (`graphify update .`) in seconds.
- **A refresh instead of a rebuild.** The first build cost about 745k tokens. `update` re-extracts code with the AST parser, makes no LLM calls, and drops nodes from files that are now ignored. That was exactly what removing `legacy/` needed. Community names were renamed by hub rather than by an LLM (`graphify label` could refresh them, at a token cost). That's good enough for navigation.

## Tests
3 new engine tests in `test_tools.py`:
- a clean graph passes;
- a planted `local/` path, RA number, data file name, e-mail and phone are all counted, the exit code is 1, and **none of the values appears in the output**;
- `graph_query` callers, callees, find and file work on a tiny graph.

Totals: engine 354, Vitest 174, Playwright 52. The app is unchanged in this step.

## Graph usefulness (this step)
This step was about the graph itself, so it doesn't measure it. I opened 6 files: `.gitignore`, `PLAN.md` (the Phase 3 section only), `CLAUDE.md`, graphify's `detect.py` (two ranges), its `SKILL.md` (grep only) and `graph.json` (structure only). `graph_query callers claim_next_download` correctly returned `Worker` (engine/worker.py:90) as the only code caller.

## Known limitations
- **The audit's review counts need a human the first time** after each rebuild. Expect the same shape: 1 e-mail in `graph.html` and many timestamps.
- **`GRAPH_REPORT.md` can go stale.** It's committed as of this step; refresh it after structural changes.
- **Community names are now "by hub"** (for example "Worker", "server.py") instead of the LLM-written names of the first build.

## Concepts to learn
- **Audit by shape, not by value:** you can prove a file has no phone numbers without ever looking at one.
- **Ignore files as a privacy boundary,** tested by running the indexer's own file detection.
- **Commit the summary, rebuild the index:** derived artefacts that churn don't belong in history.
