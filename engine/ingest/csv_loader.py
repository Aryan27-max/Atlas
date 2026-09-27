"""Load a recruiter's CSV or Excel file and build the pre-flight report (ARCHITECTURE §10).

``load_table`` is pure: it reads the file and returns a :class:`PreflightReport`.
It takes ``.csv`` and ``.xlsx`` (first sheet, the text each cell shows, the
hyperlink target for résumé-link cells); an old ``.xls`` is refused with a
clear message. ``load_csv`` is kept as a wrapper for existing callers.
It never touches the database. The recruiter reads the report, and only
after they confirm does the caller pass ``report.rows`` to
``Database.add_candidates`` (which inserts all rows or none).

Errors exclude a row (missing RA number, missing link, duplicate RA number).
Warnings keep the row and just tell the recruiter (odd phone, unreadable
CGPA, two students sharing one link, unused columns).
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import re
import unicodedata
import warnings
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from engine.ingest.links import link_identity, with_scheme

# Must equal db.CANDIDATE_INPUT_FIELDS (a test checks). Stage modules never
# import the database module, so the list is repeated here.
FIELDS = (
    "ra_number",
    "name",
    "email",
    "phone",
    "cgpa",
    "section",
    "department",
    "hackathons",
    "skills",
    "resume_link",
)
REQUIRED = ("ra_number", "resume_link")

LABELS = {
    "ra_number": "RA number",
    "name": "Name",
    "email": "Mail ID",
    "phone": "Phone",
    "cgpa": "CGPA",
    "section": "Section",
    "department": "Department",
    "hackathons": "Hackathons",
    "skills": "Skills",
    "resume_link": "Résumé link",
}

# Header aliases, written the way people type them. They are normalised with
# ``_norm_header`` before comparing, so case, spaces, punctuation and accents
# don't matter ("Reg. No" == "reg no" == "REGNO").
_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("name", "student name", "full name", "candidate name", "name of the student",
             "name of student", "applicant name", "student full name"),
    "first_name": ("first name", "given name"),
    "last_name": ("last name", "surname", "family name"),
    "ra_number": ("ra number", "ra no", "ra num", "ra", "reg no", "reg number", "register number",
                  "register no", "registration number", "registration no", "registration id",
                  "roll number", "roll no", "enrollment number", "enrolment number", "enrollment no"),
    "cgpa": ("cgpa", "gpa", "cgpa/10", "cgpa out of 10", "cumulative gpa", "current cgpa", "overall cgpa"),
    "email": ("email", "e-mail", "mail", "mail id", "email id", "e-mail id", "email address",
              "e-mail address", "personal email", "college email", "official email"),
    "section": ("section", "sec", "class section"),
    "department": ("department", "dept", "branch", "stream", "specialization", "specialisation"),
    "phone": ("phone", "phone no", "phone number", "p.no", "p no", "ph no", "mobile", "mobile no",
              "mobile number", "contact", "contact no", "contact number", "whatsapp number", "cell"),
    "hackathons": ("hackathon", "hackathons", "hackathons won or participated",
                   "hackathons won/participated", "hackathon participation", "hackathons participated"),
    "skills": ("skills", "technical skills", "skill set", "skillset", "key skills", "tech stack"),
    "resume_link": ("resume link", "resume", "cv link", "cv", "drive link", "resume drive link",
                    "resume url", "link to resume", "google drive link", "resume pdf link"),
}

# A longer header such as "Resume Link (Anyone with link)" still matches when
# it *starts with* one of these aliases. Short or vague aliases ("name",
# "mail", "contact") are left out: "Name of college" is not a student name.
_PREFIX_BLOCKLIST = frozenset({"contact", "student"})

_BLANK_TOKENS = frozenset({"", "na", "n/a", "-", "--", "nil", "none", "null", "nan"})

# How many rows are listed by number in the report before "…".
_REPORT_ROW_LIMIT = 10


# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Issue:
    """One problem found in the CSV.

    ``row`` is the spreadsheet row number the recruiter sees in Excel (the
    header is row 1), or ``None`` for a problem with the whole file or a column.
    """

    row: int | None
    ra_number: str
    code: str
    message: str


@dataclass
class PreflightReport:
    source: str
    rows: list[dict[str, Any]] = field(default_factory=list)
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)
    columns: dict[str, str] = field(default_factory=dict)   # field → header used
    encoding: str | None = None
    delimiter: str | None = None

    @property
    def file_errors(self) -> list[Issue]:
        return [e for e in self.errors if e.row is None]

    @property
    def ok(self) -> bool:
        """True when the run can start: the file is usable and some rows are ready."""
        return not self.file_errors and bool(self.rows)


# --------------------------------------------------------------------------- #
# Normalisers (public so tests and the UI can reuse them)
# --------------------------------------------------------------------------- #


def normalise_phone(raw: str) -> tuple[str, str | None]:
    """Return ``(phone, warning_code)``.

    Ten digits come back clean. Anything else is kept exactly as typed, with
    a warning, because a guessed phone number is worse than an odd-looking one.
    """
    text = _clean_cell(raw)
    if not text:
        return "", None
    compact = text.replace(" ", "")
    if re.fullmatch(r"\d+(\.\d+)?[eE]\+?\d+", compact):
        # Excel scientific notation, e.g. 9.19876E+11. It is only reversible
        # when every digit survived; 9.19876E+11 lost the last six.
        try:
            value = Decimal(compact)
        except InvalidOperation:
            return text, "phone_invalid"
        mantissa = compact.lower().split("e")[0].replace(".", "").lstrip("0")
        digits = format(value.to_integral_value(), "f")
        if value != value.to_integral_value() or len(mantissa) < len(digits):
            return text, "phone_excel_rounded"
        compact = digits
    compact = re.sub(r"^(\d+)\.0+$", r"\1", compact)  # 9876543210.0 from a float column
    if re.search(r"[^\d+\-().]", compact) or compact.count("+") > 1:
        return text, "phone_invalid"
    digits = re.sub(r"\D", "", compact)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 13 and digits.startswith("091"):
        digits = digits[3:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        return digits, None
    return text, "phone_invalid"


def normalise_cgpa(raw: str) -> tuple[float | None, str | None]:
    """Return ``(cgpa on a 10-point scale or None, warning_code)``.

    Accepts ``8.2``, ``8.2/10``, ``82%`` and ``8,2``. Out-of-range or
    unreadable values become ``None`` with a warning; the row is kept.
    """
    text = _clean_cell(raw)
    if text.lower() in _BLANK_TOKENS:
        return None, None
    text = text.replace(" ", "")
    if re.fullmatch(r"\d+,\d+", text):
        text = text.replace(",", ".")
    number = r"(\d+(?:\.\d+)?)"
    if match := re.fullmatch(number + r"/10(?:\.0+)?", text):
        value = float(match.group(1))
    elif match := re.fullmatch(number + r"%", text):
        value = float(match.group(1)) / 10
    elif match := re.fullmatch(number, text):
        value = float(match.group(1))
    else:
        return None, "cgpa_unreadable"
    if not 0 <= value <= 10:
        return None, "cgpa_out_of_range"
    return round(value, 2), None


# --------------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------------- #


XLS_MESSAGE = "Save this file as .xlsx or CSV and try again."
_ZIP_MAGIC = b"PK\x03\x04"                         # .xlsx is a zip file
_OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"   # old binary .xls


def load_table(path: Path | str) -> PreflightReport:
    """Read and validate a recruiter file (.csv or .xlsx). Never writes anything."""
    path = Path(path)
    report = PreflightReport(source=path.name)
    try:
        raw = path.read_bytes()
    except OSError:
        return _fail(report, "unreadable", "The file couldn't be opened. Check that it still exists.")
    suffix = path.suffix.lower()
    if raw.startswith(_OLE2_MAGIC) or suffix == ".xls":
        return _fail(report, "xls_unsupported", XLS_MESSAGE)
    if raw.startswith(_ZIP_MAGIC) or suffix in (".xlsx", ".xlsm"):
        return _load_xlsx(report, raw)
    return _load_csv_bytes(report, raw)


def load_csv(path: Path | str) -> PreflightReport:
    """Same as :func:`load_table` (kept for callers written before .xlsx support)."""
    return load_table(path)


def _load_csv_bytes(report: PreflightReport, raw: bytes) -> PreflightReport:
    text, encoding = _decode(raw)
    if text is None:
        return _fail(
            report, "encoding",
            "The file's text couldn't be read. In Excel, use Save As → \"CSV UTF-8\" and try again.",
        )
    report.encoding = encoding
    text = text.replace("\x00", "")
    if not text.strip():
        return _fail(report, "empty_file", "The file is empty.")

    delimiter = _sniff_delimiter(text)
    report.delimiter = delimiter
    try:
        records = list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter))
    except csv.Error:
        return _fail(report, "not_csv", "The file isn't a valid CSV. Export it from Excel as CSV.")
    return _build_report(report, records)


def _load_xlsx(report: PreflightReport, raw: bytes) -> PreflightReport:
    """First sheet of an .xlsx, each cell as the text Excel shows."""
    try:
        import openpyxl  # imported here so CSV-only use never needs it
    except ImportError:
        return _fail(report, "xlsx_unavailable", "Excel files can't be read on this computer. " + XLS_MESSAGE)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")        # openpyxl warns about unsupported Excel extras
            workbook = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    except Exception:  # noqa: BLE001 — a damaged or foreign file can fail in many ways inside openpyxl
        return _fail(report, "not_xlsx",
                     "The Excel file couldn't be read. Open it in Excel, save it again as .xlsx or CSV, "
                     "and try again.")
    report.encoding = "xlsx"
    sheet = workbook.worksheets[0]
    records: list[list[str]] = []
    links: dict[tuple[int, int], str] = {}
    for r, row in enumerate(sheet.iter_rows()):
        records.append([_cell_text(cell.value, cell.number_format) for cell in row])
        for c, cell in enumerate(row):
            target = getattr(cell.hyperlink, "target", None) if cell.hyperlink is not None else None
            if target:
                links[(r, c)] = str(target)
    workbook.close()
    return _build_report(report, records, links)


def _cell_text(value: Any, number_format: str) -> str:
    """The text a spreadsheet cell shows.

    Whole numbers are written out in full: a 12-digit phone stored as a number
    is shown by Excel as 9.19877E+11 only because of the column width, and the
    digits are all there. Other numbers keep up to 15 significant digits (so
    8.1 stays "8.1", not "8.0999999"), or the decimals the format asks for.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (dt.datetime, dt.date)):
        day = value.date() if isinstance(value, dt.datetime) else value
        return day.isoformat()
    if isinstance(value, dt.time):
        return value.isoformat(timespec="minutes")
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        fmt = number_format or "General"
        if "%" in fmt:
            decimals = _format_decimals(fmt)
            return f"{value * 100:.{decimals}f}%"
        if fmt not in ("General", "@") and re.search(r"[0#]", fmt):
            return f"{value:.{_format_decimals(fmt)}f}"
        if value.is_integer() and abs(value) < 1e16:
            return str(int(value))
        return format(value, ".15g")
    return str(value)


def _format_decimals(number_format: str) -> int:
    match = re.search(r"\.([0#]+)", number_format)
    return len(match.group(1)) if match else 0


def _build_report(
    report: PreflightReport, records: list[list[str]], links: dict[tuple[int, int], str] | None = None
) -> PreflightReport:
    """Everything after reading: header, columns, rows, issues, summary."""
    header_index = _find_header(records)
    if header_index is None:
        return _fail(report, "empty_file", "The file is empty.")
    header = records[header_index]
    columns, column_issues = _map_columns(header)
    report.warnings.extend(column_issues)
    report.columns = {f: _clean_cell(header[i]) for f, i in columns.items() if f in FIELDS}

    missing = [f for f in REQUIRED if f not in columns]
    for f in missing:
        report.errors.append(Issue(
            None, "", "missing_column",
            f"No column for {LABELS[f]}. Add a column named \"{LABELS[f]}\".",
        ))
    if "name" not in columns and "first_name" not in columns:
        report.warnings.append(Issue(None, "", "missing_name_column", "No column for Name. Names will be blank."))

    data = [(i + 1, rec) for i, rec in enumerate(records) if i > header_index]
    if not any(_non_blank(rec) for _, rec in data):
        report.errors.append(Issue(None, "", "no_rows", "The file has a header but no student rows."))
    if missing or report.file_errors:
        report.summary = _summarise(report, rows_read=sum(1 for _, r in data if _non_blank(r)))
        return report

    # A résumé-link cell that shows "Resume" but links somewhere: use the link.
    link_column = columns.get("resume_link")
    if links and link_column is not None:
        for index, record in enumerate(records):
            target = links.get((index, link_column))
            if index > header_index and target and re.match(r"^https?://", target, re.IGNORECASE) \
                    and link_column < len(record):
                record[link_column] = target

    # Trailing empty header cells (",,,," after the last column) are not columns.
    width = max((i + 1 for i, h in enumerate(header) if _clean_cell(h)), default=0)
    _read_rows(report, data, columns, width)
    report.summary = _summarise(report, rows_read=sum(1 for _, r in data if _non_blank(r)))
    return report


def _read_rows(
    report: PreflightReport, data: list[tuple[int, list[str]]], columns: dict[str, int], width: int
) -> None:
    seen_ra: dict[str, int] = {}                    # RA → row number of the kept row
    seen_link: dict[str, tuple[str, int]] = {}      # link identity → (RA, row number)
    extra_cells_rows: list[int] = []

    for row_number, record in data:
        if not _non_blank(record):
            continue

        def cell(name: str) -> str:
            index = columns.get(name)
            return _clean_cell(record[index]) if index is not None and index < len(record) else ""

        if any(_clean_cell(c) for c in record[width:]):
            extra_cells_rows.append(row_number)

        ra = cell("ra_number").upper()
        link = cell("resume_link")
        name = " ".join(cell("name").split())
        if not name and ("first_name" in columns or "last_name" in columns):
            name = " ".join(f"{cell('first_name')} {cell('last_name')}".split())

        if not ra:
            report.errors.append(Issue(row_number, "", "missing_ra", "RA number is missing. Row skipped."))
            continue
        if not link:
            report.errors.append(Issue(row_number, ra, "missing_link", "Résumé link is missing. Row skipped."))
            continue
        if ra in seen_ra:
            report.errors.append(Issue(
                row_number, ra, "duplicate_ra",
                f"RA number {ra} is also in row {seen_ra[ra]}. Kept the first; this row is skipped.",
            ))
            continue
        seen_ra[ra] = row_number

        phone, phone_warning = normalise_phone(cell("phone"))
        if phone_warning == "phone_excel_rounded":
            report.warnings.append(Issue(
                row_number, ra, phone_warning,
                "Phone number was shortened by Excel (scientific notation). Kept as typed; check the original.",
            ))
        elif phone_warning:
            report.warnings.append(Issue(row_number, ra, phone_warning, "Phone number doesn't look like 10 digits. Kept as typed."))

        cgpa, cgpa_warning = normalise_cgpa(cell("cgpa"))
        if cgpa_warning == "cgpa_out_of_range":
            report.warnings.append(Issue(row_number, ra, cgpa_warning, "CGPA is outside 0–10. Left empty."))
        elif cgpa_warning:
            report.warnings.append(Issue(row_number, ra, cgpa_warning, "CGPA couldn't be read. Left empty."))

        email = cell("email")
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            report.warnings.append(Issue(row_number, ra, "email_invalid", "Mail ID doesn't look like an email address."))

        if not re.match(r"^https?://", with_scheme(link), re.IGNORECASE):
            report.warnings.append(Issue(
                row_number, ra, "link_invalid",
                "Résumé link isn't a web address. This student will be marked failed.",
            ))

        identity = link_identity(link)
        if identity in seen_link:
            other_ra, other_row = seen_link[identity]
            report.warnings.append(Issue(
                row_number, ra, "shared_link",
                f"Same résumé link as {other_ra} (row {other_row}).",
            ))
        else:
            seen_link[identity] = (ra, row_number)

        report.rows.append({
            "ra_number": ra,
            "name": name,
            "email": email,
            "phone": phone,
            "cgpa": cgpa,
            "section": cell("section"),
            "department": " ".join(cell("department").split()),
            "hackathons": cell("hackathons"),
            "skills": cell("skills"),
            "resume_link": link,
        })

    if extra_cells_rows:
        report.warnings.append(Issue(
            None, "", "extra_cells",
            f"{len(extra_cells_rows)} rows have values beyond the last named column; those values were ignored.",
        ))


# --------------------------------------------------------------------------- #
# Report text
# --------------------------------------------------------------------------- #

# (code, label, how the rows are listed, suffix). Order is the order shown.
_REPORT_LINES: tuple[tuple[str, str, str, str], ...] = (
    ("duplicate_ra", "duplicate RA numbers", "rows", "(kept first)"),
    ("missing_ra", "missing RA numbers", "rows", "(skipped)"),
    ("missing_link", "missing résumé links", "rows", "(skipped)"),
    ("shared_link", "links shared by two students", "ras", "(warning only)"),
    ("link_invalid", "links that aren't web addresses", "ras", "(will fail)"),
    ("phone_invalid", "phone numbers look wrong", "", "(warning only)"),
    ("phone_excel_rounded", "phone numbers shortened by Excel", "ras", "(warning only)"),
    ("cgpa_out_of_range", "CGPA values outside 0–10", "ras", "(left empty)"),
    ("cgpa_unreadable", "CGPA values not understood", "ras", "(left empty)"),
    ("email_invalid", "mail IDs look wrong", "", "(warning only)"),
)


def render_report(report: PreflightReport) -> str:
    """The pre-flight text block shown before a run can start (§10)."""
    lines: list[str] = []
    if report.file_errors:
        lines.append(f"{report.source} can't be used:")
        lines.extend(f"  • {e.message}" for e in report.file_errors)
        return "\n".join(lines)

    issues = report.errors + report.warnings
    lines.append(f"{report.summary.get('rows_read', 0)} rows read")
    lines.append(f"{report.summary.get('ready', 0)} ready")

    width = max(len(label) for _, label, _, _ in _REPORT_LINES) + 4 + 1
    for code, label, listing, suffix in _REPORT_LINES:
        found = [i for i in issues if i.code == code]
        if not found:
            continue
        head = f"{len(found):>3} {label}".ljust(width)
        if listing == "rows":
            word = "row" if len(found) == 1 else "rows"
            detail = f"→ {word} {_join_limited([str(i.row) for i in found])} "
        elif listing == "ras":
            detail = "→ " + _join_limited([i.ra_number for i in found]) + " "
        else:
            detail = ""
        lines.append(f"{head}{detail}{suffix}".rstrip())

    for issue in report.warnings:
        if issue.row is None:
            lines.append(f"  note: {issue.message}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Internals
# --------------------------------------------------------------------------- #


def _fail(report: PreflightReport, code: str, message: str) -> PreflightReport:
    report.errors.append(Issue(None, "", code, message))
    report.summary = _summarise(report, rows_read=0)
    return report


def _summarise(report: PreflightReport, *, rows_read: int) -> dict[str, Any]:
    by_code: dict[str, int] = {}
    for issue in report.errors + report.warnings:
        by_code[issue.code] = by_code.get(issue.code, 0) + 1
    return {
        "rows_read": rows_read,
        "ready": len(report.rows),
        "skipped": sum(1 for e in report.errors if e.row is not None),
        "warnings": len(report.warnings),
        "by_code": by_code,
        "encoding": report.encoding,
        "delimiter": report.delimiter,
    }


def _decode(raw: bytes) -> tuple[str | None, str | None]:
    """UTF-8 with BOM, then UTF-16 (Excel "Unicode Text"), then UTF-8, then cp1252."""
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8", errors="replace"), "utf-8-sig"
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return raw.decode("utf-16"), "utf-16"
        except UnicodeDecodeError:
            return None, None
    for encoding in ("utf-8", "cp1252"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return None, None


def _sniff_delimiter(text: str) -> str:
    """Pick ``,`` ``;`` tab or ``|`` by counting them in the first non-blank line.

    ``csv.Sniffer`` is unreliable on short headers; counting outside quotes
    on the header line is simpler and right for every export we've seen.
    """
    first = next((line for line in text.splitlines() if line.strip()), "")
    counts: dict[str, int] = {d: 0 for d in (",", ";", "\t", "|")}
    in_quotes = False
    for char in first:
        if char == '"':
            in_quotes = not in_quotes
        elif not in_quotes and char in counts:
            counts[char] += 1
    best = max(counts, key=lambda d: (counts[d], d == ","))
    return best if counts[best] else ","


def _find_header(records: list[list[str]]) -> int | None:
    """Index of the header row.

    Normally the first non-blank row. If that row doesn't name the required
    columns but a later one (within the first 10 non-blank rows) does, the
    file has a title row above the header, so use the later one.
    """
    non_blank = [i for i, rec in enumerate(records) if _non_blank(rec)][:10]
    if not non_blank:
        return None
    for index in non_blank:
        columns, _ = _map_columns(records[index])
        if all(f in columns for f in REQUIRED):
            return index
    return non_blank[0]


def _map_columns(header: list[str]) -> tuple[dict[str, int], list[Issue]]:
    """Map each field to a column index. Returns ``(field → index, issues)``."""
    normalised = [_norm_header(h) for h in header]
    lookup = {_norm_header(alias): f for f, aliases in _ALIASES.items() for alias in aliases}
    prefixes = sorted(
        (
            (_norm_header(alias), f)
            for f, aliases in _ALIASES.items()
            for alias in aliases
            if (len(_norm_header(alias)) >= 5 or _norm_header(alias) == "cgpa")
            and _norm_header(alias) not in _PREFIX_BLOCKLIST
        ),
        key=lambda item: -len(item[0]),
    )

    columns: dict[str, int] = {}
    issues: list[Issue] = []
    assigned: set[int] = set()

    def assign(index: int, name: str) -> None:
        if name in columns:
            issues.append(Issue(
                None, "", "duplicate_column",
                f"Columns \"{_clean_cell(header[columns[name]])}\" and \"{_clean_cell(header[index])}\" "
                f"both look like {LABELS.get(name, name.replace('_', ' '))}. Using the first.",
            ))
        else:
            columns[name] = index
        assigned.add(index)

    for index, key in enumerate(normalised):                      # exact matches first
        if key in lookup:
            assign(index, lookup[key])
    for index, key in enumerate(normalised):                      # then "starts with"
        if index in assigned or not key:
            continue
        for alias, name in prefixes:
            if key.startswith(alias):
                assign(index, name)
                break

    for index, key in enumerate(normalised):
        if index not in assigned and key:
            issues.append(Issue(
                None, "", "unknown_column",
                f"Column \"{_clean_cell(header[index])}\" isn't used.",
            ))
    return columns, issues


def _norm_header(value: str) -> str:
    """Lower-case, strip accents, drop everything that isn't a letter or digit."""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", ascii_only.lower())


def _clean_cell(value: str) -> str:
    """Trim, including non-breaking and zero-width spaces that Excel/Forms leave behind."""
    return value.replace(" ", " ").replace("​", "").replace("﻿", "").strip()


def _non_blank(record: list[str]) -> bool:
    return any(_clean_cell(c) for c in record)


def _join_limited(items: list[str]) -> str:
    shown = items[:_REPORT_ROW_LIMIT]
    text = ", ".join(shown)
    if len(items) > _REPORT_ROW_LIMIT:
        text += f", … (+{len(items) - _REPORT_ROW_LIMIT} more)"
    return text
