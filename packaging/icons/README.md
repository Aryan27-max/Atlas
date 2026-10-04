# App icons

Rendered from the logo, `app/renderer/assets/brand/logo.svg` (a sanitised copy of the supplied Swift logo, `Public_assets/`), by `render-icons.mjs`. Don't edit these files by hand: change the logo and re-render.

```bash
node packaging/icons/render-icons.mjs           # write the icons and SHA256SUMS
node packaging/icons/render-icons.mjs --check   # re-render, and fail if any file would change
```

The script draws with the Chromium inside Electron, driven by Playwright, both already installed in `app/` (no new dependency), on a CPU-backed canvas, so re-running it writes byte-identical files. `app/tests/icons.test.ts` checks the committed files against `SHA256SUMS`, their sizes, the macOS icon grid and the `.ico`'s contents.

| File | Size | Used for |
|---|---|---|
| `icon.ico` | 16, 24, 32, 48, 64, 128, 256 px (32-bit bitmaps, a PNG at 256: with PNGs at every size Windows shows the generic program icon) | Windows: the exe (taskbar, Start menu, Explorer, desktop shortcut), the installer and the uninstaller (`win.icon`, `nsis.installerIcon`, `nsis.uninstallerIcon` in `app/electron-builder.yml`), and the window icon at run time. Each size is drawn from the vector, not shrunk from 1024 px |
| `icon-mac.png` | 1024 px | macOS: electron-builder turns it into the `.icns` in `Atlas.app` and the DMG's volume icon (`mac.icon`); the Dock icon in development. Apple's icon grid: the artwork at 824 × 824 px, centred, on a transparent canvas, with a soft drop shadow |
| `icon-256.png` | 256 px | Windows notifications |
| `icon.png` | 1024 px | Full-bleed, for anything else that needs a large PNG |
| `icon-16.png` … `icon-512.png` | 16–512 px | Full-bleed PNGs at each size (the `.ico` is built from 16–256) |
| `SHA256SUMS` | | What the script last wrote |

**Changing the logo** (for example, before any distribution outside this project, because Apple's trademark guidelines don't allow the Swift logo as a product icon): replace `app/renderer/assets/brand/logo.svg` with a square SVG (it must pass `app/renderer/assets/brand/brand.test.ts`), run `node packaging/icons/render-icons.mjs`, and commit the new icons with their `SHA256SUMS`.
