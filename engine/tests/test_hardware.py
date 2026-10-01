"""Hardware profile (Phase 3, step 3.3): fakes for the OS and Ollama, nothing real is probed."""

from __future__ import annotations

import unittest

from engine.hardware import profile


class FakePs:
    def __init__(self, models: list[dict] | Exception) -> None:
        self.models = models

    def running_models(self) -> list[dict]:
        if isinstance(self.models, Exception):
            raise self.models
        return self.models


def mac_sysctl(command: list[str]) -> str:
    return {"machdep.cpu.brand_string": "Apple M2", "hw.memsize": str(16 * 1024**3)}.get(command[-1], "")


class HardwareTests(unittest.TestCase):
    def test_apple_silicon(self) -> None:
        hw = profile(None, system="Darwin", machine="arm64", run=mac_sysctl)
        self.assertEqual((hw.cpu, hw.arch, hw.apple_silicon, hw.ram_gb, hw.kind), ("Apple M2", "arm64", True, 16.0, "apple_silicon"))
        self.assertIsNone(hw.gpu_in_use)                  # no Ollama asked: unknown, not "no"

    def test_gpu_in_use_comes_from_ollama(self) -> None:
        loaded = [{"name": "qwen3:8b", "size": 6_600_000_000, "size_vram": 6_600_000_000}]
        hw = profile(FakePs(loaded), system="Linux", machine="x86_64", run=lambda c: "")
        self.assertEqual((hw.gpu_in_use, hw.kind), (True, "gpu"))
        self.assertGreater(hw.vram_gb or 0, 6)

    def test_cpu_only_and_unknowns_never_raise(self) -> None:
        cpu_only = profile(FakePs([{"name": "qwen3:8b", "size_vram": 0}]), system="Linux", machine="x86_64",
                           run=lambda c: "")
        self.assertEqual((cpu_only.gpu_in_use, cpu_only.vram_gb, cpu_only.kind), (False, 0.0, "cpu"))
        nothing_loaded = profile(FakePs([]), system="Linux", machine="x86_64", run=lambda c: "")
        self.assertIsNone(nothing_loaded.gpu_in_use)
        ollama_down = profile(FakePs(ConnectionError("down")), system="Linux", machine="x86_64", run=lambda c: "")
        self.assertIsNone(ollama_down.gpu_in_use)
        self.assertEqual(ollama_down.as_dict()["kind"], "cpu")

    def test_this_computer(self) -> None:
        hw = profile(None)                                  # the real machine, read-only
        self.assertGreater(hw.cores, 0)
        self.assertTrue(hw.cpu and hw.os)
        self.assertGreater(hw.ram_gb or 0, 0)               # every supported OS can report RAM


if __name__ == "__main__":
    unittest.main()
