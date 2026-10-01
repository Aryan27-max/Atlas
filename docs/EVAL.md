# Measuring how well Atlas scores (the eval set)

Atlas's scores come from a language model, and models can be wrong in quiet ways: everyone gets 95, the order is shuffled, or the same résumé gets different scores on different days. The **eval harness** measures this on résumés whose right answer you already know. Run it before trusting a new model, a new prompt, or a new computer.

There are two sets:

| Set | Where | What it's for |
|---|---|---|
| **Fictional** (8 invented students) | `engine/eval/sets/fictional/` | Ships with Atlas. Checks the basics: order, spread, stability, privacy. |
| **Real** (yours, 20–30 real résumés) | `local/eval/` | Tells you whether Atlas agrees with *your* recruiters. Never leaves this computer. |

The fictional set can only show that the machinery works. Only a real set can tell you whether the scores are good enough to rely on.

---

## 1. Build the real set

### Get consent first
These are real students' résumés, used for a purpose they didn't apply for. Before you copy any:
- ask the students, or your firm's data-protection lead, whether using past applicants' résumés to test the tool is allowed under your privacy notice and India's DPDP Act;
- prefer résumés from people who agreed to it in writing (for example, colleagues or past interns);
- record who agreed and when (outside Atlas).

When in doubt, use fewer résumés with clear consent rather than many without.

### Choose 20–30 résumés
- **Mix the quality:** some clear yes, some clear no, and plenty in between. A set of only strong résumés can't show whether Atlas ranks.
- **Mix the roles** you actually hire for, and write the criteria for one role.
- **Include awkward ones:** two-column layouts, long résumés (over 3 pages), a scanned one if you have it, and a name that's also an ordinary word ("Rose", "Deep").

### Put them in `local/eval/`
`local/` is ignored by git, so nothing in it can be committed by mistake. Create:

```text
local/eval/
├── criteria.txt        ← the recruiter's criteria, exactly as you'd type them in Atlas
├── labels.csv          ← your judgement for each file
├── resume-01.pdf
├── resume-02.pdf
└── …
```

Rename the PDFs to neutral names (`resume-01.pdf`…), not student names: the report lists file names.

### Label them (`labels.csv`)
Ask **two recruiters** to judge each résumé against `criteria.txt` without seeing Atlas's scores. Agree on one answer per file:

```csv
file,expected_bucket,expected_rank_group,skills,hackathons
resume-01.pdf,shortlisted,1,"Python, Django, AWS",
resume-02.pdf,cutoff,3,"Java, Spring",Smart India Hackathon
resume-03.pdf,rejected,5,,
```

| Column | Meaning |
|---|---|
| `file` | the PDF's file name |
| `expected_bucket` | `shortlisted`, `cutoff` or `rejected`, at the cutoffs you normally use (default 60 / 50) |
| `expected_rank_group` | 1 = best. Use 4–6 groups; résumés you can't separate share a group |
| `skills`, `hackathons` *(optional)* | what the student claimed on the form, so claim checking is tested too |
| `level` *(optional)* | `exceptional` for the one or two résumés you'd call outstanding (used by the "95+" check) |

Where the two recruiters disagree, that résumé is genuinely borderline. Put it in the middle group and expect Atlas to wobble on it too.

---

## 2. Run it

Ollama must be running and the model installed. From the Atlas folder:

```bash
python -m engine.eval run --set local/eval --model qwen3:8b
```

- Each résumé is scored **twice** (`--repeats 2`) to measure stability. On a CPU laptop, allow about 1–3 minutes per résumé per repeat: a 25-résumé set takes 1–2 hours. Run it overnight, plugged in.
- Use your normal cutoffs: `--shortlist 60 --band 50`.
- The fictional set: `python -m engine.eval run --set engine/eval/sets/fictional --model qwen3:8b` (about 15 minutes).

The report is written next to the résumés: `report.md` (for reading) and `report.json` (for comparing runs). It contains **file names and numbers only**: no names, no résumé text.

---

## 3. Read the report

| Measure | What it tells you | Good | Worrying |
|---|---|---|---|
| **Bucket agreement** | Share of résumés Atlas put in the same bucket as your recruiters | 80%+ | Under 70%: read the disagreements one by one |
| **Spearman rank correlation** | Does Atlas order résumés the way your recruiters do? (1.0 = same order, 0 = unrelated) | 0.7+ | Under 0.5 |
| **Expected groups in order** | Is every group's average above the next group's? | yes | no |
| **Score spread** | How spread out the scores are | std dev 15+ | Under 8: everyone looks the same |
| **Scored 95+ but not exceptional** | Inflated scores | 0 | Several |
| **Stability** | Average difference between the two scores of the same résumé | 0–3 points | Over 5 |
| **Seconds per résumé** | Speed on this computer, with Ollama's prefill/generation split | — | — |
| **Identity leaks in prompts** | Names, emails or usernames that reached the model | **0** | Anything above 0: stop and report it |

**What to do with the numbers**
- **Leaks above 0:** don't use Atlas on real data until it's fixed.
- **Low agreement but a good rank correlation:** the order is right, but the cutoffs are wrong for this model. Move the cutoffs (Results → Adjust cutoffs), not the model.
- **Low rank correlation:** the criteria may be unclear to the model. Rewrite `criteria.txt` more concretely ("built and deployed an API used by real users" rather than "good backend skills"), then run again. If it stays low, try another model.
- **Poor stability:** the model is guessing on borderline résumés. Treat scores within ±5 of a cutoff as "look yourself".
- **Keep the reports.** Re-run after changing the model, the criteria or the computer, and compare `report.json` files.

The harness measures; it doesn't tune. Atlas never changes its scoring based on this set.
