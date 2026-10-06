# Third-party notices

Atlas itself is proprietary (see [LICENSE](LICENSE)). It ships with the third-party components below, which remain under their own licences. This file lists what is **inside the installer**: development tools, test libraries and the build toolchain are not shipped and are not listed, except where a piece of them ends up in the installer (the PyInstaller bootloader, the NSIS installer).

`packaging/check_licenses.py` re-derives the shipped packages from the code and fails CI if a new copyleft, restrictive or unknown licence appears, or if a shipped package or brand asset is missing from this file.

*This is a factual inventory, not legal advice.*

## Copyleft, restrictive or notable licences (read first)

| Component | Version | Licence | Where it is | What it means for Atlas |
|---|---|---|---|---|
| **`pymupdf`** (PyMuPDF, with MuPDF) | 1.28.2 (MuPDF 1.28.2) | **AGPL-3.0, or a commercial licence from Artifex** (package metadata: "Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License") | the engine: PDF text extraction (`engine/extract/pdf.py`) and page rendering for OCR (`engine/extract/ocr.py`) | **Needs a decision.** Distributing an installer that contains AGPL code to the firm likely brings AGPL obligations for the whole engine (offering its complete source under the AGPL), which a proprietary licence can't meet. See *Needs a decision* below. |
| FFmpeg (inside Electron's `ffmpeg.dll`) | as built by Chromium 152 | LGPL-2.1-or-later (built without the GPL-only parts) | the Electron runtime | Allowed when shipped as a separate, replaceable library with its licence text, as Electron does; the text is in `LICENSES.chromium.html` next to `Atlas.exe`. |
| `certifi` | 2026.7.22 | MPL-2.0 (file-level copyleft) | the engine (the CA certificate bundle for HTTPS) | Shipped unmodified: keep this notice; nothing more unless the file is changed. |
| PyInstaller bootloader | 6.22.3 | GPL-2.0-or-later **with the bootloader exception** | the start of `atlas-engine.exe` | The exception explicitly allows distributing programs built with it under any licence, including proprietary ones. |
| `@fontsource-variable/inter` (the Inter typeface) | 5.3.0 | SIL Open Font License 1.1 | the app (Windows uses Inter) | Embedding the font in an app is allowed; the font itself can't be sold on its own. |

### Needs a decision: PyMuPDF
Facts: PyMuPDF 1.28.2 is installed and bundled; its metadata states the dual licence above. It is the only AGPL component, and the only one that isn't clearly compatible with a proprietary licence. Atlas's code was **not** changed. The realistic options:

1. **Buy a commercial licence from Artifex** (the makers of MuPDF and PyMuPDF). Nothing changes in the code. The price isn't public; ask Artifex for a quote, mentioning a desktop app distributed to one firm.
2. **Replace PyMuPDF with a permissively licensed PDF library.** Atlas uses it for text extraction and, when OCR is installed, for rendering scanned pages to images. Candidates:
   - **pypdfium2** (Apache-2.0 / BSD-3-Clause; wraps Google's PDFium, the engine in Chrome): fast, good text extraction, also renders pages. The closest replacement.
   - **pdfminer.six** (MIT), or **pdfplumber** (MIT, built on it): good, layout-aware text, but slower and no rendering.
   - **pypdf** (BSD-3-Clause): pure Python and simple, but the weakest text on complex layouts, and no rendering.

   Risk: text order and spacing differ between libraries, and Atlas's section splitting (Projects, Experience …) depends on them. A swap needs the extraction tests and the eval set re-run, and a check on real résumé layouts.
3. **Comply with the AGPL:** license the engine (at least) under the AGPL and give the firm its complete source. That contradicts Atlas's proprietary licence.

The test-only uses of PyMuPDF (generating fictional PDFs in `engine/tests/` and `engine/eval/`) aren't shipped.

## Bundled packages

The versions below are the ones bundled into the locally built engine (Python 3.11 build environment, `packaging/requirements-build.txt`) and the app. CI's release build installs exactly the versions pinned in `engine/constraints.txt`, which match this table.

### Python packages (bundled into the engine by PyInstaller)

| Package | Version | Licence |
|---|---|---|
| `annotated-doc` | 0.0.5 | MIT |
| `annotated-types` | 0.8.0 | MIT |
| `anyio` | 4.15.1 | MIT |
| `certifi` | 2026.7.22 | Mozilla Public License 2.0 (MPL 2.0) |
| `charset-normalizer` | 3.5.2 | MIT |
| `click` | 8.5.0 | BSD-3-Clause |
| `et_xmlfile` | 2.0.0 | MIT License |
| `fastapi` | 0.142.2 | MIT |
| `h11` | 0.16.0 | MIT License |
| `idna` | 3.20 | BSD-3-Clause |
| `openpyxl` | 3.1.5 | MIT License |
| `opentelemetry-api` | 1.45.0 | Apache-2.0 |
| `pydantic` | 2.13.5 | MIT |
| `pydantic_core` | 2.46.5 | MIT |
| `pymupdf` | 1.28.2 | Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License |
| `requests` | 2.34.2 | Apache Software License |
| `starlette` | 1.7.0 | BSD-3-Clause |
| `typing-inspection` | 0.4.4 | MIT |
| `typing_extensions` | 4.16.0 | PSF-2.0 |
| `urllib3` | 2.8.0 | MIT |
| `uvicorn` | 0.54.0 | BSD-3-Clause |

### JavaScript packages (bundled into the app by vite, plus the Electron runtime)

| Package | Version | Licence |
|---|---|---|
| `@fontsource-variable/inter` | 5.3.0 | OFL-1.1 |
| `@tanstack/query-core` | 5.104.0 | MIT |
| `@tanstack/react-query` | 5.104.0 | MIT |
| `@tanstack/react-virtual` | 3.14.13 | MIT |
| `@tanstack/virtual-core` | 3.17.11 | MIT |
| `electron` | 44.4.5 | MIT |
| `framer-motion` | 13.4.4 | MIT |
| `lucide-react` | 1.48.0 | ISC |
| `motion` | 13.4.4 | MIT |
| `motion-dom` | 13.4.4 | MIT |
| `motion-utils` | 13.3.0 | MIT |
| `react` | 19.3.0 | MIT |
| `react-dom` | 19.3.0 | MIT |
| `scheduler` | 0.28.0 | MIT |
| `tslib` | 2.8.1 | 0BSD |
| `zustand` | 5.0.15 | MIT |

## Runtimes and system components inside the installer

| Component | Version in the local build | Licence |
|---|---|---|
| Electron | 44.4.5 | MIT |
| Chromium (inside Electron) | 152.0.7977.130 | BSD-3-Clause, plus its third-party components; all listed in `LICENSES.chromium.html` shipped next to `Atlas.exe` |
| Node.js (inside Electron) | 24.21.0 | MIT (its own third-party licences are in the same file) |
| CPython (inside the engine) | 3.11.3 locally; 3.12 in CI release builds | PSF-2.0 |
| OpenSSL (with CPython) | 1.1.1t locally (CPython 3.12 builds ship OpenSSL 3, Apache-2.0) | OpenSSL License and original SSLeay License (BSD-style; requires this acknowledgement: "This product includes software developed by the OpenSSL Project for use in the OpenSSL Toolkit (http://www.openssl.org/)" and "This product includes cryptographic software written by Eric Young (eay@cryptsoft.com)") |
| SQLite (with CPython) | 3.40.1 locally | Public domain |
| libffi, Expat (with CPython) | as in CPython | MIT |
| zlib, bzip2, liblzma (with CPython) | as in CPython | zlib License; bzip2 License (BSD-style); public domain / 0BSD |
| Microsoft Visual C++ runtime and Universal CRT (`VCRUNTIME140*.dll`, `MSVCP140.dll`, `ucrtbase.dll`, `api-ms-win-*.dll`) | as shipped with CPython | Microsoft redistributable licence terms |
| NSIS (the Windows installer and uninstaller) | 3.0.4 | zlib/libpng License (parts under the bzip2 License) |
| `elevate.exe` (from electron-builder, in `resources/`) | with electron-builder 26.15.3 | MIT |

## Brand assets

Atlas's logo, app icon and start-up screen use two assets supplied by the **iOS Development Center** for this project. The originals are kept unmodified in `Public_assets/`. The app ships sanitised copies with the same art (`docs/summaries/branding.md`).

| Asset | What it is | Shipped as |
|---|---|---|
| `logo.svg` (from `swift-svgrepo-com.svg`, an SVG Repo export) | The **Swift logo** | The logo on Welcome, in Settings → About and as the favicon. Every app icon is rendered from it (`packaging/icons/`: `icon.ico`, `icon-mac.png` → the `.icns`, the PNGs) |
| `hello-drawn.svg` and `hello.svg` (from `Hello (apple).svg`) | Apple's **"hello" lettering**: its draw-in animation (played once) and the finished lettering | The start-up screen (the finished lettering with reduced motion) |

**The Swift logo and the "hello" lettering are trademarks of Apple Inc.** They are not Atlas's, and Atlas's [LICENSE](LICENSE) does not cover them or grant any right in them. **Before any distribution outside this project, replace the logo:** Apple's trademark guidelines don't allow the Swift logo as a product icon. How to swap it: [docs/SIGNING.md](docs/SIGNING.md) → *Before any distribution: replace the logo*.

## Not shipped, but used by Atlas
- **Ollama** (MIT) is installed separately by the user; Atlas never bundles or installs it.
- **AI models** such as `qwen3:8b` (Apache-2.0) are downloaded by Ollama at the user's request and are not part of the installer.
- **EasyOCR and PyTorch** (Apache-2.0 / BSD) are optional for development and excluded from the installer.
