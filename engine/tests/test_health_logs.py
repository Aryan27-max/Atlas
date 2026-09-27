"""Tests for engine/health.py (the probe) and engine/logs.py (engine.log without PII)."""

from __future__ import annotations

import logging
import tempfile
import unittest
from pathlib import Path

from engine.health import DEFAULT_HOSTS, HealthProbe
from engine.logs import configure_logging, remove_logging, scrub


class FakeSocket:
    def close(self) -> None:
        pass


class HealthTests(unittest.TestCase):
    def test_either_host_answering_means_online(self) -> None:
        tried: list[tuple[str, int]] = []

        def connect(address, timeout):
            tried.append(address)
            if address[0] == "first":
                raise OSError("unreachable")
            return FakeSocket()

        probe = HealthProbe(hosts=(("first", 443), ("second", 443)), connect=connect)
        self.assertTrue(probe.internet_ok())
        self.assertEqual(tried, [("first", 443), ("second", 443)])

    def test_no_host_answering_means_offline(self) -> None:
        def connect(address, timeout):
            raise OSError("down")

        self.assertFalse(HealthProbe(connect=connect).internet_ok())

    def test_default_hosts_are_names_so_broken_dns_counts_as_offline(self) -> None:
        for host, _ in DEFAULT_HOSTS:
            self.assertRegex(host, r"[a-z]")

    def test_ollama(self) -> None:
        class Client:
            def __init__(self, ok: bool) -> None:
                self.ok = ok

            def health(self) -> bool:
                return self.ok

        self.assertTrue(HealthProbe(ollama=Client(True)).ollama_ok())
        self.assertFalse(HealthProbe(ollama=Client(False)).ollama_ok())
        self.assertFalse(HealthProbe().ollama_ok())


class LogTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.handler = configure_logging(self.dir)

    def tearDown(self) -> None:
        remove_logging(self.handler)
        self._tmp.cleanup()

    def read(self) -> str:
        self.handler.flush()
        return (self.dir / "logs" / "engine.log").read_text(encoding="utf-8")

    def test_emails_and_phones_never_reach_the_file(self) -> None:
        log = logging.getLogger("atlas.test")
        log.info("candidate %d (%s) wrote from %s, call %s", 7, "RA2211003010042", "asha@example.com", "+91 98765 43210")
        try:
            raise ValueError("bad row for asha@example.com / 9876543210")
        except ValueError:
            log.exception("boom")
        text = self.read()
        self.assertIn("candidate 7 (RA2211003010042)", text)     # ids and RA numbers are fine
        self.assertNotIn("asha@example.com", text)
        self.assertNotIn("98765 43210", text)
        self.assertNotIn("9876543210", text)
        self.assertIn("Traceback", text)
        self.assertIn("[email]", text)

    def test_configuring_twice_adds_one_handler(self) -> None:
        self.assertIs(configure_logging(self.dir), self.handler)
        handlers = [h for h in logging.getLogger("atlas").handlers if getattr(h, "baseFilename", None)]
        self.assertEqual(len(handlers), 1)

    def test_rotation_settings(self) -> None:
        self.assertEqual((self.handler.maxBytes, self.handler.backupCount), (5 * 1024 * 1024, 4))

    def test_scrub(self) -> None:
        self.assertEqual(scrub("mail a.b+c@x.co.in or 098765-43210"), "mail [email] or [phone]")
        self.assertEqual(scrub("run 12 took 3.5s, 2022-2026"), "run 12 took 3.5s, 2022-2026")


if __name__ == "__main__":
    unittest.main()
