"""Tests for engine/cli.py against the local Drive and Ollama stubs."""

from __future__ import annotations

import csv
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from engine.cli import main
from engine.db import Database
from engine.errors import Pause
from engine.health import HealthProbe
from engine.llm.client import OllamaClient
from engine.tests.fixtures import make_pdf, simple_resume_text
from engine.tests.stubs.drive_stub import DriveStub, Pdf, SignIn
from engine.tests.stubs.ollama_stub import OllamaStub


class CliTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.data = self.dir / "data"
        self.drive = DriveStub().start()
        self.ollama = OllamaStub().start()
        self.addCleanup(self.drive.stop)
        self.addCleanup(self.ollama.stop)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def csv(self, grades: dict[int, int | None]) -> Path:
        """A CSV with one row per student; ``None`` means a private link."""
        lines = ["Name,RA Number,Mail ID,Phone no.,CGPA,Department,Skills,Resume Link"]
        for i, grade in grades.items():
            if grade is None:
                link = self.drive.serve(f"CLI{i}", SignIn())
            else:
                pdf = make_pdf(self.dir / f"{i}.pdf", [simple_resume_text(grade, name=f"Kavya Rao{i}")])
                link = self.drive.serve(f"CLI{i}", Pdf(pdf.read_bytes()))
            lines.append(f"Kavya Rao{i},RA{i:04d},kavya{i}@example.com,98765{i:05d},8.{i},CSE,Python,{link}")
        path = self.dir / "students.csv"
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path

    def cli(self, *argv: str, stdin: str = "") -> tuple[int, str]:
        argv = tuple(argv)
        if argv and argv[0] in ("run", "resume", "retry") and "--ollama-url" not in argv:
            argv = (*argv, "--ollama-url", self.ollama.base_url)
        out = io.StringIO()
        client = OllamaClient(self.ollama.base_url)
        code = main(
            list(argv), stdout=out, stdin=io.StringIO(stdin),
            url_rewrite=self.drive.rewrite,
            health=HealthProbe(hosts=(("127.0.0.1", self.drive.port),), ollama=client),
            poll_interval=0.2, download_interval=0.0, idle_interval=0.01,
        )
        return code, out.getvalue()

    def run_args(self, csv_path: Path, *extra: str) -> list[str]:
        return ["run", "--csv", str(csv_path), "--model", "stub-model", "--criteria", "Backend Python projects",
                "--data-dir", str(self.data), *extra]


class CliTests(CliTestCase):
    def test_preflight(self) -> None:
        code, out = self.cli("preflight", "--csv", str(self.csv({1: 70, 2: 80})))
        self.assertEqual(code, 0)
        self.assertIn("2 rows read", out)
        bad = self.dir / "bad.csv"
        bad.write_text("Name\nAsha\n", encoding="utf-8")
        code, out = self.cli("preflight", "--csv", str(bad))
        self.assertEqual(code, 1)
        self.assertIn("No column for RA number", out)

    def test_run_results_export_and_retry(self) -> None:
        code, out = self.cli(*self.run_args(self.csv({1: 91, 2: 55, 3: None, 4: 30}), "--yes"))
        self.assertEqual(code, 0, out)
        self.assertIn("4 rows read", out)
        self.assertIn("ready for screening", out)
        self.assertIn("#1 RA0001: Scored 91", out)
        self.assertIn('#3 RA0003: Failed (permanent): Link is private. Ask the student to set sharing to "Anyone with the link".', out)
        self.assertIn("Done. Scored 3, failed 1, filtered 0.", out)
        for private in ("Kavya", "kavya", "@example.com", "98765"):
            self.assertNotIn(private, out)                  # ids and RA numbers only

        code, out = self.cli("results", "--run", "1", "--data-dir", str(self.data))
        self.assertEqual(code, 0)
        self.assertIn("Shortlisted 1 · Cutoff 1 · Rejected 1 · Failed 1", out)
        self.assertRegex(out, r"1  RA0001\s+91  shortlisted")
        code, out = self.cli("results", "--run", "1", "--data-dir", str(self.data), "--shortlist", "50", "--band", "40")
        self.assertIn("Shortlisted 2 · Cutoff 0 · Rejected 1", out)   # live re-bucketing, nothing re-scored

        target = self.dir / "shortlist.csv"
        code, out = self.cli("export", "--run", "1", "--data-dir", str(self.data), "--view", "shortlisted",
                             "--out", str(target))
        self.assertEqual(code, 0)
        with open(target, encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual([(r["RA Number"], r["Name"], r["Overall Score"]) for r in rows], [("RA0001", "Kavya Rao1", "91")])

        code, out = self.cli("retry", "--run", "1", "--data-dir", str(self.data))
        self.assertEqual((code, out.strip()), (0, "Nothing to retry."))
        code, out = self.cli("retry", "--run", "1", "--data-dir", str(self.data), "--include-permanent")
        self.assertEqual(code, 0)
        self.assertIn("Retrying 1 candidates.", out)
        self.assertIn("RA0003: Failed (permanent)", out)       # still private

    def test_declining_saves_nothing(self) -> None:
        code, out = self.cli(*self.run_args(self.csv({1: 70})), stdin="n\n")
        self.assertEqual(code, 1)
        self.assertIn("Continue? [y/N]", out)
        self.assertFalse((self.data / "atlas.db").exists())

    def test_confirming_runs(self) -> None:
        code, _ = self.cli(*self.run_args(self.csv({1: 70})), stdin="y\n")
        self.assertEqual(code, 0)

    def test_model_that_is_not_installed(self) -> None:
        code, out = self.cli("run", "--csv", str(self.csv({1: 70})), "--model", "mistral", "--criteria", "x",
                             "--data-dir", str(self.data), "--yes")
        self.assertEqual(code, 1)
        self.assertIn('The model "mistral" isn\'t installed in Ollama.', out)
        with Database(self.data / "atlas.db") as db:
            self.assertEqual(db.list_runs(), [])

    def test_the_precheck_is_cached_per_model(self) -> None:
        self.cli(*self.run_args(self.csv({1: 70}), "--yes"))
        chats = len(self.ollama.chats)
        code, out = self.cli(*self.run_args(self.csv({1: 70, 2: 60}), "--yes"))
        self.assertEqual(code, 0)
        self.assertIn("ready (checked before)", out)
        self.assertEqual(len(self.ollama.chats) - chats, 2)   # the two candidates, no pre-check

    def test_criteria_from_a_file(self) -> None:
        criteria = self.dir / "criteria.txt"
        criteria.write_text("Strong backend interns\n", encoding="utf-8")
        args = self.run_args(self.csv({1: 70}), "--yes")
        args[args.index("Backend Python projects")] = f"@{criteria}"
        self.assertEqual(self.cli(*args)[0], 0)
        with Database(self.data / "atlas.db") as db:
            self.assertEqual(db.get_run(1)["criteria_prompt"], "Strong backend interns")

    def test_model_removed_mid_run_pauses_with_exit_2_then_resumes(self) -> None:
        csv_path = self.csv({i: 60 + i for i in range(1, 6)})
        original = list(self.ollama.models)
        real_chat = OllamaClient.chat_json
        calls = {"n": 0}

        def remove_model_after_two(client, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 4:                       # pre-check + 2 candidates went through
                self.ollama.models.clear()
            return real_chat(client, *args, **kwargs)

        with patch.object(OllamaClient, "chat_json", remove_model_after_two):
            code, out = self.cli(*self.run_args(csv_path, "--yes"))
        self.assertEqual(code, 2)
        self.assertIn(f"Paused: {Pause.model_missing('stub-model:latest')}", out)   # the installed name
        self.assertIn("[1/5] #1 RA0001: Scored 61", out)
        self.assertIn("[2/5] #2 RA0002: Scored 62", out)
        self.assertIn("resume --run 1", out)

        self.ollama.models.extend(original)
        code, out = self.cli("resume", "--run", "1", "--data-dir", str(self.data))
        self.assertEqual(code, 0, out)
        with Database(self.data / "atlas.db") as db:
            self.assertEqual(db.state_counts(1)["scored"], 5)

    def test_ctrl_c_pauses_gracefully_and_resume_finishes(self) -> None:
        csv_path = self.csv({i: 50 + i for i in range(1, 9)})
        real_sleep = __import__("time").sleep
        ticks = {"n": 0}

        def interrupt_soon(seconds: float) -> None:
            ticks["n"] += 1
            if ticks["n"] == 2:
                raise KeyboardInterrupt           # what Ctrl+C does to the main thread
            real_sleep(seconds)

        self.ollama.delay = 0.3                    # slow enough that the run is mid-way at the interrupt
        with patch("engine.cli._wait", interrupt_soon):
            code, out = self.cli(*self.run_args(csv_path, "--yes"))
        self.assertEqual(code, 2)
        self.assertIn("Paused. Continue with", out)
        with Database(self.data / "atlas.db") as db:
            run = db.get_run(1)
            self.assertEqual((run["status"], run["pause_reason"]), ("paused", Pause.CLOSED))
        code, _ = self.cli("resume", "--run", "1", "--data-dir", str(self.data))
        self.assertEqual(code, 0)
        with Database(self.data / "atlas.db") as db:
            self.assertEqual(db.state_counts(1)["scored"], 8)

    def test_errors_exit_1(self) -> None:
        code, out = self.cli("results", "--run", "99", "--data-dir", str(self.data))
        self.assertEqual(code, 1)
        self.assertIn("Run 99 does not exist.", out)
        with patch("sys.stderr", io.StringIO()):
            with self.assertRaises(SystemExit) as ctx:
                self.cli("run", "--csv", "x.csv")                 # missing required options
        self.assertEqual(ctx.exception.code, 1)


if __name__ == "__main__":
    unittest.main()
