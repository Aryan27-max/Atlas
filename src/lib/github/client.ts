// Talks to the GitHub REST API for one public repository: finds the latest
// release, picks the installer for a platform, and returns that installer's
// browser_download_url (https://github.com/<owner>/<repo>/releases/download/…),
// which the browser follows to the file itself.
//
// Never the asset's API `url` (https://api.github.com/…/releases/assets/<id>):
// opened in a browser, that answers with the asset's JSON metadata, not the file.
//
// Everything it needs is passed in (settings, fetch, clock, logger), so it can
// be tested without the network. lib/github/releases.ts wires it to the real
// environment. The token is optional (it only raises GitHub's API rate limit),
// only ever goes into the Authorization header of requests to the GitHub API,
// and is never logged or returned.

import { PLATFORM_IDS, type PlatformId } from "../platforms.ts";
import type { DownloadErrorCode } from "./messages.ts";
import { findAsset } from "./patterns.ts";

export type GitHubSettings = {
  /** Optional. Without one, GitHub allows 60 API requests an hour per server address. */
  token: string | null;
  owner: string;
  repo: string;
  /** e.g. https://api.github.com, without a trailing slash. */
  apiUrl: string;
  patterns: Record<PlatformId, string>;
  /** How long to reuse the latest-release lookup. */
  cacheTtlMs: number;
};

export type ReleaseAsset = {
  id: number;
  name: string;
  size: number;
  digest: string | null;
  /** The file itself (browser_download_url); null when GitHub's answer didn't have a usable one. */
  downloadUrl: string | null;
};

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

/**
 * When an installer is missing from the cached release, look again only if the
 * cached lookup is at least this old. A new release is picked up quickly, and
 * repeated clicks on a missing installer don't each cost a GitHub request.
 */
export const MISSING_ASSET_REFRESH_MS = 30_000;

/** A failed lookup is remembered this long, so an outage or a bad token can't be hammered. */
export const FAILURE_CACHE_MS = 15_000;

export function createReleaseClient(settings: GitHubSettings, deps: ClientDeps) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.error(`[atlas-site] ${message}`));
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const repoLabel = `${settings.owner}/${settings.repo}`;
  const repoUrl = `${settings.apiUrl}/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;
  const downloadOrigin = downloadOriginFor(settings.apiUrl);

  let cache: { value: LatestRelease; fetchedAt: number; expiresAt: number } | null = null;
  let inflight: Promise<Result<LatestRelease>> | null = null;
  let failure: { code: DownloadErrorCode; until: number } | null = null;
  let warnedRenamed = false;

  async function request(url: string, context: string) {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "atlas-website",
    };
    if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
    try {
      // Redirects are followed: GitHub answers 301 for a renamed repository.
      return await deps.fetch(url, {
        method: "GET",
        headers,
        redirect: "follow",
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
      log(
        `${context}: GitHub rate limit reached (${status}). Downloads resume when the limit resets.` +
          (settings.token ? "" : " Setting GITHUB_TOKEN raises the limit from 60 to 5,000 requests an hour."),
      );
      return "rate-limited";
    }
    if (status === 403) {
      log(`${context}: GitHub refused access (403). Check that ${repoLabel} is public and that GITHUB_TOKEN, if set, is valid.`);
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
    const res = await request(`${repoUrl}/releases/latest`, context);
    if (!res) return { ok: false, code: "unavailable" };

    if (res.status === 404) {
      await res.body?.cancel();
      log(
        `${context}: no published release found for ${repoLabel} (404). Drafts and pre-releases don't count; ` +
          "publish the release. If one is published, check GITHUB_OWNER and GITHUB_REPO, and that the repository is public.",
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
   * The download link for this platform's installer: the asset's
   * browser_download_url, checked to be a release download on GitHub itself.
   * If the cached release lacks the installer and the lookup is older than
   * MISSING_ASSET_REFRESH_MS, it looks again once, so a new release is found.
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

      const link = checkDownloadUrl(asset.downloadUrl, downloadOrigin);
      if (!link) {
        log(`${asset.name} in ${latest.value.tag} has no usable download link (expected a ${downloadOrigin}/…/releases/download/… URL).`);
        return { ok: false, code: "unavailable" };
      }
      if (!warnedRenamed && !sameRepo(link, settings.owner, settings.repo)) {
        warnedRenamed = true;
        log(
          `GitHub serves this release from ${link.pathname.split("/").slice(1, 3).join("/")}, not ${repoLabel}: ` +
            "the repository was renamed or moved. Update GITHUB_OWNER and GITHUB_REPO to match.",
        );
      }
      return { ok: true, value: { url: link.toString(), fileName: asset.name } };
    }
    return { ok: false, code: "asset-missing" };
  }

  return { getLatestRelease, getSummary, getDownloadUrl };
}

/**
 * Where release files are served from: github.com for api.github.com,
 * otherwise the API's own host (GitHub Enterprise Server, or a local stand-in).
 */
export function downloadOriginFor(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (url.hostname.startsWith("api.")) url.hostname = url.hostname.slice(4);
  return url.origin;
}

/** The link, if it's a release download on the expected host; null otherwise. */
export function checkDownloadUrl(value: string | null, expectedOrigin: string): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== expectedOrigin || url.username || url.password) return null;
  if (!/^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+$/.test(url.pathname)) return null;
  return url;
}

function sameRepo(link: URL, owner: string, repo: string): boolean {
  const [, linkOwner = "", linkRepo = ""] = link.pathname.split("/");
  return linkOwner.toLowerCase() === owner.toLowerCase() && linkRepo.toLowerCase() === repo.toLowerCase();
}

export type ReleaseClient = ReturnType<typeof createReleaseClient>;

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
    const downloadUrl = typeof a.browser_download_url === "string" ? a.browser_download_url : null;
    assets.push({ id: a.id, name: a.name, size: a.size, digest, downloadUrl });
  }

  return {
    tag: r.tag_name,
    publishedAt: typeof r.published_at === "string" ? r.published_at : null,
    assets,
  };
}
