# Code signing: what to buy and how to add it

Atlas builds **unsigned** today. It installs and runs, but Windows and macOS warn recruiters first (`docs/INSTALL.md` explains how to get past the warnings). Signing removes those warnings and is the professional way to ship. It costs money and belongs to the firm, so nothing here is bought or configured for you: the build simply signs when the secrets below exist, and doesn't when they don't.

## What recruiters see without signing
| | What happens | Way past it |
|---|---|---|
| **Windows** (SmartScreen) | "Windows protected your PC" | *More info* → *Run anyway* |
| **Windows 11 with Smart App Control on** | the app is blocked, **with no "Run anyway"** | none, except turning Smart App Control off, which can't easily be turned back on. This is the strongest reason to sign for Windows. |
| **macOS** (Gatekeeper) | "Apple could not verify 'Atlas' is free of malware" | System Settings → Privacy & Security → *Open Anyway* (on macOS 15 and later, right-click → Open no longer works) |

Unsigned macOS builds are ad-hoc signed by CI (`-c.mac.identity=-`), which gives the "could not verify" message instead of "Atlas is damaged".

## What to buy
Prices are rough, in US dollars, and change; check the vendor's current price before buying.

### Windows: a code-signing certificate
- **What:** an Organization Validation (OV) or Extended Validation (EV) code-signing certificate in the firm's legal name, from a certificate authority (DigiCert, Sectigo, GlobalSign, SSL.com, or a reseller).
- **Rough cost:** about $200–$600 a year (OV is cheaper; EV costs more). The CA checks that the firm exists, which takes days.
- **Important (since June 2023):** the private key must live on a hardware token or in the vendor's cloud signing service. A plain `.pfx` file you can copy around is no longer issued. That decides how CI can sign:
  - **Cloud signing** (for example DigiCert KeyLocker, SSL.com eSigner, or Microsoft's Azure Trusted Signing, about $10 a month where available): works in CI. electron-builder supports Azure Trusted Signing directly (`win.azureSignOptions`); other cloud services plug in through a small `win.sign` script that calls the vendor's tool.
  - **USB token:** signing happens on the one computer the token is plugged into. Build there with `npm run dist` and the token's tools installed, not in CI.
- SmartScreen also learns from downloads: a new certificate may still show the warning until enough people have installed the app.

### macOS: the Apple Developer Program
- **What:** membership of the Apple Developer Program, then a **Developer ID Application** certificate (create it in Xcode or on developer.apple.com).
- **Rough cost:** $99 a year. Enrolling as an organisation needs a D-U-N-S number (free, a few days to get).
- Notarisation (Apple scanning each build) is included; it needs an **app-specific password** for the Apple ID (appleid.apple.com → Sign-In and Security → App-Specific Passwords) and the **Team ID** (developer.apple.com → Membership).

## How to add the secrets
The build reads only environment variables. In GitHub: repository → **Settings → Secrets and variables → Actions → New repository secret**, one per name:

| Secret | What it is | Used for |
|---|---|---|
| `CSC_LINK` | the certificate file (`.p12` for macOS), **base64-encoded** (`base64 -i cert.p12` on a Mac) | signing on macOS (and Windows, if your certificate is a file) |
| `CSC_KEY_PASSWORD` | the password of that file | the same |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | optional: a separate Windows certificate file and password | Windows signing, when macOS and Windows use different certificates |
| `APPLE_ID` | the Apple ID email of the developer account | macOS notarisation |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password | macOS notarisation |
| `APPLE_TEAM_ID` | the 10-character Team ID | macOS notarisation |

`.github/workflows/ci.yml` passes these to the build job only. With none set, the build is unsigned (Windows) or ad-hoc signed (macOS) and still produces installers; with them set, electron-builder signs, and on macOS notarises (it skips notarisation when `APPLE_ID` and friends are absent).

To sign on your own computer instead, set the same variables in the terminal before building:

```bash
# macOS
export CSC_LINK=/path/to/developer-id.p12 CSC_KEY_PASSWORD=…
export APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… APPLE_TEAM_ID=…
python packaging/build_engine.py && (cd app && npm run dist)
```

Never commit a certificate or a password. `.gitignore` doesn't know about them, so keep them outside the repository.

## Checking a build
- **Windows:** right-click the installer → Properties → *Digital Signatures* lists the firm's name; or in PowerShell, `Get-AuthenticodeSignature .\Atlas-Setup-*.exe`.
- **macOS:** `codesign -dv --verbose=2 /Applications/Atlas.app` (shows the Developer ID) and `spctl -a -vv /Applications/Atlas.app` (says "Notarized Developer ID").
