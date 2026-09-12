// Freshness thresholds, derived from the refresh cadence rather than chosen by feel.
//
// THE RULE THIS ENCODES: a failed refresh must never make old data look current. The app keeps
// serving the last known-good board — that is the point of last-known-good — so the only thing
// standing between a stale board and a user who believes it is current is an honest label.
//
// Every threshold below is stated as a multiple of the cadence that produces the data, so if a
// schedule changes the thresholds move with it instead of silently becoming wrong.

/** Hours between scheduled refreshes for each job. Must match .github/workflows. */
export const CADENCE_HOURS = {
  /**
   * nflverse, in-season. Its weekly player-stats release lands after the last game of a week
   * and is then corrected over the following day or two, so six hours keeps the board within
   * one release cycle of the source without polling a file that changes weekly.
   */
  nflverse: 6,
  /**
   * DynastyProcess. The published values move on a roughly weekly cadence, so a daily capture
   * is already more often than the source changes; anything faster records the same numbers
   * repeatedly and inflates the history for nothing.
   */
  market: 24 * 7,
} as const;

export const STALENESS = {
  /**
   * A board is CURRENT for two cadences. One missed run is normal operational noise — a runner
   * queue, a provider blip, a re-run — and should not cry stale. Two consecutive misses is a
   * signal.
   */
  boardCurrentHours: CADENCE_HOURS.nflverse * 2,
  /**
   * A board older than a week is not merely stale, it is likely to be describing the wrong
   * week of the season. Reported separately so the app can distinguish "a run failed" from
   * "nobody has looked at this in a week".
   */
  boardExpiredHours: 24 * 7,
  /** Market data is CURRENT for two weekly cadences, for the same one-missed-run reason. */
  marketCurrentHours: CADENCE_HOURS.market * 2,
  /** Beyond a month the market snapshot predates most roster movement it is meant to price. */
  marketExpiredHours: 24 * 30,
  /** How many refresh runs the status document summarizes. */
  runHistoryLimit: 20,
} as const;

/** Freshness of one dataset. `unknown` means nothing has ever been recorded. */
export type FreshnessState = 'current' | 'stale' | 'expired' | 'unknown';

/**
 * Classify an age against its thresholds.
 *
 * A null timestamp is `unknown`, never `current`: the absence of a refresh record is not
 * evidence of a recent refresh, and defaulting it the other way is exactly how a broken
 * pipeline comes to look healthy.
 */
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
  const ageHours = (at - then) / 3_600_000;
  // A future timestamp is treated as current rather than as an error: a provider clock slightly
  // ahead of ours is not a staleness problem.
  if (ageHours <= currentHours) return 'current';
  if (ageHours <= expiredHours) return 'stale';
  return 'expired';
}

/** Whole hours since `timestamp`, or null when there is nothing to measure. */
export function ageHours(timestamp: string | null, now: string): number | null {
  if (timestamp === null) return null;
  const then = Date.parse(timestamp);
  const at = Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(at)) return null;
  return Math.round(((at - then) / 3_600_000) * 10) / 10;
}
