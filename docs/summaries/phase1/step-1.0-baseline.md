# Step 1.0 — Baseline on Windows

## What was built
Before any Phase 1 code, the existing suite was run on the development machine (Windows 11, Python 3.14.7). It was not green. One test failed, and the database kill test had never run on Windows because it was skipped there. Making the kill test run on Windows exposed a real crash-recovery bug: straight after a process is killed, Windows briefly refuses to reopen the database. This step fixes both problems in `db.py` and makes the kill test cover Windows as well as macOS/Linux.

## Files
| File | Purpose | Key functions / classes |
|---|---|---|
| `engine/db.py` | Close the connection if opening fails; retry the open on transient SQLite I/O errors | `Database.__init__`, `_is_transient_open_error`, `_OPEN_RETRY_DELAYS` |
| `engine/tests/test_db.py` | Tests for both fixes | `test_newer_schema_is_refused`, `test_transient_io_error_on_open_is_retried`, `test_other_open_errors_are_not_retried` |
| `engine/tests/test_kill.py` | Hard-kill test now runs on Windows too | `KillTest` |
| `engine/requirements.txt`, `requirements-ocr.txt` | Pre-approved dependencies; OCR is a separate optional file | — |
| `.gitignore`, `.gitattributes` | Ignore venv, caches, `*.db*`, `.part`; keep LF line endings on both OSes | — |

## How it works
1. `Database.__init__` opens the SQLite file, then `_configure()` (WAL, `synchronous=FULL`, …) and `_migrate()`.
2. If either raises, the connection is now **closed before the error propagates**. Before this fix the handle leaked, and on Windows an open handle locks the file, so it can't be moved, replaced or deleted.
3. If the error is an SQLite I/O error (`SQLITE_IOERR`, checked via `sqlite_errorcode`), the open is retried after 20 ms, 50 ms, 100 ms, 250 ms, 500 ms and 1 s (about 2 s in total). Every other error, such as "database from a newer Atlas", is raised immediately.
4. `test_kill.py` now kills the writer with `Popen.kill()`, which is SIGKILL on POSIX and `TerminateProcess` on Windows. Both are instant and uncatchable, with no `finally` and no flush.

```mermaid
flowchart TD
    open["sqlite3.connect"] --> cfg["_configure + _migrate"]
    cfg -- ok --> done(["ready"])
    cfg -- "SQLITE_IOERR" --> close1["close handle"] --> wait["sleep 20ms…1s"] --> open
    cfg -- "other error" --> close2["close handle"] --> raise(["raise"])
```

## Key decisions and why
- **Retry only `SQLITE_IOERR`, only while opening.** Measured on this machine, 13 of 30 hard kills made the *first* reopen fail with `disk I/O error`, and the second attempt about 15 ms later always succeeded. Windows releases a dead process's memory-mapped `-shm` file a moment after `wait()` returns. Nothing is written until the open succeeds, so retrying is safe. Retrying writes would not be safe, and isn't done.
- **Run the kill test on Windows instead of skipping it.** The old skip message said "Windows kill test lives in the worker suite", but the Phase 1 prompt says to skip the worker kill test on Windows too. That would have left Windows, the recruiters' main platform, with no crash proof at all. `TerminateProcess` is as abrupt as SIGKILL, so the test is equally strong on both. This is a deliberate deviation, and it made the suite *stronger*.
- **`legacy/QWENTUS` is not tracked in git.** It is a separate clone of `Aryan27-max/QWENTUS` with its own history. Registering it as a submodule was blocked by the tool's safety check, so it is left untracked on disk for the owner to decide on.
- **`.gitattributes eol=lf`.** This machine has `core.autocrlf=true`. Without the attribute, files would flip between CRLF and LF depending on who edits them.

## Failure handling
| Situation | What happens | Candidate failed / run paused / nothing | Message |
|---|---|---|---|
| Engine restarted a few ms after being killed (Windows) | Open retried up to 6 times | nothing | — (it just works) |
| Database made by a newer Atlas | Handle closed, error raised | nothing | "Database was created by a newer Atlas…" |
| Open still failing after about 2 s | Error raised to the caller | nothing | SQLite's error |

## Tests
- Added 2; total **45**, 0 skipped on Windows (before: 43, 1 error, 1 skipped).
- `test_newer_schema_is_refused` now also proves the refused file can be renamed, meaning no handle leaked.
- `test_transient_io_error_on_open_is_retried`: two injected `SQLITE_IOERR_SHMOPEN` errors, then success; sleeps twice.
- `test_other_open_errors_are_not_retried`: any other `OperationalError` is raised at once, with no sleep.
- `test_kill.py`: 20 hard kills on Windows, run 3× in a row, all green.

## How to try it yourself
```bash
.venv/Scripts/python -m unittest engine.tests.test_kill -v     # Windows: .venv\Scripts\python
# test_sigkill_never_leaves_inconsistent_state ... ok
```

## Known limitations
- If Windows holds the file for longer than about 2 s (for example an antivirus scan), the open still fails. Electron's restart loop (3 tries in 60 s) is the next safety net.
- The kill test kills a *db writer*, not the real worker. That comes in step 1.7 (`test_worker_kill.py`).

## Concepts to learn
- **WAL shared memory (`-shm`)**: WAL mode coordinates readers and writers through a memory-mapped index file; whoever opens first after a crash rebuilds it.
- **Resource leaks on error paths**: a constructor that raises after acquiring a handle must release it, or the caller can never close it.
- **Windows file locking**: an open file can't be deleted or renamed, unlike POSIX. Many "works on Mac" bugs come from this.
- **Transient vs permanent errors**: retry only errors that are known to clear up by themselves, and only operations that are safe to repeat.
