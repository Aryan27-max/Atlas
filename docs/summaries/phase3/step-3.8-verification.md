# Step 3.8 — Verification

## What was run
| Check | Result |
|---|---|
| Engine suite (`python -m unittest discover -s engine/tests -t .`) | **407 passed**, 1 skipped (the OCR test: EasyOCR isn't installed, as in the shipped app). Both kill tests included |
| Vitest | **188 passed** |
| Typecheck, lint, formatting | clean |
| Playwright (`npm run e2e`) | **59 passed**, 2 skipped (the packaged-app and installed-app tests, which need a build) |
| Packaged-app test, on the final unpacked build | **passed** (17 s) |
| Live cutoffs with 2,000 students | median 92 ms, no long tasks |
| `leak_check` on the smoke-test-1 data | **0 leaks** (10 prompts rebuilt; counts only, nothing printed) |
| Eval, fictional set, real `qwen3:8b` | identical to step 3.2: agreement 88%, Spearman 0.99, spread 29.8 (10–88), nothing at 95+, stability 0.0, **0 leaks**; median 63.8 s per résumé (prefill 3.4 s, generation 55.8 s) |
| A real five-student screening in the packaged app | **passed** in 7.9 min, including the model's first-use test. **5 of 5 scored**: 2 shortlisted, 1 cutoff, 2 rejected, exactly the buckets the labels expect. Scores 88, 88, 50, 19, 10; 41.7–85.5 s per résumé (median 76.4 s; prefill 7–24 s, generation 35–64 s). Export: UTF-8 with BOM, 5 rows. Afterwards `downloads/` and `uploads/` were empty, and `engine.log` held no student name or email. Run on the unpacked build (the installer's files), with Atlas's normal data folder |
| Install → use → uninstall with the Windows installer | **stopped**: Windows Smart App Control (see below) |

## A hardening found on the way: Ollama must be on this computer
While writing the packaged test I noticed that the engine accepted **any** Ollama address, from `--ollama-url` or the `ATLAS_OLLAMA_URL` environment variable. A remote address would have sent résumé text off the machine, which hard rule 15 forbids, and a stray environment variable on a recruiter's laptop would have been enough.

Now `OllamaClient` accepts only `localhost`, 127.x.x.x and `::1`, and refuses anything else (`engine/llm/client.py`, `local_only`). The server and the CLI stop at start with "Atlas only uses an Ollama running on this computer, not …". Two tests (`test_llm.LocalOnlyTests`) cover addresses accepted and refused (a LAN address, a remote name, `0.0.0.0`, a look-alike `127.0.0.1.example.com`), and the server and CLI refusing at start. ARCHITECTURE §1 and DATA_HANDLING say so.

## The installer and Smart App Control (stop condition)
**What happened**
- The engine and installer were rebuilt after the change above. The engine built and passed its smoke test. electron-builder then failed twice in a row at the NSIS step, with `spawn UNKNOWN`.
- The Windows Code Integrity log says why: **Smart App Control is on** on this laptop (`VerifiedAndReputablePolicyState` = 1). It refused to run electron-builder's freshly compiled, unsigned stub (`Atlas-Setup-0.2.0-x64.exe`, the small program that writes the uninstaller), because it "did not meet the Enterprise signing level requirements".
- Smart App Control had been on all along (its policy loads at boot; there was an earlier block on 24 September). It judges files by Microsoft's cloud reputation, so it let the two installer builds of step 3.5 through, then refused these.
- The unsigned **app** (`Atlas.exe`) and the unsigned **engine** (`atlas-engine.exe`) still ran under it: the packaged-app test and the five-student screening above used them.

**Why I stopped there**
- Installing needs an installer that Windows will run here. The only ways around Smart App Control are turning it off, which is a system setting on this machine and a stop condition (and on many Windows versions it can't be turned back on without reinstalling Windows), or a code-signing certificate, which the owner buys.
- So the install → screening → export → uninstall → "data kept" sequence was **not** run on this laptop. Before the block, step 3.5 built the installer (125.0 MB) and the packaged-app test passed on its files.
- What is verified without installing:
  - the per-user, no-admin install and keeping the data on uninstall are electron-builder settings (`oneClick`, `perMachine: false`, `deleteAppDataOnUninstall: false`), checked in the generated config;
  - the packaged app uses `%APPDATA%\Atlas` as its data folder (the screening above created it).

**What the owner can choose**
1. Install the CI-built installer on a laptop without Smart App Control (or with it in evaluation mode), and run the same checks (below).
2. Buy signing (`docs/SIGNING.md`); then the installer runs here too.
3. Turn Smart App Control off on this laptop, knowing it may not be possible to turn it back on. That decision is yours, not Atlas's.

The checks are ready to rerun: the steps are in "How to try it yourself" below, and `app/e2e/installed.spec.ts` drives the screening and export on an installed Atlas.

## Leaving the laptop as it was
- Before the run, this laptop had no Atlas program folder, no `%APPDATA%\Atlas`, no shortcuts and no Apps entry.
- The run created `%APPDATA%\Atlas`, with the fictional screening, as a real install would.
- At the end, when Atlas showed its "screening finished" notification, **Electron created a Start-menu shortcut** (`Atlas.lnk`). Windows needs a shortcut with the app's ID to show notifications, and an app that wasn't installed by its installer doesn't have one. The installer creates the same shortcut, so an installed Atlas gets nothing extra.
- Both were removed afterwards (the data folder held only the five fictional students), and the laptop is back to its earlier state: no program folder, no data folder, no shortcuts, no Apps entry.

The scores differ a little from the eval's for the same five résumés (88, 88, 50, 19, 10 against 88, 86, 52, 26, 10), because the app's list also gives the model each student's CGPA and department and the claimed skills from the form. The order and the buckets are the same.

## Files
| File | Purpose |
|---|---|
| `engine/llm/client.py`, `engine/server.py`, `engine/cli.py` | `local_only`: Ollama must be on this computer |
| `engine/tests/test_llm.py` | `LocalOnlyTests` |
| `app/e2e/installed.spec.ts` | A real screening on an installed (or unpacked) Atlas: serves five fictional eval résumés on 127.0.0.1, drives the UI with `qwen3:8b`, exports, and checks the CSV. Runs only when `ATLAS_INSTALLED_EXE` is set |
| `engine/eval/sets/fictional/report.*` | The re-run eval report |
| `docs/SIGNING.md`, `CLAUDE.md` | The Smart App Control finding |
| `docs/summaries/PHASE3_SUMMARY.md` | The phase summary |

## How to try it yourself
```powershell
# 1. install (per user, silent) and look
.\Atlas-Setup-0.2.0-x64.exe /S
Test-Path "$env:LOCALAPPDATA\Programs\Atlas\Atlas.exe"          # True
# 2. a five-student screening with the real model, then export (from app/)
$env:ATLAS_INSTALLED_EXE = "$env:LOCALAPPDATA\Programs\Atlas\Atlas.exe"; npx playwright test e2e/installed.spec.ts
# 3. uninstall (silent) and check the data folder is still there
& "$env:LOCALAPPDATA\Programs\Atlas\Uninstall Atlas.exe" /S
Test-Path "$env:LOCALAPPDATA\Programs\Atlas\Atlas.exe"          # False
Test-Path "$env:APPDATA\Atlas\atlas.db"                          # True: the screening survived
```

## Graph usefulness (this step)
- Not consulted: this step ran things. The one code change (`local_only`) was found by reading `engine.ts` and `server.py` while writing a test, and located with `grep` (every `OllamaClient(` call).

## Known limitations
- **Install and uninstall are unverified on this laptop** (above).
- **The local build used Python 3.11**; CI's release build uses 3.12.
- **The five-student run measures one laptop**, CPU only, with fictional résumés; real résumés were ~141 s each in smoke test 1.
