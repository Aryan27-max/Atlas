import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addressFromHeaders } from "../lib/auth/address.ts";
import { constantTimeEqual, hmacBase64Url, toBase64Url } from "../lib/auth/crypto.ts";
import { MIN_PASSWORD_LENGTH, authSettingProblems } from "../lib/auth/policy.ts";
import { FailureLimiter } from "../lib/auth/rate-limit.ts";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "../lib/auth/redirect.ts";
import { SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from "../lib/auth/token.ts";

const KEYS = { secret: "s".repeat(40), username: "recruiter", password: "correct horse battery staple" };
const NOW = 1_800_000_000;

describe("constantTimeEqual", () => {
  it("is true only for identical strings", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("", ""), true);
  });

  it("handles different lengths without throwing", () => {
    assert.equal(constantTimeEqual("short", "a much longer string"), false);
    assert.equal(constantTimeEqual("", "x"), false);
  });

  it("compares Unicode by content", () => {
    assert.equal(constantTimeEqual("pässwörd", "pässwörd"), true);
    assert.equal(constantTimeEqual("pässwörd", "passwörd"), false);
  });
});

describe("session tokens", () => {
  it("round-trips", () => {
    const token = createSessionToken(KEYS, NOW);
    const payload = verifySessionToken(token, KEYS, NOW + 10);
    assert.ok(payload);
    assert.equal(payload.iat, NOW);
    assert.equal(payload.exp, NOW + SESSION_TTL_SECONDS);
  });

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken({ ...KEYS, secret: "x".repeat(40) }, NOW);
    assert.equal(verifySessionToken(token, KEYS, NOW), null);
  });

  it("rejects a tampered payload, even with a fresh expiry", () => {
    const token = createSessionToken(KEYS, NOW);
    const [v, , sig] = token.split(".");
    const forged = toBase64Url(JSON.stringify({ iat: NOW, exp: NOW + 10 ** 9, cv: "x" }));
    assert.equal(verifySessionToken(`${v}.${forged}.${sig}`, KEYS, NOW), null);
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken(KEYS, NOW);
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    assert.equal(verifySessionToken(flipped, KEYS, NOW), null);
  });

  it("expires", () => {
    const token = createSessionToken(KEYS, NOW);
    assert.ok(verifySessionToken(token, KEYS, NOW + SESSION_TTL_SECONDS - 1));
    assert.equal(verifySessionToken(token, KEYS, NOW + SESSION_TTL_SECONDS), null);
  });

  it("rejects tokens issued in the future", () => {
    const token = createSessionToken(KEYS, NOW + 3600);
    assert.equal(verifySessionToken(token, KEYS, NOW), null);
  });

  it("signs everyone out when the username or password changes", () => {
    const token = createSessionToken(KEYS, NOW);
    assert.equal(verifySessionToken(token, { ...KEYS, password: "new password" }, NOW), null);
    assert.equal(verifySessionToken(token, { ...KEYS, username: "someone" }, NOW), null);
  });

  it("rejects a correctly signed payload with extra or wrong-typed fields", () => {
    const body = `v1.${toBase64Url(JSON.stringify({ iat: NOW, exp: NOW + 60, cv: "x", admin: true }))}`;
    assert.equal(verifySessionToken(`${body}.${hmacBase64Url(KEYS.secret, body)}`, KEYS, NOW), null);
    const body2 = `v1.${toBase64Url(JSON.stringify({ iat: "now", exp: NOW + 60, cv: "x" }))}`;
    assert.equal(verifySessionToken(`${body2}.${hmacBase64Url(KEYS.secret, body2)}`, KEYS, NOW), null);
  });

  it("rejects malformed input", () => {
    for (const bad of [undefined, null, "", "v1", "v1.a", "v2.a.b", "v1.a.b.c", "x".repeat(2000), "v1.!!!.sig"]) {
      assert.equal(verifySessionToken(bad, KEYS, NOW), null, String(bad));
    }
  });
});

describe("FailureLimiter", () => {
  function limiter() {
    let now = 0;
    const l = new FailureLimiter({ maxFailures: 3, windowMs: 1000, maxKeys: 3, now: () => now });
    return { l, advance: (ms: number) => (now += ms) };
  }

  it("allows attempts until the limit, then blocks with a retry time", () => {
    const { l, advance } = limiter();
    for (let i = 0; i < 3; i += 1) {
      assert.deepEqual(l.check("ip"), { allowed: true });
      l.fail("ip");
    }
    advance(400);
    assert.deepEqual(l.check("ip"), { allowed: false, retryAfterMs: 600 });
  });

  it("opens again after the window", () => {
    const { l, advance } = limiter();
    for (let i = 0; i < 3; i += 1) l.fail("ip");
    advance(1000);
    assert.deepEqual(l.check("ip"), { allowed: true });
  });

  it("keeps addresses apart, and reset clears one", () => {
    const { l } = limiter();
    for (let i = 0; i < 3; i += 1) l.fail("a");
    assert.equal(l.check("b").allowed, true);
    l.reset("a");
    assert.equal(l.check("a").allowed, true);
  });

  it("take() counts every request and stops at the limit", () => {
    const { l, advance } = limiter();
    const decisions = Array.from({ length: 5 }, () => l.take("ip").allowed);
    assert.deepEqual(decisions, [true, true, true, false, false]);
    advance(1000);
    assert.equal(l.take("ip").allowed, true);
  });

  it("never tracks more than maxKeys", () => {
    const { l } = limiter();
    for (const k of ["a", "b", "c", "d", "e"]) l.fail(k);
    // The oldest were dropped to make room; memory stays bounded.
    assert.equal((l as unknown as { entries: Map<string, unknown> }).entries.size <= 3, true);
  });
});

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    assert.equal(safeNextPath("/downloads"), "/downloads");
    assert.equal(safeNextPath("/downloads?x=1"), "/downloads?x=1");
  });

  it("refuses anything that could leave the site or loop", () => {
    for (const bad of [
      undefined,
      "",
      "downloads",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/a\\b",
      "/\u0000x",
      "/login",
      "/login?next=/x",
      "/api/download/mac-arm64",
      "/" + "a".repeat(600),
      42,
    ]) {
      assert.equal(safeNextPath(bad), DEFAULT_AFTER_LOGIN, String(bad));
    }
  });
});

describe("sign-in settings policy", () => {
  const good = { u: "recruiter", p: "a-long-enough-pass", s: "s".repeat(40) };
  it("accepts strong settings", () => {
    assert.deepEqual(authSettingProblems(good.u, good.p, good.s), []);
  });
  it("refuses missing, short, example and reused values", () => {
    const cases: [string, string, string, RegExp][] = [
      ["", good.p, good.s, /APP_USERNAME is not set/],
      [good.u, "", good.s, /APP_PASSWORD is not set/],
      [good.u, "x".repeat(MIN_PASSWORD_LENGTH - 1), good.s, /at least 12/],
      [good.u, "replace-with-a-long-unique-password", good.s, /example value/],
      ["same-as-password!", "same-as-password!", good.s, /same as APP_USERNAME/],
      [good.u, good.p, "short", /at least 32/],
      [good.u, good.p, "replace-with-at-least-32-random-characters", /example value/],
      [good.u, "p".repeat(40), "p".repeat(40), /same as APP_PASSWORD/],
    ];
    for (const [u, p, s, rx] of cases) assert.match(authSettingProblems(u, p, s).join("; "), rx, `${u}/${p}/${s}`);
  });
});

describe("visitor address", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("on Vercel, trusts Vercel's own header first", () => {
    assert.equal(addressFromHeaders(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2", "x-real-ip": "3.3.3.3" }), true), "1.1.1.1");
    assert.equal(addressFromHeaders(h({ "x-forwarded-for": "2.2.2.2", "x-real-ip": "3.3.3.3" }), true), "2.2.2.2");
  });
  it("elsewhere, ignores x-vercel-forwarded-for (a client could send it) and prefers X-Forwarded-For", () => {
    assert.equal(addressFromHeaders(h({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "2.2.2.2, 10.0.0.1", "x-real-ip": "3.3.3.3" }), false), "2.2.2.2");
    assert.equal(addressFromHeaders(h({ "x-real-ip": "3.3.3.3" }), false), "3.3.3.3");
  });
  it("bounds the key length and falls back to one shared key", () => {
    assert.equal(addressFromHeaders(h({ "x-forwarded-for": "a".repeat(500) }), false).length, 64);
    assert.equal(addressFromHeaders(h({}), false), "unknown");
  });
});
