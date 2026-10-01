# Graph Report - atlas  (2026-10-01)

## Corpus Check
- 175 files · ~419,626 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: .css 8, (none) 4)

## Summary
- 2738 nodes · 7224 edges · 147 communities (91 shown, 56 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 550 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0f3a1adc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.py
- EndToEndTest
- export_csv
- test_downloader.py
- PdfExtractor
- .worker
- test_api_support.py
- .transaction
- design/index.ts
- .downloader
- test_llm.py
- api_models.py
- run_waiting_to_resume
- Results.tsx
- compute_buckets
- create_app
- Settings.tsx
- csv_loader.py
- Worker
- Button
- api-types.ts
- e2e_stubs.py
- HealthProbe
- CandidateSheet.tsx
- ServerTestCase
- OllamaClient
- RunTests
- .csv
- ipc.ts
- FakeClient
- _Cli
- load_csv
- Adjust Cutoffs Popover (light)
- Progress Screen (Paused, light)
- test_db.py
- helpers.ts
- bridge.ts
- Settings screen - Data section (light)
- package.json
- main/index.ts
- load_table
- feedback.tsx
- EngineProcess
- Engine
- Database
- main
- Extraction
- devDependencies
- Progress.tsx
- .recover
- test_csv_loader.py
- contrast.test.ts
- RunWatcher
- compilerOptions
- compilerOptions
- Results: Needs Attention View (light)
- compilerOptions
- split_sections
- stubs.ts
- gen-api-types.mjs
- StubServerTests
- compilerOptions
- Path
- Step 2.0 — Deferred work recorded, engine gaps filled
- make_pdf
- PdfTests
- ApiError
- Phase 1 Summary - the Atlas engine
- drive_stub.py
- flows.spec.ts
- ModelPicker.tsx
- .estimate
- Renderer index.html (strict CSP, #root mount)
- Phase 2 Summary - the Atlas desktop app
- .__init__
- Progress
- DriveStub
- ref_node_path
- sse.ts
- Any
- ._handler
- HealthTests
- scripts
- ScoreBand
- Pre-check sample résumé (fictional Meera Nair)
- CLAUDE.md — Atlas
- OllamaStub
- EasyOcrEngine
- _delete
- Phase 1: Build the Atlas engine end to end
- Step 2.2 — The Electron shell (app/main, app/preload)
- CompletedRunCutoffTests
- Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)
- _FormScanner
- control_server
- DatabaseError
- .prettierrc.json
- Atlas — Architecture
- 2. Steps
- OcrUnavailable
- Step 2.6 — Screen: Progress
- LaunchTests
- Live sample résumé: strong backend (Rohan Pillai)
- Get Another Model Dialog (light)
- MigrationTests
- Step 2.8 — Screen: Settings
- Step 2.9 — End-to-end flows, keyboard, performance
- assets.d.ts
- tsconfig.json
- Stubs
- electron.vite.config.ts
- PlacementLike
- .accept_upload
- exploding_writer

## God Nodes (most connected - your core abstractions)
1. `Database` - 114 edges
2. `Worker` - 85 edges
3. `Engine` - 77 edges
4. `create_app()` - 68 edges
5. `OllamaClient` - 56 edges
6. `Button` - 55 edges
7. `load_csv()` - 47 edges
8. `Reason` - 45 edges
9. `Scorer` - 43 edges
10. `Progress` - 42 edges

## Surprising Connections (you probably didn't know these)
- `ScrubPII` --semantically_similar_to--> `header and personal sections never sent to the model`  [INFERRED] [semantically similar]
  engine/logs.py → docs/summaries/phase1/step-1.5-extraction.md
- `Hard rules (never break these)` --references--> `bucket()`  [INFERRED]
  CLAUDE.md → app/e2e/results.spec.ts
- `Settings()` --references--> `nav.forget (Back never returns to deleted run)`  [INFERRED]
  app/renderer/screens/Settings.tsx → docs/summaries/phase2/step-2.8-settings.md
- `Progress` --references--> `info()`  [INFERRED]
  PLAN.md → app/src/shared/bridge.ts
- `0. Read first, in this order` --references--> `Database`  [INFERRED]
  prompts/phase1.md → engine/db.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Candidate pipeline: CSV row to exported line** — engine_ingest_csv_loader_load_csv, engine_db_database_claim_next_download, engine_ingest_downloader_downloader, engine_extract_pdf_pdfextractor, engine_extract_sections_split_sections, engine_db_database_commit_extraction, engine_llm_redact_scoring_input, engine_llm_prompt_build_prompt, engine_llm_scorer_scorer, engine_llm_verify_review, engine_db_database_save_evaluation, engine_buckets_compute_buckets, engine_export_export_csv [EXTRACTED 1.00]
- **Failure classification: fail candidate vs pause run** — engine_errors_candidateerror, engine_errors_systemunavailable, engine_errors_transienterror, engine_health_healthprobe, engine_worker_worker, engine_db_database_mark_failed [EXTRACTED 1.00]
- **Setup flow: Welcome -> Students & model -> Criteria -> Cutoffs -> Review** — app_renderer_screens_welcome, app_renderer_screens_setup_uploadmodel_uploadmodel, app_renderer_screens_setup_preflight_preflight, app_renderer_screens_setup_modelpicker_modelpicker, app_renderer_screens_setup_criteria, app_renderer_screens_setup_cutoffs_cutoffs, app_renderer_screens_setup_review_review [EXTRACTED 1.00]
- **Time estimate lifecycle (pre-check estimate then measured)** — docs_summaries_phase2_screens_review_light_time_estimate_card, docs_summaries_phase2_screens_progress_paused_light_measured_estimate_badge, docs_summaries_phase2_screens_progress_paused_light_progress_ring [INFERRED 0.75]
- **UI signals of the local-only promise** — atlas_local_only_data_promise, docs_summaries_phase2_screens_welcome_light_this_computer_card, docs_summaries_phase2_screens_settings_data_light_atlas_data_folder, docs_summaries_phase2_screens_upload_empty_light_local_model_picker [INFERRED 0.85]
- **New screening flow: Welcome > Students & model (empty > loaded) > Criteria/Cutoffs/Review** — docs_summaries_phase2_screens_welcome_light_new_screening_button, docs_summaries_phase2_screens_upload_empty_light_students_model_empty_screen, docs_summaries_phase2_screens_upload_model_light_students_model_loaded_screen, docs_summaries_phase2_screens_upload_empty_light_setup_stepper [INFERRED 0.85]
- **Run lifecycle screens: model pick, running progress, completion, needs-attention triage, export** — docs_summaries_phase2_screens_model_pull_light_get_another_model_dialog, docs_summaries_phase2_screens_progress_light_progress_screen, docs_summaries_phase2_screens_progress_done_light_screening_complete_screen, docs_summaries_phase2_screens_needs_attention_light_needs_attention_view, docs_summaries_phase2_screens_export_light_export_results_dialog [INFERRED 0.85]
- **Identity protection layers (rule 9)** — engine_llm_redact_candidatecontext, engine_llm_redact_scoring_input, docs_summaries_phase1_step_1_5_extraction_header_personal_never_sent, engine_logs_scrubpii, docs_summaries_phase2_summary_deferred_1_11a_identity_redaction [INFERRED 0.85]
- **Bundled fictional résumés used for pre-check and live-model tests** — engine_llm_sample_resume_sample_resume, engine_tests_samples_data_science_sample, engine_tests_samples_strong_backend_sample, engine_tests_samples_weak_generic_sample [INFERRED 0.85]
- **Cutoff-driven bucket presentation (set, preview, explain)** — docs_summaries_phase2_screens_cutoffs_light_score_band_slider, docs_summaries_phase2_screens_cutoffs_light_minimum_shortlist_fill, docs_summaries_phase2_screens_adjust_cutoffs_light_cutoff_preview, docs_summaries_phase2_screens_adjust_cutoffs_light_results_sidebar, docs_summaries_phase2_screens_candidate_light_bucket_reason_badge [INFERRED 0.85]
- **Score explainability in candidate sheet** — docs_summaries_phase2_screens_candidate_light_score_breakdown, docs_summaries_phase2_screens_candidate_light_resume_evidence, docs_summaries_phase2_screens_candidate_light_claim_verification [INFERRED 0.85]
- **Recruiter-readable failure messaging across screens** — docs_summaries_phase2_screens_needs_attention_light_failures_grouped_by_reason, docs_summaries_phase2_screens_progress_done_light_pause_resume_history, docs_summaries_phase2_screens_engine_failed_light_restart_atlas_action, docs_summaries_phase2_screens_needs_attention_light_retry_controls [INFERRED 0.85]
- **Renderer-to-engine request security path** — app_preload_index, app_main_validate_validateapirequest, engine_server_guard, docs_summaries_phase2_step_2_1_server_token_in_environment, app_main_security_hardensession, docs_summaries_phase2_step_2_1_server_dns_rebinding_host_check [INFERRED 0.85]
- **Close, restart and auto-resume without losing work** — engine_worker_worker_recover, engine_worker_worker_attach, engine_worker_run_waiting_to_resume, engine_server_engine, docs_summaries_phase2_step_2_1_server_shutdown_waits_8s, docs_summaries_phase2_step_2_1_server_watch_stdin, docs_summaries_phase2_step_2_2_electron_shell_close_confirmation [INFERRED 0.85]
- **Resumable-run promise communicated to the recruiter** — docs_summaries_phase2_screens_progress_paused_light_system_pause_banner, docs_summaries_phase2_screens_progress_paused_light_activity_log, docs_summaries_phase2_screens_review_light_resume_keep_awake_notes, docs_summaries_phase2_screens_settings_light_keep_awake_toggle [INFERRED 0.85]
- **View-time bucketing surfaced in the UI (cutoffs, min fill, ties, bucket counts)** — docs_summaries_phase2_screens_settings_light_score_bands_slider, docs_summaries_phase2_screens_settings_light_min_shortlist_setting, docs_summaries_phase2_screens_results_light_bucket_sidebar, docs_summaries_phase2_screens_results_light_filled_to_minimum_badge, docs_summaries_phase2_screens_results_large_display_light_tie_badge, docs_summaries_phase2_screens_results_light_min_fill_banner [INFERRED 0.85]
- **Every screen captured in light and dark theme** — atlas_light_dark_theming, docs_summaries_phase2_screens_settings_data_dark_settings_data_screen, docs_summaries_phase2_screens_upload_empty_dark_students_model_empty_screen, docs_summaries_phase2_screens_upload_model_dark_students_model_loaded_screen, docs_summaries_phase2_screens_welcome_dark_welcome_screen, docs_summaries_phase2_screens_welcome_resume_dark_welcome_resume_screen [INFERRED 0.95]

## Communities (147 total, 56 thin omitted)

### Community 0 - "server.py"
Cohesion: 0.06
Nodes (4): remember(), _filler(), make_ten_page_resume(), ten_page_resume_pages()

### Community 1 - "EndToEndTest"
Cohesion: 0.18
Nodes (3): Confirm, Oversized, EndToEndTest

### Community 2 - "export_csv"
Cohesion: 0.14
Nodes (9): _escape(), export_csv(), AtomicWriteTests, DatabaseRowsTests, ExportTestCase, FormatTests, placements(), row() (+1 more)

### Community 3 - "test_downloader.py"
Cohesion: 0.06
Nodes (16): Step 1.4 - Downloading résumés, CandidateError, Reason, _connection_error(), Downloaded, Downloader, _fsync_dir(), is_disk_full() (+8 more)

### Community 4 - "PdfExtractor"
Cohesion: 0.12
Nodes (6): QWENTUS (legacy CLI), Section extraction instead of truncation, clean_text(), OcrEngine, PdfExtractor, CleanTextTests

### Community 6 - ".worker"
Cohesion: 0.14
Nodes (10): CandidateFailureTests, FilterTests, HappyPathTests, sample(), Once, StopAndRecoveryTests, SystemProblemTests, maybe_down() (+2 more)

### Community 7 - "test_api_support.py"
Cohesion: 0.16
Nodes (7): department_counts(), department_key(), filter_reason(), FilterPreview, preview(), FilterTests, LinkKindTests

### Community 9 - ".transaction"
Cohesion: 0.08
Nodes (9): 5. Candidate state machine, 7. The worker pipeline, Hard rules (never break these), Step 1.7 - The resumable job loop, InvalidTransitionError, NotFoundError, _now(), ValidationError (+1 more)

### Community 10 - "design/index.ts"
Cohesion: 0.06
Nodes (53): ChipProps, Handle, HANDLE_LABEL, ScoreBandProps, Linked(), ButtonProps, ButtonSize, ButtonVariant (+45 more)

### Community 11 - ".downloader"
Cohesion: 0.08
Nodes (17): confirm_page(), do_GET(), _head(), _send(), _serve(), DiskAndThrottleTests, DownloaderTestCase, FakeClock (+9 more)

### Community 12 - "test_llm.py"
Cohesion: 0.05
Nodes (33): Step 1.6 - LLM scoring, Flag, ChatDeadline, ChatResult, _allocate(), build_prompt(), _claims_lines(), _context_lines() (+25 more)

### Community 13 - "api_models.py"
Cohesion: 0.06
Nodes (54): ActivityOut, BucketCountsOut, BucketDeltaOut, CandidateInfoOut, CandidateOut, ClearFiltersOut, ConfirmOut, CountsOut (+46 more)

### Community 14 - "run_waiting_to_resume"
Cohesion: 0.08
Nodes (8): AttachTests, CancelTests, FiltersTests, LifecycleTestCase, OneRunAtATimeTests, RecoverTests, TimingHistoryTests, run_waiting_to_resume()

### Community 15 - "Results.tsx"
Cohesion: 0.09
Nodes (31): EmptyState(), ScorePill(), Card(), Finished(), CandidateSheet(), CutoffPopover(), CutoffPopoverProps, describeDelta() (+23 more)

### Community 16 - "compute_buckets"
Cohesion: 0.20
Nodes (5): compute_buckets(), Placement, buckets_of(), BucketTests, rows()

### Community 17 - "create_app"
Cohesion: 0.07
Nodes (49): create_app(), _api_error(), app_events(), _busy(), data_delete(), _db(), _db_invalid(), eng() (+41 more)

### Community 18 - "Settings.tsx"
Cohesion: 0.09
Nodes (32): Harness(), Segments(), SheetHarness(), SegmentedControl(), Toggle(), Badge(), ProgressBar(), useToast() (+24 more)

### Community 19 - "csv_loader.py"
Cohesion: 0.08
Nodes (25): _build_report(), _cell_text(), _clean_cell(), _decode(), _fail(), _find_header(), _format_decimals(), Issue (+17 more)

### Community 21 - "Button"
Cohesion: 0.12
Nodes (44): api(), ApiFailure, ApiResponse, buildPath(), CallOptions, messageOf(), Part, Chip() (+36 more)

### Community 22 - "api-types.ts"
Cohesion: 0.05
Nodes (37): ActivityOut, CandidateInfoOut, ClearFiltersOut, ConfirmOut, CountsOut, CutoffsIn, DeletedOut, DepartmentCountOut (+29 more)

### Community 23 - "e2e_stubs.py"
Cohesion: 0.17
Nodes (9): Deterministic fictional fixtures (25 students), build(), main(), student(), simple_resume_text(), SignIn, Status, grade() (+1 more)

### Community 24 - "HealthProbe"
Cohesion: 0.05
Nodes (13): HealthProbe, _OllamaHealth, configure_logging(), remove_logging(), scrub(), ScrubPII, build_parser(), EngineOptions (+5 more)

### Community 25 - "CandidateSheet.tsx"
Cohesion: 0.19
Nodes (12): formatBytes(), formatDuration(), formatPerResume(), formatRange(), greeting(), BucketName, BUCKETS, Detail() (+4 more)

### Community 26 - "ServerTestCase"
Cohesion: 0.06
Nodes (16): Step 2.1 — The local API (engine/server.py), Host header check against DNS rebinding, Api, Guard, parse_multipart_file(), _send_json(), AuthTests, BootTests (+8 more)

### Community 27 - "OllamaClient"
Cohesion: 0.06
Nodes (15): 8. Failure classification, AtlasError, Pause, Pull, PullError, SystemUnavailable, TransientError, ChatPrompt (+7 more)

### Community 31 - "ipc.ts"
Cohesion: 0.15
Nodes (31): registerIpc(), handle(), TOO_LARGE, CheckedRequest, compile(), copy(), InvalidArgument, isPlainJson() (+23 more)

### Community 32 - "FakeClient"
Cohesion: 0.09
Nodes (10): parse_evaluation(), answer(), ClientTests, FakeClient, FakeHttp, FakeHttpResponse, prepared(), SchemaTests (+2 more)

### Community 33 - "_Cli"
Cohesion: 0.24
Nodes (3): _Cli, _read_criteria(), _wait()

### Community 34 - "load_csv"
Cohesion: 0.18
Nodes (4): load_csv(), drive(), EncodingAndDelimiterTests, HeaderTests

### Community 35 - "Adjust Cutoffs Popover (light)"
Cohesion: 0.08
Nodes (28): Adjust Cutoffs Popover (dark), Cutoff Preview Before Save, Results Sidebar (bucket counts), Adjust Cutoffs Popover (light), Candidate Detail Sheet (dark), Bucket Reason Badge (By score / Filled to minimum), Form Claims Not Found in Résumé, Evidence Quotes from Résumé (+20 more)

### Community 36 - "Progress Screen (Paused, light)"
Cohesion: 0.09
Nodes (31): Progress Screen (Paused, dark), Activity Log (run events timeline), Measured Estimate Badge, Progress Screen (Paused, light), Progress Ring (9 of 25 students), Stage Count Tiles (Waiting / Downloading / Reading / Scoring / Done / Needs attention), System Pause Banner (Ollama isn't running - Nothing is lost), Results Screen (dark) (+23 more)

### Community 38 - "test_db.py"
Cohesion: 0.10
Nodes (8): CandidateInputTests, DbTestCase, OverrideAndSettingsTests, RecoveryTests, _rows(), ScoringDurationTests, StateMachineTests, claim()

### Community 39 - "helpers.ts"
Cohesion: 0.24
Nodes (14): SetupOptions, startScreening(), waitForStatus(), APP_DIR, close(), Launched, bucket(), capture() (+6 more)

### Community 40 - "bridge.ts"
Cohesion: 0.07
Nodes (17): IpcContext, atlas, listeners, on(), Window, ExportOut, ApiErrorBody, AppInfo (+9 more)

### Community 41 - "Settings screen - Data section (light)"
Cohesion: 0.11
Nodes (28): Light/dark theme following the OS, Everything stays on this computer (local-only data), Settings screen - Data section (dark), Always shortlist at least (minimum fill stepper), Atlas data folder (single local folder, storage used, Show in folder), Delete all data (destructive red action), Keep the computer awake while screening, Notify me (finish / needs attention) (+20 more)

### Community 42 - "package.json"
Cohesion: 0.12
Nodes (16): description, main, name, private, productName, version, electron-builder, eslint (+8 more)

### Community 43 - "main/index.ts"
Cohesion: 0.12
Nodes (25): buildMenu(), confirmAndQuit(), createWindow(), engine, isAppUrl(), navigate(), overlayColors(), rendererUrl() (+17 more)

### Community 44 - "load_table"
Cohesion: 0.17
Nodes (5): load_table(), CsvStillWorksTests, TableTestCase, XlsTests, XlsxTests

### Community 45 - "feedback.tsx"
Cohesion: 0.13
Nodes (15): BadgeTone, BANNER_ICON, BannerAction, BannerProps, BannerTone, BUCKET_LABEL, EmptyStateProps, PillBucket (+7 more)

### Community 46 - "EngineProcess"
Cohesion: 0.17
Nodes (3): EngineProcess, ApiResult, EngineState

### Community 47 - "Engine"
Cohesion: 0.10
Nodes (3): Engine, _events_after(), _run_event_stream()

### Community 48 - "Database"
Cohesion: 0.09
Nodes (4): 17. Local API, Database, _dict(), SchemaTests

### Community 49 - "main"
Cohesion: 0.13
Nodes (3): build_parser(), main(), _Parser

### Community 50 - "Extraction"
Cohesion: 0.10
Nodes (11): Extraction, ScoreResult, FakeDownloader, FakeExtractor, FakeHealth, FakeScorer, _files_in(), ManualClock (+3 more)

### Community 51 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, electron, electron-builder, electron-vite, eslint, @fontsource-variable/inter, jsdom, lucide-react (+15 more)

### Community 52 - "Progress.tsx"
Cohesion: 0.09
Nodes (31): App(), queries, Screens(), Shell(), useEngineState(), useHashRoute(), usePlatform(), ProgressRing() (+23 more)

### Community 53 - ".recover"
Cohesion: 0.17
Nodes (4): 6. Run state machine, Headless CLI (Built, Phase 1), RecoveryReport, WorkerBusyError

### Community 54 - "test_csv_loader.py"
Cohesion: 0.13
Nodes (10): _join_limited(), normalise_cgpa(), normalise_phone(), render_report(), ContractTests, CsvTestCase, FileLevelTests, NormalisationTests (+2 more)

### Community 55 - "contrast.test.ts"
Cohesion: 0.12
Nodes (16): BACKGROUNDS, contrast(), css, DARK_MEDIA, luminance(), over(), parse(), resolve() (+8 more)

### Community 56 - "RunWatcher"
Cohesion: 0.18
Nodes (9): notificationFor(), Preferences, QUIET_REASONS, RunStatus, RunWatcher, RunWatcherDeps, start(), stop() (+1 more)

### Community 57 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+12 more)

### Community 58 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit (+11 more)

### Community 59 - "Results: Needs Attention View (light)"
Cohesion: 0.15
Nodes (20): Engine Failed Screen (dark), Engine Failed Screen (light), Restart Atlas Action (engine not found, reinstall guidance), Export Results Dialog (dark), Export Scope Selector (All / Shortlisted / Cutoff / Rejected / Needs attention), Export Results Dialog (light), Results: Needs Attention View (dark), Failures Grouped by Recruiter-Readable Reason (+12 more)

### Community 60 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution (+10 more)

### Community 61 - "split_sections"
Cohesion: 0.05
Nodes (19): _lookup(), _match(), match_heading(), _norm(), split_sections(), precheck(), result(), PrecheckResult (+11 more)

### Community 62 - "stubs.ts"
Cohesion: 0.26
Nodes (8): check(), everyScreen(), Layout, launch(), Window, PYTHON, REPO, tempDir()

### Community 63 - "gen-api-types.mjs"
Cohesion: 0.24
Nodes (15): bodyType(), byKey(), field(), generate(), here, inlineObject(), namedType(), OUT_PATH (+7 more)

### Community 64 - "StubServerTests"
Cohesion: 0.23
Nodes (5): Drip, Pdf, RateLimited, Truncated, StubServerTests

### Community 66 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+8 more)

### Community 67 - "Path"
Cohesion: 0.13
Nodes (6): 11. Downloading résumés, _clear_logs(), _empty_folder(), _folder_size(), _safe_filename(), _unlink()

### Community 68 - "Step 2.0 — Deferred work recorded, engine gaps filled"
Cohesion: 0.13
Nodes (6): Step 2.0 — Deferred work recorded, engine gaps filled, PLAN Deferred (must finish before real use) — 1.11a redaction blocking, EWMA moving average of scoring times, Magic bytes vs file extensions, Estimate, ewma()

### Community 69 - "make_pdf"
Cohesion: 0.24
Nodes (3): make_pdf(), FakeOcr, OcrFallbackTests

### Community 72 - "Phase 1 Summary - the Atlas engine"
Cohesion: 0.26
Nodes (10): 16. Export, Atlas CHANGELOG, Step 1.0 - Baseline on Windows, Step 1.10 - Stub servers and end-to-end tests, Step 1.3 - CSV loading and the pre-flight report, Step 1.5 - Text and section extraction, Step 1.8 - CSV export, Step 1.9 - The headless CLI (+2 more)

### Community 74 - "drive_stub.py"
Cohesion: 0.13
Nodes (3): _QuietServer, StubServer, Html

### Community 75 - "flows.spec.ts"
Cohesion: 0.20
Nodes (8): Detail, open(), opened, request(), Row, Run, waitForEngine(), RFC-4180

### Community 76 - "ModelPicker.tsx"
Cohesion: 0.19
Nodes (12): isPullEvent(), PullEvent, useAppEvents(), useRunEvents(), useSubscription(), FRIENDLY, ModelPickerProps, PullSheetProps (+4 more)

### Community 79 - "Phase 2 Summary - the Atlas desktop app"
Cohesion: 0.19
Nodes (7): Phase 2 Summary - the Atlas desktop app, 1.11a Identity redaction from the résumé itself (blocks real data), What still feels un-Apple-like, Smoke test 1: Phase 1 engine on real student data, CPU-only scoring speed (~141 s/résumé), Explanations vary for identical inputs, Scores bunch at the top (all 95)

### Community 80 - ".__init__"
Cohesion: 0.21
Nodes (4): DownloaderLike, HealthLike, ScorerLike, _sha256()

### Community 81 - "Progress"
Cohesion: 0.13
Nodes (13): SCREENS_DIR, Settings, nextMessageBoxAnswers(), nextSaveDialogReturns(), recordShellOpens(), shellOpened(), Atlas — Build Plan, Deferred (must finish before real use) (+5 more)

### Community 83 - "ref_node_path"
Cohesion: 0.25
Nodes (3): engineCommand, EngineOptions, findRepo()

### Community 84 - "sse.ts"
Cohesion: 0.27
Nodes (7): followRunStatuses(), followEvents(), FollowOptions, sleep(), SseMessage, SseParser, SSE event streams with Last-Event-ID

### Community 85 - "Any"
Cohesion: 0.13
Nodes (4): BucketResult, AppEvents, _event_fields(), _failure_groups()

### Community 86 - "._handler"
Cohesion: 0.27
Nodes (7): evaluation_for(), _body(), _chat(), do_GET(), do_POST(), _json(), _pull()

### Community 87 - "HealthTests"
Cohesion: 0.20
Nodes (3): FakeSocket, HealthTests, connect()

### Community 88 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, e2e, format, gen:api, lint, test (+1 more)

### Community 89 - "ScoreBand"
Cohesion: 0.22
Nodes (5): Band, ScoreBand(), Harness(), Step 2.5 — Screens part 2: Criteria, Cutoffs, Review, Inputs vs decisions: handles constrain input, engine decides

### Community 91 - "CLAUDE.md — Atlas"
Cohesion: 0.25
Nodes (6): CLAUDE.md — Atlas, Commands, Design rules (Phase 2 UI), Glossary, Repo layout, The one promise

### Community 95 - "Phase 1: Build the Atlas engine end to end"
Cohesion: 0.22
Nodes (8): 0.0 Setup check (do this before anything else), 0. Read first, in this order, 1. Ground rules for this job, 3. Definition of done for Phase 1, 4. Final report format, Phase 1: Build the Atlas engine end to end, Stop conditions: stop, explain, and wait for me, Summaries: document everything you do

### Community 96 - "Step 2.2 — The Electron shell (app/main, app/preload)"
Cohesion: 0.22
Nodes (3): ReadyLineParser, Step 2.2 — The Electron shell (app/main, app/preload), Restart budget: 3 restarts in 60 s then failed

### Community 98 - "Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)"
Cohesion: 0.67
Nodes (3): Engine dev requirements (httpx for TestClient), Optional OCR requirements (easyocr), Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)

### Community 100 - "control_server"
Cohesion: 0.47
Nodes (4): control_server(), do_GET(), do_POST(), reply()

### Community 101 - "DatabaseError"
Cohesion: 0.10
Nodes (6): How to work in this repo, DatabaseError, _is_transient_open_error(), RunLockedError, ClearFiltersTests, KillTest

### Community 102 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 103 - "Atlas — Architecture"
Cohesion: 0.08
Nodes (22): 10. CSV ingest and pre-flight, 12. Text and section extraction, 13. LLM scoring, 14. Buckets, cutoffs and minimum fill, 15. Time estimate, 18. UI screens and flow, 19. Security and privacy, 1. System context (+14 more)

### Community 104 - "2. Steps"
Cohesion: 0.25
Nodes (8): run(), 1.10 Stub servers and end-to-end tests, 1.3 `engine/ingest/csv_loader.py`: CSV loading and the pre-flight report, 1.4 `engine/ingest/downloader.py`: downloading résumés, 1.5 `engine/extract/`: text and section extraction, 1.8 `engine/export.py`: CSV export, 1.9 `engine/cli.py`: headless proof of Phase 1, 2. Steps

### Community 106 - "Step 2.6 — Screen: Progress"
Cohesion: 0.33
Nodes (3): Step 2.6 — Screen: Progress, Event-driven refresh with fallback poll, _status_event()

### Community 110 - "Get Another Model Dialog (light)"
Cohesion: 0.67
Nodes (4): Get Another Model Dialog (dark), Get Another Model Dialog (light), Local Model Picker (runs on this computer, nothing sent anywhere), Setup Stepper (Students & model, Criteria, Cutoffs, Review)

### Community 112 - "Step 2.8 — Screen: Settings"
Cohesion: 0.18
Nodes (4): nav.forget (Back never returns to deleted run), Step 2.8 — Screen: Settings, Cache invalidation across main and renderer, Optimistic settings updates with rollback

### Community 113 - "Step 2.9 — End-to-end flows, keyboard, performance"
Cohesion: 0.17
Nodes (4): Step 2.9 — End-to-end flows, keyboard, performance, Performance measured inside the page (PerformanceObserver/MutationObserver), main(), seed()

### Community 118 - "electron.vite.config.ts"
Cohesion: 0.40
Nodes (3): shared, electron-vite, vite

### Community 119 - "PlacementLike"
Cohesion: 0.50
Nodes (3): _cells(), PlacementLike, _select()

## Ambiguous Edges - Review These
- `This computer status card (Ollama running, models installed, data folder)` → `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`  [AMBIGUOUS]
  docs/summaries/phase2/screens/welcome-resume-light.png · relation: conceptually_related_to

## Knowledge Gaps
- **327 isolated node(s):** `semi`, `singleQuote`, `printWidth`, `trailingComma`, `SetupOptions` (+322 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 881 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **56 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This computer status card (Ollama running, models installed, data folder)` and `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Progress` connect `Progress` to `server.py`, `test_downloader.py`, `.transaction`, `design/index.ts`, `test_llm.py`, `csv_loader.py`, `Button`, `OllamaClient`, `ipc.ts`, `load_csv`, `helpers.ts`, `bridge.ts`, `load_table`, `Engine`, `Database`, `.recover`, `RunWatcher`, `split_sections`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `Phase 1 Summary - the Atlas engine`, `drive_stub.py`, `ScoreBand`, `Step 2.6 — Screen: Progress`?**
  _High betweenness centrality (0.208) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `server.py`, `test_downloader.py`, `PdfExtractor`, `.transaction`, `test_llm.py`, `api_models.py`, `run_waiting_to_resume`, `compute_buckets`, `create_app`, `Worker`, `HealthProbe`, `ServerTestCase`, `OllamaClient`, `load_table`, `Database`, `.recover`, `Path`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `ApiError`, `._precheck_status`, `.estimate`, `Phase 2 Summary - the Atlas desktop app`, `Progress`, `Any`, `EasyOcrEngine`, `Step 2.8 — Screen: Settings`, `.accept_upload`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `server.py`, `EndToEndTest`, `export_csv`, `.worker`, `test_api_support.py`, `.transaction`, `run_waiting_to_resume`, `Worker`, `e2e_stubs.py`, `HealthProbe`, `.csv`, `_Cli`, `load_csv`, `test_db.py`, `Engine`, `Extraction`, `test_csv_loader.py`, `.__init__`, `Progress`, `Phase 1: Build the Atlas engine end to end`, `CompletedRunCutoffTests`, `DatabaseError`, `Atlas — Architecture`, `MigrationTests`, `Step 2.9 — End-to-end flows, keyboard, performance`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `Database` (e.g. with `9. Crash recovery` and `Hard rules (never break these)`) actually correct?**
  _`Database` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `Worker` (e.g. with `9. Crash recovery` and `_Cli`) actually correct?**
  _`Worker` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `Engine` (e.g. with `One active run per engine` and `BucketResult`) actually correct?**
  _`Engine` has 18 INFERRED edges - model-reasoned connections that need verification._