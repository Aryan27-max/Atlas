"""Tests for engine/health.py (the probe) and engine/logs.py (engine.log without PII)."""

from __future__ import annotations

import logging
import tempfile
import unittest
from pathlib import Path

from engine.errors import Pause
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

    def test_captive_portal_needs_a_204_from_the_check_url(self) -> None:
        import requests

        class Response:
            def __init__(self, code: int) -> None:
                self.status_code = code

            def close(self) -> None:
                pass

        def probe(*answers: object) -> HealthProbe:
            replies = list(answers)

            def get(url: str, timeout: float, allow_redirects: bool) -> Response:
                self.assertFalse(allow_redirects)          # a portal's redirect must be seen, not followed
                reply = replies.pop(0)
                if isinstance(reply, BaseException):
                    raise reply
                return Response(int(reply))  # type: ignore[call-overload]

            return HealthProbe(hosts=(("h", 443),), connect=lambda a, timeout: FakeSocket(), get=get,
                               check_urls=("http://first/generate_204", "http://second/generate_204"))

        self.assertIsNone(probe(204).internet_problem())
        self.assertEqual(probe(200, 200).internet_problem(), Pause.CAPTIVE_PORTAL)   # the sign-in page
        self.assertEqual(probe(302, 302).internet_problem(), Pause.CAPTIVE_PORTAL)   # a redirect to it
        self.assertIsNone(probe(requests.ConnectionError(), 204).internet_problem())   # fallback host
        # The check URL blocked but the TCP hosts fine: trust TCP, don't stop screening.
        self.assertIsNone(probe(requests.ConnectionError(), requests.Timeout()).internet_problem())
        self.assertFalse(probe(200, 200).internet_ok())

        def no_tcp(address: object, timeout: float) -> FakeSocket:
            raise OSError("down")

        self.assertEqual(HealthProbe(connect=no_tcp, check_urls=()).internet_problem(), Pause.NO_INTERNET)

    def test_default_check_urls_send_no_data(self) -> None:
        from engine.health import DEFAULT_CHECK_URLS

        self.assertEqual(DEFAULT_CHECK_URLS[0], "http://connectivitycheck.gstatic.com/generate_204")
        self.assertTrue(all(u.endswith("/generate_204") and "?" not in u for u in DEFAULT_CHECK_URLS))

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
