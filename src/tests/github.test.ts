import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAILURE_CACHE_MS,
  MISSING_ASSET_REFRESH_MS,
  SIGNED_URL_REUSE_MS,
  createReleaseClient,
  parseRelease,
  signedUrlRemainingMs,
  type GitHubSettings,
} from "../lib/github/client.ts";
import { findAsset, globToRegExp } from "../lib/github/patterns.ts";
import { PLATFORMS } from "../lib/platforms.ts";

const TOKEN = "github_pat_TEST_TOKEN_must_never_leak";
const DIGEST = "a".repeat(64);

const SETTINGS: GitHubSettings = {
  token: TOKEN,
  owner: "acme",
  repo: "atlas",
  apiUrl: "https://api.github.test",
  patterns: {
    "mac-arm64": PLATFORMS["mac-arm64"].defaultPattern,
    "mac-x64": PLATFORMS["mac-x64"].defaultPattern,
    "win-x64": PLATFORMS["win-x64"].defaultPattern,
  },
  cacheTtlMs: 300_000,
};

const RELEASE = {
  tag_name: "v0.2.0",
  published_at: "2026-11-06T10:00:00Z",
  assets: [
    { id: 1, name: "Atlas-0.2.0-arm64.dmg", size: 150_000_000, digest: `sha256:${DIGEST}` },
    { id: 2, name: "Atlas-0.2.0-x64.dmg", size: 155_000_000 },
    { id: 3, name: "Atlas-Setup-0.2.0-x64.exe", size: 120_000_000 },
    { id: 4, name: "SHA256SUMS.txt", size: 300 },
    { id: 5, name: "INSTALL.md", size: 9000 },
  ],
};

type Call = { url: string; init: RequestInit };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** A fake GitHub. `routes` maps URL suffixes to handlers. */
function fakeGitHub(routes: Record<string, (call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [suffix, handler] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return handler({ url, init });
    }
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function setup(routes: Parameters<typeof fakeGitHub>[0], start = 0) {
  let now = start;
  const logs: string[] = [];
  const gh = fakeGitHub(routes);
  const client = createReleaseClient(SETTINGS, { fetch: gh.fetch, now: () => now, log: (m) => logs.push(m) });
  return { client, calls: gh.calls, logs, advance: (ms: number) => (now += ms) };
}

const signed = (id: number) => () =>
  new Response(null, { status: 302, headers: { location: `https://release-assets.githubusercontent.test/${id}?sig=abc` } });

describe("asset patterns", () => {
  it("match the names Atlas's build produces, and nothing else", () => {
    const names = RELEASE.assets.map((a) => a.name).concat("Atlas-0.2.0-arm64.dmg.blockmap");
    const pick = (p: string) => names.filter((n) => globToRegExp(p).test(n));
    assert.deepEqual(pick(SETTINGS.patterns["mac-arm64"]), ["Atlas-0.2.0-arm64.dmg"]);
    assert.deepEqual(pick(SETTINGS.patterns["mac-x64"]), ["Atlas-0.2.0-x64.dmg"]);
    assert.deepEqual(pick(SETTINGS.patterns["win-x64"]), ["Atlas-Setup-0.2.0-x64.exe"]);
  });

  it("ignore case, treat regex characters literally, and support ?", () => {
    assert.ok(globToRegExp("atlas-*.DMG").test("Atlas-1.dmg"));
    assert.ok(!globToRegExp("Atlas.(1).dmg").test("Atlas-(1)-dmg"));
    assert.ok(globToRegExp("Atlas.(1).dmg").test("Atlas.(1).dmg"));
    assert.ok(globToRegExp("v?.dmg").test("v2.dmg"));
    assert.ok(!globToRegExp("v?.dmg").test("v10.dmg"));
  });

  it("report ambiguity and pick deterministically", () => {
    const r = findAsset([{ name: "b.dmg" }, { name: "a.dmg" }], "*.dmg");
    assert.equal(r.match?.name, "a.dmg");
    assert.equal(r.ambiguous, true);
  });
});

describe("parseRelease", () => {
  it("keeps only typed fields and normalises the digest", () => {
    const r = parseRelease({ ...RELEASE, assets: [...RELEASE.assets, { id: "x" }, null, { id: 9, name: "y", size: 1, digest: "md5:zz" }] });
    assert.ok(r);
    assert.equal(r.tag, "v0.2.0");
    assert.equal(r.assets.length, 6);
    assert.equal(r.assets[0]?.digest, DIGEST);
    assert.equal(r.assets[5]?.digest, null);
  });

  it("rejects things that aren't releases", () => {
    assert.equal(parseRelease(null), null);
    assert.equal(parseRelease({ assets: [] }), null);
    assert.equal(parseRelease({ tag_name: "v1" }), null);
  });
});

describe("release client", () => {
  it("summarises the latest release per platform", async () => {
    const { client, calls } = setup({ "/releases/latest": () => json(RELEASE) });
    const s = await client.getSummary();
    assert.ok(s.ok);
    assert.equal(s.value.version, "0.2.0");
    assert.equal(s.value.publishedAt, "2026-11-06T10:00:00Z");
    assert.deepEqual(s.value.assets["mac-arm64"], { name: "Atlas-0.2.0-arm64.dmg", size: 150_000_000, digest: DIGEST });
    assert.equal(s.value.assets["win-x64"]?.name, "Atlas-Setup-0.2.0-x64.exe");
    // The summary never carries ids or URLs.
    assert.equal(JSON.stringify(s.value).includes("githubusercontent"), false);

    const call = calls[0]!;
    assert.equal(call.url, "https://api.github.test/repos/acme/atlas/releases/latest");
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(headers.Accept, "application/vnd.github+json");
  });

  it("caches the lookup for the configured time", async () => {
    const { client, calls, advance } = setup({ "/releases/latest": () => json(RELEASE) });
    await client.getSummary();
    advance(299_000);
    await client.getSummary();
    assert.equal(calls.length, 1);
    advance(2_000);
    await client.getSummary();
    assert.equal(calls.length, 2);
  });

  it("shares one request between concurrent callers", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client, calls } = setup({
      "/releases/latest": async () => {
        await gate;
        return json(RELEASE);
      },
    });
    const all = Promise.all([client.getSummary(), client.getSummary(), client.getSummary()]);
    release();
    const results = await all;
    assert.equal(calls.length, 1);
    assert.ok(results.every((r) => r.ok));
  });

  it("returns GitHub's signed URL, asking with octet-stream and manual redirects", async () => {
    const { client, calls } = setup({ "/releases/latest": () => json(RELEASE), "/releases/assets/1": signed(1) });
    const r = await client.getDownloadUrl("mac-arm64");
    assert.deepEqual(r, {
      ok: true,
      value: { url: "https://release-assets.githubusercontent.test/1?sig=abc", fileName: "Atlas-0.2.0-arm64.dmg" },
    });
    const assetCall = calls.find((c) => c.url.endsWith("/releases/assets/1"))!;
    assert.equal(assetCall.init.redirect, "manual");
    assert.equal((assetCall.init.headers as Record<string, string>).Accept, "application/octet-stream");
  });

  it("maps GitHub failures to calm codes", async () => {
    const cases: [Response | (() => Promise<Response>), string][] = [
      [new Response("", { status: 404 }), "no-release"],
      [new Response("", { status: 401 }), "access-denied"],
      [new Response("", { status: 403 }), "access-denied"],
      [new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } }), "rate-limited"],
      [new Response("", { status: 429 }), "rate-limited"],
      [new Response("", { status: 503 }), "unavailable"],
      [new Response("{not json", { status: 200 }), "unavailable"],
      [json({ hello: "world" }), "unavailable"],
      [() => Promise.reject(new TypeError("fetch failed")), "unavailable"],
    ];
    for (const [answer, code] of cases) {
      const { client } = setup({ "/releases/latest": () => (typeof answer === "function" ? answer() : answer) });
      const r = await client.getSummary();
      assert.deepEqual(r, { ok: false, code }, code);
    }
  });

  it("remembers a failure briefly, so an outage isn't hammered, then tries again", async () => {
    let fail = true;
    const { client, calls, advance } = setup({
      "/releases/latest": () => (fail ? new Response("", { status: 502 }) : json(RELEASE)),
    });
    assert.equal((await client.getSummary()).ok, false);
    fail = false;
    for (let i = 0; i < 20; i++) assert.equal((await client.getSummary()).ok, false);
    assert.equal(calls.length, 1, "repeated page loads during an outage cost one request");
    advance(FAILURE_CACHE_MS);
    assert.equal((await client.getSummary()).ok, true);
    assert.equal(calls.length, 2);
  });

  it("looks again once when the cached release lacks the installer", async () => {
    let tag = "old";
    const { client, calls, advance } = setup({
      "/releases/latest": () =>
        json(tag === "old" ? { ...RELEASE, assets: RELEASE.assets.filter((a) => a.id !== 3) } : RELEASE),
      "/releases/assets/3": signed(3),
    });
    await client.getSummary(); // cache the old release
    tag = "new";

    // Within 30 seconds of the lookup, a missing installer doesn't trigger another request.
    advance(10_000);
    assert.deepEqual(await client.getDownloadUrl("win-x64"), { ok: false, code: "asset-missing" });
    assert.equal(calls.filter((c) => c.url.endsWith("/releases/latest")).length, 1);

    // After that, it looks again once and finds the new release.
    advance(MISSING_ASSET_REFRESH_MS);
    const r = await client.getDownloadUrl("win-x64");
    assert.equal(r.ok, true);
    assert.equal(calls.filter((c) => c.url.endsWith("/releases/latest")).length, 2);
  });

  it("says the installer is missing when a fresh release doesn't have it", async () => {
    const { client, calls, logs } = setup({
      "/releases/latest": () => json({ ...RELEASE, assets: [] }),
    });
    assert.deepEqual(await client.getDownloadUrl("mac-x64"), { ok: false, code: "asset-missing" });
    assert.equal(calls.length, 1, "a fresh lookup isn't repeated");
    assert.ok(logs.some((l) => l.includes("mac-x64")));
  });

  it("refreshes when GitHub says a cached asset is gone", async () => {
    let n = 0;
    const { client } = setup({
      "/releases/latest": () => json(RELEASE),
      "/releases/assets/2": () => (n++ === 0 ? new Response("", { status: 404 }) : signed(2)()),
    });
    const r = await client.getDownloadUrl("mac-x64");
    assert.equal(r.ok, true);
  });

  it("refuses a redirect that isn't https", async () => {
    const { client } = setup({
      "/releases/latest": () => json(RELEASE),
      "/releases/assets/1": () => new Response(null, { status: 302, headers: { location: "http://insecure.test/x" } }),
    });
    assert.deepEqual(await client.getDownloadUrl("mac-arm64"), { ok: false, code: "unavailable" });
  });

  it("never relays the file itself", async () => {
    const { client } = setup({
      "/releases/latest": () => json(RELEASE),
      "/releases/assets/1": () => new Response("binary", { status: 200 }),
    });
    assert.deepEqual(await client.getDownloadUrl("mac-arm64"), { ok: false, code: "unavailable" });
  });

  it("never writes the token to the log", async () => {
    const { client, logs } = setup({
      "/releases/latest": () => new Response("", { status: 401 }),
    });
    await client.getSummary();
    await client.getDownloadUrl("win-x64");
    assert.ok(logs.length > 0);
    assert.equal(logs.some((l) => l.includes(TOKEN)), false);
  });
});

/** A signed link the way GitHub sends them now: a JWT and a storage signature, both with an expiry. */
function githubLink(id: number, nowMs: number, lifetimeS: number) {
  const exp = Math.floor(nowMs / 1000) + lifetimeS;
  const jwt = ["e30", Buffer.from(JSON.stringify({ exp, nbf: exp - lifetimeS })).toString("base64url"), "sig"].join(".");
  const se = new Date(exp * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `https://release-assets.githubusercontent.test/${id}?se=${encodeURIComponent(se)}&sig=abc&jwt=${jwt}`;
}

describe("signed download links", () => {
  it("reads how long a link has left, from jwt, se or X-Amz-*", () => {
    const now = Date.UTC(2026, 10, 7, 12, 0, 0);
    assert.equal(signedUrlRemainingMs(githubLink(1, now, 3600), now), 3_600_000);
    assert.equal(signedUrlRemainingMs("https://x.test/f?X-Amz-Date=20261107T120000Z&X-Amz-Expires=300", now), 300_000);
    assert.equal(signedUrlRemainingMs("https://x.test/f?sig=abc", now), null);
    assert.equal(signedUrlRemainingMs("not a url", now), null);
  });

  it("reuses a link for a minute, so a burst of clicks costs GitHub one request", async () => {
    const start = Date.UTC(2026, 10, 7, 12, 0, 0);
    let n = 0;
    const { client, calls, advance } = setup(
      {
        "/releases/latest": () => json(RELEASE),
        "/releases/assets/1": () => new Response(null, { status: 302, headers: { location: githubLink(1, start + n++ * 1000, 3600) } }),
      },
      start,
    );
    const first = await client.getDownloadUrl("mac-arm64");
    for (let i = 0; i < 50; i++) assert.deepEqual(await client.getDownloadUrl("mac-arm64"), first);
    assert.equal(calls.filter((c) => c.url.endsWith("/releases/assets/1")).length, 1);

    advance(SIGNED_URL_REUSE_MS);
    const second = await client.getDownloadUrl("mac-arm64");
    assert.notDeepEqual(second, first, "after a minute a fresh link is fetched");
    assert.equal(calls.filter((c) => c.url.endsWith("/releases/assets/1")).length, 2);
  });

  it("never reuses a link that is close to expiring", async () => {
    const start = Date.UTC(2026, 10, 7, 12, 0, 0);
    const { client, calls } = setup(
      {
        "/releases/latest": () => json(RELEASE),
        "/releases/assets/1": () => new Response(null, { status: 302, headers: { location: githubLink(1, start, 300) } }),
      },
      start,
    );
    await client.getDownloadUrl("mac-arm64");
    await client.getDownloadUrl("mac-arm64");
    assert.equal(calls.filter((c) => c.url.endsWith("/releases/assets/1")).length, 2);
  });

  it("keeps each installer's link separate", async () => {
    const { client } = setup({ "/releases/latest": () => json(RELEASE), "/releases/assets/1": signed(1), "/releases/assets/2": signed(2) });
    const a = await client.getDownloadUrl("mac-arm64");
    const b = await client.getDownloadUrl("mac-x64");
    assert.ok(a.ok && b.ok && a.value.url !== b.value.url && b.value.url.includes("/2?"));
  });
});
