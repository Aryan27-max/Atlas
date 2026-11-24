import "server-only";

import { PLATFORMS, PLATFORM_IDS, type PlatformId } from "@/lib/platforms";

import type { GitHubSettings } from "./client";

// GitHub settings, read from the environment at request time. GITHUB_TOKEN is
// optional (the releases are public; a token only raises the API rate limit)
// and is only ever read here, on the server.

const NAME_RX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const DEFAULT_API_URL = "https://api.github.com";
const DEFAULT_CACHE_SECONDS = 300;

export type GitHubConfig = { ok: true; settings: GitHubSettings } | { ok: false; problems: string[] };

export function readGitHubConfig(): GitHubConfig {
  const rawToken = process.env.GITHUB_TOKEN?.trim() ?? "";
  // The .env.example placeholder counts as "no token", not as a broken setting.
  const token = rawToken && rawToken !== "github_pat_replace_me" ? rawToken : null;
  const owner = process.env.GITHUB_OWNER?.trim() ?? "";
  const repo = process.env.GITHUB_REPO?.trim() ?? "";
  const problems: string[] = [];

  if (!owner) problems.push("GITHUB_OWNER is not set");
  else if (!NAME_RX.test(owner)) problems.push("GITHUB_OWNER isn't a valid GitHub user or organisation name");
  if (!repo) problems.push("GITHUB_REPO is not set");
  else if (!NAME_RX.test(repo)) problems.push("GITHUB_REPO isn't a valid repository name");

  const apiUrl = parseApiUrl(process.env.GITHUB_API_URL);
  if (!apiUrl) problems.push("GITHUB_API_URL must be an https URL (http is allowed only for localhost)");

  const patterns = {} as Record<PlatformId, string>;
  for (const id of PLATFORM_IDS) {
    const platform = PLATFORMS[id];
    patterns[id] = process.env[platform.envKey]?.trim() || platform.defaultPattern;
  }

  const cacheSeconds = parseCacheSeconds(process.env.RELEASE_CACHE_SECONDS);

  if (problems.length > 0 || !apiUrl) return { ok: false, problems };
  return {
    ok: true,
    settings: { token, owner, repo, apiUrl, patterns, cacheTtlMs: cacheSeconds * 1000 },
  };
}

function parseApiUrl(raw: string | undefined): string | null {
  const value = raw?.trim() || DEFAULT_API_URL;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function parseCacheSeconds(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_CACHE_SECONDS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 3600) return DEFAULT_CACHE_SECONDS;
  return n;
}
