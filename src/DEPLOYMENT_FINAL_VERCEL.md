# Deploying the Atlas website on Vercel: final checklist

Follow these steps in order, from top to bottom. Each step says what to do and how to tell it worked.

> **This repository is public.** Never put a password, the session secret or a GitHub token in this file, in `.env.example`, or in any other committed file. They go in Vercel only.

---

## What changed, and why downloads were broken

The repository was renamed from `Atlas-iOS_Dev_center` to `Atlas`. On Vercel, `GITHUB_REPO` still held the old name.

- Looking up the latest release still worked, because GitHub forwards the old name (a 301 redirect) and the site followed it.
- The download step asked GitHub for the file at `api.github.com/repos/…/releases/assets/<id>` and treated any redirect as "here is your file". For the old name, GitHub's redirect pointed to **another API address**, not to the file. The browser went there and GitHub showed the asset's **JSON metadata**.

The fix: a download now sends the browser to the installer's `browser_download_url` (`https://github.com/Aryan27-max/Atlas/releases/download/v…/…`), which is the file itself. The repository is public, so no token is needed to download. A wrong or old `GITHUB_REPO` no longer breaks downloads; the log just tells you to fix it.

---

## Step 1: Put the code on GitHub

Vercel builds whatever is on `main`. The fix has to be there first.

1. Commit the changes in `src/` on a branch, open a pull request and merge it into `main`. (You can ask Claude to do this.)
2. **Don't merge yet if you want to do Step 2 first.** It's fine either way. If Vercel deploys before you change the variables, you just redeploy in Step 3.

✅ Worked if: the pull request is merged and GitHub shows the commit on `main`.

---

## Step 2: Set the environment variables in Vercel

Vercel → your project (**src**) → **Settings** → **Environment Variables**.

To change a variable: **⋯** on its row → **Edit** → paste the value → **Save**. Each one should apply to **Production** (and **Preview** too, if you want preview links to work).

| Variable | What to put | Required? |
|---|---|---|
| `GITHUB_OWNER` | `Aryan27-max` | Yes |
| `GITHUB_REPO` | `Atlas` (the **new** name, no longer `Atlas-iOS_Dev_center`) | Yes |
| `GITHUB_TOKEN` | Keep the one you have, or see the note below | Optional, recommended |
| `APP_USERNAME` | The username you give to recruiters | Yes |
| `APP_PASSWORD` | Your password: **12+ characters**, not the same as the username | Yes |
| `SESSION_SECRET` | A random string, **32+ characters** (see below) | Yes |
| `NEXT_TELEMETRY_DISABLED` | `1` | Optional |

**`SESSION_SECRET`**: generate one on your Mac with

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**`GITHUB_TOKEN`**: downloads work without it. Without a token, though, GitHub allows only **60 lookups an hour** from Vercel's server address, and other Vercel projects may share that address. With a token the limit is 5,000.
- The token you already have keeps working (a renamed repository keeps its permissions). **Do nothing** unless it has expired.
- If it has expired, or you want a new one: GitHub → your picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token** → **Repository access: Public repositories (read-only)** → **Generate**. Paste it into `GITHUB_TOKEN` and tick **Sensitive**.
- An expired token **breaks** the lookup ("Downloads are unavailable right now"). If you don't want to look after a token, **delete** the variable instead.

You don't need any `ASSET_PATTERN_*` variables. The defaults match the real file names (`Atlas-0.2.0-arm64.dmg`, `Atlas-0.2.0-x64.dmg`, `Atlas-Setup-0.2.0-x64.exe`).

✅ Worked if: the list shows `GITHUB_OWNER`, `GITHUB_REPO`, `APP_USERNAME`, `APP_PASSWORD` and `SESSION_SECRET`, all for Production.

---

## Step 3: Deploy

Changing a variable does **not** update a deployment that already exists. Each deployment keeps the variables it was built with.

1. Vercel → **Deployments**.
2. Check the newest **Production** deployment: it must be from **after** your merge (its commit message matches) **and** from **after** your variable changes.
3. If it isn't, click **⋯** → **Redeploy**, then **Redeploy** again to confirm.
4. Wait until it shows **Ready**.

✅ Worked if: the newest Production deployment is **Ready** and its time is later than your last variable change.

---

## Step 4: Open the right address

Use the project's **main domain**, which is on **Overview** under *Domains* (for example `src-….vercel.app` without a random part, or your own domain).

Don't use a link like `src-oofd53isz-aryans-projects-….vercel.app`. That is one specific **old** deployment, frozen with its old variables.

---

## Step 5: Check everything works

1. **Sign in** at `/login` with `APP_USERNAME` and `APP_PASSWORD`.
   - "Sign-in isn't available yet" means a sign-in variable breaks a rule (password under 12 characters, the same as the username, or `SESSION_SECRET` under 32 characters), **or** you're on an old deployment (Step 4).
2. **The downloads page** says **Version 0.2.0** (or the newest version) and shows three cards: *Mac with Apple silicon*, *Mac with Intel*, *Windows 10 and 11*. Each card shows its file name.
3. The card for your computer says **For this computer**. (Chrome and Edge can tell Apple silicon from Intel; Safari and Firefox don't say, so on a Mac in those browsers no card is marked. That is expected.)
4. **Click each button.** The browser should start downloading a file, not show text:
   - Apple silicon → `Atlas-0.2.0-arm64.dmg` (about 155 MB)
   - Intel → `Atlas-0.2.0-x64.dmg` (about 164 MB)
   - Windows → `Atlas-Setup-0.2.0-x64.exe` (about 132 MB)
5. **Check the log:** Vercel → **Logs**. Lines from the site start with `[atlas-site]`. There should be none. If one says *"the repository was renamed or moved"*, `GITHUB_REPO` is still the old name: fix it (Step 2) and redeploy (Step 3).

✅ Worked if: all three buttons download the right file, and the log has no `[atlas-site]` lines.

---

## If something goes wrong

| The page says | What to do |
|---|---|
| Sign-in isn't available yet | Check `APP_PASSWORD` (12+ characters, not the username) and `SESSION_SECRET` (32+ characters), then redeploy. Make sure you're on the main domain |
| Downloads aren't set up yet | `GITHUB_OWNER` or `GITHUB_REPO` is missing or misspelled |
| There's no release to download yet | The release on GitHub is still a **draft** or a **pre-release**: open it on GitHub and click **Publish release** |
| The installer for … isn't in this release | That file wasn't uploaded to the release, or it has a different name |
| Downloads are unavailable right now | `GITHUB_TOKEN` has expired or was revoked: replace it or delete it, then redeploy |
| Too many downloads at once | GitHub's hourly limit was reached (most likely with no token). Wait, or add `GITHUB_TOKEN` |

Every message also leaves an `[atlas-site]` line in **Vercel → Logs** that names the exact setting to fix.

---

## Publishing a new version later

No code changes and no new deployment are needed.

1. Build and upload the release the usual way (the CI creates a **draft** from a `v<version>` tag).
2. Make sure it contains the three installers, named like `Atlas-<version>-arm64.dmg`, `Atlas-<version>-x64.dmg` and `Atlas-Setup-<version>-x64.exe`.
3. On GitHub, click **Publish release** (not a pre-release).
4. Within **5 minutes**, the downloads page shows the new version and its buttons download the new files.

---

## Good habits

- **Repository is public:** keep secrets in Vercel only. `.env.local` is ignored by git; keep it that way.
- **To cut someone off:** change `APP_PASSWORD` and redeploy. Everyone has to sign in again.
- **The installers are public on GitHub.** The sign-in keeps the downloads *page* private, but anyone who knows the GitHub release link can download a file.
- **Your local git remote** may still use the old name. It keeps working through GitHub's redirect, but you can update it with `git remote set-url origin https://github.com/Aryan27-max/Atlas.git`.
