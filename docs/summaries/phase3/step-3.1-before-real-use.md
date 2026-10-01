# Step 3.1 — Required before real use

## What was built
These are the items from the deferred 1.11 list without which Atlas can't go to the firm. The detailed spec is the 1.11 appendix of the Phase 3 brief.

- **3.1a Redaction that doesn't trust the CSV.** This is hard rule 9, and it was **blocking**.
  - *The gap:* in smoke test 1 the scored résumé belonged to someone who wasn't in the CSV. Name redaction only knew the CSV name, so it had nothing to remove, and one word of the owner's name line reached the model.
  - *The fix:* every résumé now gets an **identity lexicon** built from:
    - the CSV name;
    - the **résumé's own name line** (the first header line that isn't contact details or "Résumé"; for a résumé without headings, the first line if it reads like a name);
    - the **local part of every email** in the text;
    - **usernames in profile URLs** (GitHub, LinkedIn, GitLab, LeetCode, Kaggle, Medium, …).

    Every word of 2+ letters is redacted to `[name]` everywhere, ignoring case, on word boundaries.
  - *Ordinary-word names:* words like "Rose", "Grace", "Deep", "Ram" and "Dev" are only redacted next to another identity word, so "Rose Kumar" goes but "rose to lead the team" and "deep learning" stay. An initial next to a redacted name ("P. Sharma") goes too.
  - *`engine/tools/leak_check.py`* rebuilds every prompt in a data folder, opening the database read-only, and prints **counts only**.

    | | Before | After |
    |---|---|---|
    | Leaks on the smoke-test-1 data (10 prompts) | **10** (one name-line word in each) | **0** |
- **3.1b The claim-mismatch bug.**
  - A mismatch may now only name something the student actually claimed (their skills and hackathons). Code drops any other mismatch, with fuzzy spelling ("NodeJS" = "Node.js") and whole-word matching for short claims ("Go" doesn't match "Django").
  - The prompt says outright that the criteria are the recruiter's needs, not the student's claims.
  - Duplicate quotes are logged separately from quotes not found in the résumé.
- **3.1c Speed: the cheap wins only.**
  - The answer is capped: at most 5 evidence items with quotes of 20 words or fewer, at most 4 reasons of 25 words or fewer, at most 5 mismatches, and a summary of 2 sentences (320 characters). The caps are in the schema Ollama enforces *and* in the prompt.
  - `keep_alive` went from 10 to **30 minutes**. The length-retry ceiling dropped from 4,096 to 2,048 tokens, because the capped answer is at most about 950 tokens and the starting 1,024 already fits it.
  - Ollama's **prefill** (`prompt_eval_duration`) and **generation** (`eval_duration`) times are now stored for every résumé (schema v3) and logged.
  - The before/after benchmark and the GPU check are below.
- **3.1d Pre-check timeout.** It's now 300 s for the cold first call. A model that works but takes more than 60 s on the sample is **allowed**, and says "This model works, but it's slow on this computer: about N résumés an hour." The API carries a `slow` flag, and the model picker shows the sentence as a calm note.
- **3.1e Network and wording.**
  - **Captive portals.**
    - *The problem:* behind hotel or campus Wi-Fi that wants a sign-in page, the TCP probe passes, every download is the portal's HTML, and every student used to fail with "The file isn't a PDF."
    - *The check:* the probe now also GETs `http://connectivitycheck.gstatic.com/generate_204` (falling back to `www.gstatic.com`). It needs a **204**; a page or a redirect means a sign-in page.
    - *What happens:* the run pauses with **"Connected to Wi-Fi that needs a sign-in page"** and resumes by itself after the recruiter signs in. The worker asks before failing anyone for "not a PDF".
  - **CLI retry hint:** it prints the real data folder (it used to print a literal "…"). When every failure is permanent, it says "All failures need action from the student … Fix the links, then use … --include-permanent".
  - **Pre-flight wording:** "2 résumé links are shared by 20 students (10 each)", where it used to say "18 links shared by two students".
  - **CLI output is UTF-8,** so "→ ≥ ·" survive redirection to a file on Windows.

## Speed: before and after (report only, no target)
Method:
- `python -m engine.tools.speed_bench --model qwen3:8b --runs 5`: the 3 bundled fictional samples × 5 runs, after one warm-up call;
- the real `qwen3:8b` (Q4_K_M) on this laptop (Core Ultra 7 155H, CPU only, 15.5 GB RAM of which ~3.6 GB was free);
- "before" ran the exact pre-3.1 code (commit `deb293b`, in a separate git worktree); "after" ran this step's code.

| Run | Code | data_science | strong_backend | weak_generic | Median per résumé |
|---|---|---|---|---|---|
| Sequential, first (20:20) | before | 60.2 s | 67.8 s | 43.5 s | **60.2 s** (n = 15) |
| Sequential, ~40 min later | after | 68.1 s | 86.1 s | 50.0 s | **68.1 s** (n = 15) |
| Interleaved, 3 rounds, old and new alternating | before | 69.4 s | 82.0 s | 55.0 s | 78.8 s (n = 9) |
| Interleaved, same rounds | after | 71.0 s | 109.1 s | 68.5 s | 71.0 s (n = 9) |

What these numbers say, plainly:

- **No reliable speed change on these samples.** The laptop's own drift is bigger than any effect of the change. The *same old code* on the *same résumé* went from 43.5 s to 85.6 s in an hour of continuous load, probably heat and memory pressure (only ~3.6 GB was free while Ollama held the 6.6 GB model). The sequential pair (60.2 → 68.1 s) mostly measures that drift. The interleaved pair, where each round runs old then new under the same conditions, is a wash.
- **Generation dominates.** Prefill was 14% of the time (median 9.7 s prefill vs 58.8 s generation). So the lever on this CPU is the *length of the answer*, which is exactly what the caps bound.
- **The caps don't bite on short answers.** These fictional answers were already within them: 903–1,444 characters, 2–5 quotes. Answer sizes before/after: data_science 1,331 → 1,148, strong_backend 1,277 → 1,444, weak_generic 920 → 903.
- **They do bite on long answers.** In smoke test 1 the real résumé's answers had up to **12 quotes** and took 200–225 s, against 112–125 s for 2 quotes. That long tail is now capped at 5 quotes, 4 reasons and 5 mismatches. That's the speed win, and it can only be confirmed on real résumés.
- **I checked that the schema's length limits don't slow generation.** An A/B on the same code with `maxLength` on and off, alternating, gave the same speed (median 43.2 s vs 44.3 s for weak_generic).
- **Scores were identical across repeats in every run** (temperature 0). Before: data_science 75, strong_backend 95, weak_generic 30. After: 65, 95, 30. data_science moved under the new prompt (the criteria-vs-claims wording and the caps; which one, the run can't tell). The 95 is what 3.2's anchored rubric addresses.

**GPU check (report only; nothing changed).**
- Ollama 0.34.4's startup log on this machine: `discovering available GPUs…`, then `dropping integrated GPU; to enable, set OLLAMA_IGPU_ENABLE=1 … library=Vulkan … description="Intel(R) Arc(TM) Graphics"`, then `inference compute … library=cpu`.
- `/api/ps` reports `size_vram: 0`.
- So **this Ollama build has a Vulkan backend that sees the Arc iGPU but drops it by default**. Turning it on is a system setting (an environment variable for Ollama), which this phase must not change. It's listed in PLAN → Deferred for the owner to try.
- `qwen3:4b` is installed and could be benchmarked the same way: `python -m engine.tools.speed_bench --model qwen3:4b`.

## Files
| File | Purpose | Key functions / classes |
|---|---|---|
| `engine/llm/identity.py` | The identity lexicon | `build_lexicon`, `name_line`, `profile_usernames`, `apply`, `common_words` |
| `engine/llm/common_words.txt` | Ordinary words and tech terms that can also be names | — |
| `engine/llm/redact.py` | Uses the lexicon | `scoring_input`, `identity_of`, `redact` |
| `engine/tools/leak_check.py` | Read-only leak counts for a data folder | `check`, `main` |
| `engine/tools/speed_bench.py` | Seconds per résumé with a real model | `main` |
| `engine/llm/verify.py` | Mismatch rule; separate quote counts | `review` → `Review`, `names_a_claim` |
| `engine/llm/schema.py`, `prompt.py` | Output caps; criteria vs claims | `MAX_EVIDENCE`, `_clip` |
| `engine/llm/client.py`, `scorer.py` | `keep_alive` 30 m; prefill/generation timings | `ChatResult`, `ScoreResult` |
| `engine/db.py`, `worker.py` | Schema v3 (`prompt_eval_seconds`, `eval_seconds`); captive-portal handling | `_migrate`, `save_evaluation`, `_internet_problem` |
| `engine/health.py`, `errors.py` | Connectivity check; `Pause.CAPTIVE_PORTAL`, `INTERNET_PAUSES` | `HealthProbe.internet_problem` |
| `engine/llm/precheck.py`, `server.py`, `api_models.py` | 300 s; slow-but-working | `slow_message`, `PrecheckResult.slow` |
| `engine/cli.py`, `ingest/csv_loader.py` | Wording | `_summary`, `_shared_links_line` |
| `app/renderer/screens/setup/ModelPicker.tsx` | "Ready · slow on this computer" note | — |

## Key decisions and why
- **The lexicon is built from the résumé, not only the CSV,** because smoke test 1 showed the CSV can be wrong or unrelated. The test that matters, "a résumé whose owner isn't in the CSV", is now covered, along with nicknames, 2-letter names and usernames.
- **Ordinary-word names are treated conservatively, not ignored.**
  - Redacting "Deep" everywhere would turn "Deep Learning" into "[name] Learning" for every student called Deep, and hurt their score. Never redacting it would leak "Rose" in "Project by Rose".
  - The middle path: redact it when it's next to another identity word. That catches "Rose Kumar" and "P. Rose", and keeps ordinary prose.
  - The list is a small bundled file, so its scope is visible and easy to extend. **It holds names that are also English words, not common Indian names**: those are redacted everywhere.
- **`leak_check` uses the whole résumé, not the budgeted prompt.** That's stricter than what the model actually sees, and it means a leak hidden by trimming would still be counted.
- **Speed, honestly.**
  - The caps shorten the *worst* answers. Smoke test 1's 12-quote answers took about 210 s, against about 115 s for 2 quotes.
  - The fictional samples already produce short answers, so they barely move. Generation, not prefill, dominates on this CPU.
  - The real lever is hardware: the iGPU, or a smaller model. Both are reported, not forced.
- **Captive-portal fallback trusts TCP when the check URL is unreachable,** so a firewall that blocks only `gstatic.com` never stops screening. Only a *wrong answer* (a page instead of 204) pauses the run.
- **A slow model is allowed.** Refusing a model that works because it's slow would leave a recruiter on an older laptop with nothing; telling them the rate lets them plan an overnight run.

## Failure handling
| Situation | What happens | Candidate failed / run paused / nothing | Message shown |
|---|---|---|---|
| Wi-Fi needs a sign-in page | pause, auto-resume after sign-in | run paused, **0 failed** | "Connected to Wi-Fi that needs a sign-in page" |
| The check URL is blocked, the internet otherwise fine | nothing | nothing | — |
| Model ignores the caps (no grammar) | extra items dropped, answer kept | nothing | — |
| Model lists a criterion as a "mismatch" | dropped, count logged | nothing | — |
| Pre-check 60–300 s | model allowed | nothing | "This model works, but it's slow on this computer: about N résumés an hour." |
| Pre-check over 300 s | model refused | nothing | "This model can't be used for screening. Choose another." |

## Tests
Added **24 engine tests** (354 → 378) and **2 Vitest tests** (174 → 176). Playwright stays at 52, with two harness fixes.

- `test_llm.LexiconTests` (7):
  - nickname vs CSV name ("Priyanka S." vs "PRIYA SHARMA"), with body mentions and the initial;
  - a résumé whose owner isn't in the CSV;
  - 2-letter name parts;
  - "Rose" as a name vs "rose to lead";
  - "Deep" vs "Deep Learning";
  - a GitHub/LinkedIn username and email local parts;
  - a résumé without headings.

  **All 7 fail with the lexicon switched off** (checked by disabling it in a throwaway run).
- `test_tools.LeakCheckTests` (1): 0 on a redacted database; with redaction switched off it counts leaks, exits 1 and **prints none of the values**. The database file is unchanged afterwards (read-only).
- `test_llm.MismatchAndCapTests` (5):
  - "cloud deployment" in the criteria but not in the claims → that mismatch is dropped and the real-claim one kept;
  - fuzzy claim matching;
  - duplicate vs not-found quote counts;
  - schema caps and clipping;
  - prefill/generation timing summed over retries.
- `test_llm.ClientTests`: `keep_alive` "30m" and Ollama's timing fields.
- `test_llm.PrecheckTests` (+1): 150 s → allowed with "about 24 résumés an hour"; 301 s → refused.
- `test_db.MigrationTests` (+2): an interrupted v3 upgrade is safe to repeat; timings round-trip. The v1 upgrade now ends at v3.
- `test_worker.SystemProblemTests` (+2): a captive portal mid-run → pause, **0 failed**, auto-resume after sign-in, all scored; a real non-PDF still fails that student.
- `test_health_logs` (+2): 204 vs 200/302, fallback host, unreachable check URL (TCP wins), no TCP → offline; the default URLs carry no data.
- `test_server.CaptivePortalTests` (1): the real engine plus the Drive stub (`/generate_204` answering like a portal, files returning a portal page) → paused, `auto_resume`, 0 failed.
- `test_csv_loader` (+1): "2 résumé links are shared by 20 students (10 each)".
- `test_cli` (+1): with stdout forced to cp1252, "→" still comes out as UTF-8. The retry hint is asserted in the existing run test.
- `test_api_support` (+1): a slow-but-working model's message and `slow` flag reach `/models`.
- Vitest `setup.test.tsx` (2): the picker shows "Ready · slow on this computer" and the note, and stays quiet otherwise.
- **Fixed, not new:**
  - *Engine:* `test_worker_lifecycle.TimingHistoryTests` was flaky (1 failure in 5 full runs): the run can read "completed" a few milliseconds before the 4th scoring time is saved. The test now waits for it.
  - *Playwright:* `results.spec`'s "retry all" test now waits for the run to complete *again* (it used to return before the retry started). The shared `close()` helper pre-answers the "Close Atlas?" dialog, so no spec can hang in cleanup.

## How to try it yourself
```bash
python -m engine.tools.leak_check --data-dir local/atlas-data      # counts only; must print TOTAL LEAKS: 0
python -m engine.tools.speed_bench --model qwen3:8b --runs 5       # needs Ollama running; ~15 min
python -m unittest engine.tests.test_llm.LexiconTests -v
```

## Graph usefulness (this step)
- Opened about 20 files, most of them in part: `redact.py`, `sections.py`, `prompt.py`, `schema.py`, `scorer.py`, `verify.py`, `client.py`, `precheck.py`, `health.py`, parts of `worker.py`, `db.py`, `cli.py`, `csv_loader.py`, `server.py`, `api_models.py`, the Drive stub and the related tests, plus `ModelPicker.tsx`.
- The graph was used twice:
  - `graph_query callers scoring_input` listed exactly the code callers that had to keep working (`Worker._score`, `precheck`, and the live and unit tests);
  - `graph_query file engine/llm/redact.py` gave the module's shape without opening it.
- **Verdict for this step: modest help.** CLAUDE.md's layout already names the modules. The graph's real value was the blast-radius question ("who calls this?") before changing a signature.

## Known limitations
- **The name line is found by heuristics** (first non-contact header line), not by font size. A résumé that starts with a job title and puts the name second keeps the name line's protection only through the header drop and the email and username sources.
- **Ordinary-word names on their own in the body survive** ("Thanks to Grace" when the student is Grace Thomas). That's the price of not erasing ordinary words.
- **Speed is unchanged for short answers.** The caps only cut long ones; the big wins (the iGPU, a 4B model) are the owner's call.
- **`leak_check` counts what the lexicon knows plus the CSV of every student.** A nickname that appears nowhere in the header, emails or URLs can't be known.

## Concepts to learn
- **Don't trust a single source of identity:** collect it from everywhere the person names themselves.
- **Precision vs recall in redaction:** ordinary-word names show the trade-off; context (a neighbour token) resolves it.
- **Prefill vs generation:** reading the prompt is parallel and fast, while writing the answer is token by token, so on a CPU shorter answers are the lever.
- **Captive-portal detection:** "connected" isn't "online"; ask a URL whose only correct answer is 204.
