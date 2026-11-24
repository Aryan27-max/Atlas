import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FAILURE_CACHE_MS,
  MISSING_ASSET_REFRESH_MS,
  checkDownloadUrl,
  createReleaseClient,
  downloadOriginFor,
  parseRelease,
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

const DL = "https://github.test/acme/atlas/releases/download/v0.2.0";

/** Shaped like GitHub's real answer, including the API `url` that must never be used for a download. */
const asset = (id: number, name: string, size: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  size,
  url: `https://api.github.test/repos/acme/atlas/releases/assets/${id}`,
  browser_download_url: `${DL}/${name}`,
  ...extra,
});

const RELEASE = {
  tag_name: "v0.2.0",
  published_at: "2026-11-06T10:00:00Z",
  assets: [
    asset(1, "Atlas-0.2.0-arm64.dmg", 150_000_000, { digest: `sha256:${DIGEST}` }),
    asset(2, "Atlas-0.2.0-x64.dmg", 155_000_000),
    asset(3, "Atlas-Setup-0.2.0-x64.exe", 120_000_000),
    asset(4, "SHA256SUMS.txt", 300),
    asset(5, "INSTALL.md", 9000),
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

function setup(routes: Parameters<typeof fakeGitHub>[0], start = 0, settings: GitHubSettings = SETTINGS) {
  let now = start;
  const logs: string[] = [];
  const gh = fakeGitHub(routes);
  const client = createReleaseClient(settings, { fetch: gh.fetch, now: () => now, log: (m) => logs.push(m) });
  return { client, calls: gh.calls, logs, advance: (ms: number) => (now += ms) };
}

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
    assert.equal(r.assets[0]?.downloadUrl, `${DL}/Atlas-0.2.0-arm64.dmg`);
    assert.equal(r.assets[5]?.digest, null);
    assert.equal(r.assets[5]?.downloadUrl, null);
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
    assert.equal(JSON.stringify(s.value).includes("http"), false);

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

  it("returns the installer's browser_download_url, never the API asset URL, with one GitHub request", async () => {
    const { client, calls } = setup({ "/releases/latest": () => json(RELEASE) });
    const expected = {
      "mac-arm64": `${DL}/Atlas-0.2.0-arm64.dmg`,
      "mac-x64": `${DL}/Atlas-0.2.0-x64.dmg`,
      "win-x64": `${DL}/Atlas-Setup-0.2.0-x64.exe`,
    } as const;
    for (const [platform, url] of Object.entries(expected) as [keyof typeof expected, string][]) {
      const r = await client.getDownloadUrl(platform);
      assert.ok(r.ok, platform);
      assert.equal(r.value.url, url);
      assert.equal(r.value.url.includes("api.github"), false);
    }
    assert.equal(calls.length, 1, "only the cached release lookup; no request per download");
  });

  it("works without a token, and then sends no Authorization header", async () => {
    const { client, calls } = setup({ "/releases/latest": () => json(RELEASE) }, 0, { ...SETTINGS, token: null });
    const r = await client.getDownloadUrl("win-x64");
    assert.ok(r.ok);
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal("Authorization" in headers, false);
  });

  it("follows GitHub's redirect for a renamed repository, and tells the owner to update the settings", async () => {
    const renamed = "https://github.test/acme/atlas-new/releases/download/v0.2.0/Atlas-0.2.0-arm64.dmg";
    const { client, calls, logs } = setup({
      "/releases/latest": () => json({ ...RELEASE, assets: [asset(1, "Atlas-0.2.0-arm64.dmg", 1, { browser_download_url: renamed })] }),
    });
    const r = await client.getDownloadUrl("mac-arm64");
    assert.deepEqual(r, { ok: true, value: { url: renamed, fileName: "Atlas-0.2.0-arm64.dmg" } });
    assert.equal(calls[0]!.init.redirect, "follow");
    assert.ok(logs.some((l) => l.includes("renamed") && l.includes("acme/atlas-new")));
  });

  it("refuses a download link that isn't a release file on GitHub", async () => {
    const bad = [
      null,
      "not a url",
      "http://github.test/acme/atlas/releases/download/v0.2.0/Atlas-0.2.0-arm64.dmg",
      "https://evil.test/acme/atlas/releases/download/v0.2.0/Atlas-0.2.0-arm64.dmg",
      "https://api.github.test/repos/acme/atlas/releases/assets/1",
      "https://github.test/acme/atlas/archive/main.zip",
      "https://user:pw@github.test/acme/atlas/releases/download/v0.2.0/x.dmg",
    ];
    for (const link of bad) {
      const { client } = setup({
        "/releases/latest": () => json({ ...RELEASE, assets: [asset(1, "Atlas-0.2.0-arm64.dmg", 1, { browser_download_url: link })] }),
      });
      assert.deepEqual(await client.getDownloadUrl("mac-arm64"), { ok: false, code: "unavailable" }, String(link));
    }
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

describe("download links", () => {
  it("come from github.com for api.github.com, and from the API host otherwise", () => {
    assert.equal(downloadOriginFor("https://api.github.com"), "https://github.com");
    assert.equal(downloadOriginFor("https://ghe.example.test/api/v3"), "https://ghe.example.test");
    assert.equal(downloadOriginFor("http://127.0.0.1:4010"), "http://127.0.0.1:4010");
  });

  it("match the real v0.2.0 release links", () => {
    const real = "https://github.com/Aryan27-max/Atlas/releases/download/v0.2.0/Atlas-Setup-0.2.0-x64.exe";
    assert.equal(checkDownloadUrl(real, "https://github.com")?.toString(), real);
    assert.equal(checkDownloadUrl("https://api.github.com/repos/Aryan27-max/Atlas/releases/assets/699735390", "https://github.com"), null);
  });
});
