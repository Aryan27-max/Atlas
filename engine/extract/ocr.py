"""OCR for scanned résumé pages, via EasyOCR (optional).

Adapted from QWENTUS ``parsers/ocr.py``. What changed and why:

* **Never downloads at runtime.** QWENTUS created the reader with
  ``download_enabled=True``, so the first scanned résumé silently fetched
  model weights from the internet. Here ``download_enabled=False`` and the
  weights must already be in ``model_storage_directory`` (bundled in Phase 3).
* **Lazy and optional.** ``easyocr`` (and PyTorch behind it) is imported only
  when a page actually needs OCR. If it isn't installed, or the weights are
  missing, :class:`OcrUnavailable` is raised and the extractor turns that
  into a clear permanent failure instead of a crash.
* **One page at a time**, called by the extractor only for pages that have
  no text layer.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import pymupdf


class OcrUnavailable(Exception):
    """EasyOCR isn't installed, or its model files aren't on this computer."""


class EasyOcrEngine:
    def __init__(
        self,
        model_storage_directory: Path | str,
        *,
        languages: tuple[str, ...] = ("en",),
        zoom: float = 2.0,
    ) -> None:
        self.model_storage_directory = Path(model_storage_directory)
        self.languages = languages
        self.zoom = zoom
        self._reader: Any | None = None
        self._lock = threading.Lock()   # EasyOCR readers are not thread-safe

    def read_page(self, page: pymupdf.Page) -> str:
        with self._lock:
            reader = self._get_reader()
            image = self._render(page)
            try:
                lines = reader.readtext(image, detail=0, paragraph=True)
            except Exception as exc:  # noqa: BLE001 — torch/easyocr raise many types
                raise OcrUnavailable(f"OCR failed: {type(exc).__name__}") from exc
        return "\n".join(str(line).strip() for line in lines if str(line).strip())

    def _get_reader(self) -> Any:
        if self._reader is None:
            try:
                import easyocr  # noqa: PLC0415 — optional, heavy, imported on first use
            except ImportError as exc:
                raise OcrUnavailable("easyocr is not installed") from exc
            try:
                self._reader = easyocr.Reader(
                    list(self.languages),
                    gpu=False,
                    verbose=False,
                    download_enabled=False,
                    model_storage_directory=str(self.model_storage_directory),
                )
            except Exception as exc:  # noqa: BLE001 — missing weights raise various errors
                raise OcrUnavailable(f"OCR models could not be loaded: {type(exc).__name__}") from exc
        return self._reader

    def _render(self, page: pymupdf.Page) -> Any:
        try:
            import numpy as np  # noqa: PLC0415 — comes with easyocr
        except ImportError as exc:
            raise OcrUnavailable("numpy is not installed") from exc
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(self.zoom, self.zoom), alpha=False)
        if pixmap.n not in (3, 4):
            pixmap = pymupdf.Pixmap(pymupdf.csRGB, pixmap)
        array = np.frombuffer(pixmap.samples, dtype=np.uint8)
        return array.reshape(pixmap.height, pixmap.width, pixmap.n)
