# Graph Report - atlas  (2026-10-02)

## Corpus Check
- 214 files · ~607,984 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: .css 8, (none) 4, .csv 1)

## Summary
- 3183 nodes · 8312 edges · 177 communities (111 shown, 66 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 682 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c9df8475`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test_worker_kill.py
- Phase 1 Summary - the Atlas engine
- test_export.py
- Downloader
- test_eval.py
- .worker
- SetupFlow.tsx
- .transaction
- design/index.ts
- .downloader
- test_llm.py
- api_models.py
- WorkerBusyError
- Button
- build_prompt
- create_app
- Gallery.tsx
- load_table
- Worker
- ModelPicker.tsx
- api-types.ts
- Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md
- socket
- OllamaStub
- ServerTestCase
- Scorer
- test_db.py
- .csv
- ipc.ts
- answer
- _Cli
- load_csv
- Adjust Cutoffs Popover (light)
- Progress Screen (Paused, light)
- .new_run
- Progress
- bridge.ts
- Settings screen - Data section (light)
- package.json
- main/index.ts
- .workbook
- Welcome.tsx
- EngineProcess
- Engine
- Database
- TransientError
- worker.py
- devDependencies
- server.py
- helpers.ts
- test_csv_loader.py
- contrast.test.ts
- RunWatcher
- compilerOptions
- compilerOptions
- Results: Needs Attention View (light)
- compilerOptions
- split_sections
- Files
- _match
- hardware.py
- ._score
- compilerOptions
- .accept_upload
- Step 2.0 — Deferred work recorded, engine gaps filled
- HealthProbe
- Step 3.1 — Required before real use
- ApiError
- Settings.tsx
- run_waiting_to_resume
- StubServer
- 1. Build the real set
- ResultList.tsx
- .estimate
- Renderer index.html (strict CSP, #root mount)
- Phase 2 Summary - the Atlas desktop app
- Issue
- _FormScanner
- ._precheck_status
- compute_buckets
- sse.ts
- .results
- ._handler
- HealthTests
- scripts
- schema.py
- Pre-check sample résumé (fictional Meera Nair)
- Reason
- test_downloader.py
- ExportError
- ClientTests
- Step 2.1 — The local API (engine/server.py)
- engine.ts
- CompletedRunCutoffTests
- Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)
- Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning
- DatabaseError
- .prettierrc.json
- Atlas — Architecture
- fullscreen.spec.ts
- parse_multipart_file
- 2. Steps
- PdfExtractor
- Live sample résumé: strong backend (Rohan Pillai)
- Get Another Model Dialog (light)
- exploding_writer
- App.tsx
- parse_evaluation
- test_api_support.py
- assets.d.ts
- tsconfig.json
- Any
- electron.vite.config.ts
- graph_audit.py
- harness.py
- scoring_input
- 15. Time estimate
- Step 3.2 — Scoring quality: anchored rubric and eval harness
- gen-api-types.mjs
- test_table_loader.py
- test_hardware.py
- How Atlas handles student data
- __main__.py
- Step 3.5 — Packaging: the engine binary, the installers, signing by secrets
- LexiconTests
- flows.spec.ts
- export_csv
- .in_bucket
- smoke
- FakeHttp
- LaunchTests
- Code signing: what to buy and how to add it
- build_parser
- ._handler
- MigrationTests
- NetworkErrorTests
- report.md
- build_engine.py
- .kind
- GraphAuditTests
- .__init__
- Atlas — Build Plan
- FakeClock
- FakeSession
- README.md

## God Nodes (most connected - your core abstractions)
1. `Database` - 118 edges
2. `Worker` - 87 edges
3. `Engine` - 84 edges
4. `create_app()` - 69 edges
5. `OllamaClient` - 61 edges
6. `Button` - 57 edges
7. `Progress` - 51 edges
8. `Scorer` - 50 edges
9. `load_csv()` - 48 edges
10. `Reason` - 45 edges

## Surprising Connections (you probably didn't know these)
- `ScrubPII` --semantically_similar_to--> `header and personal sections never sent to the model`  [INFERRED] [semantically similar]
  engine/logs.py → docs/summaries/phase1/step-1.5-extraction.md
- `Hard rules (never break these)` --references--> `bucket()`  [INFERRED]
  CLAUDE.md → app/e2e/results.spec.ts
- `Failure handling` --references--> `InvalidArgument`  [INFERRED]
  docs/summaries/phase3/step-3.4-native-feel.md → app/main/validate.ts
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

## Communities (177 total, 66 thin omitted)

### Community 0 - "test_worker_kill.py"
Cohesion: 0.10
Nodes (7): main(), seed(), _load(), main(), _match(), run(), _where()

### Community 1 - "Phase 1 Summary - the Atlas engine"
Cohesion: 0.46
Nodes (8): Atlas CHANGELOG, Step 1.0 - Baseline on Windows, Step 1.10 - Stub servers and end-to-end tests, Step 1.3 - CSV loading and the pre-flight report, Step 1.5 - Text and section extraction, Step 1.8 - CSV export, Step 1.9 - The headless CLI, Phase 1 Summary - the Atlas engine

### Community 2 - "test_export.py"
Cohesion: 0.19
Nodes (7): AtomicWriteTests, DatabaseRowsTests, ExportTestCase, FormatTests, placements(), row(), ViewTests

### Community 3 - "Downloader"
Cohesion: 0.10
Nodes (7): Downloader, _fsync_dir(), is_disk_full(), _is_signin(), _looks_like_html(), _prepend(), _read_head()

### Community 4 - "test_eval.py"
Cohesion: 0.15
Nodes (6): read_labels(), _Eval, EvalHarnessTests, score(), FakeScorer, _Scored

### Community 6 - ".worker"
Cohesion: 0.14
Nodes (9): CandidateFailureTests, FilterTests, HappyPathTests, Once, StopAndRecoveryTests, SystemProblemTests, maybe_down(), UnexpectedErrorTests (+1 more)

### Community 7 - "SetupFlow.tsx"
Cohesion: 0.09
Nodes (37): Band, Chip(), ChipProps, Handle, HANDLE_LABEL, ScoreBand(), ScoreBandProps, Harness() (+29 more)

### Community 9 - ".transaction"
Cohesion: 0.08
Nodes (11): 5. Candidate state machine, 7. The worker pipeline, 9. Crash recovery, Headless CLI (Built, Phase 1), Hard rules (never break these), Step 1.7 - The resumable job loop, NotFoundError, _now() (+3 more)

### Community 10 - "design/index.ts"
Cohesion: 0.06
Nodes (45): ButtonProps, ButtonSize, ButtonVariant, decimalsOf(), FieldShell, SegmentedControlProps, SegmentOption, Select() (+37 more)

### Community 11 - ".downloader"
Cohesion: 0.14
Nodes (10): confirm_page(), DiskAndThrottleTests, DownloaderTestCase, FakeResponse, HappyPathTests, html(), HtmlTrapTests, pdf() (+2 more)

### Community 12 - "test_llm.py"
Cohesion: 0.06
Nodes (18): main(), Pause, Pull, PullError, SystemUnavailable, ChatResult, _error_text(), ModelInfo (+10 more)

### Community 13 - "api_models.py"
Cohesion: 0.06
Nodes (56): ActivityOut, BucketCountsOut, BucketDeltaOut, CandidateInfoOut, CandidateOut, ClearFiltersOut, ConfirmOut, CountsOut (+48 more)

### Community 14 - "WorkerBusyError"
Cohesion: 0.08
Nodes (7): CancelTests, FiltersTests, LifecycleTestCase, OneRunAtATimeTests, RecoverTests, TimingHistoryTests, WorkerBusyError

### Community 15 - "Button"
Cohesion: 0.10
Nodes (36): messageOf(), Button, Banner(), EmptyState(), Sidebar(), AnimatedNumber(), formatDate(), Finished() (+28 more)

### Community 16 - "build_prompt"
Cohesion: 0.12
Nodes (12): _allocate(), build_prompt(), _claims_lines(), _context_lines(), _defang(), _fit(), _ordered_sections(), Prompt (+4 more)

### Community 17 - "create_app"
Cohesion: 0.07
Nodes (50): create_app(), _api_error(), app_events(), _busy(), data_delete(), _db(), _db_invalid(), eng() (+42 more)

### Community 18 - "Gallery.tsx"
Cohesion: 0.09
Nodes (28): Harness(), Linked(), SheetHarness(), Slider(), Stepper(), TextArea(), Toggle(), ProgressRing() (+20 more)

### Community 19 - "load_table"
Cohesion: 0.15
Nodes (11): _build_report(), _decode(), _fail(), issue_groups(), _load_csv_bytes(), load_table(), _load_xlsx(), PreflightReport (+3 more)

### Community 20 - "Worker"
Cohesion: 0.10
Nodes (3): 6. Run state machine, The database as the queue, Worker

### Community 21 - "ModelPicker.tsx"
Cohesion: 0.10
Nodes (26): api(), ApiFailure, ApiResponse, buildPath(), CallOptions, Part, TextField(), Spinner() (+18 more)

### Community 22 - "api-types.ts"
Cohesion: 0.05
Nodes (41): CutoffPopoverProps, ActivityOut, BucketDeltaOut, CandidateInfoOut, ClearFiltersOut, ConfirmOut, CountsOut, CutoffsIn (+33 more)

### Community 23 - "Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md"
Cohesion: 0.18
Nodes (9): Concepts to learn, Files, Graph usefulness (this step), Key decisions and why, Known limitations, Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md, Tests, What was built (+1 more)

### Community 25 - "OllamaStub"
Cohesion: 0.07
Nodes (10): build(), control_server(), do_GET(), do_POST(), reply(), main(), student(), DriveStub (+2 more)

### Community 26 - "ServerTestCase"
Cohesion: 0.07
Nodes (13): Api, sort_rows(), AuthTests, BootTests, CancelTests, CaptivePortalTests, ConfigLockTests, ErrorBodyTests (+5 more)

### Community 27 - "Scorer"
Cohesion: 0.08
Nodes (12): Step 1.6 - LLM scoring, Flag, Scorer, _compact(), detect_injection(), names_a_claim(), normalise(), quote_found() (+4 more)

### Community 28 - "test_db.py"
Cohesion: 0.08
Nodes (10): criteria_hash(), InvalidTransitionError, CandidateInputTests, ClearFiltersTests, DbTestCase, OverrideAndSettingsTests, RecoveryTests, _rows() (+2 more)

### Community 31 - "ipc.ts"
Cohesion: 0.14
Nodes (34): OLLAMA_DOWNLOAD_URL, registerIpc(), handle(), TOO_LARGE, CheckedRequest, compile(), copy(), InvalidArgument (+26 more)

### Community 32 - "answer"
Cohesion: 0.14
Nodes (5): answer(), FakeClient, FakeClock, PrecheckTests, ScorerTests

### Community 33 - "_Cli"
Cohesion: 0.06
Nodes (10): _Cli, _read_criteria(), _wait(), EasyOcrEngine, OcrUnavailable, configure_logging(), remove_logging(), ScrubPII (+2 more)

### Community 34 - "load_csv"
Cohesion: 0.18
Nodes (5): load_csv(), drive(), EncodingAndDelimiterTests, FileLevelTests, HeaderTests

### Community 35 - "Adjust Cutoffs Popover (light)"
Cohesion: 0.08
Nodes (28): Adjust Cutoffs Popover (dark), Cutoff Preview Before Save, Results Sidebar (bucket counts), Adjust Cutoffs Popover (light), Candidate Detail Sheet (dark), Bucket Reason Badge (By score / Filled to minimum), Form Claims Not Found in Résumé, Evidence Quotes from Résumé (+20 more)

### Community 36 - "Progress Screen (Paused, light)"
Cohesion: 0.09
Nodes (31): Progress Screen (Paused, dark), Activity Log (run events timeline), Measured Estimate Badge, Progress Screen (Paused, light), Progress Ring (9 of 25 students), Stage Count Tiles (Waiting / Downloading / Reading / Scoring / Done / Needs attention), System Pause Banner (Ollama isn't running - Nothing is lost), Results Screen (dark) (+23 more)

### Community 38 - ".new_run"
Cohesion: 0.16
Nodes (3): StateMachineTests, claim(), sample()

### Community 39 - "Progress"
Cohesion: 0.14
Nodes (23): open(), screenshots(), SetupOptions, startScreening(), waitForStatus(), open(), Launched, bucket() (+15 more)

### Community 40 - "bridge.ts"
Cohesion: 0.08
Nodes (14): atlas, listeners, on(), Window, ExportOut, ApiErrorBody, AtlasBridge, Channels (+6 more)

### Community 41 - "Settings screen - Data section (light)"
Cohesion: 0.11
Nodes (28): Light/dark theme following the OS, Everything stays on this computer (local-only data), Settings screen - Data section (dark), Always shortlist at least (minimum fill stepper), Atlas data folder (single local folder, storage used, Show in folder), Delete all data (destructive red action), Keep the computer awake while screening, Notify me (finish / needs attention) (+20 more)

### Community 42 - "package.json"
Cohesion: 0.12
Nodes (16): description, main, name, private, productName, version, electron-builder, eslint (+8 more)

### Community 43 - "main/index.ts"
Cohesion: 0.12
Nodes (25): buildMenu(), createWindow(), engine, isAppUrl(), navigate(), overlayColors(), rendererUrl(), setTheme() (+17 more)

### Community 45 - "Welcome.tsx"
Cohesion: 0.08
Nodes (42): isPullEvent(), PullEvent, useAppEvents(), useRunEvents(), useSubscription(), Badge(), ProgressBar(), defaultRunName() (+34 more)

### Community 46 - "EngineProcess"
Cohesion: 0.16
Nodes (5): EngineProcess, watcher, RunWatcherDeps, ApiResult, EngineState

### Community 48 - "Database"
Cohesion: 0.09
Nodes (3): Database, _dict(), SchemaTests

### Community 49 - "TransientError"
Cohesion: 0.08
Nodes (6): AtlasError, TransientError, _connection_error(), ChatDeadline, ChatPrompt, _seconds()

### Community 50 - "worker.py"
Cohesion: 0.06
Nodes (14): RecoveryReport, Extraction, Downloaded, Evaluation, ScoreResult, FakeExtractor, FakeHealth, FakeScorer (+6 more)

### Community 51 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, electron, electron-builder, electron-vite, eslint, @fontsource-variable/inter, jsdom, lucide-react (+15 more)

### Community 52 - "server.py"
Cohesion: 0.06
Nodes (9): What was built, BucketResult, remember(), Sample, scrub(), build_parser(), export_openapi(), main() (+1 more)

### Community 53 - "helpers.ts"
Cohesion: 0.16
Nodes (8): APP_DIR, executable, PHASE3_SCREENS_DIR, ThemeName, Settings, binary, root, @playwright/test

### Community 54 - "test_csv_loader.py"
Cohesion: 0.18
Nodes (6): _join_limited(), render_report(), ContractTests, CsvTestCase, ReportTests, RowErrorTests

### Community 55 - "contrast.test.ts"
Cohesion: 0.18
Nodes (12): BACKGROUNDS, contrast(), css, DARK_MEDIA, luminance(), over(), parse(), resolve() (+4 more)

### Community 56 - "RunWatcher"
Cohesion: 0.17
Nodes (9): confirmAndQuit(), notificationFor(), Preferences, QUIET_REASONS, RunStatus, RunWatcher, start(), stop() (+1 more)

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
Cohesion: 0.11
Nodes (7): QWENTUS (legacy CLI), Section extraction instead of truncation, match_heading(), split_sections(), SectionTests, _identity_leaks(), IdentityTests

### Community 62 - "Files"
Cohesion: 0.13
Nodes (17): BUCKET_LABEL, menuLabel(), MINOR, rowMenuTemplate(), build(), Item, RowMenuChoice, RowMenuRequest (+9 more)

### Community 63 - "_match"
Cohesion: 0.50
Nodes (3): _lookup(), _match(), _norm()

### Community 64 - "hardware.py"
Cohesion: 0.19
Nodes (7): _cpu_name(), Hardware, _ollama_gpu(), _OllamaPs, _os_name(), profile(), _ram_gb()

### Community 66 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+8 more)

### Community 67 - ".accept_upload"
Cohesion: 0.12
Nodes (5): 11. Downloading résumés, _clear_logs(), _empty_folder(), PendingTable, _unlink()

### Community 68 - "Step 2.0 — Deferred work recorded, engine gaps filled"
Cohesion: 0.14
Nodes (6): Step 2.0 — Deferred work recorded, engine gaps filled, PLAN Deferred (must finish before real use) — 1.11a redaction blocking, EWMA moving average of scoring times, Magic bytes vs file extensions, Estimate, ewma()

### Community 69 - "HealthProbe"
Cohesion: 0.10
Nodes (12): 8. Failure classification, Files, HealthProbe, find_ollama(), OllamaInstall, start_ollama(), EngineOptions, options_from_env() (+4 more)

### Community 70 - "Step 3.1 — Required before real use"
Cohesion: 0.14
Nodes (11): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Speed: before and after (report only, no target), Step 3.1 — Required before real use (+3 more)

### Community 72 - "Settings.tsx"
Cohesion: 0.16
Nodes (18): Segments(), SegmentedControl(), Card(), About(), Appearance(), Changes, computerLine(), Data() (+10 more)

### Community 75 - "1. Build the real set"
Cohesion: 0.22
Nodes (8): 1. Build the real set, 2. Run it, 3. Read the report, Choose 20–30 résumés, Get consent first, Label them (`labels.csv`), Measuring how well Atlas scores (the eval set), Put them in `local/eval/`

### Community 76 - "ResultList.tsx"
Cohesion: 0.12
Nodes (19): describeDelta(), Column, COLUMNS, FilteredCells(), isMac(), LINK, Name(), NO_SELECTION (+11 more)

### Community 79 - "Phase 2 Summary - the Atlas desktop app"
Cohesion: 0.18
Nodes (7): Phase 2 Summary - the Atlas desktop app, 1.11a Identity redaction from the résumé itself (blocks real data), What still feels un-Apple-like, Smoke test 1: Phase 1 engine on real student data, CPU-only scoring speed (~141 s/résumé), Explanations vary for identical inputs, Scores bunch at the top (all 95)

### Community 80 - "Issue"
Cohesion: 0.12
Nodes (13): _clean_cell(), _find_header(), Issue, _map_columns(), assign(), _non_blank(), _norm_header(), normalise_cgpa() (+5 more)

### Community 83 - "compute_buckets"
Cohesion: 0.26
Nodes (4): compute_buckets(), buckets_of(), BucketTests, rows()

### Community 84 - "sse.ts"
Cohesion: 0.27
Nodes (7): followRunStatuses(), followEvents(), FollowOptions, sleep(), SseMessage, SseParser, SSE event streams with Last-Event-ID

### Community 86 - "._handler"
Cohesion: 0.27
Nodes (7): evaluation_for(), _body(), _chat(), do_GET(), do_POST(), _json(), _pull()

### Community 87 - "HealthTests"
Cohesion: 0.12
Nodes (4): FakeSocket, HealthTests, probe(), connect()

### Community 88 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, dist, e2e, format, gen:api, lint (+3 more)

### Community 89 - "schema.py"
Cohesion: 0.11
Nodes (11): overall_from(), _clip(), evaluation_json_schema(), inline(), EvaluationParseError, Evidence, _load_json_object(), ModelAnswer (+3 more)

### Community 91 - "Reason"
Cohesion: 0.10
Nodes (11): Step 1.4 - Downloading résumés, CandidateError, Reason, DownloadPlan, drive_file_id(), link_identity(), link_kind(), plan_download() (+3 more)

### Community 92 - "test_downloader.py"
Cohesion: 0.10
Nodes (13): Confirm, Drip, Html, Oversized, Pdf, RateLimited, SignIn, Status (+5 more)

### Community 94 - "ClientTests"
Cohesion: 0.25
Nodes (4): ClientTests, FakeHttpResponse, prepared(), stream_lines()

### Community 95 - "Step 2.1 — The local API (engine/server.py)"
Cohesion: 0.10
Nodes (9): api-schema.json (exported OpenAPI), Step 2.1 — The local API (engine/server.py), Contract-first API: Pydantic -> OpenAPI -> TypeScript, Host header check against DNS rebinding, Step 2.2 — The Electron shell (app/main, app/preload), CSP, context isolation and sandbox, Restart budget: 3 restarts in 60 s then failed, Guard (+1 more)

### Community 96 - "engine.ts"
Cohesion: 0.24
Nodes (4): engineCommand, EngineOptions, findRepo(), ReadyLineParser

### Community 98 - "Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)"
Cohesion: 0.67
Nodes (3): Engine dev requirements (httpx for TestClient), Optional OCR requirements (easyocr), Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)

### Community 99 - "Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning"
Cohesion: 0.18
Nodes (9): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning, Tests (+1 more)

### Community 101 - "DatabaseError"
Cohesion: 0.09
Nodes (11): CLAUDE.md — Atlas, Commands, Design rules (Phase 2 UI), Glossary, How to work in this repo, Navigating the codebase (graphify), Repo layout, The one promise (+3 more)

### Community 102 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 103 - "Atlas — Architecture"
Cohesion: 0.11
Nodes (16): 10. CSV ingest and pre-flight, 12. Text and section extraction, 14. Buckets, cutoffs and minimum fill, 17. Local API, 18. UI screens and flow, 19. Security and privacy, 1. System context, 20. Filesystem layout (+8 more)

### Community 104 - "fullscreen.spec.ts"
Cohesion: 0.14
Nodes (13): check(), everyScreen(), Layout, close(), launch(), waitForEngine(), Window, SCREENS_DIR (+5 more)

### Community 106 - "2. Steps"
Cohesion: 0.17
Nodes (11): 0.0 Setup check (do this before anything else), 0. Read first, in this order, 1.10 Stub servers and end-to-end tests, 1.3 `engine/ingest/csv_loader.py`: CSV loading and the pre-flight report, 1.4 `engine/ingest/downloader.py`: downloading résumés, 1.5 `engine/extract/`: text and section extraction, 1.8 `engine/export.py`: CSV export, 2. Steps (+3 more)

### Community 107 - "PdfExtractor"
Cohesion: 0.05
Nodes (14): clean_text(), OcrEngine, PdfExtractor, _filler(), make_pdf(), make_ten_page_resume(), ten_page_resume_pages(), CleanTextTests (+6 more)

### Community 110 - "Get Another Model Dialog (light)"
Cohesion: 0.67
Nodes (4): Get Another Model Dialog (dark), Get Another Model Dialog (light), Local Model Picker (runs on this computer, nothing sent anywhere), Setup Stepper (Students & model, Criteria, Cutoffs, Review)

### Community 112 - "App.tsx"
Cohesion: 0.19
Nodes (12): App(), queries, Screens(), Shell(), useEngineState(), useHashRoute(), usePlatform(), ToastProvider() (+4 more)

### Community 113 - "parse_evaluation"
Cohesion: 0.13
Nodes (9): 13. LLM scoring, Guardrails, Model pre-check, Output contract (Pydantic, `extra="forbid"`), Prompt shape, Rubric and the overall score *(Phase 3, 3.2a; `engine/llm/rubric.py`)*, parse_evaluation(), MismatchAndCapTests (+1 more)

### Community 114 - "test_api_support.py"
Cohesion: 0.17
Nodes (7): department_counts(), department_key(), filter_reason(), FilterPreview, preview(), FilterTests, LinkKindTests

### Community 117 - "Any"
Cohesion: 0.16
Nodes (5): AppEvents, _departments(), _event_fields(), _events_after(), _run_event_stream()

### Community 118 - "electron.vite.config.ts"
Cohesion: 0.40
Nodes (3): shared, electron-vite, vite

### Community 120 - "graph_audit.py"
Cohesion: 0.30
Nodes (8): audit(), count(), Count, indexed_files(), main(), _norm(), _texts(), under_local()

### Community 124 - "harness.py"
Cohesion: 0.18
Nodes (9): evaluate(), _leaks(), _ranks(), Report, ResumeResult, _row(), ScorerLike, spearman() (+1 more)

### Community 125 - "scoring_input"
Cohesion: 0.08
Nodes (20): Files, apply(), build_lexicon(), common_words(), Lexicon, name_line(), name_tokens(), profile_usernames() (+12 more)

### Community 148 - "Step 3.2 — Scoring quality: anchored rubric and eval harness"
Cohesion: 0.18
Nodes (10): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Results on the fictional set (real `qwen3:8b`, this laptop, CPU only), Step 3.2 — Scoring quality: anchored rubric and eval harness (+2 more)

### Community 149 - "gen-api-types.mjs"
Cohesion: 0.26
Nodes (15): bodyType(), byKey(), field(), generate(), here, inlineObject(), namedType(), OUT_PATH (+7 more)

### Community 150 - "test_table_loader.py"
Cohesion: 0.16
Nodes (6): _cell_text(), _format_decimals(), CellTextTests, CsvStillWorksTests, TableTestCase, XlsTests

### Community 151 - "test_hardware.py"
Cohesion: 0.21
Nodes (3): FakePs, HardwareTests, mac_sysctl()

### Community 152 - "How Atlas handles student data"
Cohesion: 0.25
Nodes (7): 1. What stays on the computer, 2. What leaves the computer, and only this, 3. What the AI is and isn't shown, 4. Deleting data, 5. Points for your legal team (India's DPDP Act and similar), How Atlas handles student data, In one paragraph

### Community 153 - "__main__.py"
Cohesion: 0.29
Nodes (5): Files, write_set(), render(), write_report(), main()

### Community 154 - "Step 3.5 — Packaging: the engine binary, the installers, signing by secrets"
Cohesion: 0.20
Nodes (9): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Numbers (Windows x64, this laptop), Step 3.5 — Packaging: the engine binary, the installers, signing by secrets (+1 more)

### Community 156 - "flows.spec.ts"
Cohesion: 0.22
Nodes (6): Detail, opened, request(), Row, Run, RFC-4180

### Community 157 - "export_csv"
Cohesion: 0.16
Nodes (5): _cells(), _escape(), export_csv(), PlacementLike, _select()

### Community 159 - "smoke"
Cohesion: 0.22
Nodes (3): _ready_line(), _request(), smoke()

### Community 162 - "Code signing: what to buy and how to add it"
Cohesion: 0.25
Nodes (7): Checking a build, Code signing: what to buy and how to add it, How to add the secrets, macOS: the Apple Developer Program, What recruiters see without signing, What to buy, Windows: a code-signing certificate

### Community 163 - "build_parser"
Cohesion: 0.29
Nodes (3): build_parser(), data(), _Parser

### Community 164 - "._handler"
Cohesion: 0.52
Nodes (4): do_GET(), _head(), _send(), _serve()

### Community 168 - "build_engine.py"
Cohesion: 0.38
Nodes (3): folder_size(), main(), main()

### Community 169 - ".kind"
Cohesion: 0.33
Nodes (3): 1. Ground rules for this job, Stop conditions: stop, explain, and wait for me, Summaries: document everything you do

### Community 172 - "Atlas — Build Plan"
Cohesion: 0.33
Nodes (6): Atlas — Build Plan, Deferred (must finish before real use), Design system — Apple-inspired, Phase 1 — Engine (headless, no UI), Phase 2 — App (local API + Electron UI), Phase 3 — Hardening & shipping

## Ambiguous Edges - Review These
- `This computer status card (Ollama running, models installed, data folder)` → `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`  [AMBIGUOUS]
  docs/summaries/phase2/screens/welcome-resume-light.png · relation: conceptually_related_to

## Knowledge Gaps
- **400 isolated node(s):** `semi`, `singleQuote`, `printWidth`, `trailingComma`, `SetupOptions` (+395 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1065 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **66 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This computer status card (Ollama running, models installed, data folder)` and `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Progress` connect `Progress` to `SetupFlow.tsx`, `.transaction`, `test_llm.py`, `WorkerBusyError`, `Button`, `Gallery.tsx`, `load_table`, `Worker`, `ModelPicker.tsx`, `Scorer`, `ipc.ts`, `load_csv`, `bridge.ts`, `Atlas — Build Plan`, `Engine`, `Database`, `RunWatcher`, `HealthProbe`, `StubServer`, `schema.py`, `Reason`, `ExportError`, `Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning`, `PdfExtractor`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `test_worker_kill.py`, `test_export.py`, `.worker`, `.transaction`, `test_llm.py`, `Worker`, `test_db.py`, `.csv`, `_Cli`, `load_csv`, `MigrationTests`, `Progress`, `.__init__`, `Engine`, `worker.py`, `server.py`, `test_csv_loader.py`, `HealthProbe`, `Step 3.1 — Required before real use`, `run_waiting_to_resume`, `test_downloader.py`, `CompletedRunCutoffTests`, `DatabaseError`, `2. Steps`, `test_api_support.py`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `Downloader`, `.transaction`, `test_llm.py`, `api_models.py`, `15. Time estimate`, `Button`, `create_app`, `load_table`, `Worker`, `ServerTestCase`, `Scorer`, `_Cli`, `Progress`, `Database`, `server.py`, `hardware.py`, `.accept_upload`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `HealthProbe`, `ApiError`, `run_waiting_to_resume`, `.estimate`, `Phase 2 Summary - the Atlas desktop app`, `._precheck_status`, `compute_buckets`, `.results`, `Step 2.1 — The local API (engine/server.py)`, `.preferences`, `PdfExtractor`, `test_api_support.py`, `Any`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Database` (e.g. with `9. Crash recovery` and `Hard rules (never break these)`) actually correct?**
  _`Database` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `Worker` (e.g. with `9. Crash recovery` and `Graph usefulness (this step)`) actually correct?**
  _`Worker` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `Engine` (e.g. with `One active run per engine` and `BucketResult`) actually correct?**
  _`Engine` has 21 INFERRED edges - model-reasoned connections that need verification._