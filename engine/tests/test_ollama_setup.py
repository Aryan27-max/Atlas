"""Finding and starting Ollama (Phase 3, step 3.3): fake filesystem and launcher only."""

from __future__ import annotations

import subprocess
import unittest

from engine.ollama_setup import OllamaInstall, find_ollama, start_ollama


class FindTests(unittest.TestCase):
    def find(self, system: str, present: set[str], which: str | None = None, env: dict | None = None) -> OllamaInstall:
        env = env if env is not None else {"LOCALAPPDATA": r"C:\Users\x\AppData\Local", "HOME": "/Users/x"}
        return find_ollama(system=system, env=env, exists=lambda p: p.replace("\\", "/") in present,
                           which=lambda name: which)

    def test_windows_prefers_the_tray_app(self) -> None:
        app = "C:/Users/x/AppData/Local/Programs/Ollama/ollama app.exe"
        cli = "C:/Users/x/AppData/Local/Programs/Ollama/ollama.exe"
        self.assertEqual(self.find("Windows", {app, cli}).how, "app")
        self.assertEqual(self.find("Windows", {cli}).how, "serve")

    def test_macos_app_then_homebrew(self) -> None:
        self.assertEqual(self.find("Darwin", {"/Applications/Ollama.app"}), OllamaInstall(True, "/Applications/Ollama.app", "app"))
        self.assertEqual(self.find("Darwin", {"/Users/x/Applications/Ollama.app"}).how, "app")
        self.assertEqual(self.find("Darwin", {"/opt/homebrew/bin/ollama"}).how, "serve")

    def test_on_the_path_or_not_installed(self) -> None:
        self.assertEqual(self.find("Linux", set(), which="/usr/bin/ollama"), OllamaInstall(True, "/usr/bin/ollama", "serve"))
        self.assertEqual(self.find("Windows", set(), env={}), OllamaInstall(False))


class StartTests(unittest.TestCase):
    def launch(self, install: OllamaInstall, system: str) -> list:
        calls: list = []
        self.assertTrue(start_ollama(install, system=system, popen=lambda cmd, **kw: calls.append((cmd, kw))))
        return calls

    def test_each_platform_starts_it_its_own_way(self) -> None:
        (cmd, kw), = self.launch(OllamaInstall(True, "/Applications/Ollama.app", "app"), "Darwin")
        self.assertEqual(cmd, ["open", "-a", "/Applications/Ollama.app"])
        self.assertTrue(kw["start_new_session"])
        (cmd, kw), = self.launch(OllamaInstall(True, r"C:\o\ollama app.exe", "app"), "Windows")
        self.assertEqual(cmd, [r"C:\o\ollama app.exe"])
        self.assertTrue(kw["creationflags"] & getattr(subprocess, "DETACHED_PROCESS", 0x8))
        (cmd, _), = self.launch(OllamaInstall(True, "/usr/bin/ollama", "serve"), "Linux")
        self.assertEqual(cmd, ["/usr/bin/ollama", "serve"])

    def test_not_installed_or_launch_failure(self) -> None:
        self.assertFalse(start_ollama(OllamaInstall(False), system="Windows", popen=lambda *a, **k: None))

        def broken(*args: object, **kwargs: object) -> None:
            raise PermissionError("blocked")

        self.assertFalse(start_ollama(OllamaInstall(True, "/x/ollama", "serve"), system="Linux", popen=broken))


if __name__ == "__main__":
    unittest.main()
