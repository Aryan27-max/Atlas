// Talks to the GitHub REST API for one private repository: finds the latest
// release, picks the installer for a platform, and asks GitHub for a
// short-lived signed download URL.
//
// Everything it needs is passed in (settings, fetch, clock, logger), so it can
// be tested without the network. lib/github/releases.ts wires it to the real
// environment. The token only ever goes into the Authorization header of
// requests to the GitHub API; it is never logged or returned.

import { PLATFORM_IDS, type PlatformId } from "../platforms.ts";
import type { DownloadErrorCode } from "./messages.ts";
import { findAsset } from "./patterns.ts";

export type GitHubSettings = {
  token: string;
  owner: string;
  repo: string;
  /** e.g. https://api.github.com, without a trailing slash. */
  apiUrl: string;
  patterns: Record<PlatformId, string>;
  /** How long to reuse the latest-release lookup. */
  cacheTtlMs: number;
};

export type ReleaseAsset = { id: number; name: string; size: number; digest: string | null };

export type LatestRelease = {
  tag: string;
  publishedAt: string | null;
  assets: ReleaseAsset[];
};

export type PlatformAsset = { name: string; size: number; digest: string | null };

/** What the downloads page shows. No ids, URLs or anything else internal. */
export type ReleaseSummary = {
  version: string;
  publishedAt: string | null;
  assets: Record<PlatformId, PlatformAsset | null>;
};

export type Result<T> = { ok: true; value: T } | { ok: false; code: DownloadErrorCode };

export type ClientDeps = {
  fetch: typeof fetch;
  now?: () => number;
  log?: (message: string) => void;
  timeoutMs?: number;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * When an installer is missing from the cached release, look again only if the
 * cached lookup is at least this old. A new release is picked up quickly, and
 * repeated clicks on a missing installer don't each cost a GitHub request.
 */
export const MISSING_ASSET_REFRESH_MS = 30_000;

/** A failed lookup is remembered this long, so an outage or a bad token can't be hammered. */
export const FAILURE_CACHE_MS = 15_000;

/**
 * GitHub's signed download links last an hour. Each one is reused for this
 * long, for everyone, so clicks don't each cost a GitHub API request: at most
 * one request per installer per minute, however busy the site is.
 */
export const SIGNED_URL_REUSE_MS = 60_000;

/** A link is never reused if it has less than this left before it expires. */
export const SIGNED_URL_MIN_REMAINING_MS = 10 * 60_000;

export function createReleaseClient(settings: GitHubSettings, deps: ClientDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.error(`[atlas-site] ${message}`));
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const repoLabel = `${settings.owner}/${settings.repo}`;
  const repoUrl = `${settings.apiUrl}/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;

  let cache: { value: LatestRelease; fetchedAt: number; expiresAt: number } | null = null;
  let inflight: Promise<Result<LatestRelease>> | null = null;
  let failure: { code: DownloadErrorCode; until: number } | null = null;
  const signedUrls = new Map<number, { url: string; reuseUntil: number }>();

  async function request(url: string, accept: string, redirect: RequestRedirect, context: string) {
    try {
      return await deps.fetch(url, {
        method: "GET",
        headers: {
          Accept: accept,
          Authorization: `Bearer ${settings.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "atlas-website",
        },
        redirect,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const kind = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timed out" : "failed";
      log(`${context}: the request to GitHub ${kind}.`);
      return null;
    }
  }

  /** Maps an unsuccessful GitHub response to an error code, and tells the owner why in the log. */
  function classify(res: Response, context: string): DownloadErrorCode {
    const status = res.status;
    if (status === 401) {
      log(`${context}: GitHub rejected the token (401). Check that GITHUB_TOKEN is correct and hasn't expired.`);
      return "access-denied";
    }
    if (status === 429 || (status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")))) {
      log(`${context}: GitHub rate limit reached (${status}). Downloads resume when the limit resets.`);
      return "rate-limited";
    }
    if (status === 403) {
      log(`${context}: GitHub refused access (403). Check that the token has Contents: Read-only on ${repoLabel}.`);
      return "access-denied";
    }
    log(`${context}: GitHub answered ${status}.`);
    return "unavailable";
  }

  async function fetchLatest(): Promise<Result<LatestRelease>> {
    const result = await lookUpLatest();
    failure = result.ok ? null : { code: result.code, until: now() + FAILURE_CACHE_MS };
    return result;
  }

  async function lookUpLatest(): Promise<Result<LatestRelease>> {
    const context = "Latest release lookup";
    const res = await request(`${repoUrl}/releases/latest`, "application/vnd.github+json", "follow", context);
    if (!res) return { ok: false, code: "unavailable" };

    if (res.status === 404) {
      await res.body?.cancel();
      log(
        `${context}: no published release found for ${repoLabel} (404). Drafts and pre-releases don't count; ` +
          "publish the release. If one is published, check GITHUB_OWNER, GITHUB_REPO and the token's repository access.",
      );
      return { ok: false, code: "no-release" };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { ok: false, code: classify(res, context) };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      log(`${context}: GitHub's answer wasn't valid JSON.`);
      return { ok: false, code: "unavailable" };
    }
    const release = parseRelease(json);
    if (!release) {
      log(`${context}: GitHub's answer didn't look like a release.`);
      return { ok: false, code: "unavailable" };
    }
    cache = { value: release, fetchedAt: now(), expiresAt: now() + settings.cacheTtlMs };
    return { ok: true, value: release };
  }

  /** The latest release, from the cache when it's fresh. Concurrent callers share one request. */
  async function getLatestRelease(
    options: { fresh?: boolean } = {},
  ): Promise<Result<LatestRelease> & { fetchedAt?: number }> {
    if (!options.fresh && cache && cache.expiresAt > now()) {
      return { ok: true, value: cache.value, fetchedAt: cache.fetchedAt };
    }
    if (!options.fresh && failure && failure.until > now()) {
      return { ok: false, code: failure.code };
    }
    if (!inflight) {
      inflight = fetchLatest().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  function pickAsset(release: LatestRelease, platform: PlatformId): ReleaseAsset | null {
    const { match, ambiguous } = findAsset(release.assets, settings.patterns[platform]);
    if (ambiguous) {
      log(`Several files in ${release.tag} match the ${platform} pattern; using ${match?.name}. Make the pattern more specific.`);
    }
    return match;
  }

  async function getSummary(): Promise<Result<ReleaseSummary>> {
    const latest = await getLatestRelease();
    if (!latest.ok) return latest;
    const release = latest.value;
    const assets = {} as Record<PlatformId, PlatformAsset | null>;
    for (const id of PLATFORM_IDS) {
      const asset = pickAsset(release, id);
      assets[id] = asset ? { name: asset.name, size: asset.size, digest: asset.digest } : null;
    }
    return {
      ok: true,
      value: { version: release.tag.replace(/^v(?=\d)/i, ""), publishedAt: release.publishedAt, assets },
    };
  }

  /**
   * Asks GitHub for a signed, short-lived URL for this platform's installer.
   * If the cached release turns out to be stale, it looks again once: always
   * when GitHub says the asset is gone, and when the installer is missing only
   * if the cached lookup is older than MISSING_ASSET_REFRESH_MS.
   */
  async function getDownloadUrl(platform: PlatformId): Promise<Result<{ url: string; fileName: string }>> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const latest = await getLatestRelease({ fresh: attempt > 0 });
      if (!latest.ok) return latest;

      const asset = pickAsset(latest.value, platform);
      if (!asset) {
        const stale = latest.fetchedAt !== undefined && now() - latest.fetchedAt >= MISSING_ASSET_REFRESH_MS;
        if (attempt === 0 && stale) continue;
        log(`No file in ${latest.value.tag} matches the ${platform} pattern "${settings.patterns[platform]}".`);
        return { ok: false, code: "asset-missing" };
      }

      const reused = signedUrls.get(asset.id);
      if (reused && reused.reuseUntil > now()) return { ok: true, value: { url: reused.url, fileName: asset.name } };

      const context = `Download of ${asset.name}`;
      const res = await request(`${repoUrl}/releases/assets/${asset.id}`, "application/octet-stream", "manual", context);
      if (!res) return { ok: false, code: "unavailable" };
      await res.body?.cancel();

      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get("location");
        if (location && isHttpsUrl(location)) {
          rememberSignedUrl(asset.id, location);
          return { ok: true, value: { url: location, fileName: asset.name } };
        }
        log(`${context}: GitHub's redirect had no usable https location.`);
        return { ok: false, code: "unavailable" };
      }
      if (res.status === 404) {
        if (attempt === 0) continue;
        log(`${context}: GitHub says the file no longer exists (404).`);
        return { ok: false, code: "asset-missing" };
      }
      if (res.ok) {
        log(`${context}: GitHub sent the file itself instead of a redirect, which this site doesn't relay.`);
        return { ok: false, code: "unavailable" };
      }
      return { ok: false, code: classify(res, context) };
    }
    return { ok: false, code: "asset-missing" };
  }

  function rememberSignedUrl(assetId: number, url: string) {
    const t = now();
    for (const [id, entry] of signedUrls) if (entry.reuseUntil <= t) signedUrls.delete(id);
    const remaining = signedUrlRemainingMs(url, t);
    if (remaining !== null && remaining < SIGNED_URL_MIN_REMAINING_MS) return;
    signedUrls.set(assetId, { url, reuseUntil: t + SIGNED_URL_REUSE_MS });
  }

  return { getLatestRelease, getSummary, getDownloadUrl };
}

/**
 * How long a GitHub signed link has left, from what it says about itself: the
 * `jwt` expiry and the storage signature's `se` (current links), or
 * X-Amz-Date + X-Amz-Expires (older links). The earliest wins; null if unknown.
 */
export function signedUrlRemainingMs(url: string, nowMs: number): number | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const ends: number[] = [];
  const jwt = u.searchParams.get("jwt");
  if (jwt) {
    try {
      const exp = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")).exp;
      if (typeof exp === "number") ends.push(exp * 1000);
    } catch {
      // Not a readable token: ignore it.
    }
  }
  const se = Date.parse(u.searchParams.get("se") ?? "");
  if (!Number.isNaN(se)) ends.push(se);
  const amzDate = u.searchParams.get("X-Amz-Date")?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  const amzExpires = Number(u.searchParams.get("X-Amz-Expires"));
  if (amzDate && Number.isFinite(amzExpires)) {
    const [, y, mo, d, h, mi, sec] = amzDate.map(Number) as number[];
    ends.push(Date.UTC(y!, mo! - 1, d!, h!, mi!, sec!) + amzExpires * 1000);
  }
  return ends.length > 0 ? Math.min(...ends) - nowMs : null;
}

export type ReleaseClient = ReturnType<typeof createReleaseClient>;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Keeps only the fields this site uses, and checks their types. */
export function parseRelease(json: unknown): LatestRelease | null {
  if (typeof json !== "object" || json === null) return null;
  const r = json as Record<string, unknown>;
  if (typeof r.tag_name !== "string" || !Array.isArray(r.assets)) return null;

  const assets: ReleaseAsset[] = [];
  for (const item of r.assets as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== "number" || typeof a.name !== "string" || typeof a.size !== "number") continue;
    const digest = typeof a.digest === "string" && /^sha256:[0-9a-f]{64}$/i.test(a.digest) ? a.digest.slice(7).toLowerCase() : null;
    assets.push({ id: a.id, name: a.name, size: a.size, digest });
  }

  return {
    tag: r.tag_name,
    publishedAt: typeof r.published_at === "string" ? r.published_at : null,
    assets,
  };
}
