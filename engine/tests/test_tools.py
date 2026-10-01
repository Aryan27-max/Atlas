"""Read-only privacy tools: they report counts and never print what they found."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from engine.tools import graph_audit


class GraphAuditTests(unittest.TestCase):
    def run_audit(self, files: dict[str, str], repo_files: dict[str, str] | None = None) -> tuple[int, str]:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            for name, text in (repo_files or {}).items():
                (repo / name).parent.mkdir(parents=True, exist_ok=True)
                (repo / name).write_text(text, encoding="utf-8")
            folder = repo / "graphify-out"
            for name, text in files.items():
                path = folder / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = graph_audit.main([str(folder), "--repo", tmp])
            return code, out.getvalue()

    @staticmethod
    def graph(*nodes: dict[str, str]) -> str:
        return json.dumps({"nodes": list(nodes), "links": []})

    def test_a_clean_graph_passes(self) -> None:
        code, out = self.run_audit({
            "graph.json": self.graph({"id": "w", "label": "Worker", "source_file": "engine/worker.py"}),
            "GRAPH_REPORT.md": "# Graph\n- engine/worker.py calls db.claim_next_download\n",
        }, {"engine/worker.py": "class Worker: ..."})
        self.assertEqual(code, 0, out)
        self.assertIn("[OK ] indexed files under local/: 0", out)
        self.assertIn("[OK ] RA numbers not traceable to an indexed file: 0", out)

    def test_mentions_in_the_repos_own_files_are_fine(self) -> None:
        # Docs and tools talk about local/eval, data file names and fictional RA numbers.
        doc = "Put real résumés in local/eval/. Never commit student_details.csv. Fixture RA2311000000."
        code, out = self.run_audit({
            "graph.json": self.graph({"id": "d", "label": doc, "source_file": "docs/EVAL.md"}),
        }, {"docs/EVAL.md": doc})
        self.assertEqual(code, 0, out)
        self.assertIn("[OK ] paths under local/ not traceable to an indexed file: 0", out)

    def test_student_data_fails_without_printing_it(self) -> None:
        secret_ra, secret_mail = "RA2111003010007", "priya.real@college.example"
        code, out = self.run_audit({
            "graph.json": self.graph({"id": "x", "label": secret_ra, "source_file": "local/student_details.csv"}),
            "cache/x.json": f'"{secret_mail}" 9876543210',
        })
        self.assertEqual(code, 1)
        self.assertIn("[BAD] indexed files under local/: 1", out)
        self.assertIn("[BAD] RA numbers not traceable to an indexed file: 1", out)
        self.assertIn("[BAD] real-data file names not traceable to an indexed file: 1", out)
        self.assertIn("[REVIEW] e-mail addresses: 1", out)
        for value in (secret_ra, secret_mail, "9876543210", "student_details"):
            self.assertNotIn(value, out)


class GraphQueryTests(unittest.TestCase):
    def test_callers_callees_find_and_file(self) -> None:
        from engine.tools import graph_query

        graph = {
            "nodes": [
                {"id": "w", "label": "Worker", "source_file": "engine/worker.py", "source_location": "L90"},
                {"id": "c", "label": ".claim_next_download()", "source_file": "engine/db.py", "source_location": "L675"},
                {"id": "t", "label": ".test_claim()", "source_file": "engine/tests/test_db.py", "source_location": "L9"},
            ],
            "links": [
                {"source": "w", "target": "c", "relation": "calls"},
                {"source": "t", "target": "c", "relation": "contains"},  # not a usage relation
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "graph.json"
            path.write_text(__import__("json").dumps(graph), encoding="utf-8")
            self.assertEqual(graph_query.run("callers", "claim_next_download", path),
                             ["Worker  [calls]  engine/worker.py:90"])
            self.assertEqual(graph_query.run("callees", "Worker", path),
                             [".claim_next_download()  [calls]  engine/db.py:675"])
            self.assertEqual(len(graph_query.run("find", "claim", path)), 2)
            self.assertEqual(graph_query.run("file", "engine/worker.py", path), ["Worker  engine/worker.py:90"])


class LeakCheckTests(unittest.TestCase):
    RESUME = ("KAVIN RAGHUNATHAN\nkavin.r@example.org | github.com/kavin-r9 | +91 98765 43210\n"
              "PROJECTS\nChat app by Kavin; code at github.com/kavin-r9/chat\nEDUCATION\nB.Tech, mentor: Raghunathan")

    def make_db(self, folder: Path) -> Path:
        from engine.db import Database

        db = Database(folder / "atlas.db")
        try:
            run = db.create_run("Fictional")
            db.configure_run(run, model_name="m", criteria_prompt="Python")
            db.add_candidates(run, [
                {"ra_number": "RA0000000001", "name": "K. R.", "email": "kavin.r@example.org",
                 "phone": "9876543210", "resume_link": "https://example.com/1"},
                {"ra_number": "RA0000000002", "name": "Meera Iyer", "email": "meera@example.org",
                 "phone": "9123456780", "resume_link": "https://example.com/2"},
            ])
            cid = db.list_candidates(run)[0]["id"]
            db.start_download(cid)
            db.finish_download(cid, folder / "1.pdf")
            db.commit_extraction(cid, text=self.RESUME, page_count=1, ocr_used=False, pdf_sha256="0" * 64)
        finally:
            db.close()
        return folder / "atlas.db"

    def test_zero_when_redaction_works_and_counts_only_when_it_does_not(self) -> None:
        from engine.llm import redact
        from engine.tools import leak_check

        with tempfile.TemporaryDirectory() as tmp:
            db = self.make_db(Path(tmp))
            before = db.read_bytes()
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = leak_check.main(["--data-dir", tmp])
            self.assertEqual(code, 0, out.getvalue())
            self.assertIn("prompts rebuilt: 1", out.getvalue())
            self.assertIn("TOTAL LEAKS: 0", out.getvalue())
            self.assertEqual(db.read_bytes(), before)            # read-only

            original = redact.apply_lexicon
            redact.apply_lexicon = lambda text, lexicon: text     # simulate the old, CSV-only redaction
            try:
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = leak_check.main(["--data-dir", tmp])
            finally:
                redact.apply_lexicon = original
            self.assertEqual(code, 1)
            for value in ("kavin", "Kavin", "raghunathan", "RAGHUNATHAN", "kavin-r9"):
                self.assertNotIn(value, out.getvalue())


class TroubleshootingTests(unittest.TestCase):
    """docs/TROUBLESHOOTING.md is generated from engine/errors.py and can't drift (step 3.7)."""

    def test_every_message_has_help_and_nothing_else_does(self) -> None:
        from engine.tools.troubleshooting import HELP, all_keys

        keys = all_keys()
        self.assertEqual(sorted(k for k in keys if k not in HELP), [], "a message in errors.py has no help")
        self.assertEqual(sorted(k for k in HELP if k not in keys), [], "help for a message that no longer exists")
        self.assertGreaterEqual(len([k for k in keys if k.startswith("Reason.")]), 18)
        self.assertGreaterEqual(len([k for k in keys if k.startswith("Pause.")]), 8)
        for key, item in HELP.items():
            self.assertTrue(item.means.strip() and item.todo.strip(), key)
            self.assertEqual(bool(item.kind), key.startswith("Reason."), key)    # only students have a kind

    def test_the_document_is_current(self) -> None:
        from engine.tools.troubleshooting import DOC, render

        text = render()
        self.assertEqual(DOC.read_text(encoding="utf-8"), text,
                         "docs/TROUBLESHOOTING.md is stale: run python -m engine.tools.troubleshooting")
        # Every message appears word for word, as a heading.
        from engine.tools.troubleshooting import SECTIONS, messages

        for cls, _, _ in SECTIONS:
            for _, message in messages(cls):
                self.assertIn(f"### {message}\n", text)

    def test_documented_kinds_match_the_code(self) -> None:
        """A reason documented as "needs the student to fix it" is raised as permanent, and the reverse."""
        import re

        from engine.tools.troubleshooting import HELP

        engine_dir = Path(__file__).resolve().parents[1]
        seen: dict[str, set[str]] = {}
        for path in engine_dir.rglob("*.py"):
            if {"tests", "tools", "eval"} & set(path.relative_to(engine_dir).parts):
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                names = re.findall(r"Reason\.([A-Z_]+)", line)
                kinds = set(re.findall(r'"(permanent|retryable)"', line))
                if not kinds and re.search(r"\b(TransientError|ChatDeadline)\(", line):
                    kinds = {"retryable"}           # an ambiguous failure fails the student as retryable
                if names and len(kinds) == 1:
                    for name in names:
                        seen.setdefault(name, set()).update(kinds)
        self.assertGreaterEqual(len(seen), 18, "most reasons are raised with a visible kind")
        for name, kinds in seen.items():
            self.assertEqual(len(kinds), 1, f"Reason.{name} is raised as both kinds")
            expected = {"permanent": "fix", "retryable": "retry"}[next(iter(kinds))]
            self.assertEqual(HELP[f"Reason.{name}"].kind, expected, f"Reason.{name}")


if __name__ == "__main__":
    unittest.main()
