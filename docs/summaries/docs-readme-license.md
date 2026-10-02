# README, LICENSE, START_CMDS and a third-party licence check

## What was built
- **`README.md`**: a complete introduction for someone new.
  - What Atlas does, written for a recruiter, a screenshot grid and the key features.
  - **Eight Mermaid diagrams** taken from the code as it is now: system context, process model, the résumé pipeline, the candidate and run state machines, the data model (schema v3) as an ER diagram, one screening as a sequence diagram, and how a score becomes a bucket.
  - Tech stack, repository layout, quick start, privacy and security, testing with current counts, status and known limitations, a documentation index, and the licence.
- **`LICENSE`**: proprietary, all rights reserved, Aryan Gupta as sole owner, with no-warranty and limitation-of-liability clauses, and third-party components left under their own licences.
  - `app/package.json` now has `"license": "UNLICENSED"`, `"author": "Aryan Gupta"` and `"private": true`.
  - `app/electron-builder.yml` has `copyright: 'Copyright © 2026 Aryan Gupta'`.
  - Settings → About shows "© 2026 Aryan Gupta. All rights reserved." and the Settings e2e test checks it.
- **`THIRD_PARTY_NOTICES.md`**: what ships in the installer, with licences. It covers 21 Python packages, 16 JavaScript packages, and the runtimes (Electron, Chromium, Node, CPython, OpenSSL, SQLite, the MSVC runtime, NSIS). Copyleft and restrictive licences come first, in their own section.
- **`packaging/check_licenses.py`** and a CI step (in the test job, after `npm ci`):
  - it derives what ships: the dependency closure of `engine/requirements.txt`, plus the packages the app's source imports (vite bundles them) and the Electron runtime;
  - it fails on a copyleft, restrictive or unknown licence that isn't on its explicit allowlist (`pymupdf`, `certifi`, each with the reason);
  - it also fails when a shipped package is missing from THIRD_PARTY_NOTICES.md.
  - Two tests are in `test_tools`.
- **Demo mode**: `npm run demo` (the real Ollama), `npm run demo:fast` (the stub Ollama, about 1.5 s per résumé) and `npm run demo:reset`.
  - `engine/tests/demo_stubs.py` writes the fictional `docs/demo/demo-students.xlsx` (20 students, 3 broken links) and serves their résumés on fixed local ports, with a control API to cause and end a pause.
  - `app/scripts/demo.mjs` and `demo-lib.mjs` start the stubs and the development app with its own data folder, "Atlas Demo".
  - `app/e2e/demo.spec.ts` clicks through every screen.
  - `.gitignore` allows just this one `.xlsx`.
- **`START_CMDS.md`**: setup, development, demo, the engine alone, tests, tools, builds, data and troubleshooting. Windows first, then macOS. Verified by running it (below).

## Found and fixed while verifying
- **A fresh `npm ci` left no Electron binary, so `npm run dev` failed with "Electron uninstall".** Electron 44 no longer downloads its binary on install, npm 11 no longer runs packages' install scripts unless approved, and electron-vite doesn't trigger Electron's on-first-use download. Atlas's own `postinstall` now fetches the binary (`node -e "require('electron')"`). Verified from a clean checkout. npm's remaining `allow-scripts` warnings (esbuild, electron-winstaller) are harmless and explained in START_CMDS.
- **`engine/worker.py`'s docstring** said two pause reasons resume by themselves; the code (`AUTO_RESUME_REASONS`) has three, including the Wi-Fi sign-in page. Fixed.
- **CLAUDE.md said the server token needs 32+ characters;** the code accepts 16 or more (the app uses 32 random bytes). Fixed.

## Docs that disagreed with the code (code wins)
| Doc said | Code does | Done |
|---|---|---|
| The task asked how to call `/docs` | `docs_url=None`: there is no `/docs` page, only `/openapi.json` (with the token) | START_CMDS says so; the engine is unchanged |
| `npm ls --omit=dev` lists what ships | it's empty: every npm package is a devDependency, and vite bundles what the source imports | the check and the notices use the import closure |
| `worker.py`: two auto-resume reasons | three | docstring fixed |
| CLAUDE.md: token of 32+ characters | 16+ | CLAUDE.md fixed |

## Licence findings
- **PyMuPDF 1.28.2 (with MuPDF 1.28.2)** is "Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License", per its installed metadata. It's used for PDF text extraction and OCR page rendering, and it ships in the engine. **Not changed.** The options are in THIRD_PARTY_NOTICES.md:
  - buy an Artifex licence;
  - move to pypdfium2 (Apache-2.0/BSD-3), pdfminer.six or pdfplumber (MIT), or pypdf (BSD-3), with an extraction-quality risk;
  - comply with the AGPL.
- **Other copyleft or notable licences:**
  - FFmpeg inside Electron: LGPL-2.1+, a separate `ffmpeg.dll`, licence text shipped;
  - certifi: MPL-2.0, unmodified;
  - the PyInstaller bootloader: GPL-2.0+ with an exception that allows proprietary programs;
  - the Inter font: OFL-1.1.
  - No GPL, SSPL or unknown licences otherwise.
- **Code adapted from QWENTUS (Apache-2.0):**
  - three engine files say so in their docstrings: `engine/extract/pdf.py`, `engine/extract/ocr.py` and `engine/llm/client.py`;
  - QWENTUS is Aryan Gupta's own project (its README credits him; its LICENSE's copyright line was left as the template placeholder);
  - there's no Apache licence copy or NOTICE alongside those files. **Nothing was changed**; the owner decides.

## Mermaid
All eight diagrams were extracted and rendered with `npx -y @mermaid-js/mermaid-cli` 12.0.0, using the system's Edge as the browser because npm now skips puppeteer's Chrome download. All rendered with no syntax errors, and the state diagram was checked by eye against `CANDIDATE_TRANSITIONS`. They use only features GitHub supports.

## Tests
Engine 407 → 409 (licence check). Vitest 188. Playwright 59 → 60 passed (the demo walkthrough), plus 2 that run only with a packaged build or an install.

## Graph usefulness
- `GRAPH_REPORT.md` pointed to `db.py`, `worker.py`, `buckets.py` and `server.py` for the diagrams; those files were read directly.
- The licence, demo and docs work was configuration and text, which the graph doesn't model.
