# Supplied brand assets (originals, unmodified)

Supplied by the **iOS Development Center** for this interview project. They are kept here exactly as received, as the record of what was supplied. Don't edit them.

| File | What it is | Used as |
|---|---|---|
| `swift-svgrepo-com.svg` | The Swift logo (an SVG Repo export) | Atlas's app logo and icon |
| `Hello (apple).svg` | Apple's "hello" lettering (an animated SVG) | The start-up screen, on off-white |

The app never loads these files directly: it uses sanitised working copies in `app/renderer/assets/brand/` (`logo.svg`, `hello.svg`), and the app icons are rendered from `logo.svg` by `packaging/icons/render-icons.mjs`. `docs/summaries/branding.md` describes what the sanitising removed and why.

**Licence.** The Swift logo and the "hello" lettering are trademarks of Apple Inc. They are not covered by Atlas's `LICENSE`; see `THIRD_PARTY_NOTICES.md` → *Brand assets*. Before any distribution outside this project, replace the logo: Apple's trademark guidelines don't allow the Swift logo as a product icon.
