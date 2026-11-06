import "server-only";

import { authSettingProblems } from "./policy";

// Sign-in settings, read from the environment on every call (never at build
// time), so the values are never baked into a build. If anything is missing or
// weak (lib/auth/policy.ts), sign-in stays off: it fails closed.

export type AuthConfig =
  | { ok: true; username: string; password: string; secret: string }
  | { ok: false; problems: string[] };

export function readAuthConfig(): AuthConfig {
  const username = process.env.APP_USERNAME ?? "";
  const password = process.env.APP_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";

  const problems = authSettingProblems(username, password, secret);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, username, password, secret };
}

/** Logs what is wrong (names only, never values), once per process. */
let warned = false;
export function warnAuthMisconfigured(problems: string[]): void {
  if (warned) return;
  warned = true;
  console.error(`[atlas-site] Sign-in is disabled: ${problems.join("; ")}. See README.md → Environment variables.`);
}
