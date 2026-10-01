# Graph Report - atlas  (2026-10-02)

## Corpus Check
- 219 files · ~616,686 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 16 file(s) not represented in the graph (top: .css 8, (none) 5, .csv 1)

## Summary
- 3268 nodes · 8421 edges · 189 communities (115 shown, 74 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 687 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2a8a1bc8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sys
- Phase 1 Summary - the Atlas engine
- export_csv
- Downloader
- test_eval.py
- .worker
- SetupFlow.tsx
- .transaction
- design/index.ts
- .downloader
- OllamaClient
- api_models.py
- CancelTests
- Button
- build_prompt
- create_app
- Settings.tsx
- csv_loader.py
- .recover
- ModelPicker.tsx
- api-types.ts
- Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md
- HealthProbe
- DriveStub
- ServerTestCase
- test_llm.py
- RunTests
- .csv
- ipc.ts
- Scorer
- _Cli
- load_csv
- Adjust Cutoffs Popover (light)
- Progress Screen (Paused, light)
- .new_run
- flows.spec.ts
- bridge.ts
- Settings screen - Data section (light)
- package.json
- main/index.ts
- load_table
- Progress.tsx
- EngineProcess
- Engine
- Database
- worker.py
- devDependencies
- main
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
- logs.py
- hardware.py
- ._score
- compilerOptions
- Path
- Step 2.0 — Deferred work recorded, engine gaps filled
- OllamaInstall
- Step 3.1 — Required before real use
- ApiError
- When a student needs attention
- run_waiting_to_resume
- StubServer
- 1. Build the real set
- ResultList.tsx
- .estimate
- Renderer index.html (strict CSP, #root mount)
- Phase 2 Summary - the Atlas desktop app
- render_report
- _FormScanner
- EasyOcrEngine
- compute_buckets
- Step 2.2 — The Electron shell (app/main, app/preload)
- ._buckets
- ._handler
- HealthTests
- scripts
- schema.py
- Pre-check sample résumé (fictional Meera Nair)
- link_identity
- drive_stub.py
- e2e_stubs.py
- ClientTests
- Step 2.1 — The local API (engine/server.py)
- engine.ts
- CompletedRunCutoffTests
- Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)
- Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning
- CLAUDE.md — Atlas
- .prettierrc.json
- Atlas — Architecture
- stubs.ts
- parse_multipart_file
- 2. Steps
- make_pdf
- Live sample résumé: strong backend (Rohan Pillai)
- Get Another Model Dialog (light)
- exploding_writer
- App.tsx
- 13. LLM scoring
- server.py
- assets.d.ts
- tsconfig.json
- Any
- electron.vite.config.ts
- graph_audit.py
- harness.py
- scoring_input
- .kind
- Worker
- Step 3.2 — Scoring quality: anchored rubric and eval harness
- gen-api-types.mjs
- test_server.py
- EndToEndTest
- How Atlas handles student data
- write_set
- Step 3.5 — Packaging: the engine binary, the installers, signing by secrets
- LexiconTests
- _error
- PlacementLike
- .in_bucket
- main
- FakeHttp
- LaunchTests
- Code signing: what to buy and how to add it
- ref_node_path
- MigrationTests
- Installing and using Atlas
- report.md
- OllamaStub
- Step 3.6 — CI on Windows and macOS
- GraphAuditTests
- .__init__
- Progress
- Troubleshooting
- FakeHealth
- Step 3.7 — Docs for the firm
- README.md
- When a screening pauses
- clean_text
- PdfTests
- estimate.py
- OcrEngine
- control_server
- ClearFiltersTests
- test_extract.py
- spearman
- app_events

## God Nodes (most connected - your core abstractions)
1. `Database` - 118 edges
2. `Worker` - 87 edges
3. `Engine` - 84 edges
4. `create_app()` - 69 edges
5. `OllamaClient` - 61 edges
6. `Button` - 57 edges
7. `Progress` - 51 edges
8. `Scorer` - 50 edges
9. `Reason` - 48 edges
10. `load_csv()` - 48 edges

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

## Communities (189 total, 74 thin omitted)

### Community 0 - "sys"
Cohesion: 0.08
Nodes (13): main(), seed(), TroubleshootingTests, _load(), main(), _match(), run(), _where() (+5 more)

### Community 1 - "Phase 1 Summary - the Atlas engine"
Cohesion: 0.26
Nodes (10): 16. Export, Atlas CHANGELOG, Step 1.0 - Baseline on Windows, Step 1.10 - Stub servers and end-to-end tests, Step 1.3 - CSV loading and the pre-flight report, Step 1.5 - Text and section extraction, Step 1.8 - CSV export, Step 1.9 - The headless CLI (+2 more)

### Community 2 - "export_csv"
Cohesion: 0.14
Nodes (9): _escape(), export_csv(), AtomicWriteTests, DatabaseRowsTests, ExportTestCase, FormatTests, placements(), row() (+1 more)

### Community 3 - "Downloader"
Cohesion: 0.11
Nodes (7): _confirm_url(), Downloader, _fsync_dir(), _is_signin(), _looks_like_html(), _prepend(), _read_head()

### Community 4 - "test_eval.py"
Cohesion: 0.18
Nodes (6): read_labels(), _Eval, EvalHarnessTests, score(), FakeScorer, _Scored

### Community 6 - ".worker"
Cohesion: 0.14
Nodes (9): CandidateFailureTests, FilterTests, HappyPathTests, Once, StopAndRecoveryTests, SystemProblemTests, maybe_down(), UnexpectedErrorTests (+1 more)

### Community 7 - "SetupFlow.tsx"
Cohesion: 0.10
Nodes (31): Band, Chip(), ScoreBand(), Harness(), TextArea(), Criteria(), TEMPLATES, Cutoffs() (+23 more)

### Community 9 - ".transaction"
Cohesion: 0.09
Nodes (8): 5. Candidate state machine, 7. The worker pipeline, Hard rules (never break these), Step 1.7 - The resumable job loop, NotFoundError, _now(), ValidationError, 1.7 `engine/health.py` and `engine/worker.py`: the resumable job loop

### Community 10 - "design/index.ts"
Cohesion: 0.05
Nodes (53): ChipProps, Handle, HANDLE_LABEL, ScoreBandProps, ButtonProps, ButtonSize, ButtonVariant, decimalsOf() (+45 more)

### Community 11 - ".downloader"
Cohesion: 0.09
Nodes (13): confirm_page(), do_GET(), _head(), _send(), _serve(), FakeResponse, FakeSession, HappyPathTests (+5 more)

### Community 12 - "OllamaClient"
Cohesion: 0.05
Nodes (13): PullError, PdfExtractor, ChatPrompt, _error_text(), ModelInfo, OllamaClient, PullProgress, _seconds() (+5 more)

### Community 13 - "api_models.py"
Cohesion: 0.06
Nodes (56): ActivityOut, BucketCountsOut, BucketDeltaOut, CandidateInfoOut, CandidateOut, ClearFiltersOut, ConfirmOut, CountsOut (+48 more)

### Community 14 - "CancelTests"
Cohesion: 0.09
Nodes (6): CancelTests, FiltersTests, LifecycleTestCase, OneRunAtATimeTests, RecoverTests, TimingHistoryTests

### Community 15 - "Button"
Cohesion: 0.11
Nodes (52): api(), messageOf(), Screens(), SheetHarness(), Button, TextField(), Banner(), EmptyState() (+44 more)

### Community 16 - "build_prompt"
Cohesion: 0.12
Nodes (12): _allocate(), build_prompt(), _claims_lines(), _context_lines(), _defang(), _fit(), _ordered_sections(), Prompt (+4 more)

### Community 17 - "create_app"
Cohesion: 0.10
Nodes (35): create_app(), data_delete(), eng(), model_precheck(), model_pull(), model_pull_cancel(), models(), ollama_start() (+27 more)

### Community 18 - "Settings.tsx"
Cohesion: 0.08
Nodes (34): Harness(), Linked(), Segments(), SegmentedControl(), Stepper(), Toggle(), useToast(), Section() (+26 more)

### Community 19 - "csv_loader.py"
Cohesion: 0.09
Nodes (23): _build_report(), _cell_text(), _clean_cell(), _decode(), _fail(), _find_header(), _format_decimals(), Issue (+15 more)

### Community 21 - "ModelPicker.tsx"
Cohesion: 0.15
Nodes (15): isPullEvent(), PullEvent, useAppEvents(), useRunEvents(), useSubscription(), FRIENDLY, ModelPickerProps, PullSheetProps (+7 more)

### Community 22 - "api-types.ts"
Cohesion: 0.04
Nodes (44): ApiFailure, ApiResponse, buildPath(), CallOptions, Part, SystemCardProps, ActivityOut, ApiRoutes (+36 more)

### Community 23 - "Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md"
Cohesion: 0.18
Nodes (9): Concepts to learn, Files, Graph usefulness (this step), Key decisions and why, Known limitations, Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md, Tests, What was built (+1 more)

### Community 26 - "ServerTestCase"
Cohesion: 0.07
Nodes (13): Api, sort_rows(), AuthTests, BootTests, CancelTests, CaptivePortalTests, ConfigLockTests, ErrorBodyTests (+5 more)

### Community 27 - "test_llm.py"
Cohesion: 0.06
Nodes (19): Step 1.6 - LLM scoring, ChatDeadline, precheck(), result(), PrecheckResult, slow_message(), resume_budget_chars(), Evaluation (+11 more)

### Community 28 - "RunTests"
Cohesion: 0.15
Nodes (3): CandidateInputTests, _rows(), RunTests

### Community 31 - "ipc.ts"
Cohesion: 0.14
Nodes (34): OLLAMA_DOWNLOAD_URL, registerIpc(), handle(), TOO_LARGE, CheckedRequest, compile(), copy(), InvalidArgument (+26 more)

### Community 32 - "Scorer"
Cohesion: 0.11
Nodes (8): ChatResult, Scorer, answer(), FakeClient, FakeClock, MismatchAndCapTests, ScorerTests, TenPageTests

### Community 33 - "_Cli"
Cohesion: 0.19
Nodes (3): _Cli, _read_criteria(), _wait()

### Community 34 - "load_csv"
Cohesion: 0.16
Nodes (4): load_csv(), drive(), EncodingAndDelimiterTests, HeaderTests

### Community 35 - "Adjust Cutoffs Popover (light)"
Cohesion: 0.08
Nodes (28): Adjust Cutoffs Popover (dark), Cutoff Preview Before Save, Results Sidebar (bucket counts), Adjust Cutoffs Popover (light), Candidate Detail Sheet (dark), Bucket Reason Badge (By score / Filled to minimum), Form Claims Not Found in Résumé, Evidence Quotes from Résumé (+20 more)

### Community 36 - "Progress Screen (Paused, light)"
Cohesion: 0.09
Nodes (31): Progress Screen (Paused, dark), Activity Log (run events timeline), Measured Estimate Badge, Progress Screen (Paused, light), Progress Ring (9 of 25 students), Stage Count Tiles (Waiting / Downloading / Reading / Scoring / Done / Needs attention), System Pause Banner (Ollama isn't running - Nothing is lost), Results Screen (dark) (+23 more)

### Community 38 - ".new_run"
Cohesion: 0.11
Nodes (7): DbTestCase, OverrideAndSettingsTests, RecoveryTests, ScoringDurationTests, StateMachineTests, claim(), sample()

### Community 39 - "flows.spec.ts"
Cohesion: 0.11
Nodes (13): SetupOptions, startScreening(), waitForStatus(), Detail, opened, request(), Row, Run (+5 more)

### Community 40 - "bridge.ts"
Cohesion: 0.08
Nodes (13): atlas, listeners, on(), Window, ExportOut, ApiErrorBody, AtlasBridge, Channels (+5 more)

### Community 41 - "Settings screen - Data section (light)"
Cohesion: 0.11
Nodes (28): Light/dark theme following the OS, Everything stays on this computer (local-only data), Settings screen - Data section (dark), Always shortlist at least (minimum fill stepper), Atlas data folder (single local folder, storage used, Show in folder), Delete all data (destructive red action), Keep the computer awake while screening, Notify me (finish / needs attention) (+20 more)

### Community 42 - "package.json"
Cohesion: 0.12
Nodes (16): description, main, name, private, productName, version, electron-builder, eslint (+8 more)

### Community 43 - "main/index.ts"
Cohesion: 0.11
Nodes (26): buildMenu(), createWindow(), engine, isAppUrl(), navigate(), overlayColors(), rendererUrl(), setTheme() (+18 more)

### Community 44 - "load_table"
Cohesion: 0.17
Nodes (5): load_table(), CsvStillWorksTests, TableTestCase, XlsTests, XlsxTests

### Community 45 - "Progress.tsx"
Cohesion: 0.10
Nodes (26): formatBytes(), formatClock(), formatDate(), formatDuration(), formatPerResume(), formatRange(), greeting(), plural() (+18 more)

### Community 46 - "EngineProcess"
Cohesion: 0.17
Nodes (4): EngineProcess, watcher, ApiResult, EngineState

### Community 48 - "Database"
Cohesion: 0.09
Nodes (3): Database, _dict(), SchemaTests

### Community 50 - "worker.py"
Cohesion: 0.05
Nodes (28): 8. Failure classification, Step 1.4 - Downloading résumés, How TROUBLESHOOTING.md can't drift, AtlasError, CandidateError, Flag, Pause, Pull (+20 more)

### Community 51 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, electron, electron-builder, electron-vite, eslint, @fontsource-variable/inter, jsdom, lucide-react (+15 more)

### Community 52 - "main"
Cohesion: 0.18
Nodes (5): What was built, build_parser(), export_openapi(), main(), OpenApiTests

### Community 53 - "helpers.ts"
Cohesion: 0.24
Nodes (13): open(), screenshots(), open(), APP_DIR, close(), capture(), PHASE3_SCREENS_DIR, setTheme() (+5 more)

### Community 54 - "test_csv_loader.py"
Cohesion: 0.18
Nodes (7): normalise_phone(), ContractTests, CsvTestCase, FileLevelTests, NormalisationTests, ReportTests, RowErrorTests

### Community 55 - "contrast.test.ts"
Cohesion: 0.12
Nodes (16): BACKGROUNDS, contrast(), css, DARK_MEDIA, luminance(), over(), parse(), resolve() (+8 more)

### Community 56 - "RunWatcher"
Cohesion: 0.15
Nodes (11): confirmAndQuit(), followRunStatuses(), notificationFor(), Preferences, QUIET_REASONS, RunStatus, RunWatcher, RunWatcherDeps (+3 more)

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
Cohesion: 0.10
Nodes (10): QWENTUS (legacy CLI), Section extraction instead of truncation, _lookup(), _match(), match_heading(), _norm(), split_sections(), SectionTests (+2 more)

### Community 62 - "Files"
Cohesion: 0.13
Nodes (17): BUCKET_LABEL, menuLabel(), MINOR, rowMenuTemplate(), build(), Item, RowMenuChoice, RowMenuRequest (+9 more)

### Community 63 - "logs.py"
Cohesion: 0.12
Nodes (5): configure_logging(), remove_logging(), scrub(), ScrubPII, LogTests

### Community 64 - "hardware.py"
Cohesion: 0.11
Nodes (10): _cpu_name(), Hardware, _ollama_gpu(), _OllamaPs, _os_name(), profile(), _ram_gb(), FakePs (+2 more)

### Community 66 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+8 more)

### Community 67 - "Path"
Cohesion: 0.17
Nodes (5): _clear_logs(), _empty_folder(), PendingTable, _safe_filename(), _unlink()

### Community 68 - "Step 2.0 — Deferred work recorded, engine gaps filled"
Cohesion: 0.13
Nodes (6): Step 2.0 — Deferred work recorded, engine gaps filled, PLAN Deferred (must finish before real use) — 1.11a redaction blocking, EWMA moving average of scoring times, Magic bytes vs file extensions, Estimate, ewma()

### Community 69 - "OllamaInstall"
Cohesion: 0.13
Nodes (9): find_ollama(), OllamaInstall, start_ollama(), EngineOptions, options_from_env(), stub_ollama_finder(), stub_ollama_starter(), FindTests (+1 more)

### Community 70 - "Step 3.1 — Required before real use"
Cohesion: 0.14
Nodes (11): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Speed: before and after (report only, no target), Step 3.1 — Required before real use (+3 more)

### Community 72 - "When a student needs attention"
Cohesion: 0.11
Nodes (19): Google Drive is limiting downloads. Retry later., Link is private. Ask the student to set sharing to "Anyone with the link"., No readable text was found in the résumé., Something went wrong while processing this résumé., The download timed out., The file host refused the download., The file host returned an error., The file is larger than 20 MB. (+11 more)

### Community 75 - "1. Build the real set"
Cohesion: 0.22
Nodes (8): 1. Build the real set, 2. Run it, 3. Read the report, Choose 20–30 résumés, Get consent first, Label them (`labels.csv`), Measuring how well Atlas scores (the eval set), Put them in `local/eval/`

### Community 76 - "ResultList.tsx"
Cohesion: 0.07
Nodes (32): Badge(), ScorePill(), describeDelta(), Failure, LABEL, MOVE_TARGETS, MoveSheetProps, Column (+24 more)

### Community 79 - "Phase 2 Summary - the Atlas desktop app"
Cohesion: 0.16
Nodes (7): Phase 2 Summary - the Atlas desktop app, 1.11a Identity redaction from the résumé itself (blocks real data), What still feels un-Apple-like, Smoke test 1: Phase 1 engine on real student data, CPU-only scoring speed (~141 s/résumé), Explanations vary for identical inputs, Scores bunch at the top (all 95)

### Community 80 - "render_report"
Cohesion: 0.33
Nodes (3): _join_limited(), render_report(), _shared_links_line()

### Community 82 - "EasyOcrEngine"
Cohesion: 0.18
Nodes (3): EasyOcrEngine, OcrUnavailable, EasyOcrEngineTests

### Community 83 - "compute_buckets"
Cohesion: 0.26
Nodes (4): compute_buckets(), buckets_of(), BucketTests, rows()

### Community 84 - "Step 2.2 — The Electron shell (app/main, app/preload)"
Cohesion: 0.17
Nodes (8): followEvents(), FollowOptions, sleep(), SseMessage, SseParser, SSE event streams with Last-Event-ID, Step 2.2 — The Electron shell (app/main, app/preload), Restart budget: 3 restarts in 60 s then failed

### Community 85 - "._buckets"
Cohesion: 0.17
Nodes (3): BucketResult, _failure_groups(), 1.9 `engine/cli.py`: headless proof of Phase 1

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
Cohesion: 0.09
Nodes (13): overall_from(), _clip(), evaluation_json_schema(), inline(), EvaluationParseError, Evidence, _load_json_object(), ModelAnswer (+5 more)

### Community 91 - "link_identity"
Cohesion: 0.33
Nodes (3): drive_file_id(), link_identity(), with_scheme()

### Community 92 - "drive_stub.py"
Cohesion: 0.17
Nodes (8): Confirm, Drip, Html, Oversized, Pdf, RateLimited, Truncated, StubServerTests

### Community 93 - "e2e_stubs.py"
Cohesion: 0.19
Nodes (8): Deterministic fictional fixtures (25 students), build(), main(), student(), SignIn, Status, grade(), WorkerKillTest

### Community 94 - "ClientTests"
Cohesion: 0.25
Nodes (4): ClientTests, FakeHttpResponse, prepared(), stream_lines()

### Community 95 - "Step 2.1 — The local API (engine/server.py)"
Cohesion: 0.15
Nodes (6): api-schema.json (exported OpenAPI), Step 2.1 — The local API (engine/server.py), Contract-first API: Pydantic -> OpenAPI -> TypeScript, Host header check against DNS rebinding, Guard, _send_json()

### Community 96 - "engine.ts"
Cohesion: 0.24
Nodes (4): engineCommand, EngineOptions, findRepo(), ReadyLineParser

### Community 98 - "Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)"
Cohesion: 0.67
Nodes (3): Engine dev requirements (httpx for TestClient), Optional OCR requirements (easyocr), Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)

### Community 99 - "Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning"
Cohesion: 0.18
Nodes (9): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning, Tests (+1 more)

### Community 101 - "CLAUDE.md — Atlas"
Cohesion: 0.10
Nodes (10): CLAUDE.md — Atlas, Commands, Design rules (Phase 2 UI), Glossary, How to work in this repo, Navigating the codebase (graphify), Repo layout, The one promise (+2 more)

### Community 102 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 103 - "Atlas — Architecture"
Cohesion: 0.11
Nodes (18): 10. CSV ingest and pre-flight, 12. Text and section extraction, 14. Buckets, cutoffs and minimum fill, 17. Local API, 18. UI screens and flow, 19. Security and privacy, 1. System context, 20. Filesystem layout (+10 more)

### Community 104 - "stubs.ts"
Cohesion: 0.16
Nodes (13): check(), everyScreen(), Layout, launch(), Launched, waitForEngine(), Window, SCREENS_DIR (+5 more)

### Community 106 - "2. Steps"
Cohesion: 0.17
Nodes (11): 0.0 Setup check (do this before anything else), 0. Read first, in this order, 1.10 Stub servers and end-to-end tests, 1.3 `engine/ingest/csv_loader.py`: CSV loading and the pre-flight report, 1.4 `engine/ingest/downloader.py`: downloading résumés, 1.5 `engine/extract/`: text and section extraction, 1.8 `engine/export.py`: CSV export, 2. Steps (+3 more)

### Community 107 - "make_pdf"
Cohesion: 0.17
Nodes (3): make_pdf(), FakeOcr, OcrFallbackTests

### Community 110 - "Get Another Model Dialog (light)"
Cohesion: 0.67
Nodes (4): Get Another Model Dialog (dark), Get Another Model Dialog (light), Local Model Picker (runs on this computer, nothing sent anywhere), Setup Stepper (Students & model, Criteria, Cutoffs, Review)

### Community 112 - "App.tsx"
Cohesion: 0.15
Nodes (13): App(), queries, Shell(), useEngineState(), useHashRoute(), usePlatform(), ToastProvider(), ToastView() (+5 more)

### Community 113 - "13. LLM scoring"
Cohesion: 0.33
Nodes (6): 13. LLM scoring, Guardrails, Model pre-check, Output contract (Pydantic, `extra="forbid"`), Prompt shape, Rubric and the overall score *(Phase 3, 3.2a; `engine/llm/rubric.py`)*

### Community 114 - "server.py"
Cohesion: 0.07
Nodes (11): DatabaseError, department_counts(), department_key(), filter_reason(), FilterPreview, preview(), _event_fields(), _events_after() (+3 more)

### Community 118 - "electron.vite.config.ts"
Cohesion: 0.40
Nodes (3): shared, electron-vite, vite

### Community 120 - "graph_audit.py"
Cohesion: 0.28
Nodes (9): Files, audit(), count(), Count, indexed_files(), main(), _norm(), _texts() (+1 more)

### Community 124 - "harness.py"
Cohesion: 0.19
Nodes (8): evaluate(), render(), Report, ResumeResult, _row(), ScorerLike, write_report(), main()

### Community 125 - "scoring_input"
Cohesion: 0.08
Nodes (22): Files, _leaks(), apply(), build_lexicon(), common_words(), Lexicon, lexicon_hits(), name_line() (+14 more)

### Community 142 - ".kind"
Cohesion: 0.13
Nodes (5): 15. Time estimate, _folder_size(), 1. Ground rules for this job, Stop conditions: stop, explain, and wait for me, Summaries: document everything you do

### Community 148 - "Step 3.2 — Scoring quality: anchored rubric and eval harness"
Cohesion: 0.18
Nodes (10): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Results on the fictional set (real `qwen3:8b`, this laptop, CPU only), Step 3.2 — Scoring quality: anchored rubric and eval harness (+2 more)

### Community 149 - "gen-api-types.mjs"
Cohesion: 0.26
Nodes (15): bodyType(), byKey(), field(), generate(), here, inlineObject(), namedType(), OUT_PATH (+7 more)

### Community 150 - "test_server.py"
Cohesion: 0.07
Nodes (9): criteria_hash(), InvalidTransitionError, RecoveryReport, RunLockedError, _filler(), make_ten_page_resume(), simple_resume_text(), ten_page_resume_pages() (+1 more)

### Community 152 - "How Atlas handles student data"
Cohesion: 0.20
Nodes (7): 1. What stays on the computer, 2. What leaves the computer, and only this, 3. What the AI is and isn't shown, 4. Deleting data, 5. Points for your legal team (India's DPDP Act and similar), How Atlas handles student data, In one paragraph

### Community 154 - "Step 3.5 — Packaging: the engine binary, the installers, signing by secrets"
Cohesion: 0.20
Nodes (9): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Numbers (Windows x64, this laptop), Step 3.5 — Packaging: the engine binary, the installers, signing by secrets (+1 more)

### Community 156 - "_error"
Cohesion: 0.15
Nodes (12): _api_error(), _busy(), _db(), _db_invalid(), _export(), _http(), _invalid(), _locked() (+4 more)

### Community 157 - "PlacementLike"
Cohesion: 0.50
Nodes (3): _cells(), PlacementLike, _select()

### Community 159 - "main"
Cohesion: 0.08
Nodes (10): build_parser(), data(), main(), _Parser, folder_size(), main(), main(), _ready_line() (+2 more)

### Community 162 - "Code signing: what to buy and how to add it"
Cohesion: 0.29
Nodes (7): Checking a build, Code signing: what to buy and how to add it, How to add the secrets, macOS: the Apple Developer Program, What recruiters see without signing, What to buy, Windows: a code-signing certificate

### Community 164 - "ref_node_path"
Cohesion: 0.20
Nodes (3): executable, binary, root

### Community 166 - "Installing and using Atlas"
Cohesion: 0.18
Nodes (11): 1. Install Ollama, 2. Install Atlas, 3. The first run, 4. Your first screening, 5. Overnight checklist, 6. Where your data lives, 7. Updating and uninstalling, Installing and using Atlas (+3 more)

### Community 169 - "Step 3.6 — CI on Windows and macOS"
Cohesion: 0.18
Nodes (10): Concepts to learn, Failure handling, Graph usefulness (this step), How it was validated (no push), How to try it yourself, Key decisions and why, Known limitations, Step 3.6 — CI on Windows and macOS (+2 more)

### Community 171 - ".__init__"
Cohesion: 0.24
Nodes (4): ExtractorLike, HealthLike, ScorerLike, _sha256()

### Community 172 - "Progress"
Cohesion: 0.12
Nodes (15): bucket(), menusShown(), nextMenuPicks(), nextMessageBoxAnswers(), nextSaveDialogReturns(), shellOpened(), Tests, _status_event() (+7 more)

### Community 173 - "Troubleshooting"
Cohesion: 0.20
Nodes (9): Downloading a model, High score without supporting evidence, Notes on a screened student (flags), Possible instructions to the AI found in résumé, Résumé longer than 10 pages; pages 11+ not read, Still stuck?, The model couldn't be downloaded. Check your internet connection and try again., There is no model called "qwen3:8b". Check the name at ollama.com/library. (+1 more)

### Community 175 - "Step 3.7 — Docs for the firm"
Cohesion: 0.22
Nodes (8): Concepts to learn, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Step 3.7 — Docs for the firm, Tests, What was built

### Community 177 - "When a screening pauses"
Cohesion: 0.22
Nodes (9): Atlas hit repeated errors. See logs., Atlas was closed, Connected to Wi-Fi that needs a sign-in page, Disk is full, No internet connection, Ollama isn't running, Paused by you, The model "qwen3:8b" is no longer installed in Ollama. Install it again, then press Resume. (+1 more)

### Community 182 - "control_server"
Cohesion: 0.47
Nodes (4): control_server(), do_GET(), do_POST(), reply()

### Community 186 - "app_events"
Cohesion: 0.50
Nodes (3): app_events(), run_events(), _sse()

## Ambiguous Edges - Review These
- `This computer status card (Ollama running, models installed, data folder)` → `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`  [AMBIGUOUS]
  docs/summaries/phase2/screens/welcome-resume-light.png · relation: conceptually_related_to

## Knowledge Gaps
- **457 isolated node(s):** `semi`, `singleQuote`, `printWidth`, `trailingComma`, `SetupOptions` (+452 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1125 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **74 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This computer status card (Ollama running, models installed, data folder)` and `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Progress` connect `Progress` to `Phase 1 Summary - the Atlas engine`, `SetupFlow.tsx`, `.transaction`, `design/index.ts`, `OllamaClient`, `CancelTests`, `Button`, `Settings.tsx`, `.recover`, `api-types.ts`, `test_server.py`, `HealthProbe`, `test_llm.py`, `ipc.ts`, `Scorer`, `load_csv`, `flows.spec.ts`, `bridge.ts`, `load_table`, `Engine`, `Database`, `worker.py`, `helpers.ts`, `RunWatcher`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `StubServer`, `schema.py`, `link_identity`, `Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning`, `server.py`?**
  _High betweenness centrality (0.233) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `sys`, `export_csv`, `Downloader`, `.worker`, `.transaction`, `Worker`, `test_server.py`, `EndToEndTest`, `test_llm.py`, `.csv`, `_Cli`, `load_csv`, `MigrationTests`, `.new_run`, `.__init__`, `Progress`, `FakeHealth`, `Engine`, `worker.py`, `test_csv_loader.py`, `Step 3.1 — Required before real use`, `run_waiting_to_resume`, `e2e_stubs.py`, `CompletedRunCutoffTests`, `CLAUDE.md — Atlas`, `Atlas — Architecture`, `2. Steps`, `server.py`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `Downloader`, `.transaction`, `OllamaClient`, `api_models.py`, `.kind`, `Button`, `create_app`, `Worker`, `.recover`, `test_server.py`, `HealthProbe`, `ServerTestCase`, `Scorer`, `load_table`, `Progress`, `Database`, `worker.py`, `main`, `hardware.py`, `Path`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `OllamaInstall`, `ApiError`, `run_waiting_to_resume`, `.estimate`, `Phase 2 Summary - the Atlas desktop app`, `EasyOcrEngine`, `compute_buckets`, `._buckets`, `Step 2.1 — The local API (engine/server.py)`, `.preferences`, `server.py`, `Any`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Database` (e.g. with `9. Crash recovery` and `Hard rules (never break these)`) actually correct?**
  _`Database` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `Worker` (e.g. with `9. Crash recovery` and `Graph usefulness (this step)`) actually correct?**
  _`Worker` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `Engine` (e.g. with `One active run per engine` and `BucketResult`) actually correct?**
  _`Engine` has 21 INFERRED edges - model-reasoned connections that need verification._