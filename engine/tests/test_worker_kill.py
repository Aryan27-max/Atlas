"""Phase 1 exit criterion: kill the real worker 20 times; nothing is lost or duplicated.

A child process runs a real ``Worker`` (real downloader, extractor, scorer,
Ollama client and health probe) against the local Drive and Ollama stubs,
with 30 candidates. It is hard-killed at 20 different moments; each round
restarts it, and ``Worker.start`` recovers whatever the kill left behind.
A final, uninterrupted round finishes the run.

``Popen.kill()`` is SIGKILL on POSIX and ``TerminateProcess`` on Windows —
both end the process instantly, with no cleanup. The test runs on both
(the Phase 1 prompt said to skip Windows; see docs/summaries/phase1/step-1.0).

Every candidate's résumé says "Capstone grade N out of 100" with its own N,
and the stub model scores exactly N. So a correct final score also proves
that no kill ever mixed up one candidate's text with another's.
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
from engine.errors import Reason
from engine.tests.fixtures import make_pdf, simple_resume_text
from engine.tests.stubs.drive_stub import DriveStub, Pdf, SignIn, Status
from engine.tests.stubs.ollama_stub import OllamaStub

ROOT = Path(__file__).resolve().parents[2]
CANDIDATES = 30
ROUNDS = 20

CHILD = textwrap.dedent(
    """
    import sys, time
    from pathlib import Path
    data_dir, root, drive_url, drive_port, ollama_url = Path(sys.argv[1]), sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
    sys.path.insert(0, root)
    from engine.db import Database
    from engine.extract import PdfExtractor
    from engine.health import HealthProbe
    from engine.ingest.downloader import Downloader
    from engine.llm.client import OllamaClient
    from engine.llm.scorer import Scorer
    from engine.logs import configure_logging
    from engine.worker import Worker

    configure_logging(data_dir)
    db = Database(data_dir / "atlas.db")
    run_id = db.list_runs()[0]["id"]
    client = OllamaClient(ollama_url)
    worker = Worker(
        db, data_dir,
        Downloader(min_interval=0, url_rewrite=lambda u: u.replace("https://drive.usercontent.google.com", drive_url),
                   connect_timeout=5, read_timeout=10),
        PdfExtractor(),
        lambda run: Scorer(client, run["model_name"], run["criteria_prompt"]),
        HealthProbe(hosts=(("127.0.0.1", drive_port),), ollama=client,
                    check_urls=(f"http://127.0.0.1:{drive_port}/generate_204",)),
        idle_interval=0.01, poll_interval=0.5,
    )
    worker.start(run_id)
    print("ready", flush=True)
    while db.get_run(run_id)["status"] == "running":
        time.sleep(0.02)
    worker.stop()
    print("done", db.get_run(run_id)["status"], flush=True)
    """
)


def grade(i: int) -> int:
    return 30 + (i * 7) % 70


class WorkerKillTest(unittest.TestCase):
    def test_killed_twenty_times_then_finishes_with_nothing_lost(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, \
                DriveStub(delay=0.03) as drive, OllamaStub(delay=0.12) as ollama:
            data_dir = Path(tmp) / "data"
            data_dir.mkdir()
            script = Path(tmp) / "child.py"
            script.write_text(CHILD, encoding="utf-8")

            expected_failures = {3: Reason.NOT_FOUND, 11: Reason.PRIVATE, 22: Reason.NOT_FOUND}
            rows = []
            for i in range(1, CANDIDATES + 1):
                file_id = f"KILLTEST{i:03d}"
                if i in (3, 22):
                    link = drive.serve(file_id, Status(404))
                elif i == 11:
                    link = drive.serve(file_id, SignIn())
                else:
                    pdf = make_pdf(Path(tmp) / f"{i}.pdf", [simple_resume_text(grade(i), name=f"Student {i}")])
                    link = drive.serve(file_id, Pdf(pdf.read_bytes()))
                rows.append({"ra_number": f"RA{i:04d}", "name": f"Student {i}", "resume_link": link})

            with Database(data_dir / "atlas.db") as db:
                run_id = db.create_run("Kill test")
                db.configure_run(run_id, model_name="stub-model", criteria_prompt="Backend projects")
                db.add_candidates(run_id, rows)

            args = [sys.executable, str(script), str(data_dir), str(ROOT), drive.base_url, str(drive.port), ollama.base_url]
            progress: list[int] = []
            for round_ in range(ROUNDS):
                proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                line = proc.stdout.readline().strip()
                if line != "ready":
                    proc.wait()
                    self.fail(f"round {round_}: worker did not start: {proc.stderr.read()[-2000:]}")
                # Vary where the kill lands: during recovery, downloads, extraction, scoring.
                time.sleep((round_ % 8) * 0.06)
                proc.kill()
                proc.wait()
                proc.stdout.close()
                proc.stderr.close()
                with Database(data_dir / "atlas.db") as db:
                    self.assert_consistent(db, run_id)
                    progress.append(db.state_counts(run_id)["scored"])

            # Final round, uninterrupted.
            proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                out, err = proc.communicate(timeout=180)
            except subprocess.TimeoutExpired:
                proc.kill()
                out, err = proc.communicate()
                self.fail(f"final run did not finish: {err[-2000:]}")
            self.assertIn("done completed", out, err[-2000:])

            with Database(data_dir / "atlas.db") as db:
                self.assert_consistent(db, run_id)
                counts = db.state_counts(run_id)
                self.assertEqual(counts["scored"] + counts["failed"], CANDIDATES, counts)
                self.assertEqual(counts["failed"], len(expected_failures))
                for cand in db.list_candidates(run_id):
                    i = int(cand["ra_number"][2:])
                    if i in expected_failures:
                        self.assertEqual((cand["state"], cand["failure_kind"], cand["failure_reason"]),
                                         ("failed", "permanent", expected_failures[i]))
                    else:
                        self.assertEqual(cand["state"], "scored")
                        self.assertEqual(db.get_evaluation(cand["id"])["overall_score"], grade(i))
                evaluations = db._conn.execute("SELECT COUNT(*) FROM evaluations").fetchone()[0]
                self.assertEqual(evaluations, counts["scored"])
                self.assertEqual(db._conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")

            leftovers = [p.name for p in (data_dir / "downloads").glob("*") if p.suffix in (".pdf", ".part")]
            self.assertEqual(leftovers, [])
            # The kills really interrupted work in progress, round after round.
            self.assertLess(progress[0], CANDIDATES - len(expected_failures))
            self.assertGreater(len(set(progress)), 3)

    def assert_consistent(self, db: Database, run_id: int) -> None:
        self.assertEqual(db._conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        self.assertEqual(db._conn.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(sum(db.state_counts(run_id).values()), CANDIDATES)
        bad = db._conn.execute(
            """SELECT c.id, c.state FROM candidates c
               LEFT JOIN resume_texts rt ON rt.candidate_id = c.id
               LEFT JOIN evaluations e ON e.candidate_id = c.id
               WHERE (c.state IN ('extracted', 'scoring', 'scored') AND rt.candidate_id IS NULL)
                  OR (c.state = 'scored' AND e.candidate_id IS NULL)
                  OR (c.state != 'scored' AND e.candidate_id IS NOT NULL)
                  OR (c.state = 'failed' AND c.failure_reason IS NULL)"""
        ).fetchall()
        self.assertEqual([tuple(r) for r in bad], [])


if __name__ == "__main__":
    unittest.main()
