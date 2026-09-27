"""Live check against a real local Ollama. Skipped unless ``ATLAS_LIVE=1``.

    set ATLAS_LIVE=1
    set ATLAS_MODEL=qwen3:8b
    python -m unittest engine.tests.test_live -v

Runs the model pre-check, then scores three bundled fictional résumés
(strong backend, data science, weak generic) against a backend-intern brief
through the real pipeline: PDF → text → sections → redaction → prompt →
Ollama → validation → quote verification. Prints scores and timings; it
asserts only what must hold for any usable model (a valid, verified
evaluation), because the scores themselves depend on the model.
"""

from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path

from engine.extract import PdfExtractor, split_sections
from engine.llm.client import DEFAULT_URL, OllamaClient
from engine.llm.precheck import precheck
from engine.llm.redact import scoring_input
from engine.llm.scorer import Scorer
from engine.tests.fixtures import make_pdf

SAMPLES = Path(__file__).with_name("samples")
CRITERIA = "Backend software engineering interns: Python, APIs, databases, cloud deployment, real projects."
LIVE = os.environ.get("ATLAS_LIVE") == "1"


@unittest.skipUnless(LIVE, "set ATLAS_LIVE=1 (and ATLAS_MODEL) to run against a real Ollama")
class LiveOllamaTest(unittest.TestCase):
    def test_three_sample_resumes(self) -> None:
        model = os.environ.get("ATLAS_MODEL")
        if not model:
            self.skipTest("set ATLAS_MODEL, e.g. qwen3:8b")
        client = OllamaClient(os.environ.get("ATLAS_OLLAMA_URL", DEFAULT_URL))
        check = precheck(client, model)
        print(f"\npre-check {model}: ok={check.ok} ({check.seconds:.1f} s) {check.message}")
        self.assertTrue(check.ok, check.message)

        scorer = Scorer(client, model, CRITERIA)
        rows = []
        with tempfile.TemporaryDirectory() as tmp:
            for sample in sorted(SAMPLES.glob("*.txt")):
                text = sample.read_text(encoding="utf-8")
                lines = text.splitlines()
                pages = ["\n".join(lines[i:i + 55]) for i in range(0, len(lines), 55)]
                extraction = PdfExtractor().extract(make_pdf(Path(tmp) / f"{sample.stem}.pdf", pages))
                data = scoring_input(
                    {"name": lines[0].title(), "cgpa": 8.0, "department": "CSE", "skills": "Python, Docker",
                     "hackathons": ""},
                    extraction.text, split_sections(extraction.text),
                )
                started = time.monotonic()
                result = scorer.score(data.context, data.sections, data.full_text)
                seconds = time.monotonic() - started
                ev = result.evaluation
                rows.append((sample.stem, ev.overall_score, result.attempts, seconds, len(ev.evidence), result.flags))
                self.assertTrue(0 <= ev.overall_score <= 100)
                self.assertTrue(ev.reasons)
                print(f"  {sample.stem:<16} score {ev.overall_score:>3}  attempts {result.attempts}  "
                      f"{seconds:5.1f} s  evidence {len(ev.evidence)}  flags {list(result.flags)}")
                print(f"    summary: {ev.summary}")
                print(f"    mismatches: {ev.claim_mismatches}")
        scores = {name: score for name, score, *_ in rows}
        print(f"  order check (expect strong_backend > weak_generic): {scores}")


if __name__ == "__main__":
    unittest.main()
