// Which NFL season should the pipeline ACQUIRE?
//
// This is deliberately a different question from `nflSeasonOf()` in ./weekTiming.ts, and the
// two must not be merged.
//
//   nflSeasonOf(iso)        — "which season does this DATE BELONG TO?"  (as-of clamping,
//                             experience counting). In March 2026 the answer is 2026: that
//                             instant belongs to the 2026 season year.
//   currentIngestSeason(now) — "which season has DATA TO INGEST?" In March 2026 the answer is
//                             2025, because the 2026 season has not kicked off and the
//                             provider publishes no 2026 game rows yet.
//
// Using the first where the second is meant is how a pipeline ends up requesting a season the
// provider has no asset for, or silently valuing players on an empty stat window.
//
// THE RULE (explicit, deterministic, no lookup table)
//   A season named S has STARTED once its Week 1 kickoff has passed.
//   Week 1 kickoff = the Thursday after Labor Day of year S  (Labor Day + 3 days),
//   which is the same calendar convention ./weekTiming.ts already uses for week boundaries.
//
//   currentIngestSeason(now) = now >= week1Kickoff(now.year) ? now.year : now.year - 1
//
// Worked through the boundaries:
//   2026-09-11 (Week 1 underway)  → 2026   the season now being played
//   2026-08-20 (preseason)        → 2025   2026 has no regular-season rows yet
//   2026-03-01 (offseason)        → 2025   the most recently completed season
//   2027-01-15 (2026 playoffs)    → 2026   still the 2026 season
//
// In the offseason this resolves to the most recently COMPLETED season, which is the correct
// window to value players on — not an empty future one.

import { laborDay } from './weekTiming';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant season `S` opens: the Thursday after Labor Day, 00:00:00 UTC. */
export function week1Kickoff(season: number): Date {
  return new Date(laborDay(season).getTime() + 3 * DAY_MS);
}

/** The most recent season that has kicked off as at `now`. */
export function currentIngestSeason(now: Date): number {
  const year = now.getUTCFullYear();
  return now.getTime() >= week1Kickoff(year).getTime() ? year : year - 1;
}

/** Where the season list came from, so the caller can say so out loud. */
export type SeasonSource = 'explicit' | 'derived';

export interface SeasonSelection {
  readonly seasons: readonly number[];
  readonly source: SeasonSource;
  /** Human-readable reason, for logs. Never invented — states the rule that applied. */
  readonly note: string;
}

/** Seasons are 4-digit years inside the range the providers actually publish. */
export function isPlausibleSeason(value: number): boolean {
  return Number.isInteger(value) && value >= 1999 && value <= 2100;
}

/**
 * Resolve the seasons to acquire.
 *
 * An explicit list always wins and is never widened, narrowed or reordered — an operator who
 * names seasons gets exactly those. Only when nothing was supplied is the current season
 * derived, and the result records that it was derived so the caller can log it. There is no
 * hard-coded year anywhere in this path, which is the point: a checkout that sits unused for
 * a year cannot quietly keep ingesting the season it was written in.
 */
export function resolveSeasons(explicit: readonly number[] | null | undefined, now: Date): SeasonSelection {
  if (explicit && explicit.length > 0) {
    const bad = explicit.filter((s) => !isPlausibleSeason(s));
    if (bad.length > 0) {
      throw new Error(`invalid season(s): ${bad.join(', ')} (expected 4-digit years 1999–2100)`);
    }
    return {
      seasons: [...explicit],
      source: 'explicit',
      note: 'seasons supplied explicitly',
    };
  }
  const season = currentIngestSeason(now);
  return {
    seasons: [season],
    source: 'derived',
    note: `derived from ${now.toISOString()} — most recent season whose Week 1 has kicked off`,
  };
}

/** One line describing the selection, for startup/ingest logs. */
export function describeSeasonSelection(selection: SeasonSelection): string {
  return `${selection.seasons.join(', ')} (${selection.source}: ${selection.note})`;
}
