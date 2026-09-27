# Changelog

One line per commit: `YYYY-MM-DD · step · what changed`.

- 2026-09-27 · import · Atlas as received: docs, `db.py`, `buckets.py`, 43 tests
- 2026-09-27 · 1.0 · Windows baseline: close DB handle on failed open, retry transient SQLite I/O errors on open, kill test runs on Windows; requirements files, `.gitignore`, `.gitattributes`
- 2026-09-27 · 1.3 · `ingest/csv_loader.py` + `ingest/links.py`: header aliases, encodings (BOM/UTF-16/cp1252), delimiter detection, phone/CGPA normalisation, duplicates, shared links, pre-flight report; 29 tests
- 2026-09-27 · 1.4 · `errors.py` (typed errors + all recruiter wording), `ingest/downloader.py` (Drive rewrite, confirm/sign-in/quota pages, 20 MB streaming cap, `%PDF-` gate, 429 Retry-After, throttle, disk-full → pause), Drive stub server; 41 tests
