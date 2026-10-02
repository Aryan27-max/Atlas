"""Kill test: SIGKILL a process mid-write, then prove nothing is lost or half-done.

This is the database layer's share of the Phase 1 exit criterion. The
worker-level kill test is ``test_worker_kill.py``.

``Popen.kill()`` is SIGKILL on POSIX and ``TerminateProcess`` on Windows. Both
end the process instantly with no cleanup, no ``finally`` and no flush, so the
same test proves crash safety on both platforms.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

from engine.db import Database

ROOT = Path(__file__).resolve().parents[2]

WRITER = textwrap.dedent(
    """
    import sys
    from pathlib import Path
    sys.path.insert(0, sys.argv[2])
    from engine.db import Database

    db = Database(sys.argv[1])
    run_id = db.list_runs()[0]["id"]
    tmp = Path(sys.argv[1]).parent
    print("ready", flush=True)
    while True:
        for cand in db.list_candidates(run_id, states=["queued"]):
            cid = cand["id"]
            pdf = tmp / f"{cid}.pdf"
            pdf.write_bytes(b"%PDF")
            db.start_download(cid)
            db.finish_download(cid, pdf)
            db.commit_extraction(cid, text="t" * 5000, page_count=3, ocr_used=False, pdf_sha256="h")
            db.start_scoring(cid)
            db.save_evaluation(
                cid, overall_score=cid % 101, sub_scores={"t": 1}, summary="s",
                reasons=["r"], evidence=[], claim_mismatches=[],
                model_name="m", prompt_hash="p",
            )
            pdf.unlink(missing_ok=True)
        db.retry_failed(run_id)
    """
)


class KillTest(unittest.TestCase):
    def test_sigkill_never_leaves_inconsistent_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "atlas.db"
            script = Path(tmp) / "writer.py"
            script.write_text(WRITER, encoding="utf-8")

            for round_ in range(20):
                # Fresh batch of queued candidates each round.
                with Database(db_path) as db:
                    if not db.list_runs():
                        run_id = db.create_run("kill")
                    else:
                        run_id = db.list_runs()[0]["id"]
                    base = round_ * 50
                    db.add_candidates(run_id, [
                        {"ra_number": f"RA{base + i}", "resume_link": "https://x"} for i in range(50)
                    ])

                proc = subprocess.Popen(
                    [sys.executable, str(script), str(db_path), str(ROOT)],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                )
                line = proc.stdout.readline().strip()
                if line != "ready":
                    proc.wait()
                    self.fail(f"writer did not start: {proc.stderr.read()}")
                time.sleep(0.02 + (round_ % 7) * 0.013)  # vary where the kill lands
                proc.kill()  # SIGKILL / TerminateProcess
                proc.wait()
                proc.stdout.close()
                proc.stderr.close()

                with Database(db_path) as db:
                    db.recover_after_crash(Path(tmp))
                    self.assertEqual(db._conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                    self.assertEqual(db._conn.execute("PRAGMA foreign_key_check").fetchall(), [])
                    run_id = db.list_runs()[0]["id"]
                    counts = db.state_counts(run_id)
                    # Nothing may be stuck mid-flight after recovery.
                    self.assertEqual(counts["downloading"] + counts["scoring"], 0, counts)
                    # Every candidate still exists exactly once.
                    self.assertEqual(sum(counts.values()), (round_ + 1) * 50)
                    # State and work products always agree.
                    bad = db._conn.execute(
                        """SELECT c.id, c.state FROM candidates c
                           LEFT JOIN resume_texts rt ON rt.candidate_id = c.id
                           LEFT JOIN evaluations e ON e.candidate_id = c.id
                           WHERE (c.state IN ('extracted', 'scored') AND rt.candidate_id IS NULL)
                              OR (c.state = 'scored' AND e.candidate_id IS NULL)
                              OR (c.state != 'scored' AND e.candidate_id IS NOT NULL)"""
                    ).fetchall()
                    self.assertEqual([tuple(r) for r in bad], [])

            # Sanity: the writer really was doing work when it was killed.
            with Database(db_path) as db:
                scored = db.state_counts(db.list_runs()[0]["id"])["scored"]
                self.assertGreater(scored, 0)


if __name__ == "__main__":
    unittest.main()
