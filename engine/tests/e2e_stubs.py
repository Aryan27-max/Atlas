"""Local stand-ins for Google Drive and Ollama, for the app's Playwright tests.

    python -m engine.tests.e2e_stubs --dir TMP

Starts the Phase 1 ``DriveStub`` and ``OllamaStub`` on free ports, writes
fictional fixture files into TMP, prints one JSON line with the URLs and file
paths, then serves a small control API until stdin closes:

    POST /ollama/offline   POST /ollama/online   POST /ollama/delay?seconds=N
    POST /ollama/models?names=a,b   (the installed models; empty = none)
    GET  /stats            → {"chats": n, "pulls": [...]}

All names, emails and phone numbers are made up.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import openpyxl

from engine.tests.fixtures import make_pdf, simple_resume_text
from engine.tests.stubs.drive_stub import DriveStub, Pdf, SignIn, Status
from engine.tests.stubs.ollama_stub import OllamaStub

# 22 scored students: with shortlist 60, band 50, minimum 15 →
# 15 shortlisted (8 by score + 7 filled), 3 cutoff, 4 rejected; + 3 failed.
GRADES = [92, 88, 85, 81, 77, 74, 70, 66, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 45, 38, 33, 21]

FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Ananya", "Vikram", "Isha", "Arjun", "Nila", "Karthik", "Priya",
         "Sanjay", "Lakshmi", "Farhan", "Tara", "Nikhil", "Zoya", "Pranav", "Kavya", "Dev", "Aditi", "Rahul", "Sneha",
         "Omar"]
LAST = ["Sharma", "Iyer", "Menon", "Rao", "Gupta", "Nair", "Singh", "Das", "Pillai", "Reddy", "Khan", "Joshi",
        "Verma", "Bose", "Kapoor", "Mehta", "Patel", "Ali", "Kumar", "Shetty", "Chopra", "Varma", "Ghosh", "Sen",
        "Qureshi"]
DEPARTMENTS = ["CSE", "CSE", "ECE", "IT", "CSE", "Mech"]
HEADER = ["Name", "RA Number", "CGPA", "Mail ID", "Section", "Department", "P.No",
          "Hackathon Won or Participated In", "Skills", "Resume Link"]


def build(drive: DriveStub, folder: Path) -> dict[str, str]:
    """Register the Drive files and write the fixture sheets. Returns their paths."""
    rows: list[list[object]] = []
    for i, grade in enumerate(GRADES):
        pdf = make_pdf(folder / f"resume{i:02d}.pdf", [simple_resume_text(grade, name=f"{FIRST[i]} {LAST[i]}")])
        link = drive.serve(f"STU{i:03d}", Pdf(pdf.read_bytes()))
        rows.append(student(i, link))
    rows.append(student(22, drive.serve("PRIVATE22", SignIn())))
    rows.append(student(23, "https://docs.google.com/document/d/DOC23/edit"))
    rows.append(student(24, drive.serve("GONE24", Status(404))))
    rows[5][0] = "=HYPERLINK(\"http://example.com\")"        # a formula-looking name (export escaping)
    rows[9][0] = "நிலா ரெட்டி"                               # a Tamil name

    paths = {"xlsx": str(folder / "students.xlsx"), "csv": str(folder / "students.csv"),
             "no_links": str(folder / "no-links.csv")}
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.append(HEADER)
    for row in rows:
        sheet.append(row)
    for r in range(2, len(rows) + 2):               # link cells are hyperlinks, as Forms exports make them
        cell = sheet.cell(row=r, column=len(HEADER))
        cell.hyperlink = str(cell.value)
    book.save(paths["xlsx"])
    with open(paths["csv"], "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER)
        writer.writerows(rows)
    with open(paths["no_links"], "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER[:-1])
        writer.writerows(row[:-1] for row in rows)
    return paths


def student(i: int, link: str) -> list[object]:
    cgpa = round(6.2 + (i * 37 % 38) / 10, 1)
    return [f"{FIRST[i]} {LAST[i]}", f"RA2311{i:06d}", cgpa, f"{FIRST[i].lower()}.{LAST[i].lower()}@example.edu",
            chr(65 + i % 4), DEPARTMENTS[i % len(DEPARTMENTS)], 919800000000 + i * 7919,
            "Smart India Hackathon" if i % 3 == 0 else "", "Python, SQL, React" if i % 2 else "Java, C++", link]


def control_server(ollama: OllamaStub) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args: object) -> None:
            pass

        def reply(self, payload: object) -> None:
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/stats":
                self.reply({"chats": len(ollama.chats), "pulls": list(ollama.pulls), "online": ollama.online})
            else:
                self.send_error(404)

        def do_POST(self) -> None:  # noqa: N802
            parts = urlsplit(self.path)
            if parts.path == "/ollama/offline":
                ollama.go_offline()
            elif parts.path == "/ollama/online":
                ollama.go_online()
            elif parts.path == "/ollama/delay":
                ollama.delay = float(parse_qs(parts.query).get("seconds", ["0"])[0])
            elif parts.path == "/ollama/models":          # ?names=a,b (empty: no models installed)
                names = parse_qs(parts.query).get("names", [""])[0]
                ollama.models[:] = [n for n in names.split(",") if n]
            else:
                self.send_error(404)
                return
            self.reply({"ok": True})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, name="e2e-control", daemon=True).start()
    return server


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--chat-delay", type=float, default=0.15)
    args = parser.parse_args()
    args.dir.mkdir(parents=True, exist_ok=True)

    drive = DriveStub().start()
    ollama = OllamaStub(models=("qwen3:8b", "qwen3:4b"), delay=args.chat_delay).start()
    ollama.pullable = {"llama3.2:3b", "gemma3:4b"}
    ollama.pull_step_delay = 0.05
    ollama.sizes = {"qwen3:8b": 5_225_388_164, "qwen3:4b": 2_497_293_931, "gemma3:4b": 3_338_801_804,
                    "llama3.2:3b": 2_019_393_189}
    files = build(drive, args.dir)
    control = control_server(ollama)
    line = {"drive": drive.base_url, "ollama": ollama.base_url,
            "control": f"http://127.0.0.1:{control.server_address[1]}", "files": files}
    sys.stdout.write(json.dumps(line) + "\n")
    sys.stdout.flush()
    try:
        while sys.stdin.buffer.read(1024):
            pass
    except (OSError, ValueError):
        pass
    control.shutdown()
    drive.stop()
    ollama.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
