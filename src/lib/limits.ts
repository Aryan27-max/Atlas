import "server-only";

import { headers } from "next/headers";

import { addressFromHeaders } from "./auth/address";
import { FailureLimiter, type LimitDecision } from "./auth/rate-limit";

// Every rate limit on the site, in one place. They live in memory, so each
// server instance counts on its own (see README.md → Security notes); kept on
// globalThis so hot reloads in development don't reset them.

const MINUTE = 60_000;

export const LIMITS = {
  /** Failed sign-ins from one address. */
  loginPerAddress: { maxFailures: 5, windowMs: 15 * MINUTE },
  /** Failed sign-ins from everywhere together: caps guessing spread over many addresses. */
  loginSiteWide: { maxFailures: 100, windowMs: 15 * MINUTE },
  /** Download clicks from one address. A person needs a handful; scripts get stopped. */
  downloadsPerAddress: { maxFailures: 30, windowMs: 10 * MINUTE },
} as const;

type Limiters = Record<keyof typeof LIMITS, FailureLimiter>;

const globalForLimits = globalThis as typeof globalThis & { __atlasLimits?: Limiters };

export const limiters: Limiters = (globalForLimits.__atlasLimits ??= {
  loginPerAddress: new FailureLimiter(LIMITS.loginPerAddress),
  loginSiteWide: new FailureLimiter({ ...LIMITS.loginSiteWide, maxKeys: 1 }),
  downloadsPerAddress: new FailureLimiter(LIMITS.downloadsPerAddress),
});

/** The key the site-wide limiter counts under. */
export const SITE_WIDE = "*";

/** Blocked if any decision is blocked; waits for the longest one. */
export function combine(...decisions: LimitDecision[]): LimitDecision {
  const blocked = decisions.filter((d): d is Extract<LimitDecision, { allowed: false }> => !d.allowed);
  if (blocked.length === 0) return { allowed: true };
  return { allowed: false, retryAfterMs: Math.max(...blocked.map((d) => d.retryAfterMs)) };
}

/** The visitor's address, from the header the host vouches for (lib/auth/address.ts). */
export function addressFrom(h: Headers): string {
  return addressFromHeaders(h, process.env.VERCEL === "1");
}

/** The visitor's address, for Server Components and Server Actions. */
export async function clientAddress(): Promise<string> {
  return addressFrom(await headers());
}
