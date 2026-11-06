// Small cryptographic helpers built on node:crypto. No secrets live here; the
// callers pass them in, which keeps this module easy to test.
//
// Imports between the pure modules use explicit .ts extensions so that Node's
// built-in test runner can load them directly (see package.json → test).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** A per-process key, so equal-length digests can be compared in constant time. */
const COMPARE_KEY = randomBytes(32);

/**
 * Compares two strings in constant time, whatever their lengths.
 * Both values are first reduced to fixed-length HMAC digests, so neither the
 * content nor the length of the secret leaks through timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const da = createHmac("sha256", COMPARE_KEY).update(a, "utf8").digest();
  const db = createHmac("sha256", COMPARE_KEY).update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}

export function hmacBase64Url(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

export function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) return null;
  return Buffer.from(encoded, "base64url").toString("utf8");
}
