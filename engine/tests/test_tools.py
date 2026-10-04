"""Read-only privacy tools: they report counts and never print what they found."""

from __future__ import annotations

import contextlib
import io
import json
import sys
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


def _licence_check():  # packaging/ isn't a package, and "packaging" is also a PyPI name: load it by path
    import importlib.util

    path = Path(__file__).resolve().parents[2] / "packaging" / "check_licenses.py"
    spec = importlib.util.spec_from_file_location("atlas_check_licenses", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module           # dataclasses look their module up here
    spec.loader.exec_module(module)
    return module


class LicenceCheckTests(unittest.TestCase):
    """packaging/check_licenses.py: a new copyleft or unknown licence in what ships fails the build."""

    def test_new_copyleft_or_unknown_licences_fail_and_allowlisted_ones_pass(self) -> None:
        check = _licence_check()
        notices = "`fine` `gpl-thing` `mystery` `pymupdf` `certifi`"
        packages = [
            check.Package("Python", "fine", "1.0", "MIT"),
            check.Package("Python", "gpl-thing", "1.0", "GNU General Public License v3 (GPLv3)"),
            check.Package("npm", "mystery", "1.0", "UNKNOWN"),
            check.Package("Python", "pymupdf", "1.28.2", "Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License"),
            check.Package("Python", "certifi", "2026.7.22", "Mozilla Public License 2.0 (MPL 2.0)"),
            check.Package("npm", "unlisted", "1.0", "MIT"),
        ]
        found = check.problems(packages, notices)
        self.assertEqual(len(found), 3, found)
        self.assertTrue(any("gpl-thing" in f and "copyleft" in f for f in found))
        self.assertTrue(any("mystery" in f for f in found))
        self.assertTrue(any("unlisted" in f and "THIRD_PARTY_NOTICES" in f for f in found))
        for licence in ("LGPL-2.1", "AGPL-3.0", "SSPL-1.0", "EPL-2.0", "Commercial"):
            self.assertTrue(check.FLAGGED.search(licence), licence)
        for licence in ("MIT", "BSD-3-Clause", "Apache-2.0", "ISC", "PSF-2.0", "0BSD", "OFL-1.1"):
            self.assertFalse(check.FLAGGED.search(licence), licence)

    def test_the_shipped_python_packages_pass_today(self) -> None:
        check = _licence_check()
        python = check.python_packages()
        names = {p.key for p in python}
        self.assertTrue({"fastapi", "pydantic", "requests", "uvicorn", "openpyxl"} <= names, names)
        notices = check.NOTICES.read_text(encoding="utf-8")
        self.assertEqual(check.problems(python, notices), [])
        self.assertIn("pymupdf", {p.key for p in python if p.key in check.ALLOWED})

    def test_brand_assets_must_be_listed_with_whose_marks_they_are(self) -> None:
        check = _licence_check()
        notices = "## Brand assets\n`logo.svg` and `hello.svg` are trademarks of Apple Inc.\n\n## Not shipped\n`other.svg`\n"
        self.assertEqual(check.brand_problems(["hello.svg", "logo.svg"], notices), [])
        found = check.brand_problems(["hello.svg", "logo.svg", "other.svg"], notices)
        self.assertEqual(len(found), 1, found)  # named only outside the section
        self.assertIn("other.svg", found[0])
        found = check.brand_problems(["logo.svg"], "## Brand assets\n`logo.svg`\n")
        self.assertEqual(len(found), 1, found)
        self.assertIn("trademarks", found[0])
        self.assertEqual(len(check.brand_problems(["logo.svg"], "`logo.svg` somewhere else")), 1)

    def test_the_shipped_brand_assets_pass_today(self) -> None:
        check = _licence_check()
        assets = check.brand_assets()
        self.assertEqual(assets, ["hello.svg", "logo.svg"])
        self.assertEqual(check.brand_problems(assets, check.NOTICES.read_text(encoding="utf-8")), [])


def _names(path: Path) -> dict[str, str]:
    """Normalised package name → the whole line, for one requirements file (``-r`` lines skipped)."""
    names: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        name = line.replace(" ", "")
        for stop in ("==", ">=", "<=", "~=", "!=", ">", "<", "[", ";"):
            name = name.split(stop, 1)[0]
        names[name.lower().replace("_", "-").replace(".", "-")] = line
    return names


class ConstraintsTests(unittest.TestCase):
    """CI and release builds install exact versions (engine/constraints.txt)."""

    ROOT = Path(__file__).resolve().parents[2]

    def test_every_requirement_has_an_exact_pin(self) -> None:
        pins = _names(self.ROOT / "engine" / "constraints.txt")
        for name, line in pins.items():
            self.assertRegex(line, r"^[A-Za-z0-9_.-]+==[0-9][A-Za-z0-9.+!-]*$", f"not an exact pin: {line}")
        for requirements in ("engine/requirements.txt", "engine/requirements-dev.txt",
                             "packaging/requirements-build.txt"):
            for name in _names(self.ROOT / requirements):
                self.assertIn(name, pins, f"{name} ({requirements}) has no pin in engine/constraints.txt")

    def test_ci_installs_with_the_constraints(self) -> None:
        workflow = (self.ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        installs = [line for line in workflow.splitlines() if "pip install" in line]
        self.assertGreaterEqual(len(installs), 2)
        for line in installs:
            self.assertIn("-c engine/constraints.txt", line, line.strip())


if __name__ == "__main__":
    unittest.main()
