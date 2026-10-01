# Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning

## What was built
- **Ollama in four states** on Welcome's *This computer* card. Each state has one next action:

  | State | What the recruiter sees | Action |
  |---|---|---|
  | Not installed | "Install Ollama to start screening", one paragraph on what Ollama is and that no résumé is sent to the internet | **Open download page** (the browser opens `https://ollama.com/download`) · Check again |
  | Installed, not running | "Ollama isn't running · Atlas can start it for you" | **Start Ollama** · Check again |
  | Running, no model | "Ollama is running · no model yet", qwen3:8b suggested (about 5 GB, once) | **Get a model** (the existing download sheet) |
  | Ready | "Ollama is running · version", "N models installed" | — |

  - *Start Ollama* calls `POST /ollama/start`. The engine looks for the installed Ollama (`engine/ollama_setup.py`) and launches it detached, the platform's own way: the tray app (`ollama app.exe`) on Windows, `open -a` on the Mac app, `ollama serve` when only the command-line tool exists. The app then checks every second for up to 30 s. If Ollama doesn't answer, it says "Ollama didn't start" and how to open it by hand.
  - **Atlas never downloads or installs Ollama.** "Open download page" is the recruiter's own browser on a fixed URL, opened by Electron main (`shell.openExternal`); nothing is sent.
- **Hardware profile** (`engine/hardware.py`), standard library only and read-only:
  - processor name (Windows registry, macOS `sysctl`, Linux `/proc/cpuinfo`), cores, RAM, OS, architecture, Apple silicon or not;
  - whether Ollama runs the model on a GPU, from Ollama's own `/api/ps` (`size_vram` > 0). This is only known while a model is loaded, so it says "Shown while a screening runs" otherwise.
  - On this laptop: Intel Core Ultra 7 155H, 22 logical cores, 15.5 GB, Windows 11, kind **cpu** (Ollama skips the Arc iGPU by default, see 3.1).
  - Shown in Settings → About (*This computer*, *Processor*, *Graphics (GPU)*) and returned by `GET /system`.
- **A hardware prior in the estimate** (`estimate.py`), used only when there's no pre-check and no history yet, per the spec:

  | Kind | Seconds per résumé (8B model) | Source |
  |---|---|---|
  | `cpu` | 140 | smoke test 1: median 141.5 s on this laptop |
  | `apple_silicon` | 35 | a conservative guess; replace with a measurement |
  | `gpu` | 15 | a conservative guess; replace with a measurement |

  The range is wide (×0.5 to ×2) and labelled "Rough estimate from this computer's hardware". `measured`, `history` and `precheck` all win over it.
- **The long-screening warning.** Settings has a toggle, on by default: *Warn me before starting a screening that will take more than 4 hours* ("Long screenings are best run overnight, with the computer plugged in."). When the middle of the estimate's range is over 4 hours, Review asks before starting: "This screening will take about 5–9 hours", with *Start anyway* and *Not now*. The engine decides (`EstimateOut.long_run`, already off when the setting is off); the app only shows it.

## Files
| File | Purpose | Key functions / classes |
|---|---|---|
| `engine/hardware.py` | What computer this is | `Hardware`, `Hardware.kind`, `profile` |
| `engine/ollama_setup.py` | Find and start the installed Ollama | `OllamaInstall`, `find_ollama`, `start_ollama` |
| `engine/llm/client.py` | Ollama `/api/ps` | `OllamaClient.running_models` |
| `engine/estimate.py` | The hardware prior and `long_run` | `HARDWARE_PRIOR`, `Estimate.long_run` |
| `engine/server.py` | `/system` install state + hardware, `POST /ollama/start`, `long_run`, `warn_long_runs` | `Engine.system`, `Engine.start_ollama`, `Engine.estimate` |
| `engine/errors.py` | The two new recruiter messages | `Api.OLLAMA_NOT_INSTALLED`, `Api.OLLAMA_START_FAILED` |
| `app/renderer/screens/Welcome.tsx` | The four states | `SystemCard`, `ollamaState` |
| `app/renderer/screens/setup/Review.tsx` | The long-screening Alert | `Review` |
| `app/renderer/screens/Settings.tsx` | The toggle and the hardware rows | `About`, `computerLine`, `gpuLine` |
| `app/main/ipc.ts` | Opens the download page (fixed URL) | `OLLAMA_DOWNLOAD_URL` |
| `engine/tests/e2e_engine.py`, `e2e_stubs.py` | Stub "installed?" and "start" so tests never touch the real Ollama | `stub_ollama_finder`, `stub_ollama_starter` |

## Key decisions and why
- **Find, start, never install.** Installing system software is the owner's or the recruiter's decision, and it needs admin rights on many machines. Starting the copy that's already there is what the recruiter would do anyway, so Atlas saves them the hunt for the Ollama icon.
- **Detached start.** Ollama keeps running after Atlas closes, exactly as if the recruiter had opened it. Atlas never stops it either.
- **"Installed" counts a running Ollama.** If Ollama answers, it's installed, however it got there (a custom folder, a service). The file search only matters when it's down.
- **The GPU comes from Ollama, not from `nvidia-smi`.** What matters for speed is whether *Ollama* uses a GPU. This laptop has an Intel Arc GPU that Ollama doesn't use, and a hardware list would have said "GPU: yes" and promised the wrong speed.
- **The prior only fills a gap.** The spec asks for it "when there's no pre-check or history yet". In the app a model is pre-checked before Review, so the prior mostly shows up for a model that hasn't passed its pre-check yet. It's a floor under "nothing known", not a new estimate method.
- **The warning is decided by the engine** (rule 16): the app doesn't compare hours, it reads `long_run`.

## Failure handling
| Situation | What happens | Message shown |
|---|---|---|
| Ollama not found on disk | `404 ollama_not_installed` | "Ollama isn't installed on this computer. Download it from ollama.com, install it, then press Check again." |
| The launch itself fails | `409 ollama_start_failed` | "Atlas couldn't start Ollama. Open the Ollama app yourself (the Start menu on Windows, Applications on a Mac), wait a few seconds, then press Check again." |
| Launched, but no answer within 30 s | the card stays on "not running" with a banner | "Ollama didn't start" + the same manual steps |
| Ollama down while reading the hardware | GPU shown as unknown; nothing fails | "Shown while a screening runs" |
| Registry or `sysctl` unavailable | that field is "Unknown processor" / empty; never raises | — |

## Tests
Added **15 engine tests** (386 → 401) and **5 Playwright tests** (52 → 57). Vitest unchanged (176).
- `test_hardware.py` (4): Apple silicon from faked `sysctl`; the GPU in use from `/api/ps`; CPU-only, nothing loaded and Ollama down (GPU unknown, never raises); this computer, read-only.
- `test_ollama_setup.py` (5): Windows prefers the tray app over `ollama.exe`; the macOS app, then Homebrew; on `PATH` or not installed; each platform starts it its own way (fake `Popen`, detached); not installed or a failed launch returns False.
- `test_estimate_pull` (+2): the hardware prior only when nothing else is known; `long_run` at the middle of the range.
- `test_llm` (+1): `running_models` reads `/api/ps`, and Ollama down is a `SystemUnavailable`.
- `test_server` (+3): `/system` install state + hardware; `POST /ollama/start` never installs (404 / 409 / started); the warning follows the setting.
- `app/e2e/firstrun.spec.ts` (5), against the stub Ollama (it never starts the real one): not installed → the download page opens in the browser; not running → Start Ollama → ready; no model → the download sheet with qwen3:8b; ready + hardware in Settings + the toggle; the over-4-hours Alert (Not now stays on Review; Start anyway starts).

Screenshots (both themes): `docs/summaries/phase3/screens/welcome-ollama-missing`, `welcome-ollama-stopped`, `welcome-no-model`.

## How to try it yourself
```bash
python -m unittest engine.tests.test_hardware engine.tests.test_ollama_setup -v
python -c "from engine.hardware import profile; print(profile().as_dict())"
python -c "from engine.ollama_setup import find_ollama; print(find_ollama())"
cd app && npx playwright test e2e/firstrun.spec.ts
```

## Graph usefulness (this step)
- About 22 files opened: the server, API models, estimate, client, errors and stubs on the engine side; Welcome, Settings, Review, ModelPicker, the bridge, preload, IPC and the e2e helpers on the app side. Almost all of them were already familiar from Phase 2, so the graph wasn't needed to find them.
- One check after the fact: `graph_query callers estimate` points to `engine/server.py` (right file; line numbers from before this step) and the estimate tests, so it would have found the one caller that had to change.

## Known limitations
- **Start Ollama is tested with a fake launcher only.** The real launch paths are unit-tested with a fake `Popen`; they haven't been pressed for real on a Mac. The Windows path is checked in 3.8 on the installed app if possible.
- **The Apple-silicon and GPU figures are guesses.** Only the CPU figure is measured. Replace them with the owner's numbers (the `history` basis takes over after the first run anyway).
- **GPU in use is only known while a model is loaded.** Before the first screening, Settings says "Shown while a screening runs".
- **Ollama in a non-standard folder** is only found if it's running or on `PATH`.

## Concepts to learn
- **Detect, don't assume:** the same hardware can be fast or slow depending on what the runtime actually uses.
- **Priors and measurement:** start from a rough prior, replace it with real data as soon as there is some, and say which one the number came from.
- **Detached processes:** starting a program so that it doesn't die with its parent.
