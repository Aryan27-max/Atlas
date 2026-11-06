import "server-only";

import { cookies } from "next/headers";

import { readAuthConfig, type AuthConfig } from "./config";
import { constantTimeEqual } from "./crypto";
import { SESSION_TTL_SECONDS, createSessionToken, verifySessionToken, type SessionPayload } from "./token";

// In production the cookie uses the __Host- prefix: the browser then insists on
// Secure, Path=/ and no Domain, so no other site or subdomain can set or read it.
// Plain HTTP on localhost can't hold a Secure cookie in every browser, so
// development uses an ordinary name without Secure.
const isProduction = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = isProduction ? "__Host-atlas_session" : "atlas_session";

type ValidAuthConfig = Extract<AuthConfig, { ok: true }>;

function keysFor(config: ValidAuthConfig) {
  return { secret: config.secret, username: config.username, password: config.password };
}

/** Checks a username and password in constant time. Both comparisons always run. */
export function credentialsMatch(config: ValidAuthConfig, username: string, password: string): boolean {
  const userOk = constantTimeEqual(username, config.username);
  const passOk = constantTimeEqual(password, config.password);
  return userOk && passOk;
}

/** Verifies a raw cookie value. Returns null when signed out or misconfigured. */
export function sessionFromToken(token: string | undefined): SessionPayload | null {
  const config = readAuthConfig();
  if (!config.ok) return null;
  return verifySessionToken(token, keysFor(config));
}

/** The current visitor's session, for Server Components and Server Actions. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return sessionFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function startSession(config: ValidAuthConfig): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(keysFor(config)), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
