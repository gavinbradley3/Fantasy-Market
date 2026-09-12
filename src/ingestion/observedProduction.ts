// Observed production aggregation for the ACCESSIBLE model tier.
//
// WHY THIS EXISTS
// `observedFacts.ts` aggregates only the counting stats the FROZEN engines declare as
// inputs (RB: career_carries/career_touches; TE: career_targets). The weekly stats export
// the pipeline already ingests carries far more than that — rushing yards/TDs, targets,
// receptions, receiving yards/TDs — at 100% column population across every ingested game.
// Those columns were being decoded, normalized, snapshotted and then thrown away, which is
// why RB/TE arrived at the engines with no production evidence at all.
//
// This module aggregates them into the windows the accessible-tier models consume. It is a
// SECOND channel, deliberately separate from `observedFacts`: the frozen supplement, and
// therefore every frozen-engine input and every QB/WR checksum, is left byte-identical.
//
// WHAT THIS IS
// Deterministic counting only — sums and counts over provider rows, filtered to regular
// season and to `asOf`. Every value is DIRECT: a sum of observed provider columns.
//
// WHAT THIS IS NOT
// It derives no rate, no share and no projection, and it never substitutes a value. A
// column no qualifying game supplied yields `null`, never 0 — summing "no data" to zero
// would be indistinguishable from a genuine zero (a back who was on the field and never
// carried), which is the exact confusion the accessible models must be able to see. Rates
// are computed downstream, where a null denominator can be reported rather than divided.
//
// Windows (all regular season, all at or before `asOf`):
//   career        → every qualifying game
//   recent        → the most recent RECENT_GAME_WINDOW (8) of those games
//   latestSeason  → every qualifying game in the newest season present
//   priorSeason   → every qualifying game in the newest season BEFORE that one
// The two season windows exist for trajectory, which needs like-for-like season splits
// rather than a rolling window that can straddle a season boundary.

import { RECENT_GAME_WINDOW, windowsFor } from './observedFacts';
import type { GameStatRecord } from './types';

import type { CountingWindow, ObservedProduction, TeamShares } from '@/accessible/production';

export type { CountingWindow, ObservedProduction, TeamShares };

/**
 * Games the latest season must hold before it is preferred over the rolling recent window as
 * the role window. Eight matches the recent window's own size, so the role window is never a
 * smaller sample than the alternative it replaces.
 */
export const ROLE_WINDOW_MIN_GAMES = 8;

type CountingKey = keyof Pick<
  GameStatRecord,
  'carries' | 'rushingYards' | 'rushingTds' | 'targets' | 'receptions' | 'receivingYards' | 'receivingTds'
>;

const COUNTING_KEYS: readonly CountingKey[] = [
  'carries',
  'rushingYards',
  'rushingTds',
  'targets',
  'receptions',
  'receivingYards',
  'receivingTds',
];

/**
 * Sum a column across games. `null` when NO game supplied it, so the caller can report
 * the column as unobserved instead of publishing a zero it never saw.
 */
function sumOrNull(games: readonly GameStatRecord[], key: CountingKey): number | null {
  let total = 0;
  let observed = false;
  for (const g of games) {
    const v = g[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v;
      observed = true;
    }
  }
  return observed ? total : null;
}

function windowOf(games: readonly GameStatRecord[]): CountingWindow {
  const out: Record<string, number | null> = {};
  for (const key of COUNTING_KEYS) out[key] = sumOrNull(games, key);
  return { games: games.length, ...out } as CountingWindow;
}

/**
 * The games that describe a player's CURRENT role.
 *
 * A full latest season is preferred over the rolling recent window (see the contract note on
 * `ObservedProduction.roleWindow`); the rolling window stands in when the latest season is
 * too short to describe a role. Exported so every consumer of "the current role window"
 * shares one definition instead of re-deriving it — two subtly different role windows would
 * put two engines on different questions.
 *
 * `games` must already be filtered to the player and to the as-of by the caller.
 */
export function roleWindowGames(games: readonly GameStatRecord[]): readonly GameStatRecord[] {
  const { career, recent } = windowsFor(games);
  if (career.length === 0) return [];
  const split = seasonSplit(career);
  return split.latest && split.latest.length >= ROLE_WINDOW_MIN_GAMES ? split.latest : recent;
}

/** The two newest seasons present in a career window, newest first. */
function seasonSplit(career: readonly GameStatRecord[]): {
  latest: readonly GameStatRecord[] | null;
  prior: readonly GameStatRecord[] | null;
  seasons: number;
} {
  const seasons = [...new Set(career.map((g) => g.season))].sort((a, b) => b - a);
  if (seasons.length === 0) return { latest: null, prior: null, seasons: 0 };
  const of = (season: number) => career.filter((g) => g.season === season);
  return {
    latest: of(seasons[0]),
    prior: seasons.length > 1 ? of(seasons[1]) : null,
    seasons: seasons.length,
  };
}

/**
 * Team opportunity totals for one (team, game), supplied by the caller from the same
 * snapshot. Keyed `${team}|${gameId}` so a player who changed teams mid-career is always
 * measured against the team he actually played that game for.
 */
export type TeamGameTotals = ReadonlyMap<string, { readonly carries: number | null; readonly targets: number | null }>;

export function teamGameKey(team: string, gameId: string): string {
  return `${team}|${gameId}`;
}

/**
 * Player share of team opportunity over `games`.
 *
 * Only games whose team total is known contribute to EITHER side of the ratio, so the
 * share is always "of the opportunity we can actually see". A share is null when no game
 * supplied a usable denominator — never 0, which would claim the player was shut out of a
 * role we simply cannot measure. Shares are not clamped to 1: a denominator that is a
 * floor could legitimately be exceeded, and silently clamping would hide that, so the
 * caller decides how to treat an out-of-range share.
 */
function sharesOver(games: readonly GameStatRecord[], totals: TeamGameTotals): TeamShares | null {
  let playerCarries = 0;
  let teamCarries = 0;
  let carryGames = 0;
  let playerTargets = 0;
  let teamTargets = 0;
  let targetGames = 0;
  let sharedGames = 0;

  for (const g of games) {
    const t = totals.get(teamGameKey(g.team, g.gameId));
    if (!t) continue;
    sharedGames += 1;
    if (t.carries !== null && t.carries > 0 && typeof g.carries === 'number') {
      playerCarries += g.carries;
      teamCarries += t.carries;
      carryGames += 1;
    }
    if (t.targets !== null && t.targets > 0 && typeof g.targets === 'number') {
      playerTargets += g.targets;
      teamTargets += t.targets;
      targetGames += 1;
    }
  }

  if (sharedGames === 0) return null;
  return {
    carryShare: carryGames > 0 && teamCarries > 0 ? playerCarries / teamCarries : null,
    targetShare: targetGames > 0 && teamTargets > 0 ? playerTargets / teamTargets : null,
    games: sharedGames,
  };
}

/**
 * Aggregate one player's observed production. `games` must already be filtered to the
 * player and to `asOf` by the caller (the evidence builder does both); this function adds
 * only the regular-season filter and the windowing, so it cannot reach past the as-of.
 */
export function observedProduction(
  games: readonly GameStatRecord[],
  teamTotals: TeamGameTotals,
  rosteredTeamWeeks: number | null = null,
): ObservedProduction | null {
  const { career, recent } = windowsFor(games);
  if (career.length === 0) return null;
  const split = seasonSplit(career);
  const roleGames = roleWindowGames(games);
  return {
    career: windowOf(career),
    recent: windowOf(recent),
    roleWindow: windowOf(roleGames),
    latestSeason: split.latest ? windowOf(split.latest) : null,
    priorSeason: split.prior ? windowOf(split.prior) : null,
    teamShares: sharesOver(roleGames, teamTotals),
    seasonsPlayed: split.seasons,
    newestGameKickoff: career.length > 0 ? career[0].kickoff : null,
    rosteredTeamWeeks,
  };
}

/**
 * Build the (team, game) opportunity totals for a whole snapshot by summing every
 * player's observed carries/targets in that game.
 *
 * The totals are RECONSTRUCTED FLOORS, not provider-published team totals: they sum only
 * the players the snapshot holds rows for. That makes them a lower bound on true team
 * opportunity, so a derived share is an upper bound. Both facts are documented on the
 * share's provenance and reflected in the accessible models' confidence, and the floor
 * property is preserved by one rule applying to both sides of every ratio.
 *
 * `asOf` filtering is the caller's responsibility and is applied to the record list
 * passed in, so this function cannot widen the window it is given.
 */
export function buildTeamGameTotals(games: readonly GameStatRecord[]): TeamGameTotals {
  const totals = new Map<string, { carries: number | null; targets: number | null }>();
  for (const g of games) {
    if (g.seasonType !== 'REG') continue;
    const key = teamGameKey(g.team, g.gameId);
    const cur = totals.get(key) ?? { carries: null, targets: null };
    if (typeof g.carries === 'number' && Number.isFinite(g.carries)) {
      cur.carries = (cur.carries ?? 0) + g.carries;
    }
    if (typeof g.targets === 'number' && Number.isFinite(g.targets)) {
      cur.targets = (cur.targets ?? 0) + g.targets;
    }
    totals.set(key, cur);
  }
  return totals;
}

export { RECENT_GAME_WINDOW };
