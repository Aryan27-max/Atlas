# Delivery check: Atlas 0.2.0

Written 6 October 2026, on branch `feat/branding` at `0ed034c` (PR #2, not merged).

## Verdict

| | Status |
|---|---|
| **Windows** | **Green.** Every check below passes. The installer builds, installs, runs and uninstalls on this laptop. |
| **macOS** | **Not yet.** All tests pass on macOS in CI, but GitHub hasn't been able to build the Mac installers since 6 October: the account's Actions billing blocks the build jobs (see *Blocker*). The macOS icon check isn't settled either, and nobody has opened Atlas on a real Mac yet. |
| **Release** | **Not yet.** The release pipeline is written and checked, but it builds in CI, so it waits on the same blocker. |

## Blocker: GitHub Actions billing

On the last CI run (6 October), all three build jobs were refused before they started:

> "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings"

This is the account's setting, not something in the code. To fix it, the account owner opens github.com → **Settings → Billing and plans**, then either:
- updates the payment method, or
- raises the **Actions spending limit**.

The macOS builds use macOS runners, which cost more minutes than Windows or Linux. Nothing in the repository needs to change.

## What was checked, and the results

### On this laptop (Windows 11, at `0ed034c`)

| Check | Command | Result |
|---|---|---|
| Engine suite, with both kill tests | `python -m unittest discover -s engine/tests -t .` | **429 passed** (1 skipped, opt-in live test) |
| App unit tests | `npm test` | **253 passed** |
| Type checks, lint, formatting | `npm run typecheck`, `npm run lint`, `npm run format` | clean |
| End-to-end, every screen and flow | `npm run e2e` | **69 passed**, 2 skipped (the installed-app and packaged-app tests, run separately below) |
| Licences, incl. the 3 brand assets | `python packaging/check_licenses.py` | passed |
| Troubleshooting guide matches the code | `python -m engine.tools.troubleshooting --check` | up to date |
| Identity leaks in what the model sees | `leak_check` on a full demo screening (fictional) | **0 leaks** in every category |
| Code-graph privacy audit | `python -m engine.tools.graph_audit` | exit 0 (every `local/` check OK) |
| Engine binary | `python packaging/build_engine.py` (Python 3.12) | 72.5 MB, smoke test passed |
| Packaged app | electron-builder, then `e2e/packaged.spec.ts` | passed: bundled engine, Welcome, the Atlas icon on `Atlas.exe` and the installer |
| Install, launch, uninstall | silent per-user install, launch, uninstall | exit 0 each time. Welcome appears. Logo on the exe, the uninstaller, the Start menu and Apps |

### In CI (GitHub Actions)

| Check | Result |
|---|---|
| Tests on Windows and macOS: engine, Vitest, e2e | **Green** on every run since 5 October, including the last (`4b199ba`) |
| Windows installer build and packaged-app test | **Green** in CI on 5 October (iterations 2 and 3) |
| macOS installer builds (Apple silicon, Intel) | They build. The packaged test passes everything except one check: macOS 26 on the runner shows its grey placeholder icon for the app, though the app's icon file is the Atlas logo (checked). The test that would tell why (a control icon) was refused by billing. |
| Draft release from a version tag | Written, YAML checked. Not run yet (billing). |

### Brand (as you asked)

| Item | Result |
|---|---|
| **App icon** | Rendered from `swift-svgrepo-com.svg`: a sanitised copy, pixel-identical to it (0 of 262,144 pixels differ). It's the icon on the exe, installer, uninstaller, Start menu, window, notifications, the Mac `.icns`, the favicon, and in Welcome and About. |
| **Start-up "hello"** | Drawn in exactly as in `Hello (apple).svg`: 0 pixels differ from the original at every moment checked. Played once, then held 0.6 s. With reduced motion, the finished lettering. |

## What's left, in order

1. **Billing:** you fix it in the GitHub account (above).
2. **CI:** I push and run CI. Done when all 5 jobs are green on one commit, and on a re-run of it. That needs the macOS icon question settled first:
   - **if the control icon renders on the runner:** a real Atlas icon problem; I fix it (an `.icns` from `iconutil`, or an Icon Composer `.icon`);
   - **if the runner renders no app icons at all:** the test records that, and the `.icns` check stands.
3. **Release:** tag `v0.2.0`. CI builds the three installers and creates a **draft** release with `SHA256SUMS.txt`, `INSTALL.md` and the release notes (`docs/RELEASE_NOTES.md`).
4. **Your run:** the checklist below.
5. **Delivery:** you merge PR #2 and publish the draft release.

## Your run (the checklist)

The Windows build from this commit is already installed on this laptop (per-user; uninstall it from *Settings → Apps* whenever you like). The installer is also at:

`%LOCALAPPDATA%\Temp\claude\…\scratchpad\dist4\Atlas-Setup-0.2.0-x64.exe`

It is 133,240,273 bytes, SHA-256 `c91f930d8f156b54ba50fe46a67a9bfe9cd1c9435e5bbfefb57de467f194ab15`. For delivery, use the one from the draft release instead.

**Windows:**
- [ ] Open Atlas from the Start menu. "hello" is written on off-white, holds, then Welcome appears.
- [ ] The taskbar and Start menu show the Swift logo.
- [ ] The **This computer** card: follow its button through the Ollama states until it reads "Ollama is running".
- [ ] Run a screening with the fictional list `docs/demo/demo-students.xlsx`, or `npm run demo` for the scripted version.
- [ ] On Results: **Adjust cutoffs**, open a student, **Move to…** with a note, **Export**, then open the CSV in Excel.
- [ ] Close Atlas mid-screening, reopen it, and **Resume**: nothing is lost.
- [ ] Settings → About: the logo and the versions.
- [ ] Uninstall from *Settings → Apps*: it goes, and your data folder stays.

**Mac (once the release exists; borrow one if you can):**
- [ ] The right `.dmg` (Apple silicon or Intel). Drag Atlas to Applications, then **Open Anyway** once.
- [ ] Dock and Finder icon: the Swift logo, sensible padding, not a grey placeholder.
- [ ] The splash, Welcome, and the same flow as on Windows.
