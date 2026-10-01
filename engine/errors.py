"""Typed errors shared by every stage, and every sentence a recruiter reads.

The worker's first question about any exception is *whose problem is this?*
(ARCHITECTURE §8):

* :class:`CandidateError` — this candidate's file or link. The candidate is
  marked failed with ``kind`` and ``reason``.
* :class:`SystemUnavailable` — the machine: network down, Ollama down, disk
  full. The run pauses; no candidate is failed.
* :class:`TransientError` — can't tell yet (a timeout could be one slow host
  or no internet at all). The worker runs a health probe to decide.

Reasons are shown to the recruiter verbatim, so they live here, in one place,
written for a person: what happened and what to do next. Never a status code
or an exception name.
"""

from __future__ import annotations

from typing import Literal

FailureKind = Literal["permanent", "retryable"]
Probe = Literal["internet", "ollama"]


class Reason:
    """Candidate failure reasons (ARCHITECTURE §8)."""

    # Link / download — permanent
    PRIVATE = 'Link is private. Ask the student to set sharing to "Anyone with the link".'
    GOOGLE_DOC = "This is a Google Doc, not a PDF. Ask the student to upload a PDF."
    FOLDER = "This is a folder link. Ask the student for a link to the PDF itself."
    NOT_PDF = "The file isn't a PDF."
    TOO_LARGE = "The file is larger than 20 MB."
    NOT_FOUND = "The file no longer exists at this link."
    INVALID_LINK = "The résumé link isn't a valid web address."
    REFUSED = "The file host refused the download."                         # added: other 4xx
    # Link / download — retryable
    RATE_LIMITED = "Google Drive is limiting downloads. Retry later."
    TIMEOUT = "The download timed out."
    HOST_ERROR = "The file host returned an error."
    UNREACHABLE = "The website in this link couldn't be reached."          # added: DNS/refused on one host

    # Extraction — permanent
    DAMAGED = "The PDF is damaged or password-protected."
    NO_TEXT = "No readable text was found in the résumé."
    OCR_UNAVAILABLE = (                                                     # added: scanned PDF, no OCR
        "This résumé is a scanned image, and text recognition (OCR) isn't installed on this computer."
    )

    # Scoring — retryable
    MODEL_UNREADABLE = "The model's answer couldn't be read."
    MODEL_STOPPED = "The model stopped before finishing this résumé."      # added: mid-answer failure

    # Anything we didn't foresee (a bug) — retryable
    UNEXPECTED = "Something went wrong while processing this résumé."


class Pause:
    """Run pause reasons (ARCHITECTURE §6)."""

    NO_INTERNET = "No internet connection"
    CAPTIVE_PORTAL = "Connected to Wi-Fi that needs a sign-in page"
    OLLAMA_DOWN = "Ollama isn't running"
    DISK_FULL = "Disk is full"
    CLOSED = "Atlas was closed"
    BY_USER = "Paused by you"
    REPEATED_ERRORS = "Atlas hit repeated errors. See logs."

    @staticmethod
    def model_missing(model: str) -> str:
        return f'The model "{model}" is no longer installed in Ollama. Install it again, then press Resume.'


class Flag:
    """Notes attached to a scored candidate for the recruiter (``evaluations.flags``)."""

    PAGES_NOT_READ = "Résumé longer than 10 pages; pages 11+ not read"
    INJECTION = "Possible instructions to the AI found in résumé"
    UNSUPPORTED_HIGH_SCORE = "High score without supporting evidence"


class Pull:
    """Model download messages (Ollama ``/api/pull``)."""

    FAILED = "The model couldn't be downloaded. Check your internet connection and try again."

    @staticmethod
    def not_found(model: str) -> str:
        return f'There is no model called "{model}". Check the name at ollama.com/library.'


class Api:
    """What the local API says when a request can't be done (ARCHITECTURE §17)."""

    UNAUTHORIZED = "This request didn't come from the Atlas app."
    WRONG_HOST = "Atlas only accepts requests from this computer."
    NOT_FOUND = "That item doesn't exist any more. It may have been deleted."
    INVALID = "Something in the request isn't valid."
    INTERNAL = "Something went wrong inside Atlas. The details are in the log file."
    UPLOAD_TOO_LARGE = "This file is larger than 20 MB. Save just the student sheet as .xlsx or CSV and try again."
    UPLOAD_TYPE = "Choose a CSV or Excel (.xlsx) file."
    UPLOAD_EMPTY = "No file was received. Choose the file again."
    NO_UPLOAD = "Add the students' file first."
    UPLOAD_NOT_READY = "This file can't be used yet. Fix the problems listed, then add it again."
    ALREADY_CONFIRMED = "This screening already has its students."
    NOT_DRAFT = "Students can only be added before screening starts."
    NO_CANDIDATES = "Add the students' file before starting."
    NOT_SCORED = "Only screened candidates can be moved between buckets."
    CANT_PAUSE = "Only a running screening can be paused."
    CANT_RESUME = "This screening can't be resumed."
    CANT_CANCEL = "A finished screening can't be cancelled."
    RUN_ACTIVE = "Pause or cancel this screening before deleting it."
    ANY_RUN_ACTIVE = "A screening is running. Pause or cancel it first."
    PRECHECK_BUSY = "Another model is being tested. Try again when it finishes."
    EXPORT_PATH = "Choose where to save the file again."
    CUTOFF_ORDER = "The cutoff band must start at or below the shortlist score."


# Only these resume on their own, when the health probe succeeds again.
AUTO_RESUME_REASONS = frozenset({Pause.NO_INTERNET, Pause.CAPTIVE_PORTAL, Pause.OLLAMA_DOWN})
# Pauses that clear when the internet probe passes again.
INTERNET_PAUSES = frozenset({Pause.NO_INTERNET, Pause.CAPTIVE_PORTAL})


class AtlasError(Exception):
    """Base class for every error a stage raises on purpose."""


class CandidateError(AtlasError):
    """A problem with this candidate's file or link."""

    def __init__(self, kind: FailureKind, reason: str) -> None:
        if kind not in ("permanent", "retryable"):
            raise ValueError(f"Unknown failure kind {kind!r}")
        super().__init__(reason)
        self.kind: FailureKind = kind
        self.reason = reason


class SystemUnavailable(AtlasError):
    """A problem with the machine. The run pauses with ``reason``."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class PullError(AtlasError):
    """Ollama couldn't download a model. ``message`` is for the recruiter."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class TransientError(AtlasError):
    """Ambiguous failure; the worker probes ``probe`` to decide whose it is.

    If the probe fails it's a :class:`SystemUnavailable`. If the probe
    succeeds, only this candidate is affected and it fails as ``retryable``
    with ``reason``. ``detail`` is for the log only.
    """

    def __init__(self, probe: Probe, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.probe: Probe = probe
        self.reason = reason
        self.detail = detail
