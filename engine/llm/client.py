"""HTTP client for the local Ollama server.

Adapted from QWENTUS ``llm/ollama.py``. What changed and why:

* **No per-request files.** QWENTUS wrote every request and response to
  ``logs/ollama/`` and never deleted them, so résumé excerpts piled up on disk
  forever. Now the raw reply is returned to the caller, which stores it in
  SQLite with the evaluation (deleted with the run).
* **Typed failures.** Ollama not answering ``/api/tags`` is
  ``SystemUnavailable("Ollama isn't running")``; a chat that breaks midway is a
  ``TransientError``, and the worker probes ``/api/tags`` to decide.
* ``format`` is the evaluation's JSON schema (not just ``"json"``),
  ``think: false``, ``temperature: 0``, and ``num_ctx``/``num_predict`` come
  from the caller (QWENTUS hard-coded ``num_predict=256``, too small for the
  JSON, so answers were cut off).
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterator, Protocol

import requests

from engine.errors import Pause, Pull, PullError, Reason, SystemUnavailable, TransientError

log = logging.getLogger("atlas.llm")

DEFAULT_URL = "http://127.0.0.1:11434"
FALLBACK_CONTEXT = 8192


class ChatPrompt(Protocol):
    system: str
    user: str


@dataclass(frozen=True)
class ModelInfo:
    name: str
    digest: str
    size: int


@dataclass(frozen=True)
class ChatResult:
    content: str
    done_reason: str | None     # "stop", or "length" when num_predict cut the answer off
    eval_count: int             # tokens generated
    duration: float             # wall-clock seconds for this call


@dataclass(frozen=True)
class PullProgress:
    status: str          # Ollama's words: "pulling manifest", "pulling <digest>", "success"
    completed: int       # bytes of the current layer
    total: int           # bytes of the current layer (0 while unknown)


class ChatDeadline(TransientError):
    """The caller's time limit ran out mid-answer (used by the model pre-check)."""


class OllamaClient:
    def __init__(
        self,
        base_url: str = DEFAULT_URL,
        *,
        session: requests.Session | None = None,
        connect_timeout: float = 3.0,
        read_timeout: float = 300.0,
        tags_timeout: float = 5.0,
        keep_alive: str = "10m",
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._session = session if session is not None else requests.Session()
        self._connect = connect_timeout
        self._read = read_timeout
        self._tags_timeout = tags_timeout
        self._keep_alive = keep_alive
        self._clock = clock

    # ---- server ----------------------------------------------------------- #

    def health(self) -> bool:
        """True when Ollama answers ``/api/tags``. Never raises."""
        try:
            self.list_models()
        except SystemUnavailable:
            return False
        return True

    def list_models(self) -> list[ModelInfo]:
        try:
            response = self._session.get(f"{self.base_url}/api/tags", timeout=(self._connect, self._tags_timeout))
        except requests.RequestException:
            raise SystemUnavailable(Pause.OLLAMA_DOWN) from None
        try:
            if response.status_code != 200:
                raise SystemUnavailable(Pause.OLLAMA_DOWN)
            payload = response.json()
        except ValueError:
            raise SystemUnavailable(Pause.OLLAMA_DOWN) from None
        finally:
            response.close()
        return [
            ModelInfo(str(m.get("name", "")), str(m.get("digest", "")), int(m.get("size") or 0))
            for m in payload.get("models", [])
            if m.get("name")
        ]

    def find_model(self, name: str) -> ModelInfo | None:
        """The installed model called ``name`` (``qwen3`` also matches ``qwen3:latest``)."""
        wanted = {name, name if ":" in name else f"{name}:latest"}
        return next((m for m in self.list_models() if m.name in wanted), None)

    def model_context_length(self, name: str) -> int:
        """The model's trained context length from ``/api/show``; 8192 if it doesn't say."""
        try:
            response = self._session.post(
                f"{self.base_url}/api/show", json={"model": name}, timeout=(self._connect, self._tags_timeout)
            )
        except requests.RequestException:
            raise SystemUnavailable(Pause.OLLAMA_DOWN) from None
        try:
            if response.status_code == 404:
                raise SystemUnavailable(Pause.model_missing(name))
            if response.status_code != 200:
                return FALLBACK_CONTEXT
            info = response.json().get("model_info") or {}
        except ValueError:
            return FALLBACK_CONTEXT
        finally:
            response.close()
        for key, value in info.items():
            if key.endswith(".context_length") and isinstance(value, int) and value > 0:
                return value
        return FALLBACK_CONTEXT

    def pull(self, name: str) -> Iterator[PullProgress]:
        """Download a model from the Ollama registry, yielding progress.

        Ollama does the downloading; Atlas only asks and listens. Stop iterating
        (or ``close()`` the generator) to cancel: the connection is closed and
        Ollama abandons the pull, keeping finished layers for next time.
        Raises ``SystemUnavailable`` if Ollama isn't running and ``PullError``
        (recruiter wording) if the pull itself fails.
        """
        try:
            response = self._session.post(
                f"{self.base_url}/api/pull",
                json={"model": name, "stream": True},
                stream=True,
                timeout=(self._connect, self._read),
            )
        except requests.RequestException:
            raise SystemUnavailable(Pause.OLLAMA_DOWN) from None
        try:
            if response.status_code != 200:
                raise PullError(self._pull_message(name, _error_text(response)))
            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except ValueError:
                    continue
                if chunk.get("error"):
                    raise PullError(self._pull_message(name, str(chunk["error"])))
                progress = PullProgress(
                    status=str(chunk.get("status") or ""),
                    completed=int(chunk.get("completed") or 0),
                    total=int(chunk.get("total") or 0),
                )
                yield progress
                if progress.status == "success":
                    return
        except requests.RequestException:
            raise PullError(Pull.FAILED) from None
        finally:
            response.close()
        raise PullError(Pull.FAILED)     # the stream ended without "success"

    @staticmethod
    def _pull_message(name: str, detail: str) -> str:
        lowered = detail.lower()
        if "not exist" in lowered or "not found" in lowered or "manifest unknown" in lowered:
            return Pull.not_found(name)
        log.info("model pull failed: %s", detail[:200])
        return Pull.FAILED

    # ---- chat ------------------------------------------------------------- #

    def chat_json(
        self,
        prompt: ChatPrompt,
        schema: dict[str, Any],
        *,
        model: str,
        num_ctx: int,
        num_predict: int,
        timeout: float | None = None,
    ) -> ChatResult:
        """One streamed, schema-constrained chat call. ``timeout`` caps the whole call."""
        payload = {
            "model": model,
            "stream": True,
            "think": False,
            "format": schema,
            "keep_alive": self._keep_alive,
            "options": {"temperature": 0, "num_ctx": num_ctx, "num_predict": num_predict},
            "messages": [
                {"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user},
            ],
        }
        started = self._clock()
        read = self._read if timeout is None else max(0.1, min(self._read, timeout))
        try:
            response = self._session.post(
                f"{self.base_url}/api/chat", json=payload, stream=True, timeout=(self._connect, read)
            )
        except requests.Timeout:
            raise self._deadline_or_stopped(timeout, "no reply before the read timeout") from None
        except requests.RequestException as exc:
            raise TransientError("ollama", Reason.MODEL_STOPPED, f"chat request failed: {type(exc).__name__}") from None

        parts: list[str] = []
        final: dict[str, Any] = {}
        try:
            if response.status_code == 404:
                raise SystemUnavailable(Pause.model_missing(model))
            if response.status_code != 200:
                raise TransientError("ollama", Reason.MODEL_STOPPED, f"chat HTTP {response.status_code}")
            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except ValueError:
                    continue
                if "error" in chunk:
                    raise TransientError("ollama", Reason.MODEL_STOPPED, "Ollama reported an error mid-answer")
                piece = (chunk.get("message") or {}).get("content")
                if isinstance(piece, str):
                    parts.append(piece)
                if chunk.get("done"):
                    final = chunk
                    break
                if timeout is not None and self._clock() - started > timeout:
                    raise ChatDeadline("ollama", Reason.MODEL_STOPPED, "time limit reached mid-answer")
        except requests.Timeout:
            raise self._deadline_or_stopped(timeout, "stream stalled") from None
        except requests.RequestException as exc:
            raise TransientError("ollama", Reason.MODEL_STOPPED, f"stream broke: {type(exc).__name__}") from None
        finally:
            response.close()

        if not final:
            raise TransientError("ollama", Reason.MODEL_STOPPED, "stream ended before the answer was done")
        content = "".join(parts) or str((final.get("message") or {}).get("content") or final.get("response") or "")
        return ChatResult(
            content=content,
            done_reason=final.get("done_reason"),
            eval_count=int(final.get("eval_count") or 0),
            duration=self._clock() - started,
        )

    @staticmethod
    def _deadline_or_stopped(timeout: float | None, detail: str) -> TransientError:
        if timeout is not None:
            return ChatDeadline("ollama", Reason.MODEL_STOPPED, detail)
        return TransientError("ollama", Reason.MODEL_STOPPED, detail)


def _error_text(response: requests.Response) -> str:
    """Ollama's ``{"error": …}`` body, or the status code."""
    try:
        return str(response.json().get("error") or response.status_code)
    except ValueError:
        return str(response.status_code)
