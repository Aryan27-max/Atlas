# Release 0.3.0 — Input fields box and typed department filter

## What was built
Two recruiter-facing changes, and nothing else. The Students & model screen has a new **Input fields** box that lists every column Atlas reads from the student list: whether it's required, what it's for, and the other header names the loader accepts. On the Cutoffs page, "Only these departments" no longer shows the file's departments as chips to tick; the recruiter types a department and presses Add, the engine checks it against the uploaded list, and only departments that exist can be added. Accepted file types stay `.csv` and `.xlsx`: reading old `.xls` would need a new dependency, and the owner chose to keep it refused with the existing "save as .xlsx" message.

## Files
| File | Purpose | Key functions / classes |
|---|---|---|
| `engine/ingest/csv_loader.py` | What each column is for, and the list the box shows | `COLUMN_HELP`, `ACCEPTED_FILE_TYPES`, `input_columns()` |
| `engine/filters.py` | Which department in the file a typed name means | `match_department()` |
| `engine/errors.py` | The recruiter message for a department that isn't in the list | `Api.unknown_department()` |
| `engine/api_models.py`, `engine/server.py` | Two read-only routes | `GET /input-format`, `GET /runs/{id}/departments/match` |
| `app/renderer/screens/setup/UploadModel.tsx` | The Input fields box | `InputFields` |
| `app/renderer/screens/setup/Cutoffs.tsx`, `screens.css` | Typed department input, chips to remove | `addDepartment`, `removeDepartment` |
| `app/src/shared/api-schema.json`, `api-types.ts` | Regenerated from the engine | — |
| `engine/server.py`, `app/package.json` | Version 0.3.0 | `ENGINE_VERSION` |

## How it works
1. **Input fields:** the box calls `GET /input-format`. The engine builds the answer from `LABELS`, `REQUIRED` and `_ALIASES`, the same tables `load_table` matches headers with, so the box can't drift from what the loader accepts.
2. **Departments:** the recruiter types a name and presses Add (or Enter). The screen calls `GET /runs/{id}/departments/match?name=…`.
3. The engine reads the run's students (the stored ones after confirm, else the pending upload, via `_preview_rows`) and calls `match_department`, which uses `department_key` and `department_counts`: the filter's own rule.
4. A match returns the file's spelling and count, which becomes a chip; no match returns `name: null` with `Api.unknown_department(...)`, shown under the box. The chips are saved as `departments_allowed`, exactly as before.

## Key decisions and why
- **Matching lives in the engine** (rule 16: no business logic in the UI). Copying `department_key` into TypeScript would let the check and the filter disagree.
- **The column list comes from the engine**, not hard-coded text, with a test that loads a file under every listed header.
- **`.xls` stays refused** (owner's decision): no new dependency (the project's rule: ask before adding one).
- **The error message lives in `errors.py`** with the other recruiter messages. `Api` messages aren't part of TROUBLESHOOTING.md, so that file is unchanged.
- **Nothing else changed:** the filter rule, the run lock, the worker and the database schema are untouched.

## Failure handling
| Situation | What happens | Effect | Message shown |
|---|---|---|---|
| Typed department not in the file | Not added | nothing | "“X” isn’t a department in the student list. Check the spelling." |
| Same department twice ("cse" then "C.S.E.") | Not added again | nothing | "CSE is already added." |
| Empty input | Not sent | nothing | "Type a department first." |
| Name over 200 characters, or empty | Engine refuses (422) | nothing | the API's plain error |
| Unknown run | 404 | nothing | "That item doesn't exist any more…" |
| `/input-format` can't be loaded | Box shows an error | nothing | "The input fields couldn’t be loaded" |

## Tests
3 engine tests added or extended (432 total, 1 skipped): the box matches the loader (every listed header loads); `match_department` uses the filter's matching; both routes need the token, and the match route trims, refuses empty or too-long names, answers 404 for an unknown run and works before and after confirm. End-to-end: `setup-part1` checks the box (10 columns, required first, file types); `setup-part2` adds a department by typing, refuses one that isn't in the file, refuses a duplicate and removes a chip. Vitest unchanged (252 + 1 skipped).

Also run for this release: a real 5-student screening with `qwen3:8b` on fictional data (completed, all scored, export OK, no connections off the computer, `leak_check` 0), and a local pen test of the engine API (auth and Host on all 37 routes, fuzzing of the new route, upload limits, an .xlsx decompression bomb, XML external entities, CSV formula injection, error bodies): no high or critical findings.

## How to try it yourself
```bash
python -m unittest engine.tests.test_server engine.tests.test_csv_loader engine.tests.test_api_support
cd app && npm run dev        # New screening → the Input fields box; Cutoffs → type "cse", press Add
```
