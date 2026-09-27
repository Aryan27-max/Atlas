"""The engine log: ``<data-dir>/logs/engine.log``, rotating 5 × 5 MB.

The rule (CLAUDE.md 15) is that résumé text and personal details never go to
disk outside SQLite. Code logs only candidate ids and RA numbers. As a safety
net for the paths nobody planned for (an exception message, a traceback),
:class:`ScrubPII` replaces anything shaped like an email address or a phone
number before a record is written.
"""

from __future__ import annotations

import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_BYTES = 5 * 1024 * 1024
LOG_FILES = 5                  # engine.log + 4 rotated copies

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"(?<![\w/])(?:\+\d{1,3}[\s.-]?)?\d(?:[\s.-]?\d){9,12}(?![\w/])")


def scrub(text: str) -> str:
    return _PHONE.sub("[phone]", _EMAIL.sub("[email]", text))


class ScrubPII(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = scrub(record.getMessage())
        record.args = ()
        if record.exc_info and not record.exc_text:
            record.exc_text = scrub(logging.Formatter().formatException(record.exc_info))
        elif record.exc_text:
            record.exc_text = scrub(record.exc_text)
        return True


def configure_logging(data_dir: Path | str, *, level: int = logging.INFO) -> logging.Handler:
    """Attach the rotating file handler to the ``atlas`` logger (once per path)."""
    path = (Path(data_dir) / "logs" / "engine.log").resolve()
    logger = logging.getLogger("atlas")
    for handler in logger.handlers:
        if isinstance(handler, RotatingFileHandler) and Path(handler.baseFilename) == path:
            return handler
    path.parent.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(path, maxBytes=LOG_BYTES, backupCount=LOG_FILES - 1, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(threadName)s: %(message)s"))
    handler.addFilter(ScrubPII())
    logger.addHandler(handler)
    logger.setLevel(level)
    return handler


def remove_logging(handler: logging.Handler) -> None:
    """Detach and close a handler (tests and shutdown; Windows locks open files)."""
    logging.getLogger("atlas").removeHandler(handler)
    handler.close()
