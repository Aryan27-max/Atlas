# Smoke test 1: the Phase 1 engine on real student data

Date: 2026-09-28. The engine was run exactly as committed (`engine/` untouched) on a real 20-student sheet, through the headless CLI, with the real local model. Student data stayed in the git-ignored `local/` folder. This summary uses **candidate ids only**.

**Setup**
- Intel Core Ultra 7 155H (16 cores), 15.5 GB RAM, integrated Intel Arc graphics, Windows 11, Python 3.14.7.
- Ollama 0.34.4 running `qwen3:8b` (Q4_K_M) on the **CPU only**: Ollama reported `size_vram 0`.
- Cutoffs were the CLI defaults: shortlist ≥ 60, cutoff band ≥ 50, minimum 0.

## Result at a glance
- **The engine held up.** It ran 20 candidates end to end with exit code 0, no pause, no stuck candidate and no lost work. The preflight, the model pre-check, downloads, extraction, scoring, results and export all worked on real data.
- **10 candidates scored, all 95.** They all share one résumé file. The other 10 failed with "Link is private…", which is correct: I checked it independently.
- **No student identity field reached the model.** I rebuilt and hash-verified the exact prompts. However, the scored résumé belongs to someone who isn't in the CSV. That exposed a gap in name redaction (concern 1).
- **The data covered less than it seemed.** The 20 rows point to only **2 distinct files**, and one of them is private. In effect, one real résumé was scored ten times, each time with a different student's form data.

## Steps 1–5 in brief
| Step | Outcome |
|---|---|
| 1. Protect the data | The sheet was moved to `local/`. `local/`, `*.xlsx`, `*.xls` and the DB/WAL/SHM files are now ignored. `git check-ignore` names the rule, and the sheet was never in git history. Commit `0a4c6e0` changed only `.gitignore`. |
| 2. Convert | The CSV has 20 rows and 10 columns, UTF-8 with BOM. Phones and RA numbers are stored as text in the workbook, so nothing was rounded and there is no `E+` anywhere. The résumé-link cells are hyperlinks whose text matches their target. `openpyxl` was installed into `.venv` only. |
| 3. Preflight | Exit 0, all columns matched. 20 read, 20 ready, 0 errors. There were 18 warnings, all `shared_link`, on rows 4–21 (2 links, 10 students each). |
| 4. Live model check | OK in 248 s. The pre-check took 82.9 s. Samples: data_science 75 in 59.2 s; strong_backend 95 in 62.3 s; weak_generic 30 in 43.4 s. Each took 0 retries and had no flags. |
| 5. Full run | Run time was 25 min 38 s (26 min 41 s including the 57.6 s pre-check). **0 pauses.** `results`: Shortlisted 10, Cutoff 0, Rejected 0, Failed 10, Filtered 0. The export has 20 rows, 22 columns, a BOM and CRLF line endings, and no unescaped formula cells. |

## Step 6: checks on the real data

### a. Identity leak
**Method.** For each of the 10 scored candidates, I rebuilt the prompt with the scorer's own functions (`scoring_input`, `build_prompt`, `resume_budget_chars`) and settings (`num_ctx` 8192, `num_predict` 1024). **All 10 matched the `prompt_hash` stored with the evaluation**, so these are the exact prompts that were sent.
- Prompts are 8,474–8,534 characters.
- The model was sent experience, skills, achievements, education and summary. Nothing was trimmed. The header was never sent.

**Own fields.** Matches of each candidate's own identity fields in their own prompt:

| id | name parts (3+ letters) | email | email local part | phone 10-digit | phone as typed | phone, any separators | RA | "Section X" labelled | section letter as a bare word |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |
| 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| 14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 |

- **Section.** Every section value in this sheet is a single letter. The engine deliberately doesn't redact one-letter sections, because doing so would erase ordinary words. The bare-word counts are that letter used as an ordinary word or token. No prompt contains a labelled section ("Section X", "Sec-X").
- **Other students.** I searched every prompt for the name parts, email, phone and RA number of all 20 students: **0 matches**.
- **Generic look-alikes.** Email-like strings: 0. Runs of 10 or more digits: 0.

**The résumé's real owner.** The scored file belongs to someone who isn't in the CSV:
- none of the 11 words in its header matches any of the 20 students' names;
- none of the 10 students' names appears in it.

Name redaction works from the CSV row, so it had nothing to remove. The only protection was dropping the header (5 lines: phone, email, two profile entries and the name line; 108 characters, 2% of the text). The header drop worked:
- the owner's phone, email and full name are **not** in any prompt;
- two header words do reach the prompt. One is a generic profile-site word.
- **The other is a 3-letter word from the owner's 4-word name line. It appears once, in the achievements section.** It's not a common word and not in any student's form claims. I couldn't tell, without reading the résumé, whether it's a name or part of an event title. The owner can check it with `local/show_possible_name_leak.py`, which is git-ignored.

### b. Downloads
- **Links:** 20 links, all Google Drive file links (10 `…/view?usp=sharing`, 10 `…/view?usp=drivesdk`).
- **Failures:** 10, all with the same reason:

  | Count | Kind | Reason shown to the recruiter | Link type | Candidate ids |
  |---|---|---|---|---|
  | 10 | permanent | Link is private. Ask the student to set sharing to "Anyone with the link". | Drive file ×10 | 1, 3, 5, 7, 9, 11, 13, 15, 17, 19 |

- **Independent check:** Atlas's download URL for that file redirects twice (302, 302) to a Google sign-in page (200, HTML), and the plain view URL returns 401. "Private" is right.
- **Successes:** 10, one attempt each, 193,070 bytes, real PDF.
  - 0 rate limits, 0 download retries.
  - Downloads ran about 2.2 s apart and stayed two ahead of scoring, as designed.

### c. Extraction
All 10 scored candidates had the same file, so every row is the same:

| ids | pages | OCR used | characters | sections detected (characters) | % in "other" |
|---|---|---|---|---|---|
| 2, 4, 6, 8, 10, 12, 14, 16, 18, 20 | 2 | no | 5,588 | header 108 · summary 457 · skills 224 · experience 3,029 · achievements 1,049 · education 625 | 0.0% |

The header takes up 2.0% of the text.

### d. Scoring
- **Seconds per résumé:**
  - min 112.3, median 141.5, max 224.7;
  - total 1,534.4 s (25.6 min), which is 99.8% of the run time;
  - by id: 2: 200.7 · 4: 159.0 · 6: 142.6 · 8: 112.3 · 10: 135.1 · 12: 140.4 · 14: 124.6 · 16: 115.6 · 18: 224.7 · 20: 179.5.
- **What drives the time:** the length of the model's answer. Answers with 2 quotes took 112–125 s; answers with 12 quotes took 200–225 s.
- **Retries:**
  - 10 model calls in total, one per résumé, so 0 retries;
  - `done_reason=length`: 0;
  - unreadable answers: 0;
  - high-score retries: 0 (every answer had verified evidence).
- **Flags:** 0 (no injection, no long résumé, no unsupported high score).
- **Evidence quotes:** the model returned 64. The engine kept 45 and dropped 19:
  - **10 weren't verbatim.** 5 had under 50% of their words in the résumé (paraphrased or invented), 4 had 50–90%, and 1 was a 29-word quote with one word changed.
  - **9 were duplicates:** the same quote reused for a second claim. The duplicate is dropped along with its claim.
  - The engine's log line counts both kinds as "not found in the résumé".
- **Quotes kept, by id:** 2: 9 · 4: 3 · 6: 4 · 8: 1 · 10: 4 · 12: 4 · 14: 2 · 16: 3 · 18: 7 · 20: 8.
- **Claim mismatches, by id:** 2: 5 · 4: 0 · 6: 2 · 8: 0 · 10: 0 · 12: 2 · 14: 2 · 16: 0 · 18: 1 · 20: 0.
  - 12 in total. By a rough heuristic: 6 refer to something the student did claim, 3 to something they didn't claim, and 3 couldn't be parsed.
- **Scores:**
  - min 95, median 95, max 95;
  - sub-scores identical for all 10: technical 95, projects 95, experience 90, achievements 90, communication 90, criteria fit 95.
- **Histogram:**

  | 0–9 | 10–19 | 20–29 | 30–39 | 40–49 | 50–59 | 60–69 | 70–79 | 80–89 | 90–100 |
  |---|---|---|---|---|---|---|---|---|---|
  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 |

- **Buckets:** Shortlisted 10 (all tied at rank 1), Cutoff 0, Rejected 0. Also Failed 10 and Filtered 0.

### e. Cleanup
- **Downloads folder:** 0 files left.
- **`engine.log`:** 74 lines, 8,207 bytes, all INFO.
  - Names 0, emails 0, email local parts 0.
  - Phones 0 (10-digit, as typed, or with any separators).
  - Digit runs of 10 or more outside timestamps: 0.
  - Résumé lines of 25+ characters: 0 of 90.
  - RA numbers: 50 mentions across all 20 candidates. This is by design; the log identifies candidates by id and RA.

## What broke
The engine didn't crash, pause, lose data or need a change. No stop condition was hit. There are four small wording and output issues, none fixed per this task's rules:
1. **Retry hint.** After the run, the CLI prints `Retry the failed ones with: python -m engine.cli retry --run 1 --data-dir …` with a literal "…" instead of the folder. It also offers this even though all 10 failures were permanent; plain `retry` would reply "Nothing to retry" without `--include-permanent`.
2. **Preflight wording.** It said "18 links shared by two students". It was 2 links shared by 10 students each.
3. **Log wording.** "dropped N of M evidence quotes not found in the résumé" also counts duplicate quotes, which were found.
4. **Windows output encoding.** When the CLI's output is redirected to a file on Windows, "→", "≥" and "·" come out as "?" or stray bytes (cp1252). This is cosmetic; the console is fine.

## Top 5 concerns, most severe first
1. **Name redaction trusts the CSV name (hard rule 9).**
   - **What happened:** when the name on the résumé differs from the CSV, only the header drop protects the student. Here that happened for every scored candidate, and one word from the owner's name line may have reached the model.
   - **Where else it bites:** real sheets will hit the same gap through nicknames, initials, reordered names or spelling differences, and through a name repeated in the body (declarations, project credits, profile URLs).
   - **Likely fix:** also redact identity words taken from the résumé's own header (the name line and the email's local part).
2. **CPU-only speed.**
   - **Measured:** median 141.5 s per résumé, about 25 per hour. A 300-student run would take roughly 13 hours on this laptop.
   - **Pre-check risk:** it took 57.6–82.9 s against its 120 s limit, so a slower laptop may be told the model can't be used.
   - **Answer length:** longer answers (more quotes) are directly slower.
3. **Scores bunch at the top.**
   - Every scored candidate got exactly 95 with identical sub-scores. The strong fictional sample also got 95. All 10 tied at rank 1.
   - Consistency is good, but a ceiling at 95 would give recruiters no ranking among strong candidates.
   - With one real résumé this is a warning sign, not a finding.
4. **What the recruiter reads varies for identical inputs.**
   - The same résumé got 1 to 9 kept quotes and 0 to 5 claim mismatches.
   - 16% of quotes weren't verbatim, and 9 duplicate quotes were silently dropped along with their claims.
   - Some "mismatches" name things the student never claimed. The live test showed the same pattern: criteria items reported as "claims".
   - The score is stable; the explanation isn't.
5. **Most of the engine is still unproven on real data.** Only one real résumé was scored. Not yet exercised with real files:
   - varied layouts and section detection;
   - scanned PDFs (OCR) and résumés over 10 pages;
   - Drive's virus-scan page, and Google Doc and folder links;
   - rate limits, internet or Ollama loss mid-run, and a kill and resume.

## How to reproduce (on the owner's machine)
```bash
python -m engine.cli preflight --csv local/student_details.csv
set ATLAS_LIVE=1
set ATLAS_MODEL=qwen3:8b
python -m unittest engine.tests.test_live -v
python -m engine.cli run --csv local/student_details.csv --model qwen3:8b --criteria @local/criteria.txt --data-dir local/atlas-data --yes
python -m engine.cli results --run 1 --data-dir local/atlas-data
python -m engine.cli export --run 1 --data-dir local/atlas-data --view all --out local/results_all.csv
set PYTHONPATH=.
python local/smoke_checks.py
python local/smoke_checks2.py
```
The raw outputs, the full report with RA numbers (`local/smoke-report-full.md`) and the check scripts are all in the git-ignored `local/` folder.
