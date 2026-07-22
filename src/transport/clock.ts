// Injected non-determinism seams (Phase 5). Business logic never calls Date.now(),
// new Date(), Math.random(), or setTimeout directly — it takes these interfaces so the
// transport is deterministic under test and jitter/latency never touch normalized output.

/** Wall-clock source for operational timestamps (fetchedAt) and elapsed measurement. */
export interface Clock {
  /** Current instant as an ISO-8601 string (used for envelope `fetchedAt`). */
  now(): string;
  /** Monotonic-ish millisecond counter for elapsed timing (operational only). */
  monotonicMs(): number;
}

/** The default production clock. Confined here so no other module reads the wall clock. */
export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  monotonicMs: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

/**
 * A fixed clock for deterministic tests/replay. `now` is constant; `monotonicMs`
 * advances by a fixed step per call so elapsed timings are stable but non-zero.
 */
export function fixedClock(iso: string, stepMs = 1): Clock {
  let t = 0;
  return {
    now: () => iso,
    monotonicMs: () => {
      const v = t;
      t += stepMs;
      return v;
    },
  };
}

/** Randomness seam (retry jitter only). Production jitter must never alter output. */
export interface Random {
  /** A value in [0, 1). */
  next(): number;
}

/** Deterministic randomness for tests — always returns 0 (i.e. no jitter). */
export const zeroRandom: Random = { next: () => 0 };

/** The production randomness source. */
export const systemRandom: Random = { next: () => Math.random() };

/** Sleep seam so backoff waits are injectable (tests pass a no-op). */
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const noSleep: Sleep = () => Promise.resolve();
