// Bounded, deterministic retry policy (Phase 5). Only transient failures are retried
// (timeouts, connection resets, HTTP 429, selected 5xx). Configuration errors,
// unsupported capabilities, most 4xx, decode/checksum failures, and adapter failures
// are terminal. Backoff is deterministic; optional production jitter is injected behind
// the Random seam and never affects normalized output.

import type { Random, Sleep } from './clock';
import { TransportError } from './errors';

export interface RetryPolicy {
  /** Extra attempts after the first (0 = no retries). */
  readonly maxRetries: number;
  /** Base backoff in ms; attempt n waits base * (factor ** (n-1)). */
  readonly baseDelayMs: number;
  /** Backoff growth factor. */
  readonly factor: number;
  /** Upper bound on any single backoff wait. */
  readonly maxDelayMs: number;
  /** Fraction [0,1] of the computed delay that may be added as jitter (via Random). */
  readonly jitterRatio: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 200,
  factor: 3,
  maxDelayMs: 5_000,
  jitterRatio: 0,
};

/** HTTP status codes that are transient and worth retrying (timeouts, 429, selected 5xx). */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/**
 * True only for transient failures. The authority is the error's own `retryable` flag,
 * set at the point the failure is classified (timeout/network/429/selected-5xx = true;
 * config/unsupported/4xx/decode/checksum/adapter = false). A non-TransportError (an
 * unexpected throw) is never retried.
 */
export function isRetryableError(err: unknown): boolean {
  return err instanceof TransportError && err.retryable;
}

/** Deterministic backoff for attempt `n` (1-based), with optional injected jitter. */
export function backoffDelayMs(policy: RetryPolicy, attempt: number, random: Random): number {
  const base = policy.baseDelayMs * policy.factor ** (attempt - 1);
  const capped = Math.min(base, policy.maxDelayMs);
  if (policy.jitterRatio <= 0) return capped;
  // Jitter is additive and bounded; with zeroRandom this is a no-op (fully deterministic).
  const jitter = capped * policy.jitterRatio * random.next();
  return Math.min(capped + jitter, policy.maxDelayMs);
}

/**
 * Run `attempt()` under the retry policy. Retries only transient TransportErrors, up to
 * `maxRetries` extra attempts, sleeping the (deterministic) backoff between tries. The
 * last error is rethrown when attempts are exhausted.
 */
export async function withRetry<T>(
  policy: RetryPolicy,
  random: Random,
  sleep: Sleep,
  attempt: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let n = 0; n <= policy.maxRetries; n++) {
    if (n > 0) await sleep(backoffDelayMs(policy, n, random));
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err)) throw err; // terminal — do not retry
    }
  }
  throw lastError;
}
