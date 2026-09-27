"""Understanding résumé links.

Students paste the same Google Drive file in many shapes (``/file/d/ID/view``,
``open?id=ID``, ``uc?id=ID``…). Everything here is pure string work: no
network, no database.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, urlsplit

from engine.errors import CandidateError, Reason

_DRIVE_HOSTS = frozenset({"drive.google.com", "docs.google.com", "drive.usercontent.google.com"})

# /file/d/ID/…, /file/u/0/d/ID/…  (drive.google.com and the older docs.google.com/file/d/ID)
_FILE_PATH = re.compile(r"^/file/(?:u/\d+/)?d/([A-Za-z0-9_-]+)")

# docs.google.com/<kind>/… — editors, not files.
_GOOGLE_EDITORS = ("document", "spreadsheets", "presentation", "forms", "drawings")

DRIVE_DOWNLOAD_URL = "https://drive.usercontent.google.com/download?id={id}&export=download"


@dataclass(frozen=True)
class DownloadPlan:
    """What the downloader should fetch for one résumé link."""

    url: str
    drive_id: str | None = None   # set when this is a Google Drive file


def plan_download(link: str) -> DownloadPlan:
    """Turn a résumé link into a direct download URL, or reject it.

    Raises :class:`CandidateError` (permanent) for links that can never be a
    PDF: Google Docs/Sheets/Slides, Drive folders, and anything that isn't an
    http(s) web address.
    """
    url = with_scheme(link)
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        parts.port  # noqa: B018 — raises ValueError for a malformed port
    except ValueError:
        raise CandidateError("permanent", Reason.INVALID_LINK) from None
    if parts.scheme.lower() not in ("http", "https") or not host or re.search(r"\s", host):
        raise CandidateError("permanent", Reason.INVALID_LINK)

    if host == "docs.google.com":
        first = parts.path.strip("/").split("/", 1)[0]
        if first in _GOOGLE_EDITORS:
            raise CandidateError("permanent", Reason.GOOGLE_DOC)
    if host == "drive.google.com" and (
        re.match(r"^/drive/(?:u/\d+/)?folders/", parts.path) or parts.path.startswith("/folderview")
    ):
        raise CandidateError("permanent", Reason.FOLDER)

    file_id = drive_file_id(url)
    if file_id:
        return DownloadPlan(DRIVE_DOWNLOAD_URL.format(id=file_id), drive_id=file_id)
    return DownloadPlan(url)


LinkKind = Literal["drive_file", "google_doc", "folder", "web", "invalid"]


def link_kind(link: str) -> LinkKind:
    """What kind of link this is, by the same rules the downloader uses.

    For the recruiter's "Needs attention" list: it says *what* was pasted
    without showing the link itself.
    """
    try:
        plan = plan_download(link)
    except CandidateError as exc:
        if exc.reason == Reason.GOOGLE_DOC:
            return "google_doc"
        if exc.reason == Reason.FOLDER:
            return "folder"
        return "invalid"
    return "drive_file" if plan.drive_id else "web"


def with_scheme(link: str) -> str:
    """``drive.google.com/file/…`` → ``https://drive.google.com/file/…``.

    Students often paste a link without ``https://``. Anything that already
    has a scheme (including ``ftp:`` or ``javascript:``) is returned as is so
    the caller can reject it.
    """
    link = link.strip()
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", link):
        return link
    if re.match(r"^(www\.)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(/|$)", link):
        return "https://" + link
    return link


def drive_file_id(link: str) -> str | None:
    """The Google Drive file id in ``link``, or ``None`` if it isn't a Drive file link."""
    parts = urlsplit(with_scheme(link))
    host = (parts.hostname or "").lower()
    if host not in _DRIVE_HOSTS:
        return None
    match = _FILE_PATH.match(parts.path)
    if match:
        return match.group(1)
    if parts.path in ("/open", "/uc", "/download"):
        ids = parse_qs(parts.query).get("id")
        if ids and re.fullmatch(r"[A-Za-z0-9_-]+", ids[0]):
            return ids[0]
    return None


def link_identity(link: str) -> str:
    """A key that is equal for two links pointing at the same file.

    Drive links compare by file id; anything else by host + path + query,
    ignoring case in the host and a trailing slash.
    """
    file_id = drive_file_id(link)
    if file_id:
        return f"drive:{file_id}"
    parts = urlsplit(with_scheme(link))
    host = (parts.hostname or "").lower()
    return f"{host}{parts.path.rstrip('/')}" + (f"?{parts.query}" if parts.query else "")
