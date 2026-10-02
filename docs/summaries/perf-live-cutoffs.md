# Live cutoffs: the first key press was close to its limit

`e2e/perf.spec.ts` presses the Shortlist handle 8 times on a screening of 2,000 fictional students and times each press until the new Shortlisted count is on screen. The budget is a median under 200 ms and a slowest press under 300 ms. On this laptop the first press took 275–310 ms, and the test failed in the full suite.

## What the profile showed
- **The method:** a temporary spec timed each press in three parts. The first is the wait before anything is sent (the preview's 80 ms debounce). The second is the engine requests, timed in the main process. The third is the rest (the reply crossing to the window, and React rendering).

  | Press | Total | Before sending | Engine (both requests at once) | Rest |
  |---|---|---|---|---|
  | a cutoff value not seen before | 200–266 ms | ~90 ms | 107–169 ms | ~5 ms |
  | a value already seen | 86–91 ms | ~90 ms | (answered from react-query's cache) | ~0 |

- **It wasn't a cold start.** Every *new* cutoff value cost the same, and the test only ever asks for two new values (71, then back to 70); the other six presses come from the cache. So warming the request when the popover opens would only have hidden the cost for ±1 steps, while making mouse drags heavier on the engine.
- **The cost was the engine.** Every new value sends two requests: the counts (`limit=1`) and the Shortlisted list. Each took about 60 ms of Python, and they shared one interpreter, so each waited for both. Most of that was waste:
  - a `ResultRowOut` was built for **all 2,000 students**, even for the one-row counts request;
  - every row's résumé link was parsed again (`link_kind`, about 60% of the time);
  - the overrides were read twice.
- **For comparison:** step 2.9 recorded 199–222 ms for the first press on this laptop. `link_kind` was already there at that time, so it isn't the cause of the change since; the difference wasn't tracked down further.

## The fix (engine only; the screen didn't change)
- **`results()`** filters and sorts light rows and builds `ResultRowOut` only for the page it returns. The counts request now builds one row.
- **`link_kind`** is cached: it's a pure function of the link.
- **The overrides are read once** per request.
- **The output is unchanged.** A new test compares a page with the same slice of the full listing, for every bucket, sort and order, and passes on the old and the new code. A second test fails on the old code: the counts preview built 300 rows instead of 1.

## Before and after on this laptop (`perf.spec`, 3 runs each, standalone)

| | First press | Second press | Median of 8 |
|---|---|---|---|
| Before | 274–318 ms | 247–270 ms | 89–95 ms |
| After | **181–198 ms** | **140–156 ms** | **87–93 ms** |

- **Engine time per request:** about 15–18 ms for the counts (was ~60) and 20–24 ms for the list (was 57–93).
- **What's left:** the 80 ms debounce. The very first preview after opening is also about 30 ms slower than later new values, a one-time cost.

## CI
- **Strict locally, report-only in CI.** The budgets stay strict on a developer's computer (`npm run e2e`). On shared runners timing is noise, so:
  - the two perf tests are tagged `@perf`;
  - CI's e2e step runs `npm run e2e:ci` (everything else, with `--grep-invert @perf`);
  - a separate step, **Performance budgets (report only)**, has `continue-on-error`, and its timings and outcome go to the job summary.
- **Checked:** the YAML parses, the filters list 61 tests and the 2 perf tests, and the summary script works with and without perf output.
- **`START_CMDS.md`** has the command to run just the budgets.
