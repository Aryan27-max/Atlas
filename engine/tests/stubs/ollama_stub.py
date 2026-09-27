"""A fake Ollama on 127.0.0.1: ``/api/tags``, ``/api/show`` and streaming ``/api/chat``.

By default every chat returns a valid evaluation:

* the score is ``N`` if the résumé block contains "grade N out of 100"
  (fixtures use this so tests know each candidate's expected score), else 55;
* the evidence quote is a real line taken from the prompt's ``<resume>`` block
  (from Projects if there is one), so quote verification passes;
* claimed skills missing from the résumé are reported as mismatches.

``script(*modes)`` makes the next chats misbehave, in order:
``"garbage"`` (not JSON), ``"truncate"`` (half the JSON, ``done_reason:
length``), ``"extra_keys"``, ``"fake_quote"``, ``"error"`` (an error line in
the stream) or ``"drop"`` (hang up mid-answer). ``go_offline()`` refuses
connections, like a stopped Ollama.
"""

from __future__ import annotations

import json
import re
import time
from http.server import BaseHTTPRequestHandler
from typing import Any

from engine.tests.stubs.base import StubServer

SUBS = ("technical", "projects", "experience", "achievements", "communication", "criteria_fit")


def evaluation_for(user_message: str) -> dict[str, Any]:
    block = user_message.split("<resume>", 1)[-1].split("</resume>", 1)[0]
    match = re.search(r"grade (\d+) out of 100", block)
    score = int(match.group(1)) if match else 55
    projects = block.split("## Projects", 1)[1].split("\n## ", 1)[0] if "## Projects" in block else block
    quote = next(
        (line.strip().lstrip("-•* ").strip() for line in projects.splitlines()
         if len(line.split()) >= 4 and not line.startswith("##")),
        "",
    )
    claimed = re.search(r"Skills claimed: (.*)", user_message)
    skills = [] if not claimed or claimed.group(1) == "none" else [s.strip() for s in claimed.group(1).split(";")]
    lowered = block.lower()
    return {
        "overall_score": score,
        "sub_scores": {k: score for k in SUBS},
        "summary": "Stub evaluation.",
        "reasons": ["The projects match the recruiter's criteria."],
        "evidence": [{"claim": "Relevant project", "quote": quote}] if quote else [],
        "claim_mismatches": [f"Claims {s}; not in the résumé" for s in skills if s and s.lower() not in lowered],
    }


class OllamaStub(StubServer):
    thread_name = "ollama-stub"

    def __init__(self, *, models: tuple[str, ...] = ("stub-model:latest",), context_length: int = 8192,
                 delay: float = 0.0) -> None:
        super().__init__()
        self.models = list(models)
        self.context_length = context_length
        self.delay = delay                     # seconds per chat, to make a run take time
        self.chats: list[dict[str, Any]] = []  # request payloads, in order
        self._script: list[str] = []
        self.pullable: set[str] = {"stub-small:latest"}   # names /api/pull can "download"
        self.pull_step_delay = 0.0             # seconds between pull progress lines
        self.pulls: list[str] = []

    def start(self) -> "OllamaStub":
        super().start()
        return self

    def __enter__(self) -> "OllamaStub":
        return self.start()

    def script(self, *modes: str) -> None:
        with self._lock:
            self._script.extend(modes)

    def _next_mode(self) -> str:
        with self._lock:
            return self._script.pop(0) if self._script else "ok"

    def _known(self, name: str) -> bool:
        return name in self.models or f"{name}:latest" in self.models

    def _handler(self) -> type[BaseHTTPRequestHandler]:
        stub = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.0"

            def log_message(self, *args: object) -> None:
                pass

            def _json(self, code: int, payload: object) -> None:
                body = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _body(self) -> dict[str, Any]:
                length = int(self.headers.get("Content-Length") or 0)
                return json.loads(self.rfile.read(length) or b"{}")

            def do_GET(self) -> None:  # noqa: N802
                with stub._lock:
                    stub.requests.append(self.path)
                if self.path == "/api/tags":
                    self._json(200, {"models": [
                        {"name": m, "model": m, "digest": f"sha256:stub{i}", "size": 1}
                        for i, m in enumerate(stub.models)
                    ]})
                elif self.path == "/api/version":
                    self._json(200, {"version": "0.0.0-stub"})
                else:
                    self._json(404, {"error": "not found"})

            def do_POST(self) -> None:  # noqa: N802
                with stub._lock:
                    stub.requests.append(self.path)
                payload = self._body()
                if self.path == "/api/pull":
                    return self._pull(str(payload.get("model") or payload.get("name") or ""))
                if self.path == "/api/show":
                    if not stub._known(payload.get("model", "")):
                        return self._json(404, {"error": "model not found"})
                    return self._json(200, {"model_info": {"stub.context_length": stub.context_length}})
                if self.path != "/api/chat":
                    return self._json(404, {"error": "not found"})
                if not stub._known(payload.get("model", "")):
                    return self._json(404, {"error": f"model '{payload.get('model')}' not found"})
                with stub._lock:
                    stub.chats.append(payload)
                self._chat(payload, stub._next_mode())

            def _pull(self, name: str) -> None:
                full = name if ":" in name else f"{name}:latest"
                with stub._lock:
                    stub.pulls.append(full)
                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.end_headers()
                lines: list[dict[str, Any]] = [{"status": "pulling manifest"}]
                if full not in stub.pullable:
                    lines.append({"error": "pull model manifest: file does not exist"})
                else:
                    for layer in range(2):
                        total = 4_000_000
                        for done in (0, 1_000_000, 2_500_000, total):
                            lines.append({"status": f"pulling layer{layer}", "digest": f"sha256:layer{layer}",
                                          "total": total, "completed": done})
                    lines += [{"status": "verifying sha256 digest"}, {"status": "writing manifest"},
                              {"status": "success"}]
                try:
                    for line in lines:
                        if stub.pull_step_delay:
                            time.sleep(stub.pull_step_delay)
                        self.wfile.write(json.dumps(line).encode() + b"\n")
                        self.wfile.flush()
                        if line.get("status") == "success":
                            with stub._lock:
                                if full not in stub.models:
                                    stub.models.append(full)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

            def _chat(self, payload: dict[str, Any], mode: str) -> None:
                if stub.delay:
                    time.sleep(stub.delay)
                user = next((m["content"] for m in payload.get("messages", []) if m["role"] == "user"), "")
                answer = evaluation_for(user)
                done_reason = "stop"
                if mode == "extra_keys":
                    answer["recommendation"] = "Shortlisted"
                if mode == "fake_quote":
                    answer["evidence"] = [{"claim": "x", "quote": "A sentence that is not in the résumé at all"}]
                content = json.dumps(answer)
                if mode == "garbage":
                    content = "I think this candidate is great!"
                if mode == "truncate":
                    content, done_reason = content[: len(content) // 2], "length"

                self.send_response(200)
                self.send_header("Content-Type", "application/x-ndjson")
                self.end_headers()
                try:
                    if mode == "error":
                        self.wfile.write(b'{"error":"llama runner process has terminated"}\n')
                        return
                    pieces = [content[i:i + 40] for i in range(0, len(content), 40)] or [""]
                    for n, piece in enumerate(pieces):
                        if mode == "drop" and n == len(pieces) // 2:
                            self.close_connection = True
                            return               # hang up mid-answer: no "done" line
                        line = {"model": payload["model"], "message": {"role": "assistant", "content": piece},
                                "done": False}
                        self.wfile.write(json.dumps(line).encode() + b"\n")
                    final = {"model": payload["model"], "message": {"role": "assistant", "content": ""},
                             "done": True, "done_reason": done_reason, "eval_count": len(content) // 4}
                    self.wfile.write(json.dumps(final).encode() + b"\n")
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

        return Handler
