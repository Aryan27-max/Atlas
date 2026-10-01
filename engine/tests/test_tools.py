"""Read-only privacy tools: they report counts and never print what they found."""

from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from engine.tools import graph_audit


class GraphAuditTests(unittest.TestCase):
    def run_audit(self, files: dict[str, str]) -> tuple[int, str]:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "graphify-out"
            for name, text in files.items():
                path = folder / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = graph_audit.main([str(folder), "--repo", tmp])
            return code, out.getvalue()

    def test_a_clean_graph_passes(self) -> None:
        code, out = self.run_audit({"GRAPH_REPORT.md": "# Graph\n- engine/worker.py calls db.claim_next_download\n"})
        self.assertEqual(code, 0)
        self.assertIn("[OK ] RA numbers: 0", out)

    def test_student_data_fails_without_printing_it(self) -> None:
        secret_ra, secret_mail = "RA2111003010007", "priya.real@college.example"
        code, out = self.run_audit({
            "graph.json": f'{{"source_file": "local/student_details.csv", "label": "{secret_ra}"}}',
            "cache/x.json": f'"{secret_mail}" 9876543210',
        })
        self.assertEqual(code, 1)
        self.assertIn("[BAD] paths under local/: 1", out)
        self.assertIn("[BAD] RA numbers: 1", out)
        self.assertIn("[BAD] real-data file names: 1", out)
        self.assertIn("[REVIEW] e-mail addresses: 1", out)
        self.assertIn("runs of 10+ digits: 2", out)  # the phone, and the RA number's digits
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


if __name__ == "__main__":
    unittest.main()
