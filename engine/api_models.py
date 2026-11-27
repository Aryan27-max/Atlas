"""Request and response shapes of the local API (``engine/server.py``).

They are the contract with the app: FastAPI turns them into the OpenAPI
schema (``app/src/shared/api-schema.json``), and the app's TypeScript types
are generated from that. Requests forbid unknown fields, so a typo in the app
fails loudly instead of being ignored.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- #
# Errors, health, system
# --------------------------------------------------------------------------- #


class ErrorOut(BaseModel):
    code: str
    message: str


class HealthOut(BaseModel):
    status: Literal["ok"]
    version: str


class OllamaStatusOut(BaseModel):
    running: bool
    url: str
    version: str | None
    installed: bool = True       # found on this computer (or running, however it was installed)


class HardwareOut(BaseModel):
    cpu: str
    cores: int
    ram_gb: float | None
    os: str
    arch: str
    apple_silicon: bool
    gpu_in_use: bool | None      # None: unknown until Ollama has a model loaded
    vram_gb: float | None
    kind: Literal["cpu", "apple_silicon", "gpu"]


class OllamaStartOut(BaseModel):
    started: bool
    message: str


class SystemOut(BaseModel):
    engine_version: str
    data_dir: str
    logs_dir: str
    storage_bytes: int
    platform: str
    cpu_count: int
    ollama: OllamaStatusOut
    models_installed: int
    hardware: HardwareOut | None = None


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #

PrecheckStatus = Literal["ready", "not_checked", "cant_use"]


class PrecheckStatusOut(BaseModel):
    status: PrecheckStatus
    message: str
    seconds: float | None
    checked: str | None
    slow: bool = False      # ready, but slow on this computer (message says how slow)


class ModelOut(BaseModel):
    name: str
    size_bytes: int
    digest: str
    precheck: PrecheckStatusOut


class ModelsOut(BaseModel):
    ollama_running: bool
    models: list[ModelOut]
    suggestions: list[str]


class PrecheckOut(BaseModel):
    ok: bool
    status: PrecheckStatus
    message: str
    seconds: float
    slow: bool = False


class PullStartOut(BaseModel):
    name: str
    status: Literal["started", "already_running"]


# --------------------------------------------------------------------------- #
# Runs
# --------------------------------------------------------------------------- #

RunStatus = Literal["draft", "running", "paused", "completed", "cancelled"]


class CountsOut(BaseModel):
    queued: int
    downloading: int
    downloaded: int
    extracted: int
    scoring: int
    scored: int
    failed: int
    filtered: int


class RunOut(BaseModel):
    id: int
    name: str
    status: RunStatus
    pause_reason: str | None
    auto_resume: bool
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None
    model_name: str | None
    criteria_prompt: str
    shortlist_cutoff: int
    maybe_cutoff: int
    min_shortlist: int
    cgpa_min: float | None
    departments_allowed: list[str] | None
    csv_filename: str | None
    counts: CountsOut
    total: int
    done: int
    has_upload: bool


class RunCreateIn(Request):
    name: str = Field(min_length=1, max_length=120)


class RunPatchIn(Request):
    """Configure a draft run. Only the fields sent are changed; send
    ``cgpa_min: null`` or ``departments_allowed: null`` to clear a filter."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    model_name: str | None = None
    criteria_prompt: str | None = Field(default=None, max_length=8000)
    shortlist_cutoff: int | None = Field(default=None, ge=0, le=100)
    maybe_cutoff: int | None = Field(default=None, ge=0, le=100)
    min_shortlist: int | None = Field(default=None, ge=0, le=100000)
    cgpa_min: float | None = Field(default=None, ge=0, le=10)
    departments_allowed: list[str] | None = None


class CutoffsIn(Request):
    shortlist_cutoff: int = Field(ge=0, le=100)
    maybe_cutoff: int = Field(ge=0, le=100)
    min_shortlist: int = Field(ge=0, le=100000)


class DeletedOut(BaseModel):
    deleted: bool


# --------------------------------------------------------------------------- #
# Upload and pre-flight
# --------------------------------------------------------------------------- #


class IssueOut(BaseModel):
    row: int | None
    ra_number: str
    code: str
    message: str


class IssueGroupOut(BaseModel):
    code: str
    label: str
    severity: Literal["error", "warning"]
    skipped: bool                  # rows in this group are left out of the run
    count: int
    rows: list[int]
    ra_numbers: list[str]


class PreflightSummaryOut(BaseModel):
    rows_read: int
    ready: int
    skipped: int
    warnings: int


class DepartmentCountOut(BaseModel):
    name: str
    count: int


class PreflightOut(BaseModel):
    source: str
    ok: bool
    summary: PreflightSummaryOut
    file_errors: list[IssueOut]
    notes: list[IssueOut]           # file-level warnings (unused columns, no name column…)
    groups: list[IssueGroupOut]
    columns: dict[str, str]         # field → header used
    departments: list[DepartmentCountOut]


class ConfirmOut(BaseModel):
    added: int


class InputColumnOut(BaseModel):
    label: str
    required: bool
    help: str
    also_accepted: list[str]


class InputFormatOut(BaseModel):
    """What a student list must contain: the "Input fields" box."""
    file_types: list[str]
    columns: list[InputColumnOut]


class DepartmentMatchOut(BaseModel):
    """A department the recruiter typed, as the file spells it; ``name: null`` (with ``message``) when no student has it."""
    name: str | None
    count: int
    message: str | None = None


class FilterPreviewOut(BaseModel):
    total: int
    removed: int
    removed_by_cgpa: int
    removed_by_department: int
    remaining: int


# --------------------------------------------------------------------------- #
# Lifecycle, estimate, progress
# --------------------------------------------------------------------------- #


class EstimateBodyOut(BaseModel):
    low_seconds: int
    high_seconds: int
    basis: Literal["precheck", "history", "measured", "hardware"]
    per_resume_seconds: float
    label: str


class EstimateOut(BaseModel):
    remaining: int
    estimate: EstimateBodyOut | None
    long_run: bool = False       # over 4 hours and the recruiter wants to be warned


class RetryIn(Request):
    include_permanent: bool = False


class RetryOut(BaseModel):
    retried: int


class ClearFiltersOut(BaseModel):
    cleared: int


class StagesOut(BaseModel):
    waiting: int
    downloading: int
    reading: int
    scoring: int
    done: int
    needs_attention: int


class ActivityOut(BaseModel):
    stage: Literal["downloading", "reading", "scoring"]
    candidate_id: int
    ra_number: str


class FailureGroupOut(BaseModel):
    reason: str
    kind: Literal["permanent", "retryable"]
    count: int


class ProgressOut(BaseModel):
    run_id: int
    name: str
    status: RunStatus
    pause_reason: str | None
    auto_resume: bool
    total: int
    done: int
    counts: CountsOut
    stages: StagesOut
    activity: list[ActivityOut]
    failures: list[FailureGroupOut]
    estimate: EstimateBodyOut | None
    last_event_id: int


# --------------------------------------------------------------------------- #
# Results and candidates
# --------------------------------------------------------------------------- #

RowBucket = Literal["shortlisted", "cutoff", "rejected", "failed", "filtered", "not_scored"]
Bucket = Literal["shortlisted", "cutoff", "rejected"]
LinkKind = Literal["drive_file", "google_doc", "folder", "web", "invalid"]


class CutoffsOut(BaseModel):
    shortlist: int
    band: int
    min: int


class BucketCountsOut(BaseModel):
    shortlisted: int
    cutoff: int
    rejected: int
    failed: int
    filtered: int
    not_scored: int


class BucketDeltaOut(BaseModel):
    shortlisted: int
    cutoff: int
    rejected: int


SortColumn = Literal["rank", "name", "department", "cgpa", "score"]
SortOrder = Literal["asc", "desc"]


class ResultRowOut(BaseModel):
    candidate_id: int
    rank: int | None
    ra_number: str
    name: str
    department: str
    cgpa: float | None
    score: int | None
    bucket: RowBucket
    auto_bucket: Bucket | None
    how_placed: Literal["score", "fill", "override"] | None
    tie: bool
    flags: int
    failure_kind: Literal["permanent", "retryable"] | None
    failure_reason: str | None
    filter_reason: str | None
    link_kind: LinkKind


class ResultsOut(BaseModel):
    run_id: int
    status: RunStatus
    cutoffs: CutoffsOut
    saved_cutoffs: CutoffsOut
    counts: BucketCountsOut
    delta: BucketDeltaOut              # these cutoffs vs the saved ones
    notes: list[str]
    histogram: list[int]               # 10 bands: 0–9 … 90–100
    filled_to_minimum: int
    tie_extra: int
    shortfall: int
    failure_groups: list[FailureGroupOut]
    bucket: str
    sort: SortColumn                   # what the rows are sorted by (3.4: the header shows it)
    order: SortOrder
    total: int                         # rows in this bucket after search
    offset: int
    limit: int
    rows: list[ResultRowOut]


class EvidenceOut(BaseModel):
    claim: str
    quote: str


class EvaluationOut(BaseModel):
    overall_score: int
    sub_scores: dict[str, int]
    summary: str
    reasons: list[str]
    evidence: list[EvidenceOut]
    claim_mismatches: list[str]
    flags: list[str]
    model_name: str
    duration_seconds: float | None


class PlacementOut(BaseModel):
    rank: int
    bucket: Bucket
    auto_bucket: Bucket
    how_placed: Literal["score", "fill", "override"]
    tie: bool


class ResumeMetaOut(BaseModel):
    pages: int
    ocr_used: bool
    characters: int


class OverrideOut(BaseModel):
    from_bucket: str
    to_bucket: str
    note: str
    created_at: str


class EventOut(BaseModel):
    id: int
    run_id: int | None
    candidate_id: int | None
    level: Literal["info", "warning", "error"]
    message: str
    created_at: str


class CandidateInfoOut(BaseModel):
    id: int
    run_id: int
    ra_number: str
    name: str
    email: str
    phone: str
    section: str
    department: str
    cgpa: float | None
    skills: str
    hackathons: str
    state: str
    failure_kind: Literal["permanent", "retryable"] | None
    failure_reason: str | None
    filter_reason: str | None
    link_kind: LinkKind
    attempts: int


class CandidateOut(BaseModel):
    candidate: CandidateInfoOut
    evaluation: EvaluationOut | None
    placement: PlacementOut | None
    resume: ResumeMetaOut | None
    overrides: list[OverrideOut]
    events: list[EventOut]


class OverrideIn(Request):
    to_bucket: Bucket
    note: str = Field(default="", max_length=500)


class ExportIn(Request):
    view: Literal["all", "shortlisted", "cutoff", "rejected", "failed"]
    path: str = Field(min_length=1, max_length=4096)


class ExportOut(BaseModel):
    written: int
    path: str


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


class SettingsOut(BaseModel):
    appearance: Literal["system", "light", "dark"]
    default_shortlist: int
    default_band: int
    default_min: int
    default_model: str | None
    keep_awake: bool
    notify_done: bool
    warn_long_runs: bool = True


class SettingsIn(Request):
    appearance: Literal["system", "light", "dark"] | None = None
    default_shortlist: int | None = Field(default=None, ge=0, le=100)
    default_band: int | None = Field(default=None, ge=0, le=100)
    default_min: int | None = Field(default=None, ge=0, le=100000)
    default_model: str | None = None
    keep_awake: bool | None = None
    notify_done: bool | None = None
    warn_long_runs: bool | None = None


class StoppingOut(BaseModel):
    status: Literal["stopping"]
