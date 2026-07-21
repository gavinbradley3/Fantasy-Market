// Source/inference freshness lifecycle (REGISTRY §20.F5, supersedes the §16
// 2×TTL degrade clause).
//
// Three states only, boundaries lower-open / upper-closed:
//   age ≤ TTL                → FRESH        (recency penalty 0)
//   TTL < age ≤ hard_bound   → STALE_USABLE (recency penalty 60; keep with STALE)
//   age > hard_bound         → UNUSABLE     (degrade per field contract)
//
// Phase 1 provides the pure classification + the recency penalty mapping. The
// per-field emission decision after UNUSABLE (present-null / omit / neutral) is
// inference logic and is deferred.

export type FreshnessState = 'FRESH' | 'STALE_USABLE' | 'UNUSABLE';

/** REGISTRY §10 p_recency by freshness state. */
export const RECENCY_PENALTY: Readonly<Record<FreshnessState, number>> = {
  FRESH: 0,
  STALE_USABLE: 60,
  UNUSABLE: 150,
};

/**
 * Age in milliseconds between an as-of timestamp and a source timestamp. Both are
 * ISO-8601 strings; parsing is deterministic and uses no wall clock. Returns a
 * non-negative number; a source newer than `asOf` (should never occur after the
 * as-of cutoff) yields a negative age and classifies FRESH.
 */
export function ageMs(asOf: string, sourceTimestamp: string): number {
  const a = Date.parse(asOf);
  const s = Date.parse(sourceTimestamp);
  if (Number.isNaN(a) || Number.isNaN(s)) {
    throw new Error(`ageMs: unparseable timestamp (asOf=${asOf}, source=${sourceTimestamp})`);
  }
  return a - s;
}

/** Classify freshness from an age and a source's TTL and hard bound (same unit). */
export function classifyFreshness(age: number, ttl: number, hardBound: number): FreshnessState {
  if (age <= ttl) return 'FRESH';
  if (age <= hardBound) return 'STALE_USABLE';
  return 'UNUSABLE';
}

/** Convenience: classify directly from ISO timestamps and day-valued bounds. */
export function classifyFreshnessFromTimestamps(
  asOf: string,
  sourceTimestamp: string,
  ttlDays: number,
  hardBoundDays: number,
): FreshnessState {
  const age = ageMs(asOf, sourceTimestamp);
  const day = 24 * 60 * 60 * 1000;
  return classifyFreshness(age, ttlDays * day, hardBoundDays * day);
}
