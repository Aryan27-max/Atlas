// The session token: a signed, expiring statement that this browser signed in.
//
//   v1.<payload, base64url JSON>.<HMAC-SHA256 signature, base64url>
//
// The payload carries no secrets: when it was issued, when it expires, and a
// fingerprint of the current username and password. Changing either credential
// (or SESSION_SECRET) therefore signs everyone out.

import { constantTimeEqual, fromBase64Url, hmacBase64Url, toBase64Url } from "./crypto.ts";

const VERSION = "v1";

/** Sessions last 8 hours: a working day, then sign in again. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Tolerated clock difference for "issued in the future", in seconds. */
const CLOCK_SKEW_SECONDS = 60;

export type SessionPayload = {
  /** Issued at, seconds since the epoch. */
  iat: number;
  /** Expires at, seconds since the epoch. */
  exp: number;
  /** Credential fingerprint. */
  cv: string;
};

export type TokenKeys = {
  secret: string;
  username: string;
  password: string;
};

export function credentialFingerprint(keys: TokenKeys): string {
  return hmacBase64Url(keys.secret, `credentials\u0000${keys.username}\u0000${keys.password}`).slice(0, 22);
}

export function createSessionToken(keys: TokenKeys, nowSeconds: number = Math.floor(Date.now() / 1000)): string {
  const payload: SessionPayload = {
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
    cv: credentialFingerprint(keys),
  };
  const body = `${VERSION}.${toBase64Url(JSON.stringify(payload))}`;
  return `${body}.${hmacBase64Url(keys.secret, body)}`;
}

/** Returns the payload when the token is authentic, current and for the current credentials; otherwise null. */
export function verifySessionToken(
  token: string | undefined | null,
  keys: TokenKeys,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token || token.length > 1024) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, encoded, signature] = parts as [string, string, string];
  if (version !== VERSION) return null;

  const expected = hmacBase64Url(keys.secret, `${version}.${encoded}`);
  if (!constantTimeEqual(signature, expected)) return null;

  const json = fromBase64Url(encoded);
  if (json === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isPayload(payload)) return null;

  if (payload.exp <= nowSeconds) return null;
  if (payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) return null;
  if (!constantTimeEqual(payload.cv, credentialFingerprint(keys))) return null;

  return payload;
}

function isPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Number.isInteger(v.iat) &&
    Number.isInteger(v.exp) &&
    typeof v.cv === "string" &&
    Object.keys(v).length === 3
  );
}
