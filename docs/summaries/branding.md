# Branding: Swift app icon and hello splash

Written 3 October 2026 on branch `feat/branding`. Atlas uses the two brand assets the iOS Development Center supplied:
- the Swift logo, as its app logo and icon;
- Apple's "hello" lettering, as a start-up screen on off-white.

**Why it's built this way.** The supplied files are treated as untrusted input:
- they stay exactly as received;
- the app uses checked, cleaned copies;
- everything else (icons, favicon, splash) is made from those copies by a script anyone can re-run and get the same bytes.

## Step 0: a clean branch

- **No graph-refresh branch needed.** `ci/hardening` has nothing `main` lacks: its graph refresh (`3ae2b25`) reached `main` with PR #1 (`36b82ff`). So no `chore/graph-refresh` branch was made.
- **Branch.** `feat/branding` starts from `main` at `36b82ff`.
- **The originals** are committed exactly as received (`90c9928`), with `Public_assets/README.md`. The README says where they came from, that they are Apple trademarks outside `LICENSE`, and that the app never loads them directly.

| Original | Bytes | SHA-256 |
|---|---|---|
| `Public_assets/swift-svgrepo-com.svg` | 2,295 | `ad4786e756a3635ce18e845dd3b9f010724f444566336e24dd89642ebfbb4611` |
| `Public_assets/Hello (apple).svg` | 7,260 | `ccca3b1fb0da33b072413979bcbfa05824230f04eb11dbac981d54215f3d9700` |

## Step 1: what the SVGs contain, and the clean copies

| | `swift-svgrepo-com.svg` | `Hello (apple).svg` |
|---|---|---|
| viewBox | `0 0 256 256`: **square** | `0 0 500 500` |
| Size | 800 × 800 px | `100%` × `100%`: no size of its own as an `<img>` |
| Art | **Filled**: an orange gradient rounded square that fills the canvas, and a white swift | **Stroked**: one black, round-capped path, readable on off-white |
| Scripts, `on*` handlers, `foreignObject` | none | none |
| External hrefs, embedded fonts or images | none | none |
| Extra | An XML prolog, an "SVG Repo" comment, an unused `xmlns:xlink` | Four SMIL `<animate>`s on a 6 s loop that draw "hello" in, hold it, erase it and loop forever. At rest (`stroke-dasharray 0 100`) it's **invisible** |

Nothing unsafe had to be removed, so none of the stop conditions applied:
- the Swift SVG is square;
- the "hello" art is black.

The clean copies are in `app/renderer/assets/brand/` (`f7563ef`):

- **`logo.svg`** (2,114 bytes) is the same art without the prolog, the comment or the xlink namespace, at 256 × 256. It is **pixel-identical** to the original at 512 px: 0 of 262,144 pixels differ.
- **`hello.svg`** (1,329 bytes) is the original's *held* frame as static art:
  - the held path, with its dash pattern;
  - the all-black gradient as a solid `#000000` stroke;
  - the viewBox cropped to the lettering plus room for the round caps (`89 189 326 120`), with that size as its own.

  It is pixel-identical to the original paused on that frame (0 pixels differ).

  **Why static?** An `<img>` can't honour "reduce motion", and the original's loop would erase "hello" while the splash is still up. The splash animates the image itself instead (step 3).

**Checks.** `brand.test.ts` (16 tests) fails if a copy:
- gains a script, an `on*` handler, `foreignObject`, an external URL, `href` or `url()`, metadata, a comment, a prolog, or an embedded image, font or `@import`;
- loses its viewBox or a matching size;
- or if "hello" gains animation.

It also fails if any renderer source inlines markup (`dangerouslySetInnerHTML`, `innerHTML`, `?raw` imports). Both files are loaded only as `<img src>`. The checker is itself tested against each bad case.

## Step 2: the app icon

**How the icons are made.** `packaging/icons/render-icons.mjs` draws `logo.svg` on a CPU-backed canvas and writes the PNGs, the `.ico` and `SHA256SUMS`. A CPU canvas gives the same bytes on every run; a GPU one may not.

**One change from the plan.** It renders with the Chromium inside Electron, driven by Playwright, both already in `app/`. The plan said Playwright's own Chromium, but that isn't installed here (no `ms-playwright` folder), and installing it means downloading a separate browser. So there is no new dependency and no download.

**Re-running gives the same bytes.** `node packaging/icons/render-icons.mjs --check` re-renders without writing and fails if any byte would change. It passed three times in a row: "11 files re-rendered byte for byte". `app/tests/icons.test.ts` checks the committed files against `SHA256SUMS`.

| File | Size | Bytes | Used for |
|---|---|---|---|
| `icon.ico` | 16, 24, 32, 48, 64, 128, 256 px (PNG entries) | 92,056 | Windows: the exe (taskbar, Start menu, Explorer, shortcuts), the installer and the uninstaller (`win.icon`, `nsis.installerIcon`, `nsis.uninstallerIcon`), and the window icon at run time |
| `icon-mac.png` | 1024 px, art 824 × 824 centred, soft shadow | 521,066 | macOS: electron-builder makes the `.icns` in `Atlas.app` from it, and the DMG's volume icon (`mac.icon`); the Dock icon in development |
| `icon-256.png` | 256 px | 57,527 | Windows notifications ("Screening finished") |
| `icon.png` | 1024 px, full-bleed | 689,930 | Anything else that needs a large PNG (replaces the placeholder) |
| `icon-16.png` … `icon-512.png` | 16, 24, 32, 48, 64, 128, 256, 512 px, full-bleed | 814 … 212,947 | The `.ico` is built from 16–256 |

**Each size is drawn from the vector, not shrunk from 1024 px.** That keeps the swift crisp at 16 px.

**The macOS icon follows Apple's grid**, checked pixel by pixel in the test:
- opaque art exactly from (100, 100) to (923, 923);
- transparent corners and margins;
- a light shadow below, at under 50% alpha, gone well before the edge.

**At run time** (`app/main/brand.ts`, `iconPath()`), the icon is found in `resources/icons/` when packaged, or `packaging/icons/` in development:
- **Windows:** the `BrowserWindow` icon, and the notification icon, for both the run watcher's and the renderer's notifications.
- **macOS:** `app.dock.setIcon()` in development only. Packaged, the bundle's `.icns` does it.

**In the app:**
- the logo at the top of Welcome (56 px);
- in Settings → About (64 px);
- as the favicon (`index.html`);
- in `README.md` (128 px).

The old placeholder icon and its README note are gone. `packaging/icons/README.md` now says which file is used where, and how to change the logo. `START_CMDS.md` §9 says how to re-render.

**Tests:**
- `icons.test.ts` (4): the hashes, the sizes, the macOS grid, and the `.ico`'s entries.
- `brand.test.ts` in `main/` (3): where the icons are found.
- `packaged.spec.ts` now also checks the built app. The icon the OS itself shows for `Atlas.exe` (Windows) or `Atlas.app` (macOS), and for the Windows installer, must be mostly the logo's orange-red: at least 30% of its opaque pixels.

| Icon | Orange-red share |
|---|---|
| The logo, at every size | 0.79 |
| Electron's default, Notepad, Edge, Firefox, Paint | 0 |
| Explorer's yellow folder (the nearest colour) | 0.14 |

On macOS the test also checks:
- that `Info.plist`'s `CFBundleIconFile` names a `.icns` in `Contents/Resources/`;
- that the DMG, mounted read-only, has a `.VolumeIcon.icns`.
