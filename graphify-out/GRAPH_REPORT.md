# Graph Report - atlas  (2026-10-01)

## Corpus Check
- 203 files · ~470,186 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: .css 8, (none) 4, .csv 1)

## Summary
- 3083 nodes · 8082 edges · 164 communities (103 shown, 61 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 656 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cdaeefb2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.py
- Phase 1 Summary - the Atlas engine
- export_csv
- Downloader
- __main__.py
- .worker
- filter_reason
- .transaction
- App.tsx
- .downloader
- OllamaClient
- api_models.py
- run_waiting_to_resume
- Button
- test_llm.py
- create_app
- Settings.tsx
- csv_loader.py
- Worker
- Welcome.tsx
- api-types.ts
- Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md
- test_server.py
- OllamaStub
- ServerTestCase
- Review
- test_db.py
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
- SetupFlow.tsx
- EngineProcess
- Engine
- Database
- EndToEndTest
- Extraction
- devDependencies
- test_health_logs.py
- .recover
- NormalisationTests
- contrast.test.ts
- RunWatcher
- compilerOptions
- compilerOptions
- Results: Needs Attention View (light)
- compilerOptions
- split_sections
- schema.py
- ResultList.tsx
- hardware.py
- compilerOptions
- Path
- Step 2.0 — Deferred work recorded, engine gaps filled
- OllamaInstall
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
- .__init__
- parse_evaluation
- gen-api-types.mjs
- compute_buckets
- sse.ts
- link_kind
- ._handler
- HealthTests
- scripts
- harness.py
- Pre-check sample résumé (fictional Meera Nair)
- link_identity
- test_downloader.py
- FakeClock
- ClientTests
- .__call__
- engine.ts
- CompletedRunCutoffTests
- Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)
- Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning
- flows.spec.ts
- DatabaseError
- .prettierrc.json
- Atlas — Architecture
- Lexicon
- parse_multipart_file
- EasyOcrEngine
- test_extract.py
- Live sample résumé: strong backend (Rohan Pillai)
- Get Another Model Dialog (light)
- MigrationTests
- Step 2.8 — Screen: Settings
- graph_query.py
- Progress
- assets.d.ts
- tsconfig.json
- Any
- electron.vite.config.ts
- graph_audit.py
- test_eval.py
- Files
- 15. Time estimate
- Step 3.2 — Scoring quality: anchored rubric and eval harness
- screens.ts
- Stubs
- 13. LLM scoring
- How Atlas handles student data
- MismatchAndCapTests
- ._handler
- _delete
- LeakCheckTests
- PlacementLike
- .in_bucket
- FakeClock
- FakeHttp
- LaunchTests
- FakeSession
- report.md

## God Nodes (most connected - your core abstractions)
1. `Database` - 118 edges
2. `Worker` - 87 edges
3. `Engine` - 84 edges
4. `create_app()` - 69 edges
5. `OllamaClient` - 61 edges
6. `Button` - 55 edges
7. `Scorer` - 50 edges
8. `load_csv()` - 48 edges
9. `Progress` - 47 edges
10. `Reason` - 45 edges

## Surprising Connections (you probably didn't know these)
- `ScrubPII` --semantically_similar_to--> `header and personal sections never sent to the model`  [INFERRED] [semantically similar]
  engine/logs.py → docs/summaries/phase1/step-1.5-extraction.md
- `Settings()` --references--> `nav.forget (Back never returns to deleted run)`  [INFERRED]
  app/renderer/screens/Settings.tsx → docs/summaries/phase2/step-2.8-settings.md
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

## Communities (164 total, 61 thin omitted)

### Community 0 - "server.py"
Cohesion: 0.06
Nodes (5): RecoveryReport, Flag, Reason, remember(), Sample

### Community 1 - "Phase 1 Summary - the Atlas engine"
Cohesion: 0.26
Nodes (10): 16. Export, Atlas CHANGELOG, Step 1.0 - Baseline on Windows, Step 1.10 - Stub servers and end-to-end tests, Step 1.3 - CSV loading and the pre-flight report, Step 1.5 - Text and section extraction, Step 1.8 - CSV export, Step 1.9 - The headless CLI (+2 more)

### Community 2 - "export_csv"
Cohesion: 0.14
Nodes (10): _escape(), export_csv(), AtomicWriteTests, exploding_writer(), DatabaseRowsTests, ExportTestCase, FormatTests, placements() (+2 more)

### Community 3 - "Downloader"
Cohesion: 0.06
Nodes (12): _confirm_url(), Downloader, _FormScanner, _fsync_dir(), is_disk_full(), _is_signin(), _looks_like_html(), _prepend() (+4 more)

### Community 4 - "__main__.py"
Cohesion: 0.15
Nodes (7): Files, write_set(), read_labels(), render(), write_report(), main(), EvalHarnessTests

### Community 6 - ".worker"
Cohesion: 0.14
Nodes (9): CandidateFailureTests, FilterTests, HappyPathTests, Once, StopAndRecoveryTests, SystemProblemTests, maybe_down(), UnexpectedErrorTests (+1 more)

### Community 7 - "filter_reason"
Cohesion: 0.19
Nodes (6): department_counts(), department_key(), filter_reason(), FilterPreview, preview(), FilterTests

### Community 9 - ".transaction"
Cohesion: 0.08
Nodes (11): bucket(), 10. CSV ingest and pre-flight, 5. Candidate state machine, 7. The worker pipeline, Hard rules (never break these), Step 1.7 - The resumable job loop, InvalidTransitionError, NotFoundError (+3 more)

### Community 10 - "App.tsx"
Cohesion: 0.04
Nodes (58): App(), queries, Screens(), Shell(), useEngineState(), useHashRoute(), usePlatform(), ChipProps (+50 more)

### Community 11 - ".downloader"
Cohesion: 0.12
Nodes (11): confirm_page(), DiskAndThrottleTests, DownloaderTestCase, FakeResponse, HappyPathTests, html(), HtmlTrapTests, NetworkErrorTests (+3 more)

### Community 12 - "OllamaClient"
Cohesion: 0.05
Nodes (16): Step 1.4 - Downloading résumés, AtlasError, Pull, PullError, SystemUnavailable, TransientError, _connection_error(), ChatDeadline (+8 more)

### Community 13 - "api_models.py"
Cohesion: 0.06
Nodes (56): ActivityOut, BucketCountsOut, BucketDeltaOut, CandidateInfoOut, CandidateOut, ClearFiltersOut, ConfirmOut, CountsOut (+48 more)

### Community 14 - "run_waiting_to_resume"
Cohesion: 0.08
Nodes (8): AttachTests, CancelTests, FiltersTests, LifecycleTestCase, OneRunAtATimeTests, RecoverTests, TimingHistoryTests, run_waiting_to_resume()

### Community 15 - "Button"
Cohesion: 0.13
Nodes (30): Button, Banner(), EmptyState(), Card(), Sidebar(), AnimatedNumber(), Spinner(), Finished() (+22 more)

### Community 16 - "test_llm.py"
Cohesion: 0.06
Nodes (26): Step 1.6 - LLM scoring, CandidateError, precheck(), result(), PrecheckResult, slow_message(), _allocate(), build_prompt() (+18 more)

### Community 17 - "create_app"
Cohesion: 0.07
Nodes (50): create_app(), _api_error(), app_events(), _busy(), data_delete(), _db(), _db_invalid(), eng() (+42 more)

### Community 18 - "Settings.tsx"
Cohesion: 0.10
Nodes (45): Harness(), Linked(), Segments(), SheetHarness(), decimalsOf(), SegmentedControl(), Select(), Slider() (+37 more)

### Community 19 - "csv_loader.py"
Cohesion: 0.09
Nodes (25): _build_report(), _cell_text(), _clean_cell(), _decode(), _fail(), _find_header(), _format_decimals(), Issue (+17 more)

### Community 21 - "Welcome.tsx"
Cohesion: 0.08
Nodes (42): api(), ApiFailure, ApiResponse, buildPath(), CallOptions, messageOf(), Part, isPullEvent() (+34 more)

### Community 22 - "api-types.ts"
Cohesion: 0.05
Nodes (43): CutoffPopoverProps, NAMES, ActivityOut, BucketDeltaOut, CandidateInfoOut, ClearFiltersOut, ConfirmOut, CountsOut (+35 more)

### Community 23 - "Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md"
Cohesion: 0.16
Nodes (10): Concepts to learn, Files, Graph usefulness (this step), Key decisions and why, Known limitations, Step 3.0 — The graph: privacy check, ignore rules and CLAUDE.md, Tests, What was built (+2 more)

### Community 24 - "test_server.py"
Cohesion: 0.08
Nodes (7): 8. Failure classification, Pause, HealthProbe, _OllamaHealth, export_openapi(), simple_resume_text(), OpenApiTests

### Community 25 - "OllamaStub"
Cohesion: 0.07
Nodes (10): build(), control_server(), do_GET(), do_POST(), reply(), main(), student(), DriveStub (+2 more)

### Community 26 - "ServerTestCase"
Cohesion: 0.08
Nodes (11): Api, AuthTests, BootTests, CancelTests, CaptivePortalTests, ConfigLockTests, ErrorBodyTests, FlowTests (+3 more)

### Community 27 - "Review"
Cohesion: 0.11
Nodes (7): _compact(), detect_injection(), names_a_claim(), normalise(), quote_found(), Review, VerifyTests

### Community 28 - "test_db.py"
Cohesion: 0.07
Nodes (11): criteria_hash(), RunLockedError, CandidateInputTests, ClearFiltersTests, DbTestCase, OverrideAndSettingsTests, RecoveryTests, _rows() (+3 more)

### Community 31 - "ipc.ts"
Cohesion: 0.16
Nodes (30): IpcContext, OLLAMA_DOWNLOAD_URL, registerIpc(), handle(), TOO_LARGE, CheckedRequest, compile(), copy() (+22 more)

### Community 32 - "answer"
Cohesion: 0.24
Nodes (4): ChatResult, answer(), FakeClient, ScorerTests

### Community 33 - "_Cli"
Cohesion: 0.24
Nodes (3): _Cli, _read_criteria(), _wait()

### Community 34 - "load_csv"
Cohesion: 0.12
Nodes (11): _join_limited(), load_csv(), render_report(), ContractTests, CsvTestCase, drive(), EncodingAndDelimiterTests, FileLevelTests (+3 more)

### Community 35 - "Adjust Cutoffs Popover (light)"
Cohesion: 0.08
Nodes (28): Adjust Cutoffs Popover (dark), Cutoff Preview Before Save, Results Sidebar (bucket counts), Adjust Cutoffs Popover (light), Candidate Detail Sheet (dark), Bucket Reason Badge (By score / Filled to minimum), Form Claims Not Found in Résumé, Evidence Quotes from Résumé (+20 more)

### Community 36 - "Progress Screen (Paused, light)"
Cohesion: 0.09
Nodes (31): Progress Screen (Paused, dark), Activity Log (run events timeline), Measured Estimate Badge, Progress Screen (Paused, light), Progress Ring (9 of 25 students), Stage Count Tiles (Waiting / Downloading / Reading / Scoring / Done / Needs attention), System Pause Banner (Ollama isn't running - Nothing is lost), Results Screen (dark) (+23 more)

### Community 38 - ".new_run"
Cohesion: 0.16
Nodes (3): StateMachineTests, claim(), sample()

### Community 39 - "helpers.ts"
Cohesion: 0.25
Nodes (13): screenshots(), SetupOptions, startScreening(), waitForStatus(), close(), Launched, capture(), PHASE3_SCREENS_DIR (+5 more)

### Community 40 - "bridge.ts"
Cohesion: 0.07
Nodes (18): atlas, listeners, on(), Window, ExportOut, ApiErrorBody, AtlasBridge, AtlasEvent (+10 more)

### Community 41 - "Settings screen - Data section (light)"
Cohesion: 0.11
Nodes (28): Light/dark theme following the OS, Everything stays on this computer (local-only data), Settings screen - Data section (dark), Always shortlist at least (minimum fill stepper), Atlas data folder (single local folder, storage used, Show in folder), Delete all data (destructive red action), Keep the computer awake while screening, Notify me (finish / needs attention) (+20 more)

### Community 42 - "package.json"
Cohesion: 0.12
Nodes (16): description, main, name, private, productName, version, electron-builder, eslint (+8 more)

### Community 43 - "main/index.ts"
Cohesion: 0.13
Nodes (23): buildMenu(), createWindow(), engine, isAppUrl(), navigate(), overlayColors(), rendererUrl(), setTheme() (+15 more)

### Community 44 - "load_table"
Cohesion: 0.15
Nodes (6): load_table(), CellTextTests, CsvStillWorksTests, TableTestCase, XlsTests, XlsxTests

### Community 45 - "SetupFlow.tsx"
Cohesion: 0.09
Nodes (29): Band, ScoreBand(), Harness(), formatPerResume(), formatRange(), Cutoffs(), useDebounced(), cutoffItems() (+21 more)

### Community 46 - "EngineProcess"
Cohesion: 0.17
Nodes (4): EngineProcess, watcher, ApiResult, EngineState

### Community 49 - "EndToEndTest"
Cohesion: 0.10
Nodes (4): build_parser(), main(), _Parser, EndToEndTest

### Community 50 - "Extraction"
Cohesion: 0.10
Nodes (10): Extraction, Downloaded, FakeDownloader, FakeExtractor, FakeHealth, _files_in(), ManualClock, action() (+2 more)

### Community 51 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, electron, electron-builder, electron-vite, eslint, @fontsource-variable/inter, jsdom, lucide-react (+15 more)

### Community 52 - "test_health_logs.py"
Cohesion: 0.12
Nodes (5): configure_logging(), remove_logging(), scrub(), ScrubPII, LogTests

### Community 53 - ".recover"
Cohesion: 0.16
Nodes (4): 17. Local API, 6. Run state machine, Headless CLI (Built, Phase 1), WorkerBusyError

### Community 55 - "contrast.test.ts"
Cohesion: 0.16
Nodes (12): BACKGROUNDS, contrast(), css, DARK_MEDIA, luminance(), over(), parse(), resolve() (+4 more)

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
Cohesion: 0.06
Nodes (14): QWENTUS (legacy CLI), Section extraction instead of truncation, clean_text(), OcrEngine, PdfExtractor, _lookup(), _match(), match_heading() (+6 more)

### Community 62 - "schema.py"
Cohesion: 0.13
Nodes (10): Evaluation, EvaluationParseError, Evidence, _load_json_object(), ModelAnswer, _Strict, SubScores, ScoreResult (+2 more)

### Community 63 - "ResultList.tsx"
Cohesion: 0.13
Nodes (16): ScorePill(), tokens.css (design tokens), describeDelta(), FilteredCells(), LINK, Name(), ResultList(), ResultListProps (+8 more)

### Community 64 - "hardware.py"
Cohesion: 0.06
Nodes (24): _cpu_name(), Hardware, _ollama_gpu(), _OllamaPs, _os_name(), profile(), _ram_gb(), FakePs (+16 more)

### Community 66 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+8 more)

### Community 67 - "Path"
Cohesion: 0.12
Nodes (7): 11. Downloading résumés, _clear_logs(), _empty_folder(), _folder_size(), PendingTable, _safe_filename(), _unlink()

### Community 68 - "Step 2.0 — Deferred work recorded, engine gaps filled"
Cohesion: 0.12
Nodes (6): Step 2.0 — Deferred work recorded, engine gaps filled, PLAN Deferred (must finish before real use) — 1.11a redaction blocking, EWMA moving average of scoring times, Magic bytes vs file extensions, Estimate, ewma()

### Community 69 - "OllamaInstall"
Cohesion: 0.09
Nodes (11): find_ollama(), OllamaInstall, start_ollama(), build_parser(), EngineOptions, main(), options_from_env(), stub_ollama_finder() (+3 more)

### Community 70 - "Step 3.1 — Required before real use"
Cohesion: 0.20
Nodes (9): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Speed: before and after (report only, no target), Step 3.1 — Required before real use (+1 more)

### Community 73 - "stubs.ts"
Cohesion: 0.16
Nodes (11): check(), everyScreen(), Layout, launch(), Window, PYTHON, REPO, tempDir() (+3 more)

### Community 75 - "1. Build the real set"
Cohesion: 0.22
Nodes (8): 1. Build the real set, 2. Run it, 3. Read the report, Choose 20–30 résumés, Get consent first, Label them (`labels.csv`), Measuring how well Atlas scores (the eval set), Put them in `local/eval/`

### Community 76 - "Progress.tsx"
Cohesion: 0.13
Nodes (22): ProgressRing(), formatClock(), formatDate(), formatDuration(), greeting(), plural(), ACTIVITY, Feed() (+14 more)

### Community 79 - "Phase 2 Summary - the Atlas desktop app"
Cohesion: 0.11
Nodes (12): api-schema.json (exported OpenAPI), Step 2.1 — The local API (engine/server.py), Contract-first API: Pydantic -> OpenAPI -> TypeScript, Host header check against DNS rebinding, Phase 2 Summary - the Atlas desktop app, 1.11a Identity redaction from the résumé itself (blocks real data), What still feels un-Apple-like, Smoke test 1: Phase 1 engine on real student data (+4 more)

### Community 80 - ".__init__"
Cohesion: 0.25
Nodes (3): HealthLike, ScorerLike, _sha256()

### Community 81 - "parse_evaluation"
Cohesion: 0.13
Nodes (7): overall_from(), _clip(), evaluation_json_schema(), inline(), _not_bool(), parse_evaluation(), SchemaTests

### Community 82 - "gen-api-types.mjs"
Cohesion: 0.19
Nodes (15): bodyType(), byKey(), field(), generate(), here, inlineObject(), namedType(), OUT_PATH (+7 more)

### Community 83 - "compute_buckets"
Cohesion: 0.26
Nodes (4): compute_buckets(), buckets_of(), BucketTests, rows()

### Community 84 - "sse.ts"
Cohesion: 0.27
Nodes (7): followRunStatuses(), followEvents(), FollowOptions, sleep(), SseMessage, SseParser, SSE event streams with Last-Event-ID

### Community 85 - "link_kind"
Cohesion: 0.12
Nodes (5): BucketResult, link_kind(), _failure_groups(), LinkKindTests, 1.9 `engine/cli.py`: headless proof of Phase 1

### Community 86 - "._handler"
Cohesion: 0.27
Nodes (7): evaluation_for(), _body(), _chat(), do_GET(), do_POST(), _json(), _pull()

### Community 87 - "HealthTests"
Cohesion: 0.12
Nodes (4): FakeSocket, HealthTests, probe(), connect()

### Community 88 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, e2e, format, gen:api, lint, test (+1 more)

### Community 89 - "harness.py"
Cohesion: 0.20
Nodes (9): evaluate(), _leaks(), _ranks(), Report, ResumeResult, _row(), ScorerLike, spearman() (+1 more)

### Community 92 - "test_downloader.py"
Cohesion: 0.13
Nodes (12): Confirm, Drip, Html, Oversized, Pdf, RateLimited, SignIn, Status (+4 more)

### Community 93 - "FakeClock"
Cohesion: 0.19
Nodes (3): Tests, FakeClock, PrecheckTests

### Community 94 - "ClientTests"
Cohesion: 0.25
Nodes (4): ClientTests, FakeHttpResponse, prepared(), stream_lines()

### Community 96 - "engine.ts"
Cohesion: 0.16
Nodes (7): engineCommand, EngineOptions, findRepo(), ReadyLineParser, Step 2.2 — The Electron shell (app/main, app/preload), CSP, context isolation and sandbox, Restart budget: 3 restarts in 60 s then failed

### Community 98 - "Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)"
Cohesion: 0.67
Nodes (3): Engine dev requirements (httpx for TestClient), Optional OCR requirements (easyocr), Engine runtime requirements (requests, PyMuPDF, pydantic, openpyxl, fastapi, uvicorn)

### Community 99 - "Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning"
Cohesion: 0.18
Nodes (9): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning, Tests (+1 more)

### Community 100 - "flows.spec.ts"
Cohesion: 0.15
Nodes (8): Detail, open(), opened, request(), Row, Run, waitForEngine(), RFC-4180

### Community 101 - "DatabaseError"
Cohesion: 0.14
Nodes (4): How to work in this repo, DatabaseError, _is_transient_open_error(), KillTest

### Community 102 - ".prettierrc.json"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 103 - "Atlas — Architecture"
Cohesion: 0.08
Nodes (22): 12. Text and section extraction, 14. Buckets, cutoffs and minimum fill, 18. UI screens and flow, 19. Security and privacy, 1. System context, 20. Filesystem layout, 21. Packaging, 22. Testing strategy (+14 more)

### Community 104 - "Lexicon"
Cohesion: 0.18
Nodes (6): apply(), Lexicon, _Identity, identity_of(), _phone_sub(), redact()

### Community 106 - "EasyOcrEngine"
Cohesion: 0.18
Nodes (3): EasyOcrEngine, OcrUnavailable, EasyOcrEngineTests

### Community 107 - "test_extract.py"
Cohesion: 0.10
Nodes (8): _filler(), make_pdf(), make_ten_page_resume(), ten_page_resume_pages(), ExtractTestCase, FakeOcr, OcrFallbackTests, PdfTests

### Community 110 - "Get Another Model Dialog (light)"
Cohesion: 0.67
Nodes (4): Get Another Model Dialog (dark), Get Another Model Dialog (light), Local Model Picker (runs on this computer, nothing sent anywhere), Setup Stepper (Students & model, Criteria, Cutoffs, Review)

### Community 112 - "Step 2.8 — Screen: Settings"
Cohesion: 0.20
Nodes (3): nav.forget (Back never returns to deleted run), Step 2.8 — Screen: Settings, Optimistic settings updates with rollback

### Community 113 - "graph_query.py"
Cohesion: 0.18
Nodes (7): main(), seed(), _load(), main(), _match(), run(), _where()

### Community 114 - "Progress"
Cohesion: 0.13
Nodes (13): open(), nextMessageBoxAnswers(), nextSaveDialogReturns(), recordShellOpens(), shellOpened(), _status_event(), Atlas — Build Plan, Deferred (must finish before real use) (+5 more)

### Community 117 - "Any"
Cohesion: 0.21
Nodes (5): AppEvents, _departments(), _event_fields(), _events_after(), _run_event_stream()

### Community 118 - "electron.vite.config.ts"
Cohesion: 0.40
Nodes (3): shared, electron-vite, vite

### Community 120 - "graph_audit.py"
Cohesion: 0.30
Nodes (8): audit(), count(), Count, indexed_files(), main(), _norm(), _texts(), under_local()

### Community 124 - "test_eval.py"
Cohesion: 0.25
Nodes (4): _Eval, score(), FakeScorer, _Scored

### Community 125 - "Files"
Cohesion: 0.12
Nodes (12): Files, build_lexicon(), common_words(), name_line(), name_tokens(), profile_usernames(), _split_handle(), check() (+4 more)

### Community 148 - "Step 3.2 — Scoring quality: anchored rubric and eval harness"
Cohesion: 0.18
Nodes (10): Concepts to learn, Failure handling, Graph usefulness (this step), How to try it yourself, Key decisions and why, Known limitations, Results on the fictional set (real `qwen3:8b`, this laptop, CPU only), Step 3.2 — Scoring quality: anchored rubric and eval harness (+2 more)

### Community 149 - "screens.ts"
Cohesion: 0.25
Nodes (4): APP_DIR, SCREENS_DIR, ThemeName, Settings

### Community 151 - "13. LLM scoring"
Cohesion: 0.33
Nodes (6): 13. LLM scoring, Guardrails, Model pre-check, Output contract (Pydantic, `extra="forbid"`), Prompt shape, Rubric and the overall score *(Phase 3, 3.2a; `engine/llm/rubric.py`)*

### Community 152 - "How Atlas handles student data"
Cohesion: 0.25
Nodes (7): 1. What stays on the computer, 2. What leaves the computer, and only this, 3. What the AI is and isn't shown, 4. Deleting data, 5. Points for your legal team (India's DPDP Act and similar), How Atlas handles student data, In one paragraph

### Community 154 - "._handler"
Cohesion: 0.52
Nodes (4): do_GET(), _head(), _send(), _serve()

### Community 157 - "PlacementLike"
Cohesion: 0.50
Nodes (3): _cells(), PlacementLike, _select()

## Ambiguous Edges - Review These
- `This computer status card (Ollama running, models installed, data folder)` → `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`  [AMBIGUOUS]
  docs/summaries/phase2/screens/welcome-resume-light.png · relation: conceptually_related_to

## Knowledge Gaps
- **368 isolated node(s):** `semi`, `singleQuote`, `printWidth`, `trailingComma`, `SetupOptions` (+363 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1013 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **61 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This computer status card (Ollama running, models installed, data folder)` and `Pause reason banner: 'Ollama isn't running - Atlas will continue automatically'`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Progress` connect `Progress` to `server.py`, `Phase 1 Summary - the Atlas engine`, `.transaction`, `OllamaClient`, `run_waiting_to_resume`, `test_llm.py`, `Settings.tsx`, `csv_loader.py`, `Welcome.tsx`, `test_server.py`, `Review`, `ipc.ts`, `load_csv`, `helpers.ts`, `bridge.ts`, `load_table`, `SetupFlow.tsx`, `Engine`, `Database`, `.recover`, `RunWatcher`, `schema.py`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `StubServer`, `link_identity`, `Step 3.3 — First run: Ollama in four states, the hardware profile, the long-screening warning`, `test_extract.py`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Why does `Database` connect `Database` to `server.py`, `export_csv`, `.worker`, `.transaction`, `run_waiting_to_resume`, `csv_loader.py`, `Worker`, `LeakCheckTests`, `test_db.py`, `.csv`, `_Cli`, `load_csv`, `Engine`, `EndToEndTest`, `Extraction`, `split_sections`, `hardware.py`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `.__init__`, `test_downloader.py`, `CompletedRunCutoffTests`, `DatabaseError`, `Atlas — Architecture`, `MigrationTests`, `graph_query.py`, `Progress`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `server.py`, `Downloader`, `.transaction`, `OllamaClient`, `api_models.py`, `15. Time estimate`, `run_waiting_to_resume`, `test_llm.py`, `create_app`, `csv_loader.py`, `Worker`, `test_server.py`, `ServerTestCase`, `load_table`, `Database`, `.recover`, `split_sections`, `hardware.py`, `Path`, `Step 2.0 — Deferred work recorded, engine gaps filled`, `OllamaInstall`, `ApiError`, `.estimate`, `Phase 2 Summary - the Atlas desktop app`, `compute_buckets`, `link_kind`, `EasyOcrEngine`, `Step 2.8 — Screen: Settings`, `Progress`, `Any`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Database` (e.g. with `9. Crash recovery` and `Hard rules (never break these)`) actually correct?**
  _`Database` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `Worker` (e.g. with `9. Crash recovery` and `Graph usefulness (this step)`) actually correct?**
  _`Worker` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `Engine` (e.g. with `One active run per engine` and `BucketResult`) actually correct?**
  _`Engine` has 21 INFERRED edges - model-reasoned connections that need verification._