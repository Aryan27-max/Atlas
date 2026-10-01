# Eval report — fictional

Model `qwen3:8b` · cutoffs shortlist 60 / band 50 · each résumé scored 2× · files and numbers only (no names, no résumé text).

| Measure | Value | What good looks like |
|---|---|---|
| Bucket agreement | 88% | high; disagreements are worth reading |
| Spearman rank correlation | 0.99 | close to 1.0 (the expected order) |
| Expected groups in order | yes | yes |
| Score spread (std dev) | 29.8 | wide enough to rank (not everyone at 95) |
| Min / max score | 10 / 88 | |
| Scored 95+ but not "exceptional" | 0 | 0 |
| Stability (mean abs. difference between repeats) | 0.0 | 0–3 points |
| Seconds per résumé (median) | 61.3 | |
| … prefill / generation (median) | 2.5 / 58.1 | |
| Identity leaks in prompts | 0 | **0** |

| File | Level | Expected | Got | Scores | Group |
|---|---|---|---|---|---|
| 01_exceptional_backend.pdf | exceptional | shortlisted | shortlisted (88) | 88, 88 | 1 |
| 02_strong_backend.pdf | strong | shortlisted | shortlisted (86) | 86, 86 | 2 |
| 03_strong_ml.pdf | strong | cutoff | shortlisted (68) | 68, 68 | 3 |
| 04_average_backend.pdf | average | cutoff | cutoff (52) | 52, 52 | 3 |
| 05_average_frontend.pdf | average | rejected | rejected (31) | 31, 31 | 4 |
| 06_weak_backend.pdf | weak | rejected | rejected (26) | 26, 26 | 4 |
| 07_weak_generic.pdf | weak | rejected | rejected (10) | 10, 10 | 5 |
| 08_very_weak.pdf | very weak | rejected | rejected (10) | 10, 10 | 5 |
