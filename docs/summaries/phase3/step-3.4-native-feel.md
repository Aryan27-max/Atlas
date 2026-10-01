# Step 3.4 — Native-feel quick wins

Only the cheap items from PHASE2_SUMMARY §7, as the Phase 3 prompt asked. Everything else in §7 (native macOS sheets and toolbar, rows animating between buckets, the Chromium `<select>` menu, toasts) stays a non-goal (PLAN → Deferred).

## What was built
| §7 item | Before | Now |
|---|---|---|
| 5. Column headers | "RANK NAME DEPARTMENT" in capitals; sorting in a separate "Sort by" menu | **Title-case headers** (Rank, Name, Department, CGPA, Score) that sort when clicked, with a **sort arrow** on the sorted one; clicking it again reverses the order |
| 6. Right-click | nothing | a **native menu** (built by Electron in main): *Show details*, *Move to ▸ Shortlisted… / Cutoff… / Rejected…* (the other buckets), *Copy RA number* |
| 7. Multi-select | moving ten people meant ten sheets | **Shift-click, Cmd-click (macOS) / Ctrl-click (Windows)**, Shift+arrows, Cmd/Ctrl+A; a bar shows "3 selected · Move to… · Deselect"; one sheet, **one note, one override request per candidate** |
| 9. Destructive buttons | "Delete all data…" was a filled red button | a plain button; red only on the final "Delete everything" in the typed confirmation |
| 12. Missing name | "No name", styled like a real name | **"Name not given"** in the secondary colour (Results list and Needs attention) |
| 13. Wide displays | on 1920 px the score sat ~1,100 px from the name | columns have **maximum widths** (Name 320 px, Department 240 px); the badges take what's left |
| 3. Popovers | no arrow | an **arrow** pointing at the middle of the button that opened the popover |

Details worth knowing:
- **Sorting stays in the engine** (rule 16). `GET /runs/{id}/results` takes `sort` (rank, name, department, cgpa, score) and `order` (asc, desc, or nothing for the column's own first direction: best first for rank, score and CGPA; A to Z for text). Rows without a value (no name, no CGPA, not ranked) always go last, and ties stay in RA-number order. The response says how it sorted, and the header draws its arrow from that, so the arrow can't disagree with the rows.
- **The menu is the operating system's own.** The renderer can't build native menus (it's sandboxed), so it asks main through one IPC call, `atlas:row-menu`. Main checks the request first: 1 to 5,000 RA numbers of up to 64 characters with no control characters, bucket names from the three real ones, and a yes/no for "Show details". Then it builds the menu with `Menu.buildFromTemplate` and returns what was chosen. Labels are in title case on macOS ("Copy RA Number") and sentence case on Windows, as each OS does.
- **"Copy RA number" is done by main.** The renderer has no clipboard access (every permission is denied since 2.2), and granting it would be broader than writing the RA numbers the recruiter just right-clicked.
- **For a selection, the menu acts on all of it** ("Move 3 candidates to ▸", "Copy 3 RA numbers", one per line). Right-clicking a row outside the selection selects just that row first, as Finder and Explorer do.
- **A plain click still opens the candidate**, as in Phase 2. Only modifier clicks are new, so nothing a recruiter already knows changed.
- **Moving several**: the sheet sends one `POST …/override` per candidate with the same note, so each move is in that candidate's history, exactly like a move from the detail sheet. If some fail, the sheet says how many and why, and *Try again* resends only those.

## Files
| File | Purpose | Key functions / classes |
|---|---|---|
| `engine/server.py`, `engine/api_models.py` | Sort by any column, either direction; the response says how | `sort_rows`, `FIRST_ORDER`, `ResultsOut.sort/order` |
| `app/main/menus.ts` | The native row menu and its labels | `rowMenuTemplate`, `menuLabel` |
| `app/main/validate.ts`, `app/main/ipc.ts` | Validate the request, show the menu, write the clipboard | `validateRowMenu`, `Channels.rowMenu` handler |
| `app/src/shared/bridge.ts`, `app/preload/index.ts` | `window.atlas.menus.resultRows()` | `RowMenuRequest`, `RowMenuChoice` |
| `app/renderer/screens/results/ResultList.tsx` | Header buttons, selection, right-click, "Name not given" | `ResultList`, `SortButton` |
| `app/renderer/screens/results/MoveSheet.tsx` | Move one or several with one note | `MoveSheet` |
| `app/renderer/screens/results/Results.tsx` | Sort state, selection bar, menu choices | `Results` |
| `app/renderer/design/overlays.tsx` | The popover arrow | `Popover`, `arrowOffset` |
| `app/renderer/screens/Settings.tsx` | "Delete all data…" plain | `Settings` |

## Key decisions and why
- **Click-again reverses, and the engine decides the first direction.** "Best first" is a judgement about the data (a higher CGPA is better; an earlier name isn't), so it lives in the engine with the other judgements.
- **Header outside the scrolling list.** The header buttons are real buttons, so they can't sit inside the listbox (a listbox may only contain options). The header now sits above the list, and reserves the list's scroll-bar width (`scrollbar-gutter: stable` on both) so the columns still line up on Windows, where scroll bars take space.
- **One request per candidate, as the prompt asked,** rather than a new bulk endpoint: no new engine surface, and each move is recorded exactly like a single move.
- **An ellipsis on "Shortlisted…"** because a sheet follows (for the note): Apple's rule for menu items that need more input.

## Failure handling
| Situation | What happens | Message shown |
|---|---|---|
| Some moves in a bulk move fail | the others stay moved; the sheet stays open | "2 of 10 couldn't be moved" + the engine's reason; *Try again* resends only those |
| The menu request is malformed (a compromised renderer) | main refuses it before building anything | — (an `InvalidArgument`, logged) |
| The recruiter dismisses the menu | nothing happens | — |
| A selected row disappears (moved, or hidden by a search) | it's dropped from the selection | the bar's count follows |

## Tests
- **Engine (+1, 401 → 402), and one extended:** sorting by every column in both directions, rows without a value last, ties in RA order (`sort_rows`); the existing name-sort test now also reverses names, checks the reported `sort`/`order`, that score defaults to best first, and that an unknown column is refused (422).
- **Vitest (+12, 176 → 188):**
  - `menus.test.ts` (4): one row, a selection, unscored rows, macOS title case; clicking items reports the choice and copies one RA number per line;
  - `validate.test.ts` (2): good requests pass; empty, too many, too long, control characters, unknown or repeated buckets are refused;
  - `results.test.tsx` (5): title-case headers and the arrow; click / Ctrl-click / Shift-click; Shift+arrows and Ctrl+A; right-click inside and outside a selection, and the keyboard's context-menu key; "Name not given";
  - `components.test.tsx` (1): the arrow points at the button's middle and never into a corner.
- **Playwright (+2, 57 → 59), changed 4:**
  - right-click → *Copy RA number* (the clipboard is checked) and *Move to ▸ Cutoff…* (the sheet, the note, the move);
  - Ctrl/Cmd-click and Shift-click a range, deselect one, copy 3 RA numbers from the menu, move 3 with one note, and check each candidate's newest override;
  - "search and sort" now sorts by clicking headers, checks the reverse order and that the student with no name stays last;
  - the shell test knows the bridge's new `menus` key.
  - Playwright can't click an OS menu, so the tests replace `Menu.buildFromTemplate`'s popup in main with one that picks an item by label and records the labels shown (`nextMenuPicks`, `menusShown` in `e2e/stubs.ts`).

Screenshots (both themes) are now in `docs/summaries/phase3/screens/`: `results`, `results-selection`, `move-sheet`, `adjust-cutoffs` (with the arrow), `results-large-display` (column widths, "Name not given"), `settings-data` (the plain button), `delete-all`, `candidate`, `needs-attention`, `export`. The Phase 2 folder keeps the Phase 2 look, for comparison. The native menu itself can't be screenshotted: the OS draws it outside the page.

## How to try it yourself
```bash
python -m unittest engine.tests.test_server -k sort -v
cd app && npx vitest run main/menus.test.ts renderer/screens/results
npx playwright test e2e/results.spec.ts
```

## Graph usefulness (this step)
- About 20 files opened. `graph_query callers results` would have pointed to `server.py` and the tests; the app side (ResultList, Results, overlays, the IPC trio) was known from Phase 2.
- Honest note: for UI work the graph adds little, because the React files' links are imports and JSX, which the AST graph only partly captures.

## Known limitations
- **Not seen on a Mac.** Title-case menu labels, Cmd-click and the arrow are coded for macOS but unobserved (CI's macOS screenshots will show the popover arrow and headers, not the menu).
- **Ctrl-click on macOS opens the menu** (that's macOS's right-click), so on a Mac only Cmd-click adds to a selection. That matches Finder.
- **The selection is cleared when switching buckets**, and isn't kept across restarts.
- **Column widths are fixed maxima, not resizable.** Resizable columns were out of the cheap list.

## Concepts to learn
- **Native menus from a sandboxed renderer:** ask the privileged process, validate the request, and let it build the real thing.
- **Controlled selection:** the list reports clicks; the screen owns which ids are selected.
- **Stable sorting with "blanks last":** sort the known values, append the unknown, and keep ties in a fixed order so the list never shuffles.
