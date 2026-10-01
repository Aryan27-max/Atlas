# Step 3.7 — Docs for the firm

## What was built
| Document | For | What's in it |
|---|---|---|
| `docs/INSTALL.md` | recruiters | what the laptop needs; install Ollama, then Atlas; **getting past the unsigned-app warnings** (Windows SmartScreen *More info → Run anyway*; Smart App Control, which has no way past; macOS *Open Anyway* in System Settings); the first run's four Ollama states and the one button each; a first screening step by step; an **overnight checklist**; where the data lives; updating and uninstalling (data kept) |
| `docs/TROUBLESHOOTING.md` | recruiters | **generated from `engine/errors.py`**: every pause reason, every student failure reason, every flag and every model-download message, word for word, each with what it means and what to do |
| `docs/DATA_HANDLING.md` | the firm and its legal team | what stays on the computer, what leaves it (résumé downloads, the connectivity check, model downloads, the download page), what the AI never sees, how to delete data, retention and DPDP-relevant facts, "for your legal team to review". Drafted earlier in Phase 3; this step added that the hardware check and *Start Ollama* are local |
| `docs/SIGNING.md` (3.5), `docs/EVAL.md` (3.2) | the owner | already written in their steps |

### How TROUBLESHOOTING.md can't drift
- `engine/tools/troubleshooting.py` reads the messages straight from the classes in `errors.py` (`Pause`, `Reason`, `Flag`, `Pull`, including the ones built by a function, like the "model is no longer installed" pause). The document quotes each one as a heading, exactly as the app shows it.
- The help text (what it means, what to do) is kept next to the generator, keyed by the constant's name (`Reason.PRIVATE` …).
- Facts that live in code come from code, not from the help text:
  - whether a pause **continues by itself** comes from `AUTO_RESUME_REASONS`;
  - whether a failure **needs the student to fix it** or is **usually temporary** is checked against how the code raises it.
- **Three tests** in `engine/tests/test_tools.py`:
  1. every message has help, and no help is left for a message that no longer exists;
  2. the committed file is exactly what the generator produces (like the OpenAPI schema check);
  3. each failure's documented kind matches the kind the code raises it with. The test scans every `CandidateError("permanent"/"retryable", Reason.X)`, `TransientError(…)` and `mark_failed(kind=…)` in the engine.
- CLAUDE.md now says: after adding or rewording a message, add its help and run `python -m engine.tools.troubleshooting`.

## Key decisions and why
- **Generated, not hand-written.** A hand-written list goes stale the first time someone rewords a message; here the build fails instead.
- **The app's own words for the two kinds of failure.** The document uses "Needs the student to fix it" and "Usually temporary", as the Needs attention screen does, so a recruiter can match what they read to what they see.
- **Honest about links.** Atlas can't edit a student's link inside a screening. The help says when a fix at the *same* link is enough (sharing settings, replacing the file), so *Retry all including fixed links* works, and when a *new* link needs a new screening.
- **INSTALL.md is for recruiters**, not developers: no terminal commands except one fallback in TROUBLESHOOTING for re-downloading a removed model.

## Tests
3 new engine tests (402 → 405), described above. Regenerating: `python -m engine.tools.troubleshooting`; checking only: `--check`.

## How to try it yourself
```bash
python -m engine.tools.troubleshooting --check
python -m unittest engine.tests.test_tools -v
```

## Graph usefulness (this step)
- About 10 files opened: `errors.py`, the raise sites found by `grep` (`downloader.py`, `pdf.py`, `links.py`, `client.py`, `worker.py`, `scorer.py`), `NeedsAttention.tsx` for the app's wording. **The graph would not have helped**: "which line raises which reason with which kind" is a text search, and `grep` answered it at once.

## Known limitations
- **INSTALL.md and DATA_HANDLING.md are hand-written.** They describe the current app; a test doesn't check them, so the owner should reread them when the app changes.
- **The help text is English only**, like the app.
- **Screenshots aren't embedded in INSTALL.md.** The Phase 3 screenshots exist under `docs/summaries/phase3/screens/` if the firm wants an illustrated version.

## Concepts to learn
- **Docs as code:** generate documentation from the source of truth, and test that the committed copy is current.
- **Write for the reader's next action:** every message answers "what happened, and what do I do now?".
