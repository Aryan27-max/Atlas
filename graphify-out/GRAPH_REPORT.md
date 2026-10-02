# Graph Report - atlas  (2026-10-02)

## Corpus Check
- 236 files · ~642,346 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: .css 8, (none) 6, .csv 1)

## Summary
- 3507 nodes · 8919 edges · 196 communities (133 shown, 63 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 739 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `32377672`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test_tools.py
- main
- export_csv
- ServerTestCase
- harness.py
- .worker
- Button
- .transaction
- design/index.ts
- .downloader
- OllamaClient
- api_models.py
- CancelTests
- Results.tsx
- build_prompt
- create_app
- Settings.tsx
- csv_loader.py
- .recover
- CandidateSheet.tsx
- api-types.ts
- local_only
- check_licenses.py
- EasyOcrEngine
- make_ten_page_resume
- schema.py
- test_db.py
- HealthProbe
- ipc.ts
- answer
- _Cli
- load_csv
- Adjust Cutoffs Popover (light)
- Progress Screen (Paused, light)
- .new_run
- stubs.ts
- bridge.ts
- Settings screen - Data section (light)
- package.json
- main/index.ts
- load_table
- Welcome.tsx
- EngineProcess
- ._precheck_status
- Database
- smoke
- Downloader
- devDependencies
- ref_node_path
- helpers.ts
- parse_evaluation
- contrast.test.ts
- RunWatcher
- compilerOptions
- compilerOptions
- Results: Needs Attention View (light)
- compilerOptions
- split_sections
- menus.ts
- configure_logging
- profile
- Worker
- compilerOptions
- .__init__
- Step 2.0 — Deferred work recorded, engine gaps filled
- OllamaInstall
- Step 3.1 — Required before real use
- Engine
- When a student needs attention
- run_waiting_to_resume
- StubServer
- 1. Build the real set
- Starting Atlas: commands
- .estimate
- Renderer index.html (strict CSP, #root mount)
- Phase 2 Summary - the Atlas desktop app
- Atlas — Build Plan
- _FormScanner
- _error
- compute_buckets
- sse.ts
- 2. Steps
- ._handler
- _Listed
- scripts
- link_kind
- Pre-check sample résumé (fictional Meera Nair)
- filter_reason
- test_server.py
- Phase 3 Summary — Atlas made shippable
- ClientTests
- Step 2.1 — The local API (engine/server.py)
- engine.ts
- CompletedRunCutoffTests
- Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)
- Estimate
- ScoreBand
- DatabaseError
- .prettierrc.json
- Atlas — Architecture
- fullscreen.spec.ts
- parse_multipart_file
- Phase 1: Build the Atlas engine end to end
- OcrFallbackTests
- clean_text
- Live sample résumé: strong backend (Rohan Pillai)
- Get Another Model Dialog (light)
- exploding_writer
- App.tsx
- .assert_fails
- Atlas: private, on-device résumé screening for campus hiring
- assets.d.ts
- tsconfig.json
- Any
- electron.vite.config.ts
- sys
- Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md
- scoring_input
- DownloaderTestCase
- CI fixes: four failures on the first full CI run (2026-10-02)
- Step 3.2 — Scoring quality: anchored rubric and eval harness
- gen-api-types.mjs
- server.py
- CLAUDE.md — Atlas
- How Atlas handles student data
- export_openapi
- main
- LexiconTests
- graph_query.py
- PlacementLike
- .__init__
- ._handler
- FakeHttp
- LaunchTests
- Code signing: what to buy and how to add it
- Third-party notices
- .kind
- Tests
- Installing and using Atlas
- report.md
- plan_download
- Step 3.6 — CI on Windows and macOS
- Stubs
- CandidateContext
- Progress
- When a screening pauses
- README, LICENSE, START_CMDS and a third-party licence check
- Step 3.7 — Docs for the firm
- README.md
- Step 3.4 — Native-feel quick wins
- ExportError
- control_server
- _match
- System design
- Step 2.2 — The Electron shell (app/main, app/preload)
- is_disk_full
- _Sortable
- .__call__
- GraphAuditTests
- RecoveryReport
- FakeClock
- LicenceCheckTests
- app_events
- _escape

## God Nodes (most connected - your core abstractions)
1. `Database` - 121 edges
2. `Worker` - 88 edges
3. `Engine` - 85 edges
4. `create_app()` - 69 edges
5. `OllamaClient` - 67 edges
6. `Button` - 57 edges
7. `Scorer` - 52 edges
8. `Progress` - 52 edges
9. `Reason` - 48 edges
10. `load_csv()` - 48 edges

## Surprising Connections (you probably didn't know these)
- `ScrubPII` --semantically_similar_to--> `header and personal sections never sent to the model`  [INFERRED] [semantically similar]
  engine/logs.py → docs/summaries/phase1/step-1.5-extraction.md
- `Failure handling` --references--> `InvalidArgument`  [INFERRED]
  docs/summaries/phase3/step-3.4-native-feel.md → app/main/validate.ts
- `Progress` --references--> `info()`  [INFERRED]
  PLAN.md → app/src/shared/bridge.ts
- `0. Read first, in this order` --references--> `Database`  [INFERRED]
  prompts/phase1.md → engine/db.py
- `1.4 `engine/ingest/downloader.py`: downloading résumés` --references--> `TransientError`  [INFERRED]
  prompts/phase1.md → engine/errors.py

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

## Communities (196 total, 63 thin omitted)

### Community 0 - "test_tools.py"
Cohesion: 0.15
Nodes (6): TroubleshootingTests, all_keys(), Help, main(), messages(), render()

### Community 1 - "main"
Cohesion: 0.19
Nodes (9): Atlas CHANGELOG, Step 1.0 - Baseline on Windows, Step 1.10 - Stub servers and end-to-end tests, Step 1.3 - CSV loading and the pre-flight report, Step 1.5 - Text and section extraction, Step 1.8 - CSV export, Step 1.9 - The headless CLI, Phase 1 Summary - the Atlas engine (+1 more)

### Community 2 - "export_csv"
Cohesion: 0.18
Nodes (8): export_csv(), AtomicWriteTests, DatabaseRowsTests, ExportTestCase, FormatTests, placements(), row(), ViewTests

### Community 3 - "ServerTestCase"
Cohesion: 0.06
Nodes (15): EngineOptions, sort_rows(), AuthTests, BootTests, CancelTests, CaptivePortalTests, ConfigLockTests, ErrorBodyTests (+7 more)

### Community 4 - "harness.py"
Cohesion: 0.08
Nodes (21): Files, Sample, write_set(), evaluate(), _leaks(), _ranks(), read_labels(), render() (+13 more)

### Community 6 - ".worker"
Cohesion: 0.10
Nodes (19): Proving it in the app, Reproducing it, Tests, The demo flake: a student failed during an outage (rule 5), The fix (`engine/worker.py`), The mirror case: an Ollama outage that is over before the probe looks, The slow demo runs (a separate thing, not a bug), Why the probe said "online" (+11 more)

### Community 7 - "Button"
Cohesion: 0.16
Nodes (32): api(), ApiFailure, messageOf(), Chip(), Button, Banner(), Spinner(), Override() (+24 more)

### Community 9 - ".transaction"
Cohesion: 0.08
Nodes (12): bucket(), 5. Candidate state machine, 7. The worker pipeline, 9. Crash recovery, Hard rules (never break these), Step 1.7 - The resumable job loop, InvalidTransitionError, NotFoundError (+4 more)

### Community 10 - "design/index.ts"
Cohesion: 0.06
Nodes (49): ChipProps, Handle, HANDLE_LABEL, ScoreBandProps, ButtonProps, ButtonSize, ButtonVariant, decimalsOf() (+41 more)

### Community 11 - ".downloader"
Cohesion: 0.15
Nodes (5): FakeResponse, FakeSession, NetworkErrorTests, SizeTests, StatusTests

### Community 12 - "OllamaClient"
Cohesion: 0.04
Nodes (25): 1 · The estimate on Windows, How TROUBLESHOOTING.md can't drift, Pull, ChatDeadline, ChatPrompt, _error_text(), ModelInfo, OllamaClient (+17 more)

### Community 13 - "api_models.py"
Cohesion: 0.06
Nodes (55): ActivityOut, BucketCountsOut, BucketDeltaOut, CandidateInfoOut, CandidateOut, ClearFiltersOut, ConfirmOut, CountsOut (+47 more)

### Community 14 - "CancelTests"
Cohesion: 0.10
Nodes (5): CancelTests, FiltersTests, LifecycleTestCase, OneRunAtATimeTests, RecoverTests

### Community 15 - "Results.tsx"
Cohesion: 0.08
Nodes (43): Select(), TextField(), EmptyState(), Card(), AnimatedNumber(), Finished(), CandidateSheet(), Failure (+35 more)

### Community 16 - "build_prompt"
Cohesion: 0.14
Nodes (6): _allocate(), build_prompt(), _fit(), _ordered_sections(), _split_items(), PromptTests

### Community 17 - "create_app"
Cohesion: 0.10
Nodes (34): create_app(), data_delete(), eng(), model_precheck(), model_pull(), model_pull_cancel(), models(), ollama_start() (+26 more)

### Community 18 - "Settings.tsx"
Cohesion: 0.08
Nodes (38): Harness(), Linked(), Segments(), SheetHarness(), SegmentedControl(), Slider(), Stepper(), TextArea() (+30 more)

### Community 19 - "csv_loader.py"
Cohesion: 0.08
Nodes (25): _build_report(), _cell_text(), _clean_cell(), _decode(), _fail(), _find_header(), _format_decimals(), Issue (+17 more)

### Community 20 - ".recover"
Cohesion: 0.18
Nodes (4): 2. Process model, 6. Run state machine, Headless CLI (Built, Phase 1), WorkerBusyError

### Community 21 - "CandidateSheet.tsx"
Cohesion: 0.13
Nodes (27): Badge(), KeyValue(), Alert(), formatBytes(), formatClock(), formatDate(), formatDuration(), formatPerResume() (+19 more)

### Community 22 - "api-types.ts"
Cohesion: 0.04
Nodes (50): ApiResponse, buildPath(), CallOptions, Part, CutoffPopoverProps, ModelPickerProps, models(), renderPicker() (+42 more)

### Community 23 - "local_only"
Cohesion: 0.14
Nodes (11): A hardening found on the way: Ollama must be on this computer, Files, Graph usefulness (this step), How to try it yourself, Known limitations, Leaving the laptop as it was, Step 3.8 — Verification, The installer and Smart App Control (stop condition) (+3 more)

### Community 24 - "check_licenses.py"
Cohesion: 0.17
Nodes (13): _cpu_name(), _app_imports(), main(), _manifest(), _marker_applies(), _npm_licence(), npm_packages(), Package (+5 more)

### Community 25 - "EasyOcrEngine"
Cohesion: 0.21
Nodes (3): EasyOcrEngine, OcrUnavailable, EasyOcrEngineTests

### Community 27 - "schema.py"
Cohesion: 0.06
Nodes (20): Step 1.6 - LLM scoring, Flag, _clip(), Evaluation, evaluation_json_schema(), inline(), EvaluationParseError, Evidence (+12 more)

### Community 28 - "test_db.py"
Cohesion: 0.08
Nodes (10): criteria_hash(), RunLockedError, CandidateInputTests, ClearFiltersTests, DbTestCase, OverrideAndSettingsTests, RecoveryTests, _rows() (+2 more)

### Community 30 - "HealthProbe"
Cohesion: 0.06
Nodes (11): run_event_lines(), HealthProbe, _OllamaHealth, CliTestCase, CliTests, paused(), wait_past_pauses(), FakeSocket (+3 more)

### Community 31 - "ipc.ts"
Cohesion: 0.14
Nodes (34): OLLAMA_DOWNLOAD_URL, registerIpc(), handle(), TOO_LARGE, CheckedRequest, compile(), copy(), InvalidArgument (+26 more)

### Community 32 - "answer"
Cohesion: 0.16
Nodes (5): ChatResult, answer(), FakeClient, FakeClock, ScorerTests

### Community 33 - "_Cli"
Cohesion: 0.24
Nodes (3): _Cli, _read_criteria(), _wait()

### Community 34 - "load_csv"
Cohesion: 0.12
Nodes (11): load_csv(), render_report(), ContractTests, CsvTestCase, drive(), EncodingAndDelimiterTests, FileLevelTests, HeaderTests (+3 more)

### Community 35 - "Adjust Cutoffs Popover (light)"
Cohesion: 0.08
Nodes (28): Adjust Cutoffs Popover (dark), Cutoff Preview Before Save, Results Sidebar (bucket counts), Adjust Cutoffs Popover (light), Candidate Detail Sheet (dark), Bucket Reason Badge (By score / Filled to minimum), Form Claims Not Found in Résumé, Evidence Quotes from Résumé (+20 more)

### Community 36 - "Progress Screen (Paused, light)"
Cohesion: 0.09
Nodes (31): Progress Screen (Paused, dark), Activity Log (run events timeline), Measured Estimate Badge, Progress Screen (Paused, light), Progress Ring (9 of 25 students), Stage Count Tiles (Waiting / Downloading / Reading / Scoring / Done / Needs attention), System Pause Banner (Ollama isn't running - Nothing is lost), Results Screen (dark) (+23 more)

### Community 39 - "stubs.ts"
Cohesion: 0.17
Nodes (17): Hooks, Request, DemoLib, DemoStubs, launch(), waitForEngine(), Window, copiedText() (+9 more)

### Community 40 - "bridge.ts"
Cohesion: 0.07
Nodes (15): IpcContext, atlas, listeners, on(), Window, ExportOut, ApiErrorBody, AppInfo (+7 more)

### Community 41 - "Settings screen - Data section (light)"
Cohesion: 0.11
Nodes (28): Light/dark theme following the OS, Everything stays on this computer (local-only data), Settings screen - Data section (dark), Always shortlist at least (minimum fill stepper), Atlas data folder (single local folder, storage used, Show in folder), Delete all data (destructive red action), Keep the computer awake while screening, Notify me (finish / needs attention) (+20 more)

### Community 42 - "package.json"
Cohesion: 0.11
Nodes (18): author, description, license, main, name, private, productName, version (+10 more)

### Community 43 - "main/index.ts"
Cohesion: 0.13
Nodes (24): buildMenu(), createWindow(), engine, isAppUrl(), navigate(), overlayColors(), rendererUrl(), setTheme() (+16 more)

### Community 44 - "load_table"
Cohesion: 0.15
Nodes (6): load_table(), CellTextTests, CsvStillWorksTests, TableTestCase, XlsTests, XlsxTests

### Community 45 - "Welcome.tsx"
Cohesion: 0.07
Nodes (40): isPullEvent(), PullEvent, useAppEvents(), useRunEvents(), useSubscription(), ProgressBar(), Toolbar(), defaultRunName() (+32 more)

### Community 46 - "EngineProcess"
Cohesion: 0.17
Nodes (4): EngineProcess, watcher, ApiResult, EngineState

### Community 48 - "Database"
Cohesion: 0.09
Nodes (3): Database, _dict(), SchemaTests

### Community 49 - "smoke"
Cohesion: 0.12
Nodes (6): build_parser(), data(), _Parser, _ready_line(), _request(), smoke()

### Community 50 - "Downloader"
Cohesion: 0.11
Nodes (6): Downloader, _fsync_dir(), _is_signin(), _looks_like_html(), _prepend(), _read_head()

### Community 51 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, electron, electron-builder, electron-vite, eslint, @fontsource-variable/inter, jsdom, lucide-react (+15 more)

### Community 52 - "ref_node_path"
Cohesion: 0.10
Nodes (16): executable, binary, root, app, args, build, dataDir, electron (+8 more)

### Community 53 - "helpers.ts"
Cohesion: 0.23
Nodes (14): open(), screenshots(), APP_DIR, close(), Launched, capture(), PHASE3_SCREENS_DIR, setTheme() (+6 more)

### Community 54 - "parse_evaluation"
Cohesion: 0.16
Nodes (4): overall_from(), parse_evaluation(), MismatchAndCapTests, SchemaTests

### Community 55 - "contrast.test.ts"
Cohesion: 0.13
Nodes (15): BACKGROUNDS, contrast(), css, DARK_MEDIA, luminance(), over(), parse(), resolve() (+7 more)

### Community 56 - "RunWatcher"
Cohesion: 0.16
Nodes (10): confirmAndQuit(), notificationFor(), Preferences, QUIET_REASONS, RunStatus, RunWatcher, RunWatcherDeps, start() (+2 more)

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
Nodes (9): QWENTUS (legacy CLI), Section extraction instead of truncation, match_heading(), split_sections(), _filler(), ten_page_resume_pages(), SectionTests, _identity_leaks() (+1 more)

### Community 62 - "menus.ts"
Cohesion: 0.26
Nodes (9): BUCKET_LABEL, copyFailedMessage(), MINOR, rowMenuTemplate(), build(), Item, RowMenuChoice, RowMenuRequest (+1 more)

### Community 63 - "configure_logging"
Cohesion: 0.12
Nodes (5): configure_logging(), remove_logging(), scrub(), ScrubPII, LogTests

### Community 64 - "profile"
Cohesion: 0.12
Nodes (9): Hardware, _ollama_gpu(), _OllamaPs, _os_name(), profile(), _ram_gb(), FakePs, HardwareTests (+1 more)

### Community 65 - "Worker"
Cohesion: 0.11
Nodes (3): The database as the queue, _delete(), Worker

### Community 66 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+8 more)

### Community 67 - ".__init__"
Cohesion: 0.14
Nodes (4): _clear_logs(), _empty_folder(), _folder_size(), _safe_filename()

### Community 68 - "Step 2.0 — Deferred work recorded, engine gaps filled"
Cohesion: 0.22
Nodes (4): Step 2.0 — Deferred work recorded, engine gaps filled, PLAN Deferred (must finish before real use) — 1.11a redaction blocking, EWMA moving average of scoring times, Magic bytes vs file extensions

### Community 69 - "OllamaInstall"
Cohesion: 0.13
Nodes (9): Files, find_ollama(), OllamaInstall, start_ollama(), options_from_env(), stub_ollama_finder(), stub_ollama_starter(), FindTests (+1 more)

### Community 70 - "Step 3.1 — Required before real use"
Cohesion: 0.22
Nodes (9): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Speed: before and after (report only, no target), Step 3.1 — Required before real use (+1 more)

### Community 71 - "Engine"
Cohesion: 0.09
Nodes (4): ApiError, Engine, PendingTable, _unlink()

### Community 72 - "When a student needs attention"
Cohesion: 0.11
Nodes (19): Google Drive is limiting downloads. Retry later., Link is private. Ask the student to set sharing to "Anyone with the link"., No readable text was found in the résumé., Something went wrong while processing this résumé., The download timed out., The file host refused the download., The file host returned an error., The file is larger than 20 MB. (+11 more)

### Community 75 - "1. Build the real set"
Cohesion: 0.22
Nodes (8): 1. Build the real set, 2. Run it, 3. Read the report, Choose 20–30 résumés, Get consent first, Label them (`labels.csv`), Measuring how well Atlas scores (the eval set), Put them in `local/eval/`

### Community 76 - "Starting Atlas: commands"
Cohesion: 0.14
Nodes (14): 10. Where data lives, 11. Troubleshooting top 10, 1. Prerequisites, 2. First-time setup, 3. Start Ollama, 4. Run the app (development), 5. Demo mode: every screen, no real data, 6. The engine on its own (+6 more)

### Community 79 - "Phase 2 Summary - the Atlas desktop app"
Cohesion: 0.21
Nodes (7): Phase 2 Summary - the Atlas desktop app, 1.11a Identity redaction from the résumé itself (blocks real data), What still feels un-Apple-like, Smoke test 1: Phase 1 engine on real student data, CPU-only scoring speed (~141 s/résumé), Explanations vary for identical inputs, Scores bunch at the top (all 95)

### Community 80 - "Atlas — Build Plan"
Cohesion: 0.33
Nodes (6): Atlas — Build Plan, Deferred (must finish before real use), Design system — Apple-inspired, Phase 1 — Engine (headless, no UI), Phase 2 — App (local API + Electron UI), Phase 3 — Hardening & shipping

### Community 82 - "_error"
Cohesion: 0.15
Nodes (12): _api_error(), _busy(), _db(), _db_invalid(), _export(), _http(), _invalid(), _locked() (+4 more)

### Community 83 - "compute_buckets"
Cohesion: 0.26
Nodes (4): compute_buckets(), buckets_of(), BucketTests, rows()

### Community 84 - "sse.ts"
Cohesion: 0.27
Nodes (7): followRunStatuses(), followEvents(), FollowOptions, sleep(), SseMessage, SseParser, SSE event streams with Last-Event-ID

### Community 85 - "2. Steps"
Cohesion: 0.29
Nodes (7): 1.10 Stub servers and end-to-end tests, 1.3 `engine/ingest/csv_loader.py`: CSV loading and the pre-flight report, 1.4 `engine/ingest/downloader.py`: downloading résumés, 1.5 `engine/extract/`: text and section extraction, 1.8 `engine/export.py`: CSV export, 1.9 `engine/cli.py`: headless proof of Phase 1, 2. Steps

### Community 86 - "._handler"
Cohesion: 0.27
Nodes (7): evaluation_for(), _body(), _chat(), do_GET(), do_POST(), _json(), _pull()

### Community 87 - "_Listed"
Cohesion: 0.16
Nodes (4): 10. CSV ingest and pre-flight, 17. Local API, publish(), _Listed

### Community 88 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, demo, demo:fast, demo:reset, dev, dist, e2e (+8 more)

### Community 89 - "link_kind"
Cohesion: 0.15
Nodes (7): Before and after on this laptop (`perf.spec`, 3 runs each, standalone), CI, Live cutoffs: the first key press was close to its limit, The fix (engine only; the screen didn't change), What the profile showed, link_kind(), LinkKindTests

### Community 91 - "filter_reason"
Cohesion: 0.19
Nodes (6): department_counts(), department_key(), filter_reason(), FilterPreview, preview(), FilterTests

### Community 92 - "test_server.py"
Cohesion: 0.04
Nodes (27): control_server(), link(), main(), make_file(), serve(), serve_files(), student_id(), build() (+19 more)

### Community 93 - "Phase 3 Summary — Atlas made shippable"
Cohesion: 0.17
Nodes (12): 1. Overview, 2. Steps, 3. Definition of done: evidence, 4. Numbers the owner asked for, 6. Did graphify help? (honest finding), 7. Known weaknesses (most severe first), 8. Ready for real use?, 9. What you need to do (+4 more)

### Community 94 - "ClientTests"
Cohesion: 0.21
Nodes (4): ClientTests, FakeHttpResponse, prepared(), stream_lines()

### Community 95 - "Step 2.1 — The local API (engine/server.py)"
Cohesion: 0.17
Nodes (6): api-schema.json (exported OpenAPI), Step 2.1 — The local API (engine/server.py), Contract-first API: Pydantic -> OpenAPI -> TypeScript, Host header check against DNS rebinding, Api, Guard

### Community 96 - "engine.ts"
Cohesion: 0.24
Nodes (4): engineCommand, EngineOptions, findRepo(), ReadyLineParser

### Community 98 - "Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)"
Cohesion: 0.67
Nodes (3): Engine dev requirements (httpx for TestClient), Optional OCR requirements (easyocr), Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)

### Community 99 - "Estimate"
Cohesion: 0.11
Nodes (11): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning, Tests (+3 more)

### Community 100 - "ScoreBand"
Cohesion: 0.18
Nodes (6): Band, ScoreBand(), Harness(), 3 · Lost key presses on the cutoff slider, Step 2.5 — Screens part 2: Criteria, Cutoffs, Review, Inputs vs decisions: handles constrain input, engine decides

### Community 101 - "DatabaseError"
Cohesion: 0.15
Nodes (3): DatabaseError, _is_transient_open_error(), KillTest

### Community 102 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 103 - "Atlas — Architecture"
Cohesion: 0.10
Nodes (20): 11. Downloading résumés, 12. Text and section extraction, 13. LLM scoring, 14. Buckets, cutoffs and minimum fill, 18. UI screens and flow, 19. Security and privacy, 1. System context, 20. Filesystem layout (+12 more)

### Community 104 - "fullscreen.spec.ts"
Cohesion: 0.18
Nodes (6): check(), everyScreen(), Layout, SCREENS_DIR, Step 2.9 — End-to-end flows, keyboard, performance, Performance measured inside the page (PerformanceObserver/MutationObserver)

### Community 105 - "parse_multipart_file"
Cohesion: 0.40
Nodes (3): run_table(), parse_multipart_file(), MultipartTests

### Community 106 - "Phase 1: Build the Atlas engine end to end"
Cohesion: 0.22
Nodes (8): 0.0 Setup check (do this before anything else), 0. Read first, in this order, 1. Ground rules for this job, 3. Definition of done for Phase 1, 4. Final report format, Phase 1: Build the Atlas engine end to end, Stop conditions: stop, explain, and wait for me, Summaries: document everything you do

### Community 107 - "OcrFallbackTests"
Cohesion: 0.15
Nodes (3): ExtractTestCase, FakeOcr, OcrFallbackTests

### Community 108 - "clean_text"
Cohesion: 0.17
Nodes (3): clean_text(), OcrEngine, CleanTextTests

### Community 110 - "Get Another Model Dialog (light)"
Cohesion: 0.67
Nodes (4): Get Another Model Dialog (dark), Get Another Model Dialog (light), Local Model Picker (runs on this computer, nothing sent anywhere), Setup Stepper (Students & model, Criteria, Cutoffs, Review)

### Community 112 - "App.tsx"
Cohesion: 0.11
Nodes (19): App(), queries, Screens(), Shell(), useEngineState(), useHashRoute(), usePlatform(), ToastProvider() (+11 more)

### Community 113 - ".assert_fails"
Cohesion: 0.36
Nodes (3): confirm_page(), html(), HtmlTrapTests

### Community 114 - "Atlas: private, on-device résumé screening for campus hiring"
Cohesion: 0.17
Nodes (12): Atlas: private, on-device résumé screening for campus hiring, Documentation, Key features, License, Privacy and security, Quick start, Repository layout, Screenshots (+4 more)

### Community 117 - "Any"
Cohesion: 0.08
Nodes (8): BucketResult, _app_event_stream(), AppEvents, _departments(), _event_fields(), _events_after(), _failure_groups(), _run_event_stream()

### Community 118 - "electron.vite.config.ts"
Cohesion: 0.40
Nodes (3): shared, electron-vite, vite

### Community 120 - "sys"
Cohesion: 0.07
Nodes (13): main(), seed(), audit(), count(), Count, indexed_files(), main(), _norm() (+5 more)

### Community 124 - "Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md"
Cohesion: 0.18
Nodes (9): Concepts to learn, Files, Graph usefulness (this step), Key decisions and why, Known limitations, Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md, Tests, What was built (+1 more)

### Community 125 - "scoring_input"
Cohesion: 0.10
Nodes (20): Files, apply(), build_lexicon(), common_words(), Lexicon, name_line(), name_tokens(), profile_usernames() (+12 more)

### Community 126 - "DownloaderTestCase"
Cohesion: 0.27
Nodes (4): DiskAndThrottleTests, DownloaderTestCase, HappyPathTests, pdf()

### Community 142 - "CI fixes: four failures on the first full CI run (2026-10-02)"
Cohesion: 0.15
Nodes (5): 2 · The window size on a small screen, CI fixes: four failures on the first full CI run (2026-10-02), Open (not changed), Tests, 5. Design changes vs ARCHITECTURE (all reflected in it now)

### Community 148 - "Step 3.2 — Scoring quality: anchored rubric and eval harness"
Cohesion: 0.20
Nodes (10): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Results on the fictional set (real `qwen3:8b`, this laptop, CPU only), Step 3.2 — Scoring quality: anchored rubric and eval harness (+2 more)

### Community 149 - "gen-api-types.mjs"
Cohesion: 0.26
Nodes (15): bodyType(), byKey(), field(), generate(), here, inlineObject(), namedType(), OUT_PATH (+7 more)

### Community 150 - "server.py"
Cohesion: 0.05
Nodes (17): 8. Failure classification, Step 1.4 - Downloading résumés, Placement, AtlasError, CandidateError, Pause, PullError, Reason (+9 more)

### Community 151 - "CLAUDE.md — Atlas"
Cohesion: 0.25
Nodes (8): CLAUDE.md — Atlas, Commands, Design rules (Phase 2 UI), Glossary, How to work in this repo, Navigating the codebase (graphify), Repo layout, The one promise

### Community 152 - "How Atlas handles student data"
Cohesion: 0.29
Nodes (7): 1. What stays on the computer, 2. What leaves the computer, and only this, 3. What the AI is and isn't shown, 4. Deleting data, 5. Points for your legal team (India's DPDP Act and similar), How Atlas handles student data, In one paragraph

### Community 154 - "main"
Cohesion: 0.13
Nodes (12): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Numbers (Windows x64, this laptop), Step 3.5 — Packaging: the engine binary, the installers, signing by secrets (+4 more)

### Community 156 - "graph_query.py"
Cohesion: 0.42
Nodes (5): _load(), main(), _match(), run(), _where()

### Community 157 - "PlacementLike"
Cohesion: 0.50
Nodes (3): _cells(), PlacementLike, _select()

### Community 158 - ".__init__"
Cohesion: 0.25
Nodes (4): DownloaderLike, ExtractorLike, HealthLike, _sha256()

### Community 159 - "._handler"
Cohesion: 0.52
Nodes (4): do_GET(), _head(), _send(), _serve()

### Community 162 - "Code signing: what to buy and how to add it"
Cohesion: 0.29
Nodes (7): Checking a build, Code signing: what to buy and how to add it, How to add the secrets, macOS: the Apple Developer Program, What recruiters see without signing, What to buy, Windows: a code-signing certificate

### Community 163 - "Third-party notices"
Cohesion: 0.20
Nodes (9): click(), Bundled packages, Copyleft, restrictive or notable licences (read first), JavaScript packages (bundled into the app by vite, plus the Electron runtime), Needs a decision: PyMuPDF, Not shipped, but used by Atlas, Python packages (bundled into the engine by PyInstaller), Runtimes and system components inside the installer (+1 more)

### Community 165 - "Tests"
Cohesion: 0.19
Nodes (4): Tests, MigrationTests, LeakCheckTests, TimingHistoryTests

### Community 166 - "Installing and using Atlas"
Cohesion: 0.18
Nodes (11): 1. Install Ollama, 2. Install Atlas, 3. The first run, 4. Your first screening, 5. Overnight checklist, 6. Where your data lives, 7. Updating and uninstalling, Installing and using Atlas (+3 more)

### Community 168 - "plan_download"
Cohesion: 0.16
Nodes (6): DownloadPlan, drive_file_id(), link_identity(), plan_download(), with_scheme(), PlanTests

### Community 169 - "Step 3.6 — CI on Windows and macOS"
Cohesion: 0.20
Nodes (10): Concepts to learn, Failure handling, Graph usefulness (this step), How it was validated (no push), How to try it yourself, Key decisions and why, Known limitations, Step 3.6 — CI on Windows and macOS (+2 more)

### Community 171 - "CandidateContext"
Cohesion: 0.08
Nodes (14): _claims_lines(), _context_lines(), _defang(), split_claims(), CandidateContext, ScoreResult, FakeExtractor, FakeHealth (+6 more)

### Community 172 - "Progress"
Cohesion: 0.12
Nodes (17): SetupOptions, startScreening(), waitForStatus(), Detail, open(), opened, request(), Row (+9 more)

### Community 173 - "When a screening pauses"
Cohesion: 0.11
Nodes (18): Atlas hit repeated errors. See logs., Atlas was closed, Connected to Wi-Fi that needs a sign-in page, Disk is full, Downloading a model, High score without supporting evidence, No internet connection, Notes on a screened student (flags) (+10 more)

### Community 174 - "README, LICENSE, START_CMDS and a third-party licence check"
Cohesion: 0.22
Nodes (8): Docs that disagreed with the code (code wins), Found and fixed while verifying, Graph usefulness, Licence findings, Mermaid, README, LICENSE, START_CMDS and a third-party licence check, Tests, What was built

### Community 175 - "Step 3.7 — Docs for the firm"
Cohesion: 0.22
Nodes (8): Concepts to learn, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Step 3.7 — Docs for the firm, Tests, What was built

### Community 179 - "Step 3.4 — Native-feel quick wins"
Cohesion: 0.22
Nodes (8): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Step 3.4 — Native-feel quick wins, What was built

### Community 182 - "control_server"
Cohesion: 0.47
Nodes (4): control_server(), do_GET(), do_POST(), reply()

### Community 183 - "_match"
Cohesion: 0.50
Nodes (3): _lookup(), _match(), _norm()

### Community 184 - "System design"
Cohesion: 0.25
Nodes (8): 1. System context, 2. Process model, 3. The résumé pipeline, 5. Run states, 6. Data model (schema version 3), 7. One screening, from the click to the export, 8. How a score becomes a bucket, System design

### Community 185 - "Step 2.2 — The Electron shell (app/main, app/preload)"
Cohesion: 0.24
Nodes (5): hardenSession(), isAllowedRequest(), Step 2.2 — The Electron shell (app/main, app/preload), CSP, context isolation and sandbox, Restart budget: 3 restarts in 60 s then failed

### Community 193 - "app_events"
Cohesion: 0.50
Nodes (3): app_events(), run_events(), _sse()

## Ambiguous Edges - Review These
- `This computer status card (Ollama running, models installed, data folder)` → `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`  [AMBIGUOUS]
  docs/summaries/phase2/screens/welcome-resume-light.png · relation: conceptually_related_to

## Knowledge Gaps
- **545 isolated node(s):** `semi`, `singleQuote`, `printWidth`, `trailingComma`, `Request` (+540 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1244 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This computer status card (Ollama running, models installed, data folder)` and `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Progress` connect `Progress` to `Button`, `.transaction`, `OllamaClient`, `Results.tsx`, `Settings.tsx`, `.recover`, `CandidateSheet.tsx`, `server.py`, `make_ten_page_resume`, `schema.py`, `HealthProbe`, `ipc.ts`, `load_csv`, `Tests`, `stubs.ts`, `bridge.ts`, `plan_download`, `load_table`, `Welcome.tsx`, `Database`, `helpers.ts`, `ExportError`, `RunWatcher`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `Engine`, `StubServer`, `Atlas — Build Plan`, `Estimate`, `ScoreBand`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `test_tools.py`, `export_csv`, `.worker`, `.transaction`, `csv_loader.py`, `server.py`, `test_db.py`, `HealthProbe`, `.__init__`, `_Cli`, `load_csv`, `.kind`, `Tests`, `CandidateContext`, `Progress`, `Worker`, `.__init__`, `Engine`, `run_waiting_to_resume`, `test_server.py`, `CompletedRunCutoffTests`, `DatabaseError`, `Phase 1: Build the Atlas engine end to end`, `sys`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `ServerTestCase`, `.transaction`, `OllamaClient`, `CI fixes: four failures on the first full CI run (2026-10-02)`, `create_app`, `csv_loader.py`, `.recover`, `server.py`, `EasyOcrEngine`, `main`, `HealthProbe`, `load_table`, `Progress`, `._precheck_status`, `Database`, `Downloader`, `profile`, `Worker`, `.__init__`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `OllamaInstall`, `run_waiting_to_resume`, `.estimate`, `Phase 2 Summary - the Atlas desktop app`, `compute_buckets`, `_Listed`, `test_server.py`, `Step 2.1 — The local API (engine/server.py)`, `Estimate`, `Any`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `Database` (e.g. with `9. Crash recovery` and `Hard rules (never break these)`) actually correct?**
  _`Database` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `Worker` (e.g. with `9. Crash recovery` and `Graph usefulness (this step)`) actually correct?**
  _`Worker` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `Engine` (e.g. with `One active run per engine` and `BucketResult`) actually correct?**
  _`Engine` has 22 INFERRED edges - model-reasoned connections that need verification._