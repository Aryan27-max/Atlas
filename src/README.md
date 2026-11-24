# Atlas website

The public face of Atlas and the private way to get it. This folder is a self-contained Next.js project; nothing outside it is used or changed.

- **`/`**: what Atlas does, how it works and what it needs, with an interactive demo of the cutoff lines.
- **`/login`**: one username and password, from environment variables.
- **`/downloads`**: signed-in visitors download the macOS (Apple silicon or Intel) or Windows installer from the latest release of the **public** GitHub repository `Aryan27-max/Atlas`. An optional GitHub token raises the API rate limit and stays on the server.

## Quick start

Requires **Node.js 22.18 or later**.

```bash
cd src
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:3000
```

To preview the downloads page offline, use a local stand-in for GitHub:

```bash
npm run mock:github             # in a second terminal: http://127.0.0.1:4010
```

and in `.env.local`, set `GITHUB_API_URL=http://127.0.0.1:4010`, `GITHUB_OWNER=demo`, and `GITHUB_REPO=atlas`. Its download buttons go to `example.com`.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` then `npm start` | Production build and server |
| `npm test` | Unit tests (Node's built-in test runner, no extra packages) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run check` | All three of the above |
| `npm run mock:github` | Local stand-in for the GitHub API |

## Environment variables

Put them in `src/.env.local` for local work (git ignores it), or in your host's settings. All are read on the server at request time; none are built into the pages, and none reach the browser.

| Variable | Required | What it is |
|---|---|---|
| `APP_USERNAME` | yes | The username that unlocks the downloads page |
| `APP_PASSWORD` | yes | Its password: **at least 12 characters**, not the username. Use a long, unique one |
| `SESSION_SECRET` | yes | Signs the session cookie. **At least 32 characters** of randomness: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `GITHUB_TOKEN` | no, recommended | Any GitHub token, used only to raise the API rate limit from 60 to 5,000 requests an hour (see below) |
| `GITHUB_OWNER` | yes | The user or organisation that owns the repository |
| `GITHUB_REPO` | yes | The repository that holds the releases |
| `ASSET_PATTERN_MAC_ARM64` | no | Default `Atlas-*-arm64.dmg` |
| `ASSET_PATTERN_MAC_X64` | no | Default `Atlas-*-x64.dmg` |
| `ASSET_PATTERN_WIN_X64` | no | Default `Atlas-Setup-*-x64.exe` |
| `RELEASE_CACHE_SECONDS` | no | How long to reuse the latest-release lookup. Default `300` (5 minutes), 0–3600 |
| `GITHUB_API_URL` | no | Only for GitHub Enterprise Server, or the local stand-in. Default `https://api.github.com` |
| `SITE_URL` | no | The site's public address (e.g. `https://atlas.example.com`), for link previews. Read at **build** time. Not needed on Vercel |

Changing `APP_USERNAME`, `APP_PASSWORD` or `SESSION_SECRET` signs everyone out. If a required variable is missing or too weak (see *Security notes*), the site still serves the overview, sign-in says it isn't available yet, and the server log names what's missing (never the values).

## The GitHub token (optional)

The releases are public, so downloads work without a token. Without one, GitHub allows the site **60 API requests an hour** per server address, and on Vercel that address may be shared with other projects. A token raises the limit to **5,000 an hour**, so set one.

1. On GitHub: your picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name**: e.g. `atlas-website downloads`. **Expiration**: pick one and put a reminder in your calendar to replace it (an expired token makes GitHub refuse the lookup until you paste a new one or remove it).
3. **Repository access**: **Public repositories (read-only)** is enough. Leave every permission at *No access*.
4. **Generate token**, copy it (GitHub shows it once) and put it in `GITHUB_TOKEN`. On Vercel, mark it **Sensitive**.

## How releases must look

The site always offers the repository's **latest release**, as GitHub defines it: the most recent **published** release that isn't a pre-release. Drafts and pre-releases are skipped.

> The main repository's CI (`.github/workflows/ci.yml`, job *release*) creates the release as a **draft** from a `v<version>` tag. Check it, then press **Publish release** on GitHub. Until then the site says there's no release yet.

Each installer is found by matching its file name against a pattern. `*` matches anything and `?` matches one character; matching ignores case and covers the whole name. The defaults match the names Atlas's build already produces (`artifactName` in `app/electron-builder.yml`):

| Card | Default pattern | Example file |
|---|---|---|
| Mac with Apple silicon (M1 and later, arm64) | `Atlas-*-arm64.dmg` | `Atlas-0.2.0-arm64.dmg` |
| Mac with Intel (x64) | `Atlas-*-x64.dmg` | `Atlas-0.2.0-x64.dmg` |
| Windows 10 and 11 (64-bit, x64) | `Atlas-Setup-*-x64.exe` | `Atlas-Setup-0.2.0-x64.exe` |

Other files in the release (`SHA256SUMS.txt`, `INSTALL.md`, `.blockmap` files) are ignored. If an installer is missing, its card says so and the other two keep working. If GitHub provides a SHA-256 digest for a file, the card shows it under **SHA-256 checksum**.

## How a download works

1. The button links to `/api/download/mac-arm64`, `/api/download/mac-x64` or `/api/download/win-x64`.
2. The route checks the session cookie. No valid session → **401**. More than 30 clicks from one address in 10 minutes → *Too many downloads at once* (**429**).
3. It looks up the latest release (`GET /repos/{owner}/{repo}/releases/latest`), cached in memory for `RELEASE_CACHE_SECONDS`, and finds the platform's file.
4. It takes that file's **`browser_download_url`** (`https://github.com/{owner}/{repo}/releases/download/{tag}/{file}`) and checks it is a release download on github.com. It never uses the asset's API `url` (`api.github.com/…/releases/assets/{id}`): opened in a browser, that answers with the asset's JSON metadata, not the file.
5. The browser is redirected there (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`), and github.com sends the file. The file never passes through this server, and no extra GitHub API request is made per click.

If something fails, a browser is sent back to `/downloads` with a plain explanation, and the server log says why in owner terms (lines start with `[atlas-site]`):

| The page says | Usually means |
|---|---|
| Downloads aren't set up yet | A `GITHUB_*` variable is missing or invalid |
| There's no release to download yet | No **published** release, or `GITHUB_OWNER` / `GITHUB_REPO` are wrong, or the repository isn't public |
| The installer for … isn't in this release | No file matches that pattern: check the file name or `ASSET_PATTERN_*` |
| Downloads are unavailable right now | GitHub rejected `GITHUB_TOKEN`: expired or revoked. Replace it, or delete it |
| Too many downloads at once | GitHub's rate limit (60 an hour without a token, 5,000 with one); it resets on its own |
| The download didn't start | GitHub didn't answer in time; try again |

If the repository is renamed, GitHub's redirect is followed and downloads keep working; the log then says to update `GITHUB_OWNER` / `GITHUB_REPO`.

When an installer is missing from the cached release, the site looks again (at most every 30 seconds), so a newly published release shows up without waiting for the cache.

## Deploying on Vercel

The project builds with no environment variables at all (secrets are read only when a request arrives), so a build never needs them and never contains them.

1. In Vercel: **Add New → Project** → import this repository.
2. **Root Directory**: `src`. Vercel detects Next.js; keep the default build settings. Node.js 24 is used (`engines` in `package.json`).
3. **Environment Variables**, for **Production** only:

   | Name | Value | Sensitive |
   |---|---|---|
   | `APP_USERNAME` | the username you hand out | |
   | `APP_PASSWORD` | 12+ characters, unique (a password manager's random one is ideal) | yes |
   | `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` | yes |
   | `GITHUB_TOKEN` | optional, recommended: a fine-grained token with public read-only access | yes |
   | `GITHUB_OWNER` | `Aryan27-max` | |
   | `GITHUB_REPO` | `Atlas` | |

   Leave them off **Preview** unless you want preview deployments to unlock real downloads. Weak or example values are refused: sign-in stays off and the log says which setting to fix.
4. **Settings → Deployment Protection**: keep **Vercel Authentication** on for preview deployments (the default), so unfinished versions aren't public.
5. **Deploy**, then add your domain under **Settings → Domains**. HTTPS is automatic; the session cookie requires it.
6. **Firewall** (recommended):
   - **Rate limiting** rules, counted across all of Vercel rather than per server instance: `POST /login`, 10 requests a minute per IP; and `/api/download/*`, 30 requests per 10 minutes per IP.
   - Vercel's DDoS mitigation is always on. If the site is ever under attack, turn on **Attack Challenge Mode** until it passes.
7. After deploying: sign in, check the downloads page shows the release, and click one download.

Changing an environment variable takes effect on the next deployment (**Deployments → … → Redeploy**).

If you deploy with the Vercel CLI (`vercel deploy` from `src/`), `.vercelignore` keeps `.env.local`, `node_modules` and `.next` from being uploaded. Git-based deploys only ever see committed files.

### Hosting elsewhere

```bash
cd src && npm ci && npm run build && npm start     # PORT=3000 by default
```

Put it behind an HTTPS reverse proxy that **overwrites** `X-Forwarded-For` with the connecting address (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`, not `$proxy_add_x_forwarded_for`, which keeps whatever the client sent). The per-address limits rely on it; without it, only the site-wide sign-in limit still holds. `npm start` runs in production mode: the cookie is `Secure` and HSTS is sent, so serve it only over HTTPS.

## Security notes

A penetration test of the production build (sign-in, sessions, downloads, headers, file exposure, the image optimiser, a known Next.js bypass, and load) passed on 7 November 2026; see *Testing*.

- **The GitHub token** (optional) is read only in `lib/github/config.ts`. Every module that reads a secret from the environment imports `server-only`, so the build fails if client code ever imports one. The token is sent only in the `Authorization` header to the GitHub API, and is never logged or returned; a unit test checks that it never appears in a log message.
- **Sign-in** compares the username and password in constant time (both values are HMAC'd to equal-length digests, then `crypto.timingSafeEqual`; both comparisons always run). A wrong username and a wrong password give the same message in the same time. Server Actions reject cross-site posts (Next.js checks `Origin`).
- **Weak settings fail closed** (`lib/auth/policy.ts`): sign-in stays off if `APP_PASSWORD` is under 12 characters, equals the username, or is the `.env.example` value, or if `SESSION_SECRET` is under 32 characters, reuses the password, or is the example value. The log names the setting, never its value.
- **The session cookie** is `__Host-atlas_session` in production: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 8 hours. It holds a signed (HMAC-SHA256) expiry and a fingerprint of the current credentials, nothing secret. Changing the password or `SESSION_SECRET` signs everyone out.
- **Rate limits** (`lib/limits.ts`):
  - sign-in: 5 failures per address per 15 minutes, and 100 failures per 15 minutes across all addresses, so guessing from many addresses (a botnet) gains little. The trade-off: during such an attack, sign-in pauses for everyone until the window passes.
  - downloads: 30 clicks per address per 10 minutes.
  - They live in memory, so each server instance counts on its own and a restart resets them. The Vercel firewall rules above add limits counted across all of Vercel.
- **The visitor's address** comes from the header the host vouches for (`lib/auth/address.ts`): on Vercel, `x-vercel-forwarded-for`, then `x-forwarded-for`, which Vercel builds from the connection, discarding anything the client sent. `x-real-ip` is only a last resort.
- **GitHub quota protection**: GitHub allows 60 API requests an hour per address without a token, 5,000 with one. The latest-release lookup is cached for 5 minutes and a failed lookup for 15 seconds; a download click reuses the cached release and makes no API request. However busy the site, it needs about 12 GitHub requests an hour per server instance. Signed-out requests never reach GitHub.
- **Redirects after sign-in** only go to paths on this site (`lib/auth/redirect.ts`); error redirects use relative URLs, so a forged `Host` header can't send anyone elsewhere.
- **Headers**: a Content-Security-Policy (`frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`, scripts and styles from this site only), HSTS in production, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`. Download redirects add `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Next.js needs `'unsafe-inline'` scripts for hydration unless every page uses a nonce; the site renders no user-supplied HTML.
- **No middleware**: authentication is checked in the page and the route themselves, so the 2025 Next.js middleware bypass (CVE-2025-29927) can't apply; the penetration test checks it anyway.
- **One shared login**: everyone uses the same credentials. To cut someone off, change the password (everyone signs in again). The installers themselves are public on GitHub, so the sign-in keeps the downloads page private, not the files.
- **Dependencies**: `npm audit` reports 0 vulnerabilities. A patched `minimatch` is pinned for the linter (`overrides` in `package.json`, GHSA-g3hv-75wg-m249); it's a development tool and never runs on the server. Re-run `npm audit` before each deployment.
- **Next.js telemetry**: Next.js sends anonymous usage data during builds by default. Turn it off with `npx next telemetry disable`, or `NEXT_TELEMETRY_DISABLED=1` in your build environment.

## Project layout

```text
src/
├── app/                        Routes (UI only; no secrets here)
│   ├── page.tsx                The overview
│   ├── login/page.tsx          Sign-in
│   ├── downloads/page.tsx      The three installers (signed in only); loading.tsx while it looks
│   ├── api/download/[platform]/route.ts   Session check → browser_download_url
│   ├── layout.tsx, icon.svg, robots.ts, not-found.tsx, error.tsx
├── components/
│   ├── site/                   Nav (frosted, sticky), footer, logo, scroll reveal
│   ├── landing/                Overview sections and the interactive cutoff demo
│   ├── mockups/                Drawn app screens (placeholders for screenshots)
│   ├── auth/                   The sign-in form
│   └── downloads/              Download cards, notices, "for this computer" hint
├── lib/
│   ├── auth/                   Config and settings policy, constant-time compare, session token
│   │                           and cookie, limiter, visitor address, safe redirects, sign-in/out
│   ├── github/                 Config, release client (cache, asset patterns, download links),
│   │                           messages people see
│   ├── limits.ts               Every rate limit (sign-in, downloads)
│   ├── platforms.ts            The three installers
│   ├── site.ts                 Copyright, Ollama link, screenshot slots
│   └── format.ts               File sizes and dates
├── styles/globals.css          Design tokens, type scale, buttons, motion
├── public/screenshots/         Put real screenshots here
├── scripts/mock-github.mjs     Local stand-in for the GitHub API
└── tests/                      Unit tests
```

The modules the tests import directly (`lib/auth/crypto.ts`, `token.ts`, `rate-limit.ts`, `redirect.ts`, `lib/github/client.ts`, `patterns.ts`, …) take their secrets as arguments and import each other with explicit `.ts` extensions, so Node can run them without a build step.

## Replacing the placeholder visuals

The three app windows on the overview are drawn in HTML and CSS, with fictional students. To use real screenshots:

1. Save them in `public/screenshots/`, e.g. `results-light.png` and `results-dark.png`. Use fictional students only; the main repository's demo list (`npm run demo:fast` in `app/`) is made for this.
2. In `lib/site.ts`, fill in the matching entry of `screenshots`:

   ```ts
   results: { light: "/screenshots/results-light.png", dark: "/screenshots/results-dark.png", width: 2558, height: 1600 },
   ```

   `width` and `height` are the image's size in pixels. `dark` is optional. The slots are `results` (top of the page), `candidate` (*Every score shows its working*) and `progress` (*Leave it running overnight*).

The privacy illustration and the cutoff demo aren't screenshots and stay as they are. The hero artwork is `public/brand/hero-bg.png`; a replacement works best if it is dark, about 16:9, with its focal point in the centre (the layout leaves a gap there).

## Changing the words

| What | Where |
|---|---|
| Overview sections | `components/landing/*.tsx` |
| Footnotes and footer | `app/page.tsx`, `components/site/SiteFooter.tsx`, `lib/site.ts` |
| Card titles and button text | `lib/platforms.ts` |
| "Before you open Atlas" (unsigned-app warnings) | `app/downloads/page.tsx`. Update these once the installers are code-signed |
| Download error messages | `lib/github/messages.ts` |
| Sign-in messages | `lib/auth/actions.ts` |

Every product claim on the page comes from the main repository's README and `docs/` (INSTALL, DATA_HANDLING). If Atlas changes, check the overview still matches.

## Design notes

- **Type**: the system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue"`), with Segoe UI added before the generic fallback for Windows visitors. One family, one type scale (`styles/globals.css`).
- **Colour**: built around the Swift logo's orange. Buttons use the logo's deeper stop `#d33929` (white text 4.8:1, WCAG AA); links use `#c7381c` in light mode and `#ff8552` in dark mode; focus rings use the logo's `#f05138`. Besides neutrals, the only other colours are the app's three group colours: green for Shortlisted, amber for Cutoff, grey for Rejected. The drawn app windows keep the app's own blue, so they look like the real app. Light and dark follow the visitor's system; the hero and the nav are always dark.
- **The hero** is the supplied artwork `public/brand/hero-bg.png` (a copy of `Public_assets/bglogo.png`), served compressed by Next.js. The headline sits above its glowing logo and the text below it: the artwork is centred on an empty "stage" element between them (`components/landing/Hero.tsx`), so the logo stays in that gap at every width. Its edges fade into black, and soft scrims keep the text readable over the light waves.
- **Motion**: one page-load sequence in the hero, and a quiet reveal for the large visuals. Content is fully visible without JavaScript, and `prefers-reduced-motion` turns motion off.
- **The logo** is the Swift logo supplied for this project (`Public_assets/swift-svgrepo-com.svg`), used through a sanitised copy: `public/brand/swift-logo.svg` (nav, sign-in, downloads) and `app/icon.svg` (favicon). The sanitising removed the XML prolog, the generator comment and the fixed 800 px size, and renamed the gradient IDs. The link-preview image `app/opengraph-image.png` is the hero artwork at 1200 px.
- **Trademarks.** The Swift logo, and the logo inside the hero artwork, are trademarks of Apple Inc. As `Public_assets/README.md` in the main repository says, they were supplied for this project, and before any distribution outside it they must be replaced: Apple's trademark guidelines don't allow the Swift logo as a product's logo. To swap them, replace the two files in `public/brand/`, `app/icon.svg` and `app/opengraph-image.png`.
- **The cutoff demo** uses the same grouping rules as the app's `engine/buckets.py`: shortlist at or above the line, minimum fill by rank, ties never split. `tests/demo-and-format.test.ts` checks it.

## Testing

`npm test` runs 51 unit tests: session tokens (tampering, expiry, credential changes), constant-time comparison, the rate limiter, safe redirects, asset patterns, the GitHub client against a fake `fetch` (caching, shared requests, every failure status, stale releases, browser_download_url never the API asset URL, no token needed, renamed repositories, download-link checks, no token in logs), brief failure caching, the sign-in settings policy, which header gives the visitor's address, the demo's grouping rules and formatting.

This project isn't part of the main repository's CI. To add it, give `.github/workflows/ci.yml` a job that runs `npm ci && npm run check && npm run build` with `working-directory: src`.
