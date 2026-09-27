"""The time estimate (engine/estimate.py) and model pull (OllamaClient.pull)."""

from __future__ import annotations

import unittest

from engine.errors import Pause, Pull, PullError, SystemUnavailable
from engine.estimate import HISTORY_KEEP, estimate, ewma, remember
from engine.llm.client import OllamaClient
from engine.tests.stubs.ollama_stub import OllamaStub


class EstimateTests(unittest.TestCase):
    def test_nothing_known(self) -> None:
        self.assertIsNone(estimate(10))

    def test_precheck_basis_is_a_wide_rough_range(self) -> None:
        e = estimate(10, precheck_seconds=60.0)
        assert e is not None
        self.assertEqual((e.low_seconds, e.high_seconds, e.basis), (420, 900, "precheck"))
        self.assertEqual(e.label, "Rough estimate")
        self.assertEqual(e.per_resume_seconds, 60.0)

    def test_history_beats_precheck(self) -> None:
        e = estimate(10, history=[100.0, 140.0, 400.0], precheck_seconds=60.0)
        assert e is not None
        self.assertEqual(e.basis, "history")
        self.assertEqual(e.per_resume_seconds, 140.0)
        self.assertEqual((e.low_seconds, e.high_seconds), (1120, 1820))

    def test_measured_after_five_uses_a_moving_average(self) -> None:
        measured = [100.0, 100.0, 100.0, 100.0, 200.0]
        e = estimate(4, measured=measured, history=[50.0], precheck_seconds=10.0)
        assert e is not None
        self.assertEqual(e.basis, "measured")
        self.assertEqual(e.label, "Measured")
        self.assertAlmostEqual(e.per_resume_seconds, 130.0)
        self.assertEqual((e.low_seconds, e.high_seconds), (442, 624))

    def test_four_measured_are_not_enough(self) -> None:
        e = estimate(4, measured=[100.0] * 4, precheck_seconds=10.0)
        assert e is not None
        self.assertEqual(e.basis, "precheck")

    def test_nothing_left(self) -> None:
        e = estimate(0, precheck_seconds=60.0)
        assert e is not None
        self.assertEqual((e.low_seconds, e.high_seconds), (0, 0))

    def test_negative_remaining(self) -> None:
        with self.assertRaises(ValueError):
            estimate(-1, precheck_seconds=1.0)

    def test_as_dict_has_the_api_fields(self) -> None:
        e = estimate(2, precheck_seconds=30.0)
        assert e is not None
        self.assertEqual(set(e.as_dict()), {"low_seconds", "high_seconds", "basis", "per_resume_seconds", "label"})

    def test_ewma(self) -> None:
        self.assertEqual(ewma([10.0]), 10.0)
        self.assertAlmostEqual(ewma([10.0, 20.0], alpha=0.5), 15.0)
        with self.assertRaises(ValueError):
            ewma([])

    def test_remember_is_bounded_per_model(self) -> None:
        history: dict[str, list[float]] | None = None
        for i in range(HISTORY_KEEP + 5):
            history = remember(history, "a", float(i))
        history = remember(history, "b", 1.234)
        assert history is not None
        self.assertEqual(len(history["a"]), HISTORY_KEEP)
        self.assertEqual(history["a"][-1], float(HISTORY_KEEP + 4))
        self.assertEqual(history["b"], [1.23])


class PullTests(unittest.TestCase):
    def setUp(self) -> None:
        self.stub = OllamaStub().start()
        self.client = OllamaClient(self.stub.base_url)

    def tearDown(self) -> None:
        self.stub.stop()

    def test_a_pull_streams_progress_and_installs_the_model(self) -> None:
        steps = list(self.client.pull("stub-small"))
        self.assertEqual(steps[0].status, "pulling manifest")
        self.assertEqual(steps[-1].status, "success")
        layer = [s for s in steps if s.total]
        self.assertTrue(layer)
        self.assertEqual(layer[-1].completed, layer[-1].total)
        self.assertIsNotNone(self.client.find_model("stub-small"))

    def test_an_unknown_model_says_so(self) -> None:
        with self.assertRaises(PullError) as caught:
            list(self.client.pull("no-such-model"))
        self.assertEqual(caught.exception.message, Pull.not_found("no-such-model"))

    def test_ollama_not_running(self) -> None:
        self.stub.go_offline()
        with self.assertRaises(SystemUnavailable) as caught:
            list(OllamaClient(self.stub.base_url, connect_timeout=5).pull("stub-small"))
        self.assertEqual(caught.exception.reason, Pause.OLLAMA_DOWN)

    def test_stopping_early_cancels_the_pull(self) -> None:
        self.stub.pull_step_delay = 0.05
        progress = self.client.pull("stub-small")
        first = next(progress)
        self.assertEqual(first.status, "pulling manifest")
        progress.close()
        self.assertIsNone(self.client.find_model("stub-small"))


if __name__ == "__main__":
    unittest.main()
