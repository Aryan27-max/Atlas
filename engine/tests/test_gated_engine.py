"""The gated engine the app's start-up screen test uses (``gated_engine.py``)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from engine.tests import gated_engine


class WaitForGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.gate = Path(self.folder.name) / "go"

    def test_returns_at_once_when_the_gate_is_open(self) -> None:
        self.gate.write_text("", encoding="utf-8")
        with mock.patch.object(gated_engine.time, "sleep") as sleep:
            gated_engine.wait_for_gate(self.gate)
        sleep.assert_not_called()

    def test_waits_until_the_gate_opens(self) -> None:
        def open_on_third_poll(_seconds: float) -> None:
            if sleep.call_count == 3:
                self.gate.write_text("", encoding="utf-8")

        with mock.patch.object(gated_engine.time, "sleep", side_effect=open_on_third_poll) as sleep:
            gated_engine.wait_for_gate(self.gate)
        self.assertEqual(sleep.call_count, 3)

    def test_gives_up_after_the_limit(self) -> None:
        clock = iter([0.0, 30.0, 61.0])
        with (
            mock.patch.object(gated_engine.time, "monotonic", side_effect=lambda: next(clock)),
            mock.patch.object(gated_engine.time, "sleep") as sleep,
            self.assertRaises(SystemExit),
        ):
            gated_engine.wait_for_gate(self.gate, limit=60.0)
        self.assertEqual(sleep.call_count, 1)


if __name__ == "__main__":
    unittest.main()
