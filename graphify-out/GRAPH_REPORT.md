# Graph Report - atlas  (2026-10-01)

## Corpus Check
- 201 files · ~443,658 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: .css 8, (none) 4, .csv 1)

## Summary
- 3039 nodes · 7937 edges · 169 communities (109 shown, 60 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 622 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ec0c5130`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.py
- Phase 1 Summary - the Atlas engine
- export_csv
- Downloader
- harness.py
- .worker
- test_api_support.py
- .transaction
- design/index.ts
- .downloader
- test_llm.py
- api_models.py
- CancelTests
- Button
- build_prompt
- create_app
- Settings.tsx
- csv_loader.py
- Worker
- SetupFlow.tsx
- api-types.ts
- graph_audit.py
- Pause
- Review.tsx
- ServerTestCase
- verify.py
- RunTests
- .csv
- ipc.ts
- answer
- _Cli
- load_csv
- Adjust Cutoffs Popover (light)
- Progress Screen (Paused, light)
- .new_run
- helpers.ts
- bridge.ts
- Settings screen - Data section (light)
- package.json
- main/index.ts
- load_table
- Cutoffs.tsx
- EngineProcess
- Engine
- Database
- main
- ScoreResult
- devDependencies
- App.tsx
- .recover
- test_csv_loader.py
- contrast.test.ts
- RunWatcher
- compilerOptions
- compilerOptions
- Results: Needs Attention View (light)
- compilerOptions
- split_sections
- schema.py
- Step 2.1 — The local API (engine/server.py)
- hardware.py
- compilerOptions
- Path
- Step 2.0 — Deferred work recorded, engine gaps filled
- test_server.py
- Step 3.1 — Required before real use
- ApiError
- LexiconTests
- stubs.ts
- StubServer
- 1. Build the real set
- Progress.tsx
- .estimate
- Renderer index.html (strict CSP, #root mount)
- Phase 2 Summary - the Atlas desktop app
- _delete
- Extraction
- gen-api-types.mjs
- compute_buckets
- sse.ts
- Any
- ._handler
- HealthTests
- scripts
- run_waiting_to_resume
- Pre-check sample résumé (fictional Meera Nair)
- link_identity
- test_downloader.py
- Estimate
- ClientTests
- .__call__
- engine.ts
- RunLockedError
- Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)
- _FormScanner
- flows.spec.ts
- DatabaseError
- .prettierrc.json
- Atlas — Architecture
- CLAUDE.md — Atlas
- parse_multipart_file
- EasyOcrEngine
- PdfTests
- Live sample résumé: strong backend (Rohan Pillai)
- Get Another Model Dialog (light)
- MigrationTests
- Step 2.8 — Screen: Settings
- graph_query.py
- Progress
- assets.d.ts
- tsconfig.json
- _error
- electron.vite.config.ts
- .accept_upload
- .assert_fails
- scoring_input
- Phase 1: Build the Atlas engine end to end
- DownloaderTestCase
- Step 3.2 — Scoring quality: anchored rubric and eval harness
- settings.spec.ts
- plan_download
- OcrFallbackTests
- How Atlas handles student data
- Step 2.2 — The Electron shell (app/main, app/preload)
- ._handler
- render_report
- 2. Steps
- PlacementLike
- _match
- FakeClock
- FakeHttp
- LaunchTests
- is_disk_full
- app_events
- seed
- _connection_error
- exploding_writer
- report.md

## God Nodes (most connected - your core abstractions)
1. `Database` - 118 edges
2. `Worker` - 87 edges
3. `Engine` - 79 edges
4. `create_app()` - 68 edges
5. `OllamaClient` - 60 edges
6. `Button` - 55 edges
7. `Scorer` - 50 edges
8. `load_csv()` - 48 edges
9. `Progress` - 46 edges
10. `Reason` - 45 edges

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

## Communities (169 total, 60 thin omitted)

### Community 0 - "server.py"
Cohesion: 0.05
Nodes (7): remember(), Downloaded, configure_logging(), remove_logging(), scrub(), ScrubPII, LogTests

### Community 1 - "Phase 1 Summary - the Atlas engine"
Cohesion: 0.26
Nodes (10): 16. Export, Atlas CHANGELOG, Step 1.0 - Baseline on Windows, Step 1.10 - Stub servers and end-to-end tests, Step 1.3 - CSV loading and the pre-flight report, Step 1.5 - Text and section extraction, Step 1.8 - CSV export, Step 1.9 - The headless CLI (+2 more)

### Community 2 - "export_csv"
Cohesion: 0.16
Nodes (9): _escape(), export_csv(), AtomicWriteTests, DatabaseRowsTests, ExportTestCase, FormatTests, placements(), row() (+1 more)

### Community 3 - "Downloader"
Cohesion: 0.11
Nodes (6): Downloader, _fsync_dir(), _is_signin(), _looks_like_html(), _prepend(), _read_head()

### Community 4 - "harness.py"
Cohesion: 0.09
Nodes (20): Files, write_set(), evaluate(), _leaks(), _ranks(), read_labels(), render(), Report (+12 more)

### Community 6 - ".worker"
Cohesion: 0.10
Nodes (12): CandidateFailureTests, FakeHealth, FilterTests, HappyPathTests, sample(), ManualClock, Once, StopAndRecoveryTests (+4 more)

### Community 7 - "test_api_support.py"
Cohesion: 0.14
Nodes (8): department_counts(), department_key(), filter_reason(), FilterPreview, preview(), link_kind(), FilterTests, LinkKindTests

### Community 9 - ".transaction"
Cohesion: 0.09
Nodes (8): 5. Candidate state machine, 7. The worker pipeline, Hard rules (never break these), Step 1.7 - The resumable job loop, InvalidTransitionError, _now(), ValidationError, 1.7 `engine/health.py` and `engine/worker.py`: the resumable job loop

### Community 10 - "design/index.ts"
Cohesion: 0.04
Nodes (58): ChipProps, Handle, HANDLE_LABEL, ScoreBandProps, SheetHarness(), ButtonProps, ButtonSize, ButtonVariant (+50 more)

### Community 11 - ".downloader"
Cohesion: 0.15
Nodes (5): FakeResponse, FakeSession, NetworkErrorTests, SizeTests, StatusTests

### Community 12 - "test_llm.py"
Cohesion: 0.04
Nodes (30): Step 1.4 - Downloading résumés, Step 1.6 - LLM scoring, AtlasError, CandidateError, Flag, Pull, PullError, SystemUnavailable (+22 more)

### Community 13 - "api_models.py"
Cohesion: 0.06
Nodes (54): ActivityOut, BucketCountsOut, BucketDeltaOut, CandidateInfoOut, CandidateOut, ClearFiltersOut, ConfirmOut, CountsOut (+46 more)

### Community 14 - "CancelTests"
Cohesion: 0.10
Nodes (5): CancelTests, FiltersTests, LifecycleTestCase, OneRunAtATimeTests, RecoverTests

### Community 15 - "Button"
Cohesion: 0.09
Nodes (42): Button, Select(), Badge(), Banner(), EmptyState(), ScorePill(), Sidebar(), AnimatedNumber() (+34 more)

### Community 16 - "build_prompt"
Cohesion: 0.11
Nodes (11): _allocate(), build_prompt(), _claims_lines(), _context_lines(), _defang(), _fit(), _ordered_sections(), split_claims() (+3 more)

### Community 17 - "create_app"
Cohesion: 0.10
Nodes (33): create_app(), data_delete(), eng(), model_precheck(), model_pull(), model_pull_cancel(), models(), run_cancel() (+25 more)

### Community 18 - "Settings.tsx"
Cohesion: 0.09
Nodes (27): Harness(), Linked(), Segments(), decimalsOf(), SegmentedControl(), Slider(), Stepper(), Toggle() (+19 more)

### Community 19 - "csv_loader.py"
Cohesion: 0.09
Nodes (23): _build_report(), _cell_text(), _clean_cell(), _decode(), _fail(), _find_header(), _format_decimals(), Issue (+15 more)

### Community 21 - "SetupFlow.tsx"
Cohesion: 0.09
Nodes (42): api(), ApiFailure, ApiResponse, buildPath(), CallOptions, messageOf(), Part, Screens() (+34 more)

### Community 22 - "api-types.ts"
Cohesion: 0.04
Nodes (53): CutoffPopoverProps, describeDelta(), NAMES, original, sized, ModelPickerProps, models(), renderPicker() (+45 more)

### Community 23 - "graph_audit.py"
Cohesion: 0.11
Nodes (18): Concepts to learn, Files, Graph usefulness (this step), Key decisions and why, Known limitations, Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md, Tests, What was built (+10 more)

### Community 24 - "Pause"
Cohesion: 0.08
Nodes (8): 8. Failure classification, Pause, HealthProbe, _OllamaHealth, build_parser(), EngineOptions, main(), options_from_env()

### Community 25 - "Review.tsx"
Cohesion: 0.28
Nodes (13): Card(), KeyValue(), defaultRunName(), formatDuration(), formatPerResume(), formatRange(), greeting(), plural() (+5 more)

### Community 26 - "ServerTestCase"
Cohesion: 0.09
Nodes (10): AuthTests, BootTests, CancelTests, CaptivePortalTests, ConfigLockTests, ErrorBodyTests, FlowTests, ServerTestCase (+2 more)

### Community 27 - "verify.py"
Cohesion: 0.10
Nodes (8): _compact(), detect_injection(), names_a_claim(), normalise(), quote_found(), Review, MismatchAndCapTests, VerifyTests

### Community 31 - "ipc.ts"
Cohesion: 0.16
Nodes (30): registerIpc(), handle(), TOO_LARGE, CheckedRequest, compile(), copy(), InvalidArgument, isPlainJson() (+22 more)

### Community 32 - "answer"
Cohesion: 0.07
Nodes (17): 13. LLM scoring, Guardrails, Model pre-check, Output contract (Pydantic, `extra="forbid"`), Prompt shape, Rubric and the overall score *(Phase 3, 3.2a; `engine/llm/rubric.py`)*, _clip(), evaluation_json_schema() (+9 more)

### Community 33 - "_Cli"
Cohesion: 0.24
Nodes (3): _Cli, _read_criteria(), _wait()

### Community 34 - "load_csv"
Cohesion: 0.15
Nodes (5): load_csv(), drive(), EncodingAndDelimiterTests, HeaderTests, RowErrorTests

### Community 35 - "Adjust Cutoffs Popover (light)"
Cohesion: 0.08
Nodes (28): Adjust Cutoffs Popover (dark), Cutoff Preview Before Save, Results Sidebar (bucket counts), Adjust Cutoffs Popover (light), Candidate Detail Sheet (dark), Bucket Reason Badge (By score / Filled to minimum), Form Claims Not Found in Résumé, Evidence Quotes from Résumé (+20 more)

### Community 36 - "Progress Screen (Paused, light)"
Cohesion: 0.09
Nodes (31): Progress Screen (Paused, dark), Activity Log (run events timeline), Measured Estimate Badge, Progress Screen (Paused, light), Progress Ring (9 of 25 students), Stage Count Tiles (Waiting / Downloading / Reading / Scoring / Done / Needs attention), System Pause Banner (Ollama isn't running - Nothing is lost), Results Screen (dark) (+23 more)

### Community 38 - ".new_run"
Cohesion: 0.10
Nodes (8): CandidateInputTests, DbTestCase, OverrideAndSettingsTests, RecoveryTests, _rows(), ScoringDurationTests, StateMachineTests, claim()

### Community 39 - "helpers.ts"
Cohesion: 0.23
Nodes (12): SetupOptions, startScreening(), waitForStatus(), close(), Launched, bucket(), capture(), setTheme() (+4 more)

### Community 40 - "bridge.ts"
Cohesion: 0.08
Nodes (16): IpcContext, atlas, listeners, on(), Window, ExportOut, ApiErrorBody, AppInfo (+8 more)

### Community 41 - "Settings screen - Data section (light)"
Cohesion: 0.11
Nodes (28): Light/dark theme following the OS, Everything stays on this computer (local-only data), Settings screen - Data section (dark), Always shortlist at least (minimum fill stepper), Atlas data folder (single local folder, storage used, Show in folder), Delete all data (destructive red action), Keep the computer awake while screening, Notify me (finish / needs attention) (+20 more)

### Community 42 - "package.json"
Cohesion: 0.12
Nodes (16): description, main, name, private, productName, version, electron-builder, eslint (+8 more)

### Community 43 - "main/index.ts"
Cohesion: 0.13
Nodes (24): buildMenu(), confirmAndQuit(), createWindow(), engine, isAppUrl(), navigate(), overlayColors(), rendererUrl() (+16 more)

### Community 44 - "load_table"
Cohesion: 0.17
Nodes (5): load_table(), CsvStillWorksTests, TableTestCase, XlsTests, XlsxTests

### Community 45 - "Cutoffs.tsx"
Cohesion: 0.17
Nodes (14): Band, Chip(), ScoreBand(), Harness(), TextArea(), Criteria(), TEMPLATES, Cutoffs() (+6 more)

### Community 46 - "EngineProcess"
Cohesion: 0.16
Nodes (5): EngineProcess, watcher, RunWatcherDeps, ApiResult, EngineState

### Community 48 - "Database"
Cohesion: 0.08
Nodes (4): Database, _dict(), NotFoundError, SchemaTests

### Community 49 - "main"
Cohesion: 0.14
Nodes (3): build_parser(), main(), _Parser

### Community 50 - "ScoreResult"
Cohesion: 0.21
Nodes (6): ScoreResult, FakeDownloader, FakeScorer, _files_in(), result_for(), action()

### Community 51 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, electron, electron-builder, electron-vite, eslint, @fontsource-variable/inter, jsdom, lucide-react (+15 more)

### Community 52 - "App.tsx"
Cohesion: 0.20
Nodes (10): App(), queries, Shell(), useEngineState(), useHashRoute(), usePlatform(), Gallery(), root (+2 more)

### Community 53 - ".recover"
Cohesion: 0.15
Nodes (4): 6. Run state machine, Headless CLI (Built, Phase 1), RecoveryReport, WorkerBusyError

### Community 54 - "test_csv_loader.py"
Cohesion: 0.24
Nodes (6): normalise_phone(), ContractTests, CsvTestCase, FileLevelTests, NormalisationTests, ReportTests

### Community 55 - "contrast.test.ts"
Cohesion: 0.18
Nodes (12): BACKGROUNDS, contrast(), css, DARK_MEDIA, luminance(), over(), parse(), resolve() (+4 more)

### Community 56 - "RunWatcher"
Cohesion: 0.18
Nodes (8): notificationFor(), Preferences, QUIET_REASONS, RunStatus, RunWatcher, start(), stop(), watcher()

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
Cohesion: 0.13
Nodes (7): QWENTUS (legacy CLI), Section extraction instead of truncation, match_heading(), split_sections(), SectionTests, _identity_leaks(), IdentityTests

### Community 62 - "schema.py"
Cohesion: 0.19
Nodes (7): overall_from(), EvaluationParseError, Evidence, _load_json_object(), ModelAnswer, _Strict, SubScores

### Community 63 - "Step 2.1 — The local API (engine/server.py)"
Cohesion: 0.20
Nodes (6): api-schema.json (exported OpenAPI), Step 2.1 — The local API (engine/server.py), Contract-first API: Pydantic -> OpenAPI -> TypeScript, Host header check against DNS rebinding, Api, Guard

### Community 64 - "hardware.py"
Cohesion: 0.07
Nodes (15): _cpu_name(), Hardware, _ollama_gpu(), _OllamaPs, _os_name(), profile(), _ram_gb(), find_ollama() (+7 more)

### Community 66 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+8 more)

### Community 67 - "Path"
Cohesion: 0.13
Nodes (6): 11. Downloading résumés, _clear_logs(), _empty_folder(), _folder_size(), _safe_filename(), _unlink()

### Community 68 - "Step 2.0 — Deferred work recorded, engine gaps filled"
Cohesion: 0.22
Nodes (4): Step 2.0 — Deferred work recorded, engine gaps filled, PLAN Deferred (must finish before real use) — 1.11a redaction blocking, EWMA moving average of scoring times, Magic bytes vs file extensions

### Community 69 - "test_server.py"
Cohesion: 0.08
Nodes (9): Reason, Sample, export_openapi(), _filler(), make_pdf(), make_ten_page_resume(), simple_resume_text(), ten_page_resume_pages() (+1 more)

### Community 70 - "Step 3.1 — Required before real use"
Cohesion: 0.15
Nodes (11): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Speed: before and after (report only, no target), Step 3.1 — Required before real use (+3 more)

### Community 73 - "stubs.ts"
Cohesion: 0.15
Nodes (11): check(), everyScreen(), Layout, Window, SCREENS_DIR, PYTHON, REPO, tempDir() (+3 more)

### Community 75 - "1. Build the real set"
Cohesion: 0.22
Nodes (8): 1. Build the real set, 2. Run it, 3. Read the report, Choose 20–30 résumés, Get consent first, Label them (`labels.csv`), Measuring how well Atlas scores (the eval set), Put them in `local/eval/`

### Community 76 - "Progress.tsx"
Cohesion: 0.14
Nodes (21): isPullEvent(), PullEvent, useAppEvents(), useRunEvents(), useSubscription(), ProgressRing(), Toolbar(), formatClock() (+13 more)

### Community 79 - "Phase 2 Summary - the Atlas desktop app"
Cohesion: 0.16
Nodes (7): Phase 2 Summary - the Atlas desktop app, 1.11a Identity redaction from the résumé itself (blocks real data), What still feels un-Apple-like, Smoke test 1: Phase 1 engine on real student data, CPU-only scoring speed (~141 s/résumé), Explanations vary for identical inputs, Scores bunch at the top (all 95)

### Community 80 - "_delete"
Cohesion: 0.16
Nodes (5): _delete(), DownloaderLike, HealthLike, ScorerLike, _sha256()

### Community 81 - "Extraction"
Cohesion: 0.11
Nodes (6): clean_text(), Extraction, OcrEngine, CleanTextTests, FakeExtractor, ExtractorLike

### Community 82 - "gen-api-types.mjs"
Cohesion: 0.22
Nodes (15): bodyType(), byKey(), field(), generate(), here, inlineObject(), namedType(), OUT_PATH (+7 more)

### Community 83 - "compute_buckets"
Cohesion: 0.26
Nodes (4): compute_buckets(), buckets_of(), BucketTests, rows()

### Community 84 - "sse.ts"
Cohesion: 0.27
Nodes (7): followRunStatuses(), followEvents(), FollowOptions, sleep(), SseMessage, SseParser, SSE event streams with Last-Event-ID

### Community 85 - "Any"
Cohesion: 0.09
Nodes (9): BucketResult, Placement, AppEvents, _departments(), _event_fields(), _events_after(), _failure_groups(), _run_event_stream() (+1 more)

### Community 86 - "._handler"
Cohesion: 0.27
Nodes (7): evaluation_for(), _body(), _chat(), do_GET(), do_POST(), _json(), _pull()

### Community 87 - "HealthTests"
Cohesion: 0.12
Nodes (4): FakeSocket, HealthTests, probe(), connect()

### Community 88 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, e2e, format, gen:api, lint, test (+1 more)

### Community 91 - "link_identity"
Cohesion: 0.33
Nodes (3): drive_file_id(), link_identity(), with_scheme()

### Community 92 - "test_downloader.py"
Cohesion: 0.05
Nodes (23): build(), control_server(), do_GET(), do_POST(), reply(), main(), student(), Confirm (+15 more)

### Community 94 - "ClientTests"
Cohesion: 0.26
Nodes (4): ClientTests, FakeHttpResponse, prepared(), stream_lines()

### Community 96 - "engine.ts"
Cohesion: 0.24
Nodes (4): engineCommand, EngineOptions, findRepo(), ReadyLineParser

### Community 97 - "RunLockedError"
Cohesion: 0.13
Nodes (5): 10. CSV ingest and pre-flight, RunLockedError, CompletedRunCutoffTests, DbTestCase, ClearFiltersTests

### Community 98 - "Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)"
Cohesion: 0.67
Nodes (3): Engine dev requirements (httpx for TestClient), Optional OCR requirements (easyocr), Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)

### Community 100 - "flows.spec.ts"
Cohesion: 0.15
Nodes (10): Detail, open(), opened, request(), Row, Run, launch(), waitForEngine() (+2 more)

### Community 101 - "DatabaseError"
Cohesion: 0.14
Nodes (4): How to work in this repo, DatabaseError, _is_transient_open_error(), KillTest

### Community 102 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 103 - "Atlas — Architecture"
Cohesion: 0.11
Nodes (16): 12. Text and section extraction, 14. Buckets, cutoffs and minimum fill, 15. Time estimate, 18. UI screens and flow, 19. Security and privacy, 1. System context, 20. Filesystem layout, 21. Packaging (+8 more)

### Community 104 - "CLAUDE.md — Atlas"
Cohesion: 0.13
Nodes (13): CLAUDE.md — Atlas, Commands, Design rules (Phase 2 UI), Glossary, Navigating the codebase (graphify), Repo layout, The one promise, Atlas — Build Plan (+5 more)

### Community 105 - "parse_multipart_file"
Cohesion: 0.40
Nodes (3): run_table(), parse_multipart_file(), MultipartTests

### Community 106 - "EasyOcrEngine"
Cohesion: 0.21
Nodes (3): EasyOcrEngine, OcrUnavailable, EasyOcrEngineTests

### Community 110 - "Get Another Model Dialog (light)"
Cohesion: 0.67
Nodes (4): Get Another Model Dialog (dark), Get Another Model Dialog (light), Local Model Picker (runs on this computer, nothing sent anywhere), Setup Stepper (Students & model, Criteria, Cutoffs, Review)

### Community 112 - "Step 2.8 — Screen: Settings"
Cohesion: 0.20
Nodes (3): nav.forget (Back never returns to deleted run), Step 2.8 — Screen: Settings, Optimistic settings updates with rollback

### Community 113 - "graph_query.py"
Cohesion: 0.42
Nodes (5): _load(), main(), _match(), run(), _where()

### Community 114 - "Progress"
Cohesion: 0.14
Nodes (9): nextMessageBoxAnswers(), nextSaveDialogReturns(), recordShellOpens(), shellOpened(), 17. Local API, _status_event(), _error_text(), PullProgress (+1 more)

### Community 117 - "_error"
Cohesion: 0.15
Nodes (12): _api_error(), _busy(), _db(), _db_invalid(), _export(), _http(), _invalid(), _locked() (+4 more)

### Community 118 - "electron.vite.config.ts"
Cohesion: 0.40
Nodes (3): shared, electron-vite, vite

### Community 124 - ".assert_fails"
Cohesion: 0.36
Nodes (3): confirm_page(), html(), HtmlTrapTests

### Community 125 - "scoring_input"
Cohesion: 0.08
Nodes (20): Files, apply(), build_lexicon(), common_words(), Lexicon, name_line(), name_tokens(), profile_usernames() (+12 more)

### Community 142 - "Phase 1: Build the Atlas engine end to end"
Cohesion: 0.17
Nodes (8): 0.0 Setup check (do this before anything else), 0. Read first, in this order, 1. Ground rules for this job, 3. Definition of done for Phase 1, 4. Final report format, Phase 1: Build the Atlas engine end to end, Stop conditions: stop, explain, and wait for me, Summaries: document everything you do

### Community 147 - "DownloaderTestCase"
Cohesion: 0.27
Nodes (4): DiskAndThrottleTests, DownloaderTestCase, HappyPathTests, pdf()

### Community 148 - "Step 3.2 — Scoring quality: anchored rubric and eval harness"
Cohesion: 0.18
Nodes (10): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Results on the fictional set (real `qwen3:8b`, this laptop, CPU only), Step 3.2 — Scoring quality: anchored rubric and eval harness (+2 more)

### Community 149 - "settings.spec.ts"
Cohesion: 0.20
Nodes (3): APP_DIR, Settings, Stubs

### Community 150 - "plan_download"
Cohesion: 0.29
Nodes (3): DownloadPlan, plan_download(), PlanTests

### Community 152 - "How Atlas handles student data"
Cohesion: 0.25
Nodes (7): 1. What stays on the computer, 2. What leaves the computer, and only this, 3. What the AI is and isn't shown, 4. Deleting data, 5. Points for your legal team (India's DPDP Act and similar), How Atlas handles student data, In one paragraph

### Community 153 - "Step 2.2 — The Electron shell (app/main, app/preload)"
Cohesion: 0.29
Nodes (3): Step 2.2 — The Electron shell (app/main, app/preload), CSP, context isolation and sandbox, Restart budget: 3 restarts in 60 s then failed

### Community 154 - "._handler"
Cohesion: 0.52
Nodes (4): do_GET(), _head(), _send(), _serve()

### Community 155 - "render_report"
Cohesion: 0.33
Nodes (3): _join_limited(), render_report(), _shared_links_line()

### Community 156 - "2. Steps"
Cohesion: 0.33
Nodes (6): 1.10 Stub servers and end-to-end tests, 1.3 `engine/ingest/csv_loader.py`: CSV loading and the pre-flight report, 1.4 `engine/ingest/downloader.py`: downloading résumés, 1.5 `engine/extract/`: text and section extraction, 1.8 `engine/export.py`: CSV export, 2. Steps

### Community 157 - "PlacementLike"
Cohesion: 0.50
Nodes (3): _cells(), PlacementLike, _select()

### Community 158 - "_match"
Cohesion: 0.50
Nodes (3): _lookup(), _match(), _norm()

### Community 163 - "app_events"
Cohesion: 0.50
Nodes (3): app_events(), run_events(), _sse()

## Ambiguous Edges - Review These
- `This computer status card (Ollama running, models installed, data folder)` → `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`  [AMBIGUOUS]
  docs/summaries/phase2/screens/welcome-resume-light.png · relation: conceptually_related_to

## Knowledge Gaps
- **363 isolated node(s):** `semi`, `singleQuote`, `printWidth`, `trailingComma`, `SetupOptions` (+358 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1000 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **60 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This computer status card (Ollama running, models installed, data folder)` and `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Progress` connect `Progress` to `Phase 1 Summary - the Atlas engine`, `.transaction`, `design/index.ts`, `test_llm.py`, `Settings.tsx`, `SetupFlow.tsx`, `Pause`, `verify.py`, `ipc.ts`, `load_csv`, `helpers.ts`, `bridge.ts`, `load_table`, `Cutoffs.tsx`, `Engine`, `Database`, `.recover`, `RunWatcher`, `schema.py`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `test_server.py`, `Step 3.1 — Required before real use`, `StubServer`, `link_identity`, `flows.spec.ts`, `CLAUDE.md — Atlas`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `server.py`, `export_csv`, `.worker`, `test_api_support.py`, `.transaction`, `test_llm.py`, `Phase 1: Build the Atlas engine end to end`, `Worker`, `.csv`, `_Cli`, `load_csv`, `seed`, `.new_run`, `Engine`, `test_csv_loader.py`, `test_server.py`, `_delete`, `run_waiting_to_resume`, `test_downloader.py`, `RunLockedError`, `DatabaseError`, `Atlas — Architecture`, `MigrationTests`, `Progress`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `server.py`, `Downloader`, `test_api_support.py`, `test_llm.py`, `api_models.py`, `create_app`, `Worker`, `Pause`, `ServerTestCase`, `load_table`, `Database`, `.recover`, `Step 2.1 — The local API (engine/server.py)`, `Path`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `test_server.py`, `ApiError`, `.estimate`, `Phase 2 Summary - the Atlas desktop app`, `compute_buckets`, `Any`, `run_waiting_to_resume`, `Estimate`, `EasyOcrEngine`, `Step 2.8 — Screen: Settings`, `Progress`, `.accept_upload`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Database` (e.g. with `9. Crash recovery` and `Hard rules (never break these)`) actually correct?**
  _`Database` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `Worker` (e.g. with `9. Crash recovery` and `Graph usefulness (this step)`) actually correct?**
  _`Worker` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `Engine` (e.g. with `One active run per engine` and `BucketResult`) actually correct?**
  _`Engine` has 19 INFERRED edges - model-reasoned connections that need verification._