"use server";

import { redirect } from "next/navigation";

import { SITE_WIDE, clientAddress, combine, limiters } from "@/lib/limits";

import { readAuthConfig, warnAuthMisconfigured } from "./config";
import { safeNextPath } from "./redirect";
import { credentialsMatch, endSession, startSession } from "./session";

// Server Actions for signing in and out. Next.js checks that these POSTs come
// from this site's own pages (Origin vs Host), which protects them from
// cross-site request forgery.
//
// Guessing is limited twice: 5 failures per address per 15 minutes, and 100
// failures per 15 minutes across all addresses (so a botnet gains little).
// Both answer with the same message, and neither reveals whether the username
// or the password was wrong.

export type LoginState = {
  error?: string;
  /** Echoed back so the field keeps its value after a failed attempt. Never the password. */
  username?: string;
};

const MAX_FIELD = 512;

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = readAuthConfig();
  if (!config.ok) {
    warnAuthMisconfigured(config.problems);
    return { error: "Sign-in isn’t available yet. Let the person who sent you the link know." };
  }

  const username = String(formData.get("username") ?? "").slice(0, MAX_FIELD);
  const password = String(formData.get("password") ?? "").slice(0, MAX_FIELD);

  const address = await clientAddress();
  const gate = combine(limiters.loginPerAddress.check(address), limiters.loginSiteWide.check(SITE_WIDE));
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterMs / 60_000));
    return {
      error: `Too many attempts. Try again in ${minutes === 1 ? "a minute" : `${minutes} minutes`}.`,
      username,
    };
  }

  if (!username.trim() || !password) {
    return { error: "Enter your username and password.", username };
  }

  if (!credentialsMatch(config, username, password)) {
    limiters.loginPerAddress.fail(address);
    limiters.loginSiteWide.fail(SITE_WIDE);
    return { error: "That username and password don’t match. Check them and try again.", username };
  }

  limiters.loginPerAddress.reset(address);
  await startSession(config);
  redirect(safeNextPath(formData.get("next")));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}
