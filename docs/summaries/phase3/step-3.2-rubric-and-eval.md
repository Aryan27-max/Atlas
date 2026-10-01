# Step 3.2 — Scoring quality: anchored rubric and eval harness

## What was built
- **3.2a Anchored rubric** (`engine/llm/rubric.py`).
  - *The problem:* smoke test 1 saw one real résumé score 95 ten times, and the strong fictional sample also scored 95. An open-ended "90–100 is exceptional" scale lets a model park every good résumé at the top, and then there's no ranking among strong candidates.
  - *Anchors:* each of the six sub-scores now has concrete anchors at **90+, 70, 50, 30 and 10**, tied to the recruiter's criteria. For example, criteria_fit 90+ is "meets every must-have in the criteria with evidence AND shows 2 or more of the strong-plus items", and projects 30 is "toy projects (a calculator, a to-do list) or vague descriptions". The prompt says **90+ is rare, about 1 résumé in 10**, and that most solid students land between 55 and 80.
  - *Overall score:* `overall_score` is now **computed by code** as a weighted mean of the sub-scores, and the model is no longer asked for it. The weights are in `rubric.WEIGHTS` and add up to 1:

    | Sub-score | Weight |
    |---|---|
    | criteria_fit | **0.30** |
    | technical | 0.20 |
    | projects | 0.20 |
    | experience | 0.15 |
    | achievements | 0.10 |
    | communication | 0.05 |

    A stray `overall_score` from a model that ignores the schema is dropped, never trusted.
- **3.2b Eval harness** (`engine/eval/`): `python -m engine.eval run --set DIR --model NAME`.
  - **Input:** a folder of PDFs, `labels.csv` (`file, expected_bucket, expected_rank_group`, optionally the student's claimed `skills`/`hackathons` and `level`) and `criteria.txt`.
  - **Pipeline:** every résumé goes through the real pipeline (PDF → text → sections → redaction → prompt → model → validation → quote checks) and is scored twice.
  - **Report:** `report.md` and `report.json` are written into the set's folder, with **file names and numbers only**:
    - bucket agreement;
    - Spearman rank correlation;
    - score spread (standard deviation, min, max);
    - stability (mean absolute difference between the two scores);
    - seconds per résumé with the prefill/generation split;
    - the identity-leak count.
  - **The fictional set:** 8 invented students covering **5 quality levels** (exceptional, strong, average, weak, very weak) and **3 roles** (backend, data/ML, frontend), against one backend-intern brief, at `engine/eval/sets/fictional/`. The text is in `engine/eval/fictional.py`; regenerate the PDFs with `python -m engine.eval make-fictional` (PyMuPDF, no network).
- **`docs/EVAL.md`** tells the owner how to build the real set:
  - get consent;
  - put the files in `local/eval/` (git-ignored), with neutral file names;
  - have two recruiters label each résumé;
  - run the command overnight;
  - read each number, including what to do when it's bad.
- **A better graph privacy audit** (a fix to 3.0's tool, found when the graph was refreshed after 3.1). The old audit flagged the repo's *own* mentions of `local/eval` and `student_details.csv` (in docs, and in the audit's own patterns) as if they were data. Now:
  - it fails if any file under `local/` was **indexed** (from the graph's own `source_file` list and the manifest);
  - it fails if an RA number, a `local/` path or a data-file name appears that **can't be traced to an indexed file**;
  - mentions in the repo's own files pass.

## Results on the fictional set (real `qwen3:8b`, this laptop, CPU only)
`python -m engine.eval run --set engine/eval/sets/fictional --model qwen3:8b` (each résumé scored twice; the report is committed at `engine/eval/sets/fictional/report.md`):

| Measure | Value | Target (report only) |
|---|---|---|
| Spearman rank correlation | **0.99** | the fictional ordering is correct ✔ |
| Expected groups in order | **yes** | ✔ |
| Scored 95+ but not "exceptional" | **0** (the highest score is 88) | nothing 95+ except the exceptional one ✔ |
| Score spread | std dev **29.8**, min 10, max 88 | not everyone at 95 ✔ |
| Bucket agreement | **88%** (7 of 8) | — |
| Stability (two runs) | **0.0** points | — |
| Seconds per résumé | median 61.3 (prefill 2.5 / generation 58.1) | — |
| Identity leaks in the prompts | **0** | 0 ✔ |

| File | Level | Expected | Got |
|---|---|---|---|
| 01 exceptional backend | exceptional | shortlisted | shortlisted (88) |
| 02 strong backend | strong | shortlisted | shortlisted (86) |
| 03 strong data/ML | strong, off-role | cutoff | **shortlisted (68)** |
| 04 average backend | average | cutoff | cutoff (52) |
| 05 average frontend | average, off-role | rejected | rejected (31) |
| 06 weak backend | weak | rejected | rejected (26) |
| 07 weak generic | weak | rejected | rejected (10) |
| 08 very weak | very weak | rejected | rejected (10) |

**The one disagreement:** the strong ML student scores 68, so they're shortlisted where the label expected the cutoff band.
- *Why it's defensible:* the résumé really does show Python, SQL and an API served with Flask, which are must-haves of the brief, so a reviewer could argue either way.
- *What still holds:* the ranking keeps them below both backend candidates.
- *For the owner:* exactly the kind of case the real set (`docs/EVAL.md`) will settle with your recruiters' labels.

**Before and after the rubric, on the three original samples**

The appendix's target (1.11c) is "strong_backend ≥ 20 points above data_science ≥ 20 above weak_generic, and strong_backend below 95". Same model, temperature 0 (scores are repeatable):

| Sample | Phase 1 prompt | After 3.1 | **With the rubric (3.2)** |
|---|---|---|---|
| strong_backend | 95 | 95 | **87** |
| data_science | 75 | 65 | **54** |
| weak_generic | 30 | 30 | **10** |

strong_backend − data_science = **33**; data_science − weak_generic = **44**; strong_backend is below 95. ✔

## Files
| File | Purpose | Key functions / classes |
|---|---|---|
| `engine/llm/rubric.py` | Anchors, weights, the computed overall score | `RUBRIC`, `WEIGHTS`, `overall_from` |
| `engine/llm/schema.py` | The model's answer has no overall score; `Evaluation` adds the computed one | `ModelAnswer`, `Evaluation`, `parse_evaluation` |
| `engine/llm/prompt.py` | The rubric in the system prompt | `SYSTEM_PROMPT` |
| `engine/eval/harness.py` | Metrics and the report | `evaluate`, `spearman`, `write_report`, `render` |
| `engine/eval/__main__.py` | `run` / `make-fictional` | `main` |
| `engine/eval/fictional.py`, `sets/fictional/` | The 8 invented students | `SAMPLES`, `write_set` |
| `engine/tools/graph_audit.py` | Audit by indexed files and traceability | `indexed_files`, `audit` |
| `docs/EVAL.md` | How to build and read the real set | — |

## Key decisions and why
- **The code computes the overall score; the model scores parts.** A model asked for one number anchors on round, flattering values (95). Six anchored sub-scores, each tied to the criteria, are harder to inflate together, and the weighted mean keeps the ranking explainable: anyone can redo the arithmetic from the detail sheet.
- **criteria_fit weighs most (0.30).** Atlas ranks students *for this recruiter's brief*, so a brilliant ML student shouldn't outrank a solid backend student for a backend internship. Communication weighs least (0.05): it's real, but it shouldn't decide.
- **The fictional set mixes roles on purpose.** Two "strong" students in the wrong role (data/ML, frontend) check that fit to the criteria, not general brilliance, drives the order.
- **The report holds no names or résumé text,** so the owner's real report under `local/eval/` is no more sensitive than file names. It's written next to the set and never committed when the set is under `local/`.
- **The harness measures; it never tunes.** Changing weights or prompts based on the fictional set would just fit Atlas to 8 invented people.

## Failure handling
| Situation | What happens | Message shown |
|---|---|---|
| `labels.csv` names a missing PDF | stops before scoring anything | "labels.csv lists files that aren't in the folder: …" |
| A PDF can't be read | that row shows the error; the rest are scored | "couldn't read the PDF (…)" |
| Ollama stops mid-eval | the run stops with Ollama's error (rerun when it's back) | the engine's pause reason |
| A model returns an `overall_score` anyway | ignored; computed from the sub-scores | — |

## Tests
Added **8 engine tests** (378 → 386):
- `test_eval.py` (5):
  - the fictional set is complete (8 files, 5 levels, 3 roles);
  - metrics and the report with a fake scorer. This covers agreement, Spearman, stability, the prefill/generation medians and **0 leaks**, and checks that no student name reaches the "model" or the report;
  - a deliberately backwards scorer is caught (Spearman < −0.9, groups out of order);
  - Spearman with ties;
  - a missing file is named.
- `test_llm` (+2): the overall score is the weighted mean, a model's own `overall_score` (even 140) is ignored, the weights add up to 1 and `criteria_fit` weighs most; the rubric has every anchor, says 90+ is rare, and no longer asks for an overall score.
- `test_llm` (changed, not added): schema tests now check that `overall_score` is absent from the model's schema, and out-of-range *sub-scores* are rejected.
- `test_tools` (+1): the repo's own mentions of `local/eval` and data-file names pass the graph audit; an indexed `local/` file, or an untraceable RA number, fails it, still without printing values.

## How to try it yourself
```bash
python -m engine.eval run --set engine/eval/sets/fictional --model qwen3:8b     # ~25 min on a CPU laptop
python -m engine.eval make-fictional                                             # regenerate the 8 PDFs
python -m unittest engine.tests.test_eval -v
```

## Graph usefulness (this step)
- Opened `schema.py`, `prompt.py`, `buckets.py` (signature only), `estimate.py` (for 3.3), the e2e and Ollama stubs (to keep `overall_score` working end to end) and the fixtures helper.
- **Where the graph mattered:** `grep`-style questions about `overall_score` (who reads it) were answered faster with a plain `grep` than with the graph, because it's a data key, not a function.
- **The graph's real contribution this step:** refreshing it after 3.1 exposed a weakness in 3.0's audit (it flagged the repo's own docs), which is now fixed.

## Known limitations
- **8 fictional résumés can't validate quality.** They show that the machinery works and that the order is sane. Only the owner's real, labelled set can say whether Atlas agrees with recruiters.
- **The anchors are written for internship screening** (projects, internships, hackathons). A senior-hire brief would need different anchors.
- **The weights are a judgement call,** not fitted to data. They're one dictionary, easy to change once a real set exists.
- **The stability check uses 2 repeats.** With temperature 0 the same model on the same input is usually identical, so this mostly catches instability from Ollama versions or hardware.

## Concepts to learn
- **Anchored rating scales:** describe each level concretely and the raters (human or model) spread out.
- **Separate judgement from arithmetic:** the model judges parts, and code combines them the same way every time.
- **Spearman rank correlation:** "is the order right?", independent of where the scores sit.
- **Evaluate on labelled data before trusting a model**, and keep the reports to compare over time.
