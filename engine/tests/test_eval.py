"""The eval harness (Phase 3, step 3.2b), with a fake scorer: no model needed."""

from __future__ import annotations

import json
import math
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path

from engine.eval.fictional import SAMPLES, write_set
from engine.eval.harness import evaluate, read_labels, render, spearman, write_report


@dataclass
class _Eval:
    overall_score: int


@dataclass
class _Scored:
    evaluation: _Eval
    prompt_eval_seconds: float = 1.0
    eval_seconds: float = 4.0


class FakeScorer:
    """Scores by the student's level, read from a word in the résumé; optional wobble between repeats."""

    BY_MARKER = {"Taskmill": 92, "Northwind": 81, "U-Net": 58, "Library Manager": 55,
                 "Portfolio Builder": 44, "Calculator": 30, "cultural fest": 22, "Cricket": 10}

    def __init__(self, wobble: int = 0) -> None:
        self.wobble = wobble
        self.calls = 0
        self.seen: list[str] = []

    def score(self, context, sections, full_text):  # noqa: ANN001 — matches ScorerLike
        self.calls += 1
        self.seen.append(full_text)
        base = next(score for marker, score in self.BY_MARKER.items() if marker in full_text)
        return _Scored(_Eval(base + (self.wobble if self.calls % 2 == 0 else 0)))


class EvalHarnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.folder = Path(self._tmp.name) / "fictional"
        write_set(self.folder)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_the_fictional_set_is_complete(self) -> None:
        labels = read_labels(self.folder)
        self.assertEqual(len(labels), 8)
        self.assertEqual({s.level for s in SAMPLES}, {"exceptional", "strong", "average", "weak", "very weak"})
        self.assertEqual({s.role for s in SAMPLES} >= {"backend", "data/ML", "frontend"}, True)
        self.assertTrue((self.folder / "criteria.txt").read_text(encoding="utf-8").strip())

    def test_metrics_and_report(self) -> None:
        scorer = FakeScorer(wobble=2)
        report = evaluate(self.folder, lambda criteria: scorer, model="fake", repeats=2, clock=iter(range(1000)).__next__)
        self.assertEqual(scorer.calls, 16)                              # 8 résumés × 2 repeats
        self.assertEqual(report.leaks, 0)                               # names, emails, usernames redacted
        self.assertTrue(report.groups_in_order)
        self.assertGreater(report.spearman, 0.95)
        self.assertEqual(report.bucket_agreement, 1.0)
        self.assertEqual(report.stability_mad, 2.0)
        self.assertEqual(report.above_95_not_exceptional, [])
        self.assertEqual((report.prefill_median, report.generate_median), (1.0, 4.0))
        for text in scorer.seen:                                        # what the model saw
            for name in ("Anika", "Verma", "example-anika", "Rohan", "Pillai"):
                self.assertNotIn(name, text)

        md, js = write_report(self.folder, report)
        text = md.read_text(encoding="utf-8")
        self.assertIn("| Identity leaks in prompts | 0 | **0** |", text)
        self.assertNotIn("Anika", text)                                 # files and numbers only
        data = json.loads(js.read_text(encoding="utf-8"))
        self.assertEqual(len(data["resumes"]), 8)

    def test_a_shuffled_model_is_caught(self) -> None:
        class Backwards(FakeScorer):
            def score(self, context, sections, full_text):  # noqa: ANN001
                scored = super().score(context, sections, full_text)
                return _Scored(_Eval(100 - scored.evaluation.overall_score))

        report = evaluate(self.folder, lambda criteria: Backwards(), model="fake", repeats=1)
        self.assertLess(report.spearman, -0.9)
        self.assertFalse(report.groups_in_order)
        self.assertIn("01_exceptional_backend.pdf", render(report))

    def test_spearman(self) -> None:
        self.assertAlmostEqual(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
        self.assertAlmostEqual(spearman([1, 2, 2, 3], [1, 2, 3, 4]), spearman([1, 2.5, 2.5, 4], [1, 2, 3, 4]))
        self.assertTrue(math.isnan(spearman([1], [1])))

    def test_a_missing_file_is_named(self) -> None:
        (self.folder / SAMPLES[0].file).unlink()
        with self.assertRaises(FileNotFoundError) as ctx:
            read_labels(self.folder)
        self.assertIn(SAMPLES[0].file, str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
