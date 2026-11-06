import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, sessionFromToken } from "@/lib/auth/session";
import { downloadMessage, type DownloadErrorCode } from "@/lib/github/messages";
import { getDownloadUrl } from "@/lib/github/releases";
import { addressFrom, limiters } from "@/lib/limits";
import { PLATFORMS, isPlatformId } from "@/lib/platforms";

// GET /api/download/mac-arm64 | mac-x64 | win-x64
//
// 1. No valid session → 401 (signed-out requests never reach GitHub).
// 2. More than 30 clicks from one address in 10 minutes → "too many downloads".
// 3. Find the latest release and this platform's installer (cached for a few minutes).
// 4. Ask GitHub for the file with redirect: "manual"; GitHub answers with a
//    signed URL that lasts an hour, and the browser is sent straight there.
//    That URL is reused for a minute (lib/github/client.ts), so a burst of
//    clicks costs GitHub one request per installer.
//
// The GitHub token is only used server-side in step 4 and never appears in any
// response. Responses are never cached by browsers or proxies.

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};

const STATUS: Record<DownloadErrorCode, number> = {
  "not-configured": 503,
  "no-release": 404,
  "asset-missing": 404,
  "access-denied": 502,
  "rate-limited": 429,
  unavailable: 502,
};

type Context = { params: Promise<{ platform: string }> };

export async function GET(request: NextRequest, context: Context) {
  const isNavigation =
    request.headers.get("sec-fetch-mode") === "navigate" || (request.headers.get("accept") ?? "").includes("text/html");

  if (!sessionFromToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return unauthorized(isNavigation);
  }

  const { platform } = await context.params;
  if (!isPlatformId(platform)) {
    return NextResponse.json(
      { error: "unknown-platform", message: "There’s no Atlas installer for that platform." },
      { status: 404, headers: NO_STORE },
    );
  }

  const gate = limiters.downloadsPerAddress.take(addressFrom(request.headers));
  const result = gate.allowed
    ? await getDownloadUrl(platform)
    : ({ ok: false, code: "rate-limited", retryAfterS: Math.ceil(gate.retryAfterMs / 1000) } as const);

  if (result.ok) {
    return new NextResponse(null, { status: 302, headers: { Location: result.value.url, ...NO_STORE } });
  }

  if (isNavigation) {
    // Back to the downloads page, which explains what happened. A relative
    // Location keeps whatever host the visitor used, even behind a proxy.
    const query = new URLSearchParams({ error: result.code, platform });
    return new NextResponse(null, { status: 303, headers: { Location: `/downloads?${query}`, ...NO_STORE } });
  }

  const headers: Record<string, string> = { ...NO_STORE };
  if (result.code === "rate-limited") headers["Retry-After"] = String("retryAfterS" in result ? result.retryAfterS : 120);
  return NextResponse.json(
    { error: result.code, ...downloadMessage(result.code, PLATFORMS[platform].name) },
    { status: STATUS[result.code], headers },
  );
}

function unauthorized(asPage: boolean) {
  const headers = { ...NO_STORE, "WWW-Authenticate": 'Session realm="Atlas downloads"' };
  if (!asPage) {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in to download Atlas." },
      { status: 401, headers },
    );
  }
  return new NextResponse(UNAUTHORIZED_PAGE, {
    status: 401,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

const UNAUTHORIZED_PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>Sign in to download | Atlas</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f5f7; color: #1d1d1f;
    font: 17px/1.47 -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", sans-serif;
    letter-spacing: -0.022em; -webkit-font-smoothing: antialiased; text-align: center; }
  main { padding: 24px; max-width: 420px; }
  h1 { margin: 0; font-size: 32px; line-height: 1.125; font-weight: 600; letter-spacing: 0.004em; }
  p { margin: 12px 0 32px; color: #6e6e73; }
  a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 22px; border-radius: 980px;
    background: #d33929; color: #fff; text-decoration: none; }
  a:hover { background: #c9361c; }
  a:focus-visible { outline: 3px solid rgba(240,81,56,.75); outline-offset: 2px; }
  @media (prefers-color-scheme: dark) { body { background: #000; color: #f5f5f7; } p { color: #a1a1a6; } }
</style>
</head>
<body>
<main>
  <h1>Sign in to download.</h1>
  <p>Your session has ended, or you haven’t signed in yet.</p>
  <a href="/login?next=/downloads">Sign in</a>
</main>
</body>
</html>
`;
