// Shared freshness contract. Both the status exporter and the browser classify the same
// publication timestamp with these rules; neither layer owns a divergent copy.

/** Hours between scheduled refreshes for each job. Must match .github/workflows. */
export const CADENCE_HOURS = {
  nflverse: 6,
  market: 24 * 7,
} as const;

export const STALENESS = {
  // One missed board run is normal operational noise; two consecutive misses is a signal.
  boardCurrentHours: CADENCE_HOURS.nflverse * 2,
  // Beyond a week a board is likely to describe the wrong week of the season.
  boardExpiredHours: 24 * 7,
  marketCurrentHours: CADENCE_HOURS.market * 2,
  marketExpiredHours: 24 * 30,
  runHistoryLimit: 20,
} as const;

export type FreshnessState = 'current' | 'stale' | 'expired' | 'unknown';

export function classifyFreshness(
  timestamp: string | null,
  now: string,
  currentHours: number,
  expiredHours: number,
): FreshnessState {
  if (timestamp === null) return 'unknown';
  const then = Date.parse(timestamp);
  const at = Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(at)) return 'unknown';
  const age = (at - then) / 3_600_000;
  // A future timestamp is inconsistent evidence, never evidence of freshness.
  if (age < 0) return 'unknown';
  if (age <= currentHours) return 'current';
  if (age <= expiredHours) return 'stale';
  return 'expired';
}

/** Hours since `timestamp`, rounded for display/status, or null without valid evidence. */
export function ageHours(timestamp: string | null, now: string): number | null {
  if (timestamp === null) return null;
  const then = Date.parse(timestamp);
  const at = Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(at)) return null;
  const age = (at - then) / 3_600_000;
  if (age < 0) return null;
  return Math.round(age * 10) / 10;
}
