"""Demo mode: see every screen of Atlas with no real data (development only).

    python -m engine.tests.demo_stubs make-file        # (re)write docs/demo/demo-students.xlsx
    python -m engine.tests.demo_stubs serve [--fast]   # the stubs, until stdin closes

``app/scripts/demo.mjs`` (``npm run demo`` / ``npm run demo:fast``) runs
``serve`` and starts the app against it. Everything here is fictional:

* ``docs/demo/demo-students.xlsx``: 20 made-up students. Their résumé links
  look like Google Drive links; the demo engine (``engine.tests.e2e_engine``)
  sends them to the local Drive stub instead, so nothing goes online.
  Three links are broken on purpose (private, a Google Doc, deleted), so
  *Needs attention* has something to show.
* ``serve`` starts the Drive stub on ``127.0.0.1:47811`` and a control API on
  ``127.0.0.1:47813``. With ``--fast`` it also starts the Ollama stub on
  ``127.0.0.1:47812``, which "scores" each résumé in about 1.5 s; without it
  the app uses the real Ollama on this computer (slow but real).

Control API (to show a pause and the automatic resume):

    POST /drive/offline   POST /drive/online     → "No internet connection"
    POST /ollama/offline  POST /ollama/online    → "Ollama isn't running" (--fast only)
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import openpyxl

from engine.tests.fixtures import make_pdf, simple_resume_text
from engine.tests.stubs.drive_stub import DriveStub, Pdf, SignIn, Status
from engine.tests.stubs.ollama_stub import OllamaStub

ROOT = Path(__file__).resolve().parents[2]
DEMO_FILE = ROOT / "docs" / "demo" / "demo-students.xlsx"
DRIVE_PORT, OLLAMA_PORT, CONTROL_PORT = 47811, 47812, 47813

HEADER = ["Name", "RA Number", "CGPA", "Mail ID", "Section", "Department", "P.No",
          "Hackathon Won or Participated In", "Skills", "Resume Link"]

# Name, CGPA, department, skills, and what the "résumé" earns from the stub
# (or None: a broken link of the given kind).
STUDENTS: list[tuple[str, float, str, str, int | str]] = [
    ("Ishaan Bhatt", 9.4, "CSE", "Python, Go, PostgreSQL", 94),
    ("Mira Kulkarni", 9.1, "CSE", "Python, Django, Docker", 89),
    ("Reyansh Kaur", 8.8, "IT", "Java, Spring, MySQL", 86),
    ("Saanvi Desai", 8.7, "CSE", "Python, FastAPI, Redis", 82),
    ("Kabir Malhotra", 8.5, "ECE", "C++, Python, SQL", 78),
    ("Anvi Rao", 8.4, "CSE", "JavaScript, Node.js, MongoDB", 73),
    ("Vihaan Shetty", 8.2, "IT", "Python, Flask, SQLite", 69),
    ("Aisha Siddiqui", 8.0, "CSE", "Go, gRPC, PostgreSQL", 64),
    ("Arnav Joshi", 7.9, "Mech", "Python, MATLAB", 61),
    ("Diya Fernandes", 7.8, "CSE", "Java, Android", 58),
    ("Yash Agarwal", 7.6, "ECE", "C, Embedded C", 56),
    ("Navya Pillai", 7.5, "IT", "PHP, Laravel, MySQL", 54),
    ("Rudra Banerjee", 7.3, "CSE", "Python, pandas", 51),
    ("Tara Mehta", 7.1, "CSE", "HTML, CSS", 47),
    ("Om Prakash", 6.9, "Mech", "AutoCAD", 41),
    ("Zara Khan", 6.7, "IT", "MS Office", 35),
    ("Neel Chandra", 6.4, "ECE", "Communication", 28),
    ("Riya Saxena", 8.6, "CSE", "Python, React, AWS", "private"),
    ("Aditya Menon", 8.1, "IT", "Java, SQL", "google_doc"),
    ("Kiara Dutta", 7.7, "CSE", "Python, Linux", "deleted"),
]


def student_id(index: int) -> str:
    return f"DEMO{index + 1:02d}"


def link(index: int, outcome: int | str) -> str:
    if outcome == "google_doc":
        return f"https://docs.google.com/document/d/{student_id(index)}/edit?usp=sharing"
    return f"https://drive.google.com/file/d/{student_id(index)}/view?usp=sharing"


def make_file(path: Path = DEMO_FILE) -> Path:
    """Write the demo student list (fictional; deterministic, so the committed file doesn't churn)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = "Students"
    sheet.append(HEADER)
    for i, (name, cgpa, department, skills, outcome) in enumerate(STUDENTS):
        first, last = name.split()
        sheet.append([name, f"RA2599{i + 1:06d}", cgpa, f"{first.lower()}.{last.lower()}@example.edu",
                      "ABCD"[i % 4], department, f"90000{i + 1:05d}",
                      "Smart India Hackathon" if i % 3 == 0 else "", skills, link(i, outcome)])
        cell = sheet.cell(row=i + 2, column=len(HEADER))
        cell.hyperlink = str(cell.value)            # as a Google Forms export makes them
    book.properties.creator = "Atlas demo"
    book.properties.created = book.properties.modified = datetime.datetime(2026, 1, 1)
    book.save(path)
    return path


def serve_files(drive: DriveStub, folder: Path) -> None:
    for i, (name, _, _, _, outcome) in enumerate(STUDENTS):
        if outcome == "private":
            drive.serve(student_id(i), SignIn())
        elif outcome == "deleted":
            drive.serve(student_id(i), Status(404))
        elif isinstance(outcome, int):
            pdf = make_pdf(folder / f"{student_id(i)}.pdf", [simple_resume_text(outcome, name=name)])
            drive.serve(student_id(i), Pdf(pdf.read_bytes()))
        # a Google Doc link fails before any download, so there is nothing to serve


def control_server(drive: DriveStub, ollama: OllamaStub | None) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args: object) -> None:
            pass

        def do_POST(self) -> None:  # noqa: N802
            actions = {"/drive/offline": drive.go_offline, "/drive/online": drive.go_online}
            if ollama is not None:
                actions |= {"/ollama/offline": ollama.go_offline, "/ollama/online": ollama.go_online}
            action = actions.get(urlsplit(self.path).path)
            if action is None:
                self.send_error(404)
                return
            action()
            body = json.dumps({"ok": True}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", CONTROL_PORT), Handler)
    threading.Thread(target=server.serve_forever, name="demo-control", daemon=True).start()
    return server


def serve(fast: bool) -> int:
    with tempfile.TemporaryDirectory(prefix="atlas-demo-pdfs-") as tmp:
        drive = DriveStub()
        drive.port = DRIVE_PORT
        drive.start()
        ollama = None
        if fast:
            ollama = OllamaStub(models=("qwen3:8b",), delay=1.5)
            ollama.port = OLLAMA_PORT
            ollama.sizes = {"qwen3:8b": 5_225_388_164}
            ollama.start()
        serve_files(drive, Path(tmp))
        control = control_server(drive, ollama)
        line = {"drive": drive.base_url, "control": f"http://127.0.0.1:{CONTROL_PORT}",
                "ollama": ollama.base_url if ollama else None, "file": str(DEMO_FILE)}
        sys.stdout.write(json.dumps(line) + "\n")
        sys.stdout.flush()
        try:
            while sys.stdin.buffer.read(1024):
                pass
        except (OSError, ValueError):
            pass
        control.shutdown()
        drive.stop()
        if ollama is not None:
            ollama.stop()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Atlas demo stubs (fictional data only)")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("make-file", help="write docs/demo/demo-students.xlsx")
    run = sub.add_parser("serve", help="serve the demo résumés until stdin closes")
    run.add_argument("--fast", action="store_true", help="also start the stub Ollama (instant scores)")
    args = parser.parse_args(argv)
    if args.command == "make-file":
        print(f"wrote {make_file()}")
        return 0
    try:
        return serve(args.fast)
    except OSError as exc:
        print(f"demo: a demo port ({DRIVE_PORT}–{CONTROL_PORT}) is busy: is another demo running? ({exc})",
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
