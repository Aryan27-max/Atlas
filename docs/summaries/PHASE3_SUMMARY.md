# Phase 3 Summary — Atlas made shippable

## 1. Overview
Phase 3 took Atlas from "runs from the repository on one Windows laptop" to "an installer a recruiter can use":

- **Safe for real data.** Identity is now stripped from what the model sees using the résumé's own header, emails and profile handles, not only the CSV (1.11a). `leak_check` on the smoke-test-1 data: **10 leaks → 0**.
- **Better scores.** An anchored rubric, with the overall score computed by code from six sub-scores, ended the "everyone gets 95" problem. An eval harness measures scoring quality on a labelled set: fictional for now, the firm's real one later.
- **A real first run.** Welcome handles Ollama missing / stopped / without a model / ready, each with one button. A hardware profile feeds the estimate and Settings, and screenings over 4 hours ask first.
- **Feels more native.** Sortable title-case columns, a native right-click menu, multi-select with bulk moves, popover arrows, plain destructive buttons, "Name not given".
- **Shippable.** A PyInstaller engine binary (no Python needed on the laptop), a per-user Windows installer (no admin), macOS DMGs from CI, signing driven only by secrets, CI on Windows and macOS.
- **Documented for the firm.** INSTALL, TROUBLESHOOTING (generated from the code), DATA_HANDLING, SIGNING, EVAL.

| | End of Phase 2 | End of Phase 3 |
|---|---|---|
| Engine tests | 351 | **407** (1 skipped: OCR, not installed) |
| Vitest | 174 | **188** |
| Playwright | 52 | **59**, plus the packaged-app test and the installed-app test (run when a build or an install exists) |
| Windows installer | none | **125.0 MB** (installed: 390 MB) |
| Real-data identity leaks (smoke test 1) | 10 | **0** |

Everything was built and tested on Windows 11. **macOS is still untested by a human**; CI is set up to run the suites there and build DMGs, and it uploads the Mac screenshots for review.

**One item is waiting for you:** installing and uninstalling the Windows installer on this laptop. Windows **Smart App Control** is on here, and it refused to run the unsigned installer when it was rebuilt. Turning it off is a system setting, so I stopped there (section 3, and [step-3.8-verification.md](phase3/step-3.8-verification.md)).

## 2. Steps
| Step | What was built | Tests after (engine / Vitest / Playwright) | Summary |
|---|---|---|---|
| 3.0 | graphify made safe: privacy audit (counts only), `.graphifyignore`, only the report committed, `graph_audit` + `graph_query`, CLAUDE.md navigation section | 354 / 174 / 52 | [step-3.0-graph.md](phase3/step-3.0-graph.md) |
| 3.1 | Required before real use: identity lexicon redaction (1.11a), mismatches only about claimed items, answer caps + `keep_alive` + prefill/generation timings (schema v3), pre-check 300 s, captive portals, CLI wording | 378 / 176 / 52 | [step-3.1-before-real-use.md](phase3/step-3.1-before-real-use.md) |
| 3.2 | Anchored rubric, `overall_score` computed by code; eval harness + fictional set of 8; `docs/EVAL.md` | 386 / 176 / 52 | [step-3.2-rubric-and-eval.md](phase3/step-3.2-rubric-and-eval.md) |
| 3.3 | First run: Ollama in four states (find and start, never install), `hardware.py`, hardware prior in the estimate, the 4-hour warning and its toggle | 401 / 176 / 57 | [step-3.3-first-run.md](phase3/step-3.3-first-run.md) |
| 3.4 | Native-feel quick wins: sortable title-case headers, native row menu, multi-select + bulk move, plain destructive buttons, "Name not given", column widths, popover arrows | 402 / 188 / 59 | [step-3.4-native-feel.md](phase3/step-3.4-native-feel.md) |
| 3.5 | Packaging: PyInstaller engine + smoke test, electron-builder (NSIS per-user, DMG per arch), signing by env vars, placeholder icon, packaged-app test, `docs/SIGNING.md` | 402 / 188 / 59 + 1 | [step-3.5-packaging.md](phase3/step-3.5-packaging.md) |
| 3.6 | CI: test (Windows + macOS) and build (three installers) jobs, `.python-version` | 402 / 188 / 59 + 1 | [step-3.6-ci.md](phase3/step-3.6-ci.md) |
| 3.7 | INSTALL, TROUBLESHOOTING (generated + drift tests), DATA_HANDLING | 405 / 188 / 59 + 1 | [step-3.7-docs.md](phase3/step-3.7-docs.md) |
| 3.8 | Verification: suites, eval, leak check, a real screening + export in the packaged app; Ollama must be local (new); install/uninstall blocked by Smart App Control | 407 / 188 / 59 + 2 | [step-3.8-verification.md](phase3/step-3.8-verification.md) |

## 3. Definition of done: evidence
All run on this Windows 11 laptop (Core Ultra 7 155H, 22 logical cores, 15.5 GB, CPU-only inference), Python 3.14 for development, Node 24, Electron 44.

- [x] **All suites green locally, and the CI workflow validated.**
  - Engine: `python -m unittest discover -s engine/tests -t .` → **407 passed**, 1 skipped (OCR). Both kill tests included.
  - Vitest **188**; typecheck, lint and formatting clean.
  - Playwright **59 passed**, plus the packaged-app test (passed on the final build) and the installed-app test (run on the packaged files; see below).
  - CI: `.github/workflows/ci.yml`, validated by a YAML parse and a structural check (no `actionlint` on this laptop), and the engine suite was re-run with CI's environment. **Not pushed**, so it hasn't run on GitHub yet.
- [x] **Graph privacy audit 0, ignore rules in place, CLAUDE.md graph section.** `python -m engine.tools.graph_audit` → `[OK]` on all four must-be-zero checks after every refresh (no file under `local/` indexed; 260 indexed files, none from build output, virtual environments, `node_modules` or `local/`). `.graphifyignore` and the CLAUDE.md section since 3.0.
- [x] **`leak_check` 0 on the smoke-test-1 data, redaction tests pass.** 10 prompts rebuilt, **0** in every category (was 10 before 3.1); the redaction tests are in the engine suite.
- [x] **Claim-mismatch fix tested; captive-portal detection tested.** `test_llm` (mismatches only about claimed items, duplicates counted apart); `test_health_logs`, `test_worker` and `test_server` with the stub's `/generate_204` (pause "Connected to Wi-Fi that needs a sign-in page", auto-resume).
- [x] **Speed before/after reported; prefill and generation stored per résumé.** Section 4 above; schema v3 columns `prompt_eval_seconds`/`eval_seconds`, shown in the eval report.
- [x] **Eval harness runs on the fictional set; numbers reported.** Section 4; re-run in 3.8 with identical scores.
- [x] **Ollama first-run states tested in Playwright with the stub.** `e2e/firstrun.spec.ts`: not installed, not running → Start Ollama, no model → Get a model, ready, and the 4-hour warning (5 tests).
- [ ] **Windows installer built, installed, used for a fictional screening, and uninstalled, with data kept.** **Partly.** Built in 3.5: 125.0 MB, and the packaged-app test passed on its files. The fictional screening with the real model and the export ran in the packaged app (5 of 5 scored, buckets as labelled, export with BOM and 5 rows). **Installing and uninstalling were blocked** by Windows Smart App Control on this laptop, which refused to run the unsigned installer stub during the rebuild. Turning it off is a system setting (a stop condition), so this waits for your decision ([step-3.8-verification.md](phase3/step-3.8-verification.md)).
- [x] **Engine binary smoke test and packaged-app Playwright test pass.** `packaging/smoke_engine.py` (ready in 4.8–5.1 s, `/health`, token, shutdown) and `e2e/packaged.spec.ts` (16–17 s) on every build.
- [x] **INSTALL, TROUBLESHOOTING (with drift test), DATA_HANDLING, SIGNING and EVAL exist.** All in `docs/`; TROUBLESHOOTING is generated, with three drift tests.
- [x] **PLAN Deferred updated.** 1.11a moved to done (with the other 3.1 items), the open items and all seven non-goals listed.
- [x] **Summaries, CHANGELOG, Progress and markers current; PHASE3_SUMMARY.md exists.** Nine step summaries in `docs/summaries/phase3/`, CHANGELOG and PLAN Progress lines for 3.0–3.8, CLAUDE.md and ARCHITECTURE markers, this file.

## 4. Numbers the owner asked for
### Installer sizes (Windows x64; binary MB, as Explorer shows them)
| What | Size |
|---|---|
| `Atlas-Setup-0.2.0-x64.exe` | **125.0 MB** (131,049,580 bytes) |
| Installed (`%LOCALAPPDATA%\Programs\Atlas`) | 390 MB: Electron ~320 MB, the engine 68.5 MB, the app 0.9 MB |
| Engine binary folder | 68.5 MB in 99 files (PyMuPDF 38 MB of it) |
| macOS DMGs | built by CI (none on this Windows laptop) |

### Speed before and after (step 3.1c; report only, no target)
The cheap wins: answers capped (5 quotes, 4 reasons, 5 mismatches, length limits), the model kept loaded for 30 minutes between résumés, and prefill/generation time stored for every résumé.

| Run (fictional samples, real qwen3:8b, CPU only) | Before (`deb293b`) | After |
|---|---|---|
| Sequential (old code first, new 40 min later) | 60.2 s median | 68.1 s median |
| Interleaved (old and new alternating, same conditions) | 78.8 s | 71.0 s |

**Plainly: no reliable change on these short fictional answers.** This laptop's own drift (the same old code on the same résumé went from 43.5 s to 85.6 s within an hour) is bigger than the effect. Generation is 86% of the time (prefill 9.7 s, generation 58.8 s median), so the lever is answer length, which the caps now bound. The caps matter for long answers like smoke test 1's (12 quotes, 200–225 s), which can only be confirmed on real résumés. Real résumés on this laptop: ~141 s each.

### Eval on the fictional set (qwen3:8b)
`python -m engine.eval run --set engine/eval/sets/fictional --model qwen3:8b`, each résumé scored twice (report: `engine/eval/sets/fictional/report.md`). Step 3.2's run and step 3.8's re-run gave **identical scores**.

| Measure | Value |
|---|---|
| Spearman rank correlation | **0.99**; the expected groups are in order |
| Bucket agreement | **88%** (7 of 8) |
| Score spread | std dev **29.8**, from 10 to 88 |
| Scored 95+ without being "exceptional" | **0** |
| Stability (two runs) | **0.0** points |
| Identity leaks in the prompts | **0** |
| Seconds per résumé (median) | 61.3 (3.2) and 63.8 (3.8); prefill 2.5–3.4 s, generation 55.8–58.1 s |

The one disagreement: a strong data/ML student scores 68 and is shortlisted where the label expected the cutoff band. The ranking still keeps them below both backend students; the real set will say who's right. On the three original samples the rubric moved 95/75/30 to **87/54/10**, which meets the appendix's spacing target.

## 5. Design changes vs ARCHITECTURE (all reflected in it now)
**Engine**
1. **Redaction uses an identity lexicon per résumé** (the CSV name, the résumé's own name line, email local parts, profile usernames); ordinary-word names only next to another identity token (§13, 3.1a).
2. **The model no longer gives an overall score.** It gives six anchored sub-scores; `overall_score` is their weighted mean, computed by code (criteria fit weighs most) (§13, 3.2a).
3. **Captive portals pause the run** ("Connected to Wi-Fi that needs a sign-in page") and resume by themselves (§8, 3.1e).
4. **Schema v3:** prefill and generation seconds per evaluation (§4, 3.1c).
5. **Ollama must be on this computer** (3.8): `OllamaClient` refuses any address other than `localhost`, 127.x.x.x or `::1`, and the server and CLI stop at start. Before, a stray `ATLAS_OLLAMA_URL` could have sent résumé text to a remote model (§1).
6. **New API:** `POST /ollama/start` (find and launch an installed Ollama, never install); `/system` has `ollama.installed` and `hardware`; the estimate has a hardware basis and `long_run`; `/results` sorts by any column in either direction and reports how (§15, §17, 3.3–3.4).

**App**

7. **Welcome's four Ollama states**, the long-screening Alert, hardware in Settings → About (§18, 3.3).
8. **Results:** header buttons instead of a Sort menu, multi-select, a selection bar and MoveSheet; the native row menu is built in main behind a validated IPC call, and main writes the clipboard (§18, §19, 3.4).

**Shipping**

9. **Packaging as built** (§21): PyInstaller one folder in `extraResources`; NSIS one-click per-user; DMG per architecture; signing only from env vars; uninstall keeps user data (§20).
10. **CI** (§22): test and build jobs; the e2e tests and the packaged-app test run in CI.

## 6. Did graphify help? (honest finding)
**Somewhat, for the engine; hardly at all for the rest of this phase.**

- **What it cost:** the first full build in 3.0 cost about 745k tokens of model calls. After that, `graphify update .` (code only, no model) refreshes it in seconds, and only `GRAPH_REPORT.md` (about 30 KB) is committed.
- **Where it pointed to the right files:** "who calls X" questions about engine functions. For example, `graph_query callers estimate` → `engine/server.py` and the estimate tests, which were exactly the files 3.3 changed. The report's communities are a fair first map of the engine for someone (or an agent) starting cold.
- **Where it didn't help:**
  - **UI work** (3.3, 3.4): React components are linked by imports and JSX, which the code graph only partly captures, and the files were known from Phase 2 anyway;
  - **configuration, CI and docs** (3.5–3.7): YAML, npm scripts and Markdown aren't modelled;
  - **text questions:** which line raises which reason with which kind, or who reads `overall_score`. `grep` answered these at once and completely.
  Across the steps I opened roughly 8–22 files each; the graph changed which ones only rarely.
- **Its most valuable contribution was indirect:** making the graph safe forced a privacy audit (`engine/tools/graph_audit.py`). Refreshing it after 3.1 exposed a weakness in that audit, which was then fixed.
- **Verdict:** keep it as a cheap, audited map of the engine and refresh it with `graphify update .` after structural changes. Don't pay for another full build; for day-to-day work in a codebase you already know, `grep` and reading the code are faster.

## 7. Known weaknesses (most severe first)
1. **Unsigned.** Windows SmartScreen warns; on a laptop with **Smart App Control** on, Windows may refuse the installer outright, with no way past it. It did, on this laptop. macOS needs *Open Anyway*. Unsigned PyInstaller programs also attract antivirus false positives. Signing is the fix (`docs/SIGNING.md`).
2. **macOS has never been seen by a person.** CI runs the suites and builds the DMGs there, but nothing has run on GitHub yet, and the e2e tests were tuned on Windows. Expect a round of small fixes after the first CI run.
3. **Slow on CPU-only laptops.** About 140 s per real résumé on this laptop (smoke test 1), so 200 students take about 8 hours. The cheap wins showed no measurable change on short fictional answers. Ollama 0.34 ignores this laptop's Intel Arc GPU unless `OLLAMA_IGPU_ENABLE=1` is set (a system setting, not changed).
4. **Scoring quality is proven only on 8 fictional résumés.** The ranking is right there (Spearman 0.99), but only the firm's own labelled set (`docs/EVAL.md`) can say whether Atlas agrees with its recruiters.
5. **No OCR in the shipped app.** Scanned résumés land in Needs attention ("…text recognition (OCR) isn't installed…") and must be read by hand.
6. **The local build tested here used Python 3.11** (the engine binary inside the unpacked app), because 3.12 isn't installed on this laptop. CI builds releases with 3.12, so what was tested and what ships differ in their bundled Python.
7. **Packaged-app hardening is minimal.** Electron's debugging switches ("fuses") are still on: someone with access to the laptop could attach a debugger. That needs local access anyway, but it's a cheap thing to switch off later.
8. **Real-world inputs are still mostly untested.** Varied résumé layouts, Drive's virus-scan page, Google Doc and folder links in the wild, and multi-hour outages were exercised against stubs only.
9. **Links can't be fixed inside a screening.** A student who sends a new link needs a new screening (or the same link fixed at the source).
10. **One screening at a time**, and no auto-update (both deliberate non-goals).

## 8. Ready for real use?
| Item | State |
|---|---|
| Identity never reaches the model (1.11a) | ✅ done; `leak_check` on smoke-test-1 data **0** |
| Ollama must be on this computer | ✅ enforced in code (3.8): a remote Ollama address is refused at start |
| Claim mismatches only about claimed items | ✅ done (3.1b) |
| Captive portals pause instead of failing everyone | ✅ done (3.1e) |
| Scores spread out and ordered on the fictional set | ✅ Spearman 0.99, nothing at 95+ |
| Kill and resume without losing work | ✅ both kill tests, 20 kills each, every run |
| An installer that needs no admin and keeps data on uninstall | ⬜ built and configured that way (3.5); **not installed here**: Smart App Control refused the unsigned installer (3.8) |
| The packaged app screens real résumés end to end | ✅ five fictional students with qwen3:8b, export checked (3.8) |
| Recruiter docs (install, troubleshooting, data handling) | ✅ |
| **Code signing** | ⬜ owner: buy and add secrets, or accept the warnings (`docs/SIGNING.md`) |
| **First CI run, macOS screenshots reviewed** | ⬜ owner: push and check Actions |
| **Real eval set (consented, labelled)** | ⬜ owner: `docs/EVAL.md` |
| **A small real screening on a recruiter's laptop** (10–20 students) | ⬜ owner, after the items above |
| **The real app icon** | ⬜ owner (`packaging/icons/README.md`) |
| **Retention decision** (how long to keep screenings) | ⬜ the firm (`docs/DATA_HANDLING.md` §5) |

**Ready for a supervised pilot** on one recruiter's laptop with a small, consented list, once the installer has been tried there and the signing decision is made. **Not yet ready for unsupervised use across the firm** until the real eval set confirms that Atlas's ranking matches your recruiters'.

## 9. What you need to do
1. **Decide about the install check** on this laptop (it has Smart App Control on): run it on another Windows laptop with the CI installer, sign the installer, or turn Smart App Control off yourself (it may not be possible to turn it back on). The steps are in [step-3.8-verification.md](phase3/step-3.8-verification.md).
2. **Push to GitHub and check CI** (Actions → CI). Expect some macOS-only fixes in the e2e tests, and check that the `macos-15-intel` runner label still exists.
3. **Review the macOS screenshots artifact** (`macos-screenshots` on the macOS test job): Welcome, setup, Progress, Results, Settings, light and dark. It's the first look at the Mac UI.
4. **Buy or skip signing.** `docs/SIGNING.md` covers what to buy (Windows code-signing certificate, about $200–600 a year, or cloud signing; Apple Developer Program, $99 a year), how to add the secrets, and what recruiters see without it. If you skip it, check that recruiters' laptops don't have Smart App Control on.
5. **Build the real eval set** (`docs/EVAL.md`): consented résumés in `local/eval/`, labelled by two recruiters, then `python -m engine.eval run --set local/eval --model qwen3:8b` overnight.
6. **Try the installer on a recruiter's laptop** (the CI artifact), following `docs/INSTALL.md`, with a small list first. Note how long each résumé takes there.
7. **Supply the real icon** (`packaging/icons/README.md`), and change the app ID `com.atlas.screening` if the firm needs another.
8. **Decide retention:** how long to keep screenings, then delete them with Settings → Data.
9. **Optional:** try `OLLAMA_IGPU_ENABLE=1` on laptops with an Intel Arc GPU (a system setting), to see whether Ollama gets faster there.
