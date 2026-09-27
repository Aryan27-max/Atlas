"""SQLite persistence for Atlas.

Everything that must survive a crash lives here. The design rules:

* **One transaction per state change.** A candidate is never half-moved.
* **Optimistic state checks.** Every transition says which state it expects
  the candidate to be in; if another thread or a stale caller got there
  first, the transition fails loudly instead of silently overwriting.
* **Work products are committed together with the state.** Extracted text and
  the ``extracted`` state land in the same transaction, as do an evaluation
  and the ``scored`` state. The caller deletes the PDF only *after* the
  commit returns.
* **WAL + synchronous=FULL.** A committed transaction survives a power cut.
* **Buckets are never stored.** Shortlisted / Cutoff / Rejected are computed
  from scores at view time (see ``buckets.py``), so cutoffs can change after
  a run without re-scoring.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping

SCHEMA_VERSION = 2

# --------------------------------------------------------------------------- #
# State machines
# --------------------------------------------------------------------------- #

# Candidate lifecycle.
#   queued → downloading → downloaded → extracted → scoring → scored
#   any working state → failed
#   queued → filtered      (removed by a recruiter hard filter, never scored)
CANDIDATE_STATES = (
    "queued",
    "downloading",
    "downloaded",
    "extracted",
    "scoring",
    "scored",
    "failed",
    "filtered",
)

CANDIDATE_TRANSITIONS: dict[str, frozenset[str]] = {
    "queued": frozenset({"downloading", "failed", "filtered"}),
    "downloading": frozenset({"downloaded", "failed", "queued"}),
    "downloaded": frozenset({"extracted", "failed", "queued"}),
    "extracted": frozenset({"scoring", "failed"}),
    "scoring": frozenset({"scored", "failed", "extracted"}),
    "scored": frozenset(),
    "failed": frozenset({"queued", "extracted"}),  # only via retry_failed
    "filtered": frozenset({"queued"}),             # only via clear_filters
}

RUN_STATUSES = ("draft", "running", "paused", "completed", "cancelled")

RUN_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"running", "cancelled"}),
    "running": frozenset({"paused", "completed", "cancelled"}),
    "paused": frozenset({"running", "cancelled"}),
    "completed": frozenset({"running"}),  # e.g. "Retry failed" after completion
    "cancelled": frozenset(),
}

FAILURE_KINDS = ("permanent", "retryable")
BUCKETS = ("shortlisted", "cutoff", "rejected")

# Files the downloader writes; only these are ever reported as orphans.
DOWNLOAD_SUFFIXES = frozenset({".pdf", ".part"})

# Candidate fields that come from the recruiter CSV.
CANDIDATE_INPUT_FIELDS = (
    "ra_number",
    "name",
    "email",
    "phone",
    "cgpa",
    "section",
    "department",
    "hackathons",
    "skills",
    "resume_link",
)


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


class DatabaseError(Exception):
    """Base class for Atlas database errors."""


class NotFoundError(DatabaseError):
    """A run or candidate id does not exist."""


class InvalidTransitionError(DatabaseError):
    """A state change is not allowed, or the row was not in the expected state."""


class RunLockedError(DatabaseError):
    """Tried to change a run's configuration after it started."""


class ValidationError(DatabaseError):
    """Input rejected before it reached SQLite."""


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS runs (
    id                  INTEGER PRIMARY KEY,
    name                TEXT    NOT NULL,
    status              TEXT    NOT NULL DEFAULT 'draft'
                        CHECK (status IN ({", ".join(repr(s) for s in RUN_STATUSES)})),
    pause_reason        TEXT,
    model_name          TEXT,
    criteria_prompt     TEXT    NOT NULL DEFAULT '',
    criteria_hash       TEXT,
    shortlist_cutoff    INTEGER NOT NULL DEFAULT 60 CHECK (shortlist_cutoff BETWEEN 0 AND 100),
    maybe_cutoff        INTEGER NOT NULL DEFAULT 50 CHECK (maybe_cutoff BETWEEN 0 AND 100),
    min_shortlist       INTEGER NOT NULL DEFAULT 0  CHECK (min_shortlist >= 0),
    cgpa_min            REAL    CHECK (cgpa_min IS NULL OR cgpa_min BETWEEN 0 AND 10),
    departments_allowed TEXT,   -- JSON list, NULL = all departments
    csv_filename        TEXT,
    created_at          TEXT    NOT NULL,
    updated_at          TEXT    NOT NULL,
    started_at          TEXT,
    completed_at        TEXT,
    CHECK (maybe_cutoff <= shortlist_cutoff)
);

CREATE TABLE IF NOT EXISTS candidates (
    id              INTEGER PRIMARY KEY,
    run_id          INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    ra_number       TEXT    NOT NULL,
    name            TEXT    NOT NULL DEFAULT '',
    email           TEXT    NOT NULL DEFAULT '',
    phone           TEXT    NOT NULL DEFAULT '',
    cgpa            REAL    CHECK (cgpa IS NULL OR cgpa BETWEEN 0 AND 10),
    section         TEXT    NOT NULL DEFAULT '',
    department      TEXT    NOT NULL DEFAULT '',
    hackathons      TEXT    NOT NULL DEFAULT '',
    skills          TEXT    NOT NULL DEFAULT '',
    resume_link     TEXT    NOT NULL,
    state           TEXT    NOT NULL DEFAULT 'queued'
                    CHECK (state IN ({", ".join(repr(s) for s in CANDIDATE_STATES)})),
    failure_kind    TEXT    CHECK (failure_kind IS NULL OR failure_kind IN ('permanent', 'retryable')),
    failure_reason  TEXT,
    filter_reason   TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    pdf_path        TEXT,   -- set only while a downloaded PDF sits on disk
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    UNIQUE (run_id, ra_number),
    CHECK ((state = 'failed') = (failure_kind IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_candidates_run_state ON candidates (run_id, state);

CREATE TABLE IF NOT EXISTS resume_texts (
    candidate_id    INTEGER PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
    text            TEXT    NOT NULL,
    sections        TEXT,   -- JSON {{section_name: text}}, filled by section extraction
    page_count      INTEGER NOT NULL CHECK (page_count >= 0),
    ocr_used        INTEGER NOT NULL DEFAULT 0 CHECK (ocr_used IN (0, 1)),
    pdf_sha256      TEXT    NOT NULL,
    created_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluations (
    candidate_id      INTEGER PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
    overall_score     INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    sub_scores        TEXT    NOT NULL,   -- JSON {{name: int}}
    summary           TEXT    NOT NULL DEFAULT '',
    reasons           TEXT    NOT NULL,   -- JSON list of strings
    evidence          TEXT    NOT NULL,   -- JSON list of {{claim, quote}}
    claim_mismatches  TEXT    NOT NULL,   -- JSON list of strings
    model_name        TEXT    NOT NULL,
    prompt_hash       TEXT    NOT NULL,
    raw_response      TEXT,
    duration_seconds  REAL,
    created_at        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS overrides (
    id              INTEGER PRIMARY KEY,
    candidate_id    INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    from_bucket     TEXT    NOT NULL,
    to_bucket       TEXT    NOT NULL CHECK (to_bucket IN ('shortlisted', 'cutoff', 'rejected')),
    note            TEXT    NOT NULL DEFAULT '',
    created_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_overrides_candidate ON overrides (candidate_id, id);

CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY,
    run_id          INTEGER REFERENCES runs(id) ON DELETE CASCADE,
    candidate_id    INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    level           TEXT    NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    message         TEXT    NOT NULL,
    created_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_run ON events (run_id, id);

CREATE TABLE IF NOT EXISTS settings (
    key             TEXT    PRIMARY KEY,
    value           TEXT    NOT NULL   -- JSON
);
"""


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def criteria_hash(prompt: str) -> str:
    """Stable fingerprint of the recruiter's criteria for one run."""
    return hashlib.sha256(prompt.strip().encode("utf-8")).hexdigest()


def _dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


# Waits between attempts to open the database (about 2 s in total).
_OPEN_RETRY_DELAYS = (0.02, 0.05, 0.1, 0.25, 0.5, 1.0)


def _is_transient_open_error(exc: BaseException) -> bool:
    """An SQLite I/O error while opening, e.g. right after a killed process."""
    code = getattr(exc, "sqlite_errorcode", None)
    return isinstance(exc, sqlite3.OperationalError) and code is not None and code & 0xFF == sqlite3.SQLITE_IOERR


@dataclass(frozen=True)
class RecoveryReport:
    """What ``recover_after_crash`` changed, for the startup log."""

    runs_paused: int
    candidates_requeued: int
    candidates_rewound_to_extracted: int
    orphan_pdf_paths: tuple[str, ...]


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #


def _status_event(current: str, status: str, reason: str | None) -> str:
    """The events-table line for a run status change (the app's activity feed shows it)."""
    if status == "running":
        return "Screening started" if current == "draft" else "Screening resumed"
    if status == "paused":
        if not reason:
            return "Paused"
        return reason if reason.lower().startswith("paused") else f"Paused: {reason}"
    if status == "completed":
        return "Screening complete"
    if status == "cancelled":
        return "Screening cancelled"
    return f"Screening {status}"


class Database:
    """Thread-safe access to the Atlas SQLite file.

    One connection, guarded by a re-entrant lock. The screening rate is a few
    candidates per minute, so serialising access costs nothing and removes a
    whole class of concurrency bugs between the worker and the API server.
    """

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        for delay in (*_OPEN_RETRY_DELAYS, None):
            self._conn = sqlite3.connect(
                self.path,
                isolation_level=None,  # we issue BEGIN/COMMIT ourselves
                check_same_thread=False,
                timeout=10.0,
            )
            self._conn.row_factory = sqlite3.Row
            try:
                self._configure()
                self._migrate()
                return
            except BaseException as exc:
                # A refused or broken database must not stay open: on Windows
                # an open handle locks the file, so nothing could replace it.
                self._conn.close()
                if delay is None or not _is_transient_open_error(exc):
                    raise
            # Windows releases a killed process's -shm mapping a few ms after
            # the process exits; until then opening the WAL fails with an I/O
            # error. Nothing has been written yet, so trying again is safe.
            time.sleep(delay)

    # ---- lifecycle -------------------------------------------------------- #

    def _configure(self) -> None:
        mode = self._conn.execute("PRAGMA journal_mode=WAL").fetchone()[0]
        if str(mode).lower() != "wal":
            raise DatabaseError(f"Could not enable WAL mode (got {mode!r})")
        self._conn.execute("PRAGMA synchronous=FULL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.execute("PRAGMA busy_timeout=10000")

    def _migrate(self) -> None:
        with self._lock:
            version = self._conn.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise DatabaseError(
                    f"Database was created by a newer Atlas (schema {version}); "
                    f"this build understands up to {SCHEMA_VERSION}."
                )
            if version < 1:
                self._conn.executescript(_SCHEMA)          # the released v1 schema, never edited
                self._conn.execute("PRAGMA user_version=1")
                version = 1
            if version < 2:
                # v2: evaluations.flags — notes for the recruiter (JSON list).
                # The column check keeps this safe to repeat if a previous
                # attempt was interrupted.
                with self.transaction() as c:
                    columns = {r["name"] for r in c.execute("PRAGMA table_info(evaluations)")}
                    if "flags" not in columns:
                        c.execute("ALTER TABLE evaluations ADD COLUMN flags TEXT NOT NULL DEFAULT '[]'")
                    c.execute("PRAGMA user_version=2")

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """``BEGIN IMMEDIATE`` … ``COMMIT``; rolls back on any exception."""
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    def _query(self, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(r) for r in self._conn.execute(sql, tuple(params)).fetchall()]

    def _query_one(self, sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
        with self._lock:
            return _dict(self._conn.execute(sql, tuple(params)).fetchone())

    # ---- runs ------------------------------------------------------------- #

    def create_run(self, name: str, csv_filename: str | None = None) -> int:
        name = name.strip()
        if not name:
            raise ValidationError("Run name cannot be empty.")
        now = _now()
        with self.transaction() as c:
            cur = c.execute(
                "INSERT INTO runs (name, csv_filename, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (name, csv_filename, now, now),
            )
            run_id = int(cur.lastrowid)
            self._event(c, run_id, None, "info", f"Screening created: {name}")
            return run_id

    def get_run(self, run_id: int) -> dict[str, Any]:
        row = self._query_one("SELECT * FROM runs WHERE id = ?", (run_id,))
        if row is None:
            raise NotFoundError(f"Run {run_id} does not exist.")
        row["departments_allowed"] = (
            json.loads(row["departments_allowed"]) if row["departments_allowed"] else None
        )
        return row

    def list_runs(self) -> list[dict[str, Any]]:
        return self._query("SELECT * FROM runs ORDER BY id DESC")

    def configure_run(
        self,
        run_id: int,
        *,
        model_name: str | None = None,
        criteria_prompt: str | None = None,
        shortlist_cutoff: int | None = None,
        maybe_cutoff: int | None = None,
        min_shortlist: int | None = None,
        cgpa_min: float | None | type[...] = ...,
        departments_allowed: list[str] | None | type[...] = ...,
    ) -> None:
        """Set run options. Allowed only while the run is a draft.

        One deliberate exception: a **completed** run may change its cutoffs
        and minimum (and nothing else). Buckets are computed at view time from
        the stored scores, so new cutoffs re-sort the results without any
        re-scoring; model, criteria and filters stay locked.

        ``cgpa_min`` and ``departments_allowed`` use ``...`` as "not given" so
        that ``None`` can mean "clear this filter".
        """
        cutoffs_only = (model_name is None and criteria_prompt is None
                        and cgpa_min is ... and departments_allowed is ...)
        with self.transaction() as c:
            run = c.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
            if run is None:
                raise NotFoundError(f"Run {run_id} does not exist.")
            if run["status"] != "draft" and not (run["status"] == "completed" and cutoffs_only):
                raise RunLockedError(
                    "A run's model, criteria and cutoffs are locked once it starts."
                )

            updates: dict[str, Any] = {}
            if model_name is not None:
                if not model_name.strip():
                    raise ValidationError("Model name cannot be empty.")
                updates["model_name"] = model_name.strip()
            if criteria_prompt is not None:
                updates["criteria_prompt"] = criteria_prompt.strip()
                updates["criteria_hash"] = criteria_hash(criteria_prompt)

            shortlist = run["shortlist_cutoff"] if shortlist_cutoff is None else shortlist_cutoff
            maybe = run["maybe_cutoff"] if maybe_cutoff is None else maybe_cutoff
            for label, value in (("Shortlist cutoff", shortlist), ("Cutoff band start", maybe)):
                if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 100:
                    raise ValidationError(f"{label} must be a whole number from 0 to 100.")
            if maybe > shortlist:
                raise ValidationError(
                    "The cutoff band must start at or below the shortlist score."
                )
            updates["shortlist_cutoff"] = shortlist
            updates["maybe_cutoff"] = maybe

            if min_shortlist is not None:
                if not isinstance(min_shortlist, int) or isinstance(min_shortlist, bool) or min_shortlist < 0:
                    raise ValidationError("Minimum shortlist must be zero or a positive whole number.")
                updates["min_shortlist"] = min_shortlist

            if cgpa_min is not ...:
                if cgpa_min is not None and not 0 <= float(cgpa_min) <= 10:
                    raise ValidationError("Minimum CGPA must be between 0 and 10.")
                updates["cgpa_min"] = None if cgpa_min is None else float(cgpa_min)

            if departments_allowed is not ...:
                if departments_allowed is None:
                    updates["departments_allowed"] = None
                else:
                    cleaned = sorted({d.strip() for d in departments_allowed if d and d.strip()})
                    updates["departments_allowed"] = json.dumps(cleaned) if cleaned else None

            updates["updated_at"] = _now()
            columns = ", ".join(f"{k} = ?" for k in updates)
            c.execute(f"UPDATE runs SET {columns} WHERE id = ?", (*updates.values(), run_id))

    def set_run_status(
        self, run_id: int, status: str, *, reason: str | None = None
    ) -> None:
        if status not in RUN_STATUSES:
            raise ValidationError(f"Unknown run status {status!r}.")
        with self.transaction() as c:
            run = c.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
            if run is None:
                raise NotFoundError(f"Run {run_id} does not exist.")
            current = run["status"]
            if status not in RUN_TRANSITIONS[current]:
                raise InvalidTransitionError(f"Run cannot go from {current} to {status}.")
            if status == "running" and current == "draft" and not run["model_name"]:
                raise ValidationError("Choose a model before starting the run.")

            now = _now()
            fields: dict[str, Any] = {"status": status, "updated_at": now}
            fields["pause_reason"] = reason if status == "paused" else None
            if status == "running" and run["started_at"] is None:
                fields["started_at"] = now
            if status == "completed":
                fields["completed_at"] = now
            columns = ", ".join(f"{k} = ?" for k in fields)
            c.execute(f"UPDATE runs SET {columns} WHERE id = ?", (*fields.values(), run_id))
            message = _status_event(current, status, reason)
            self._event(c, run_id, None, "warning" if status == "paused" else "info", message)

    def update_run_info(self, run_id: int, *, name: str | None = None, csv_filename: str | None = None) -> None:
        """Rename a run or record its file name. Allowed in any status (not screening config)."""
        updates: dict[str, Any] = {}
        if name is not None:
            if not name.strip():
                raise ValidationError("Give the screening a name.")
            updates["name"] = " ".join(name.split())[:120]
        if csv_filename is not None:
            updates["csv_filename"] = csv_filename
        if not updates:
            return
        updates["updated_at"] = _now()
        with self.transaction() as c:
            columns = ", ".join(f"{k} = ?" for k in updates)
            cur = c.execute(f"UPDATE runs SET {columns} WHERE id = ?", (*updates.values(), run_id))
            if cur.rowcount == 0:
                raise NotFoundError(f"Run {run_id} does not exist.")

    def vacuum(self) -> None:
        """Give deleted pages back to the disk (after deleting runs)."""
        with self._lock:
            self._conn.execute("VACUUM")

    def delete_run(self, run_id: int) -> None:
        """Remove a run and everything under it (cascade)."""
        with self.transaction() as c:
            cur = c.execute("DELETE FROM runs WHERE id = ?", (run_id,))
            if cur.rowcount == 0:
                raise NotFoundError(f"Run {run_id} does not exist.")

    # ---- candidates: creation & reads ------------------------------------- #

    def add_candidates(self, run_id: int, rows: Iterable[Mapping[str, Any]]) -> int:
        """Insert CSV rows for a draft run. All-or-nothing.

        The CSV loader validates and de-duplicates first; the UNIQUE
        constraint here is the backstop. Any bad row rolls the whole batch
        back, so a run never starts with half a CSV.
        """
        now = _now()
        count = 0
        with self.transaction() as c:
            run = c.execute("SELECT status FROM runs WHERE id = ?", (run_id,)).fetchone()
            if run is None:
                raise NotFoundError(f"Run {run_id} does not exist.")
            if run["status"] != "draft":
                raise RunLockedError("Candidates can only be added before the run starts.")
            for index, row in enumerate(rows, start=1):
                ra = str(row.get("ra_number") or "").strip()
                link = str(row.get("resume_link") or "").strip()
                if not ra:
                    raise ValidationError(f"Row {index}: RA number is missing.")
                if not link:
                    raise ValidationError(f"Row {index} ({ra}): résumé link is missing.")
                values = {
                    "ra_number": ra,
                    "name": str(row.get("name") or "").strip(),
                    "email": str(row.get("email") or "").strip(),
                    "phone": str(row.get("phone") or "").strip(),
                    "cgpa": None if row.get("cgpa") in (None, "") else float(row["cgpa"]),
                    "section": str(row.get("section") or "").strip(),
                    "department": str(row.get("department") or "").strip(),
                    "hackathons": str(row.get("hackathons") or "").strip(),
                    "skills": str(row.get("skills") or "").strip(),
                    "resume_link": link,
                }
                try:
                    c.execute(
                        f"""INSERT INTO candidates
                            (run_id, {", ".join(values)}, created_at, updated_at)
                            VALUES (?, {", ".join("?" for _ in values)}, ?, ?)""",
                        (run_id, *values.values(), now, now),
                    )
                except sqlite3.IntegrityError as exc:
                    if "UNIQUE" in str(exc):
                        raise ValidationError(f"Row {index}: RA number {ra} appears twice.") from exc
                    raise ValidationError(f"Row {index} ({ra}): {exc}") from exc
                count += 1
            self._event(c, run_id, None, "info", f"{count} students added")
        return count

    def get_candidate(self, candidate_id: int) -> dict[str, Any]:
        row = self._query_one("SELECT * FROM candidates WHERE id = ?", (candidate_id,))
        if row is None:
            raise NotFoundError(f"Candidate {candidate_id} does not exist.")
        return row

    def list_candidates(
        self, run_id: int, *, states: Iterable[str] | None = None, limit: int | None = None
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM candidates WHERE run_id = ?"
        params: list[Any] = [run_id]
        if states is not None:
            states = list(states)
            unknown = set(states) - set(CANDIDATE_STATES)
            if unknown:
                raise ValidationError(f"Unknown candidate state(s): {sorted(unknown)}")
            sql += f" AND state IN ({', '.join('?' for _ in states)})"
            params.extend(states)
        sql += " ORDER BY id"
        if limit is not None:
            sql += " LIMIT ?"
            params.append(int(limit))
        return self._query(sql, params)

    def state_counts(self, run_id: int) -> dict[str, int]:
        counts = {state: 0 for state in CANDIDATE_STATES}
        for row in self._query(
            "SELECT state, COUNT(*) AS n FROM candidates WHERE run_id = ? GROUP BY state",
            (run_id,),
        ):
            counts[row["state"]] = row["n"]
        return counts

    # ---- candidates: state machine ---------------------------------------- #

    def _transition(
        self,
        c: sqlite3.Connection,
        candidate_id: int,
        expected: str | tuple[str, ...],
        new_state: str,
        **fields: Any,
    ) -> None:
        """Move one candidate from ``expected`` to ``new_state`` or raise."""
        expected_states = (expected,) if isinstance(expected, str) else tuple(expected)
        row = c.execute("SELECT state FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
        if row is None:
            raise NotFoundError(f"Candidate {candidate_id} does not exist.")
        current = row["state"]
        if current not in expected_states:
            raise InvalidTransitionError(
                f"Candidate {candidate_id} is {current}, expected {' or '.join(expected_states)}."
            )
        if new_state not in CANDIDATE_TRANSITIONS[current]:
            raise InvalidTransitionError(
                f"Candidate {candidate_id} cannot go from {current} to {new_state}."
            )
        # Leaving 'failed' clears the failure; entering it is handled by mark_failed.
        if new_state != "failed":
            fields.setdefault("failure_kind", None)
            fields.setdefault("failure_reason", None)
        if new_state != "filtered":
            fields.setdefault("filter_reason", None)
        fields["state"] = new_state
        fields["updated_at"] = _now()
        columns = ", ".join(f"{k} = ?" for k in fields)
        # The WHERE on state makes the check-and-set atomic even without the lock.
        cur = c.execute(
            f"UPDATE candidates SET {columns} WHERE id = ? AND state = ?",
            (*fields.values(), candidate_id, current),
        )
        if cur.rowcount != 1:
            raise InvalidTransitionError(f"Candidate {candidate_id} changed state concurrently.")

    def start_download(self, candidate_id: int) -> None:
        with self.transaction() as c:
            self._transition(c, candidate_id, "queued", "downloading")
            c.execute("UPDATE candidates SET attempts = attempts + 1 WHERE id = ?", (candidate_id,))

    def claim_next_download(self, run_id: int, *, max_in_flight: int) -> dict[str, Any] | None:
        """Claim the next queued candidate (CSV order) for download, if the prefetch gate allows.

        The gate — fewer than ``max_in_flight`` candidates in ``downloading``,
        ``downloaded`` or ``extracted`` — is checked and the claim made in one
        transaction, so it holds however the worker's threads interleave.
        """
        with self.transaction() as c:
            in_flight = c.execute(
                "SELECT COUNT(*) FROM candidates WHERE run_id = ? "
                "AND state IN ('downloading', 'downloaded', 'extracted')",
                (run_id,),
            ).fetchone()[0]
            if in_flight >= max_in_flight:
                return None
            row = c.execute(
                "SELECT id FROM candidates WHERE run_id = ? AND state = 'queued' ORDER BY id LIMIT 1",
                (run_id,),
            ).fetchone()
            if row is None:
                return None
            self._transition(c, row["id"], "queued", "downloading")
            c.execute("UPDATE candidates SET attempts = attempts + 1 WHERE id = ?", (row["id"],))
            return dict(c.execute("SELECT * FROM candidates WHERE id = ?", (row["id"],)).fetchone())

    def claim_next_scoring(self, run_id: int) -> dict[str, Any] | None:
        """Claim the next extracted candidate (CSV order) for scoring."""
        with self.transaction() as c:
            row = c.execute(
                "SELECT id FROM candidates WHERE run_id = ? AND state = 'extracted' ORDER BY id LIMIT 1",
                (run_id,),
            ).fetchone()
            if row is None:
                return None
            self._transition(c, row["id"], "extracted", "scoring")
            return dict(c.execute("SELECT * FROM candidates WHERE id = ?", (row["id"],)).fetchone())

    def finish_download(self, candidate_id: int, pdf_path: Path | str) -> None:
        with self.transaction() as c:
            self._transition(c, candidate_id, "downloading", "downloaded", pdf_path=str(pdf_path))

    def commit_extraction(
        self,
        candidate_id: int,
        *,
        text: str,
        page_count: int,
        ocr_used: bool,
        pdf_sha256: str,
        sections: Mapping[str, str] | None = None,
    ) -> None:
        """Store extracted text and mark the candidate ``extracted`` in one go.

        After this returns, the PDF is no longer needed: the caller deletes it.
        ``pdf_path`` is cleared here, so a crash between commit and delete
        leaves an *orphan* file that ``recover_after_crash`` reports.
        """
        if not text.strip():
            raise ValidationError("Extracted text is empty; mark the candidate failed instead.")
        with self.transaction() as c:
            self._transition(c, candidate_id, "downloaded", "extracted", pdf_path=None)
            c.execute(
                """INSERT OR REPLACE INTO resume_texts
                   (candidate_id, text, sections, page_count, ocr_used, pdf_sha256, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    candidate_id,
                    text,
                    json.dumps(dict(sections)) if sections is not None else None,
                    int(page_count),
                    1 if ocr_used else 0,
                    pdf_sha256,
                    _now(),
                ),
            )

    def get_resume_text(self, candidate_id: int) -> dict[str, Any] | None:
        row = self._query_one("SELECT * FROM resume_texts WHERE candidate_id = ?", (candidate_id,))
        if row and row["sections"]:
            row["sections"] = json.loads(row["sections"])
        return row

    def start_scoring(self, candidate_id: int) -> None:
        with self.transaction() as c:
            self._transition(c, candidate_id, "extracted", "scoring")

    def save_evaluation(
        self,
        candidate_id: int,
        *,
        overall_score: int,
        sub_scores: Mapping[str, int],
        summary: str,
        reasons: list[str],
        evidence: list[Mapping[str, str]],
        claim_mismatches: list[str],
        model_name: str,
        prompt_hash: str,
        raw_response: str | None = None,
        duration_seconds: float | None = None,
        flags: Iterable[str] = (),
    ) -> None:
        """Store the LLM result and mark the candidate ``scored`` in one go.

        ``flags`` are short notes for the recruiter (schema v2), e.g.
        "Possible instructions to the AI found in résumé".
        """
        if not isinstance(overall_score, int) or isinstance(overall_score, bool):
            raise ValidationError("overall_score must be an integer.")
        if not 0 <= overall_score <= 100:
            raise ValidationError("overall_score must be between 0 and 100.")
        for key, value in sub_scores.items():
            if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 100:
                raise ValidationError(f"Sub-score {key!r} must be an integer from 0 to 100.")
        if not reasons:
            raise ValidationError("Every evaluation needs at least one reason.")
        with self.transaction() as c:
            self._transition(c, candidate_id, "scoring", "scored")
            c.execute(
                """INSERT OR REPLACE INTO evaluations
                   (candidate_id, overall_score, sub_scores, summary, reasons, evidence,
                    claim_mismatches, model_name, prompt_hash, raw_response,
                    duration_seconds, flags, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    candidate_id,
                    overall_score,
                    json.dumps(dict(sub_scores)),
                    summary,
                    json.dumps(list(reasons)),
                    json.dumps([dict(e) for e in evidence]),
                    json.dumps(list(claim_mismatches)),
                    model_name,
                    prompt_hash,
                    raw_response,
                    duration_seconds,
                    json.dumps([str(f) for f in flags]),
                    _now(),
                ),
            )

    def get_evaluation(self, candidate_id: int) -> dict[str, Any] | None:
        row = self._query_one("SELECT * FROM evaluations WHERE candidate_id = ?", (candidate_id,))
        if row:
            for key in ("sub_scores", "reasons", "evidence", "claim_mismatches", "flags"):
                row[key] = json.loads(row[key])
        return row

    def mark_failed(self, candidate_id: int, *, kind: str, reason: str) -> None:
        """Record a *candidate* failure (their file, their link).

        System failures (internet down, Ollama down) must never come here:
        they pause the run instead. See ``worker.py``.

        ``pdf_path`` is cleared: the caller deletes the file next. If the
        process dies in between, recovery reports the file as an orphan
        instead of it staying referenced (and on disk) until a retry.
        """
        if kind not in FAILURE_KINDS:
            raise ValidationError(f"Failure kind must be one of {FAILURE_KINDS}.")
        reason = reason.strip()
        if not reason:
            raise ValidationError("A failure needs a human-readable reason.")
        with self.transaction() as c:
            working = ("queued", "downloading", "downloaded", "extracted", "scoring")
            self._transition(
                c, candidate_id, working, "failed", failure_kind=kind, failure_reason=reason, pdf_path=None
            )
            run_id = c.execute(
                "SELECT run_id FROM candidates WHERE id = ?", (candidate_id,)
            ).fetchone()["run_id"]
            self._event(c, run_id, candidate_id, "warning", f"Failed ({kind}): {reason}")

    def mark_filtered(self, candidate_id: int, *, reason: str) -> None:
        with self.transaction() as c:
            self._transition(c, candidate_id, "queued", "filtered", filter_reason=reason)

    def return_to_queue(self, candidate_id: int) -> None:
        """Put back a download that stopped because of a *system* problem."""
        with self.transaction() as c:
            self._transition(c, candidate_id, ("downloading", "downloaded"), "queued", pdf_path=None)

    def return_to_extracted(self, candidate_id: int) -> None:
        """Put back a scoring attempt that stopped because Ollama went away."""
        with self.transaction() as c:
            self._transition(c, candidate_id, "scoring", "extracted")

    def retry_failed(self, run_id: int, *, include_permanent: bool = False) -> int:
        """Send failed candidates back into the pipeline. Returns how many.

        Candidates whose text was already extracted go back to ``extracted``
        (no re-download); the rest go back to ``queued``.
        """
        kinds = FAILURE_KINDS if include_permanent else ("retryable",)
        with self.transaction() as c:
            rows = c.execute(
                f"""SELECT c.id, rt.candidate_id IS NOT NULL AS has_text
                    FROM candidates c LEFT JOIN resume_texts rt ON rt.candidate_id = c.id
                    WHERE c.run_id = ? AND c.state = 'failed'
                      AND c.failure_kind IN ({', '.join('?' for _ in kinds)})""",
                (run_id, *kinds),
            ).fetchall()
            for row in rows:
                target = "extracted" if row["has_text"] else "queued"
                self._transition(c, row["id"], "failed", target, pdf_path=None)
            if rows:
                self._event(c, run_id, None, "info", f"Retrying {len(rows)} students who couldn't be screened")
            return len(rows)

    def clear_filters(self, run_id: int) -> int:
        """Send candidates removed by a hard filter back to the queue. Returns how many.

        Only while the run is a draft or paused. The run's filter settings are
        not touched (they stay locked, CLAUDE.md rule 11): the worker applies
        filters once, when a run leaves draft, so these candidates are screened
        when the run continues.
        """
        with self.transaction() as c:
            run = c.execute("SELECT status FROM runs WHERE id = ?", (run_id,)).fetchone()
            if run is None:
                raise NotFoundError(f"Run {run_id} does not exist.")
            if run["status"] not in ("draft", "paused"):
                raise RunLockedError("Filtered candidates can be added back only while screening is paused.")
            rows = c.execute(
                "SELECT id FROM candidates WHERE run_id = ? AND state = 'filtered' ORDER BY id", (run_id,)
            ).fetchall()
            for row in rows:
                self._transition(c, row["id"], "filtered", "queued")
            if rows:
                self._event(c, run_id, None, "info", f"{len(rows)} filtered-out students will be screened after all")
            return len(rows)

    def scoring_durations(self, run_id: int) -> list[float]:
        """Seconds each scored candidate of the run took, oldest first (for the ETA)."""
        rows = self._query(
            """SELECT e.duration_seconds AS seconds FROM evaluations e
               JOIN candidates c ON c.id = e.candidate_id
               WHERE c.run_id = ? AND e.duration_seconds IS NOT NULL
               ORDER BY e.created_at, e.candidate_id""",
            (run_id,),
        )
        return [float(r["seconds"]) for r in rows]

    # ---- crash recovery --------------------------------------------------- #

    def recover_after_crash(self, downloads_dir: Path | str | None = None) -> RecoveryReport:
        """Run once at startup, before the worker starts.

        * ``running`` runs become ``paused`` ("Atlas closed unexpectedly").
        * ``downloading`` → ``queued`` (the partial file is worthless).
        * ``downloaded`` whose PDF is missing on disk → ``queued``.
        * ``scoring`` → ``extracted`` (the LLM call died with the process).
        * PDFs in ``downloads_dir`` that no candidate references are reported
          as orphans for the caller to delete.
        """
        runs_paused = requeued = rewound = 0
        with self.transaction() as c:
            for run in c.execute("SELECT id FROM runs WHERE status = 'running'").fetchall():
                c.execute(
                    "UPDATE runs SET status = 'paused', pause_reason = ?, updated_at = ? WHERE id = ?",
                    ("Atlas closed unexpectedly. Press Resume to continue.", _now(), run["id"]),
                )
                self._event(c, run["id"], None, "warning", "Atlas closed unexpectedly; screening paused")
                runs_paused += 1

            for row in c.execute(
                "SELECT id, state, pdf_path FROM candidates WHERE state IN ('downloading', 'downloaded', 'scoring')"
            ).fetchall():
                if row["state"] == "downloading" or (
                    row["state"] == "downloaded"
                    and (not row["pdf_path"] or not Path(row["pdf_path"]).is_file())
                ):
                    self._transition(c, row["id"], row["state"], "queued", pdf_path=None)
                    requeued += 1
                elif row["state"] == "scoring":
                    self._transition(c, row["id"], "scoring", "extracted")
                    rewound += 1

            referenced = {
                str(Path(r["pdf_path"]).resolve())
                for r in c.execute("SELECT pdf_path FROM candidates WHERE pdf_path IS NOT NULL")
            }

        orphans: list[str] = []
        if downloads_dir is not None and Path(downloads_dir).is_dir():
            for file in Path(downloads_dir).iterdir():
                if (
                    file.is_file()
                    and file.suffix.lower() in DOWNLOAD_SUFFIXES
                    and str(file.resolve()) not in referenced
                ):
                    orphans.append(str(file))

        return RecoveryReport(runs_paused, requeued, rewound, tuple(sorted(orphans)))

    # ---- overrides -------------------------------------------------------- #

    def add_override(
        self, candidate_id: int, *, from_bucket: str, to_bucket: str, note: str = ""
    ) -> None:
        if to_bucket not in BUCKETS:
            raise ValidationError(f"Bucket must be one of {BUCKETS}.")
        with self.transaction() as c:
            row = c.execute(
                "SELECT run_id, state FROM candidates WHERE id = ?", (candidate_id,)
            ).fetchone()
            if row is None:
                raise NotFoundError(f"Candidate {candidate_id} does not exist.")
            if row["state"] != "scored":
                raise InvalidTransitionError("Only scored candidates can be moved between buckets.")
            c.execute(
                """INSERT INTO overrides (candidate_id, from_bucket, to_bucket, note, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (candidate_id, from_bucket, to_bucket, note.strip(), _now()),
            )
            self._event(
                c, row["run_id"], candidate_id, "info",
                f"Moved by recruiter: {from_bucket} → {to_bucket}" + (f" ({note.strip()})" if note.strip() else ""),
            )

    def overrides_for(self, candidate_id: int) -> list[dict[str, Any]]:
        """Every override of one candidate, oldest first."""
        return self._query("SELECT * FROM overrides WHERE candidate_id = ? ORDER BY id", (candidate_id,))

    def latest_overrides(self, run_id: int) -> dict[int, str]:
        """Most recent override per candidate: ``{candidate_id: to_bucket}``."""
        rows = self._query(
            """SELECT o.candidate_id, o.to_bucket FROM overrides o
               JOIN candidates c ON c.id = o.candidate_id
               WHERE c.run_id = ?
                 AND o.id = (SELECT MAX(id) FROM overrides WHERE candidate_id = o.candidate_id)""",
            (run_id,),
        )
        return {r["candidate_id"]: r["to_bucket"] for r in rows}

    # ---- results feed ----------------------------------------------------- #

    def scored_rows(self, run_id: int) -> list[dict[str, Any]]:
        """Scored candidates with their score, for ``buckets.compute_buckets``."""
        return self._query(
            """SELECT c.id AS candidate_id, c.ra_number, e.overall_score
               FROM candidates c JOIN evaluations e ON e.candidate_id = c.id
               WHERE c.run_id = ? AND c.state = 'scored'""",
            (run_id,),
        )

    def results_rows(self, run_id: int) -> list[dict[str, Any]]:
        """Every candidate of a run with what the results screen lists (one query)."""
        rows = self._query(
            """SELECT c.id AS candidate_id, c.ra_number, c.name, c.department, c.cgpa, c.state,
                      c.failure_kind, c.failure_reason, c.filter_reason, c.resume_link,
                      e.overall_score, e.flags
               FROM candidates c LEFT JOIN evaluations e ON e.candidate_id = c.id
               WHERE c.run_id = ? ORDER BY c.id""",
            (run_id,),
        )
        for row in rows:
            row["flags"] = json.loads(row["flags"]) if row["flags"] else []
        return rows

    def export_rows(self, run_id: int) -> list[dict[str, Any]]:
        """Every candidate of a run with its evaluation (if any), JSON decoded.

        Plain data for ``export.export_csv`` and the results screen.
        """
        rows = self._query(
            """SELECT c.id AS candidate_id, c.ra_number, c.name, c.email, c.phone, c.section,
                      c.department, c.cgpa, c.state, c.failure_kind, c.failure_reason, c.filter_reason,
                      e.overall_score, e.sub_scores, e.summary, e.reasons, e.evidence,
                      e.claim_mismatches, e.flags, e.model_name
               FROM candidates c LEFT JOIN evaluations e ON e.candidate_id = c.id
               WHERE c.run_id = ? ORDER BY c.id""",
            (run_id,),
        )
        for row in rows:
            for key in ("sub_scores", "reasons", "evidence", "claim_mismatches", "flags"):
                row[key] = json.loads(row[key]) if row[key] else None
        return rows

    # ---- events & settings ------------------------------------------------ #

    @staticmethod
    def _event(
        c: sqlite3.Connection, run_id: int | None, candidate_id: int | None, level: str, message: str
    ) -> None:
        c.execute(
            "INSERT INTO events (run_id, candidate_id, level, message, created_at) VALUES (?, ?, ?, ?, ?)",
            (run_id, candidate_id, level, message, _now()),
        )

    def log_event(
        self, run_id: int | None, message: str, *, level: str = "info", candidate_id: int | None = None
    ) -> None:
        with self.transaction() as c:
            self._event(c, run_id, candidate_id, level, message)

    def events(self, run_id: int, *, after_id: int = 0, limit: int = 200) -> list[dict[str, Any]]:
        return self._query(
            "SELECT * FROM events WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?",
            (run_id, after_id, limit),
        )

    def candidate_events(self, candidate_id: int, *, limit: int = 200) -> list[dict[str, Any]]:
        return self._query(
            "SELECT * FROM events WHERE candidate_id = ? ORDER BY id LIMIT ?", (candidate_id, limit)
        )

    def last_event_id(self, run_id: int) -> int:
        row = self._query_one("SELECT MAX(id) AS last FROM events WHERE run_id = ?", (run_id,))
        return int(row["last"] or 0) if row else 0

    def clear_settings(self) -> None:
        with self.transaction() as c:
            c.execute("DELETE FROM settings")

    def get_setting(self, key: str, default: Any = None) -> Any:
        row = self._query_one("SELECT value FROM settings WHERE key = ?", (key,))
        return default if row is None else json.loads(row["value"])

    def set_setting(self, key: str, value: Any) -> None:
        with self.transaction() as c:
            c.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value)),
            )
