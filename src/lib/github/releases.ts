import "server-only";

import type { PlatformId } from "@/lib/platforms";

import { createReleaseClient, type ReleaseClient, type ReleaseSummary, type Result } from "./client";
import { readGitHubConfig } from "./config";

// One release client per server process, so the latest-release cache is shared
// by every request. Rebuilt only if the settings change.

const globalForReleases = globalThis as typeof globalThis & {
  __atlasReleases?: { key: string; client: ReleaseClient };
};

let warnedMisconfigured = false;

function getClient(): ReleaseClient | null {
  const config = readGitHubConfig();
  if (!config.ok) {
    if (!warnedMisconfigured) {
      warnedMisconfigured = true;
      console.error(`[atlas-site] Downloads are disabled: ${config.problems.join("; ")}. See README.md → Environment variables.`);
    }
    return null;
  }
  // The key stays in memory only; it is never logged or sent anywhere.
  const key = JSON.stringify(config.settings);
  const existing = globalForReleases.__atlasReleases;
  if (existing && existing.key === key) return existing.client;

  const client = createReleaseClient(config.settings, { fetch });
  globalForReleases.__atlasReleases = { key, client };
  return client;
}

/** Version, date and per-platform files of the latest release, for the downloads page. */
export async function getReleaseSummary(): Promise<Result<ReleaseSummary>> {
  const client = getClient();
  if (!client) return { ok: false, code: "not-configured" };
  return client.getSummary();
}

/** A signed, short-lived GitHub URL for this platform's installer. */
export async function getDownloadUrl(platform: PlatformId): Promise<Result<{ url: string; fileName: string }>> {
  const client = getClient();
  if (!client) return { ok: false, code: "not-configured" };
  return client.getDownloadUrl(platform);
}
