# Changelog

One line per commit: `YYYY-MM-DD · step · what changed`.

- 2026-09-27 · import · Atlas as received: docs, `db.py`, `buckets.py`, 43 tests
- 2026-09-27 · 1.0 · Windows baseline: close DB handle on failed open, retry transient SQLite I/O errors on open, kill test runs on Windows; requirements files, `.gitignore`, `.gitattributes`
- 2026-09-27 · 1.3 · `ingest/csv_loader.py` + `ingest/links.py`: header aliases, encodings (BOM/UTF-16/cp1252), delimiter detection, phone/CGPA normalisation, duplicates, shared links, pre-flight report; 29 tests
