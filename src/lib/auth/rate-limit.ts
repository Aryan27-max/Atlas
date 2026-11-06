// A small fixed-window limiter for failed sign-ins, kept in memory.
//
// It is deliberately basic: on a serverless host each instance has its own
// memory, so the limit is per instance. That still slows down guessing a lot;
// README.md → Security notes says how to add a shared store if you need one.

export type LimiterOptions = {
  /** Failed attempts allowed per window. */
  maxFailures: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Stop tracking new keys beyond this many, so memory can't grow without bound. */
  maxKeys?: number;
  now?: () => number;
};

export type LimitDecision = { allowed: true } | { allowed: false; retryAfterMs: number };

type Entry = { failures: number; resetAt: number };

export class FailureLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: LimiterOptions) {
    this.maxFailures = options.maxFailures;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  /** May this key try now? */
  check(key: string): LimitDecision {
    const entry = this.current(key);
    if (entry && entry.failures >= this.maxFailures) {
      return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - this.now()) };
    }
    return { allowed: true };
  }

  /** Check and count in one step, for limiting every request (not just failures). */
  take(key: string): LimitDecision {
    const decision = this.check(key);
    if (decision.allowed) this.fail(key);
    return decision;
  }

  /** Record a failed attempt. */
  fail(key: string): void {
    const entry = this.current(key);
    if (entry) {
      entry.failures += 1;
      return;
    }
    if (this.entries.size >= this.maxKeys) this.prune();
    this.entries.set(key, { failures: 1, resetAt: this.now() + this.windowMs });
  }

  /** Forget a key, after a successful sign-in. */
  reset(key: string): void {
    this.entries.delete(key);
  }

  private current(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
    // Still full: drop the oldest entries (Map keeps insertion order).
    while (this.entries.size >= this.maxKeys) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
