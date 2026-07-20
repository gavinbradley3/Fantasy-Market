// Deterministic aggregation of weekly stat records into the historical windows
// the engines reason over (CAREER, CURRENT_SEASON, PREVIOUS_SEASON, LAST_4,
// LAST_8). Aggregation is a pure fold over rows sorted by (season, week); given
// the same rows in any input order it produces identical aggregates.
//
// Window semantics:
//   CAREER          — every regular-season row.
//   CURRENT_SEASON  — rows in the configured current season.
//   PREVIOUS_SEASON — rows in current season − 1.
//   LAST_4 / LAST_8 — the most recent 4 / 8 game-weeks, newest-first, across
//                     seasons up to and including the current season.
// Postseason inclusion is decided upstream by the adapter; by default only
// regular-season rows reach here. Missing weeks simply do not contribute (games
// played = number of rows present). Traded players aggregate across teams.

import type {
  StatWindow,
  WeeklyStatRecord,
  WindowAggregate,
} from '@/pipeline/stats/types';

export interface AggregateConfig {
  readonly currentSeason: number;
}

function emptyAggregate(window: StatWindow): WindowAggregate {
  return {
    window,
    games: 0,
    seasons: [],
    completions: 0,
    attempts: 0,
    passingYards: 0,
    passingTds: 0,
    interceptions: 0,
    sacks: 0,
    sackYards: 0,
    carries: 0,
    rushingYards: 0,
    rushingTds: 0,
    receptions: 0,
    targets: 0,
    receivingYards: 0,
    receivingTds: 0,
    receivingAirYards: null,
    airYardsWeeks: 0,
    receivingYardsAfterCatch: null,
    yacWeeks: 0,
    teamTargetsRecon: null,
    targetShareWeeks: 0,
  };
}

function fold(rows: readonly WeeklyStatRecord[], window: StatWindow): WindowAggregate {
  const agg = { ...emptyAggregate(window) };
  const seasons = new Set<number>();
  let airYards = 0;
  let yac = 0;
  let teamTargets = 0;
  for (const r of rows) {
    seasons.add(r.season);
    agg.games += 1;
    agg.completions += r.completions;
    agg.attempts += r.attempts;
    agg.passingYards += r.passingYards;
    agg.passingTds += r.passingTds;
    agg.interceptions += r.interceptions;
    agg.sacks += r.sacks;
    agg.sackYards += r.sackYards;
    agg.carries += r.carries;
    agg.rushingYards += r.rushingYards;
    agg.rushingTds += r.rushingTds;
    agg.receptions += r.receptions;
    agg.targets += r.targets;
    agg.receivingYards += r.receivingYards;
    agg.receivingTds += r.receivingTds;
    if (r.receivingAirYards !== null) {
      airYards += r.receivingAirYards;
      agg.airYardsWeeks += 1;
    }
    if (r.receivingYardsAfterCatch !== null) {
      yac += r.receivingYardsAfterCatch;
      agg.yacWeeks += 1;
    }
    // Reconstruct team targets for the week: player targets ÷ share. Requires a
    // positive share and at least one target.
    if (r.targetShare !== null && r.targetShare > 0 && r.targets > 0) {
      teamTargets += r.targets / r.targetShare;
      agg.targetShareWeeks += 1;
    }
  }
  agg.seasons = [...seasons].sort((a, b) => a - b);
  agg.receivingAirYards = agg.airYardsWeeks > 0 ? airYards : null;
  agg.receivingYardsAfterCatch = agg.yacWeeks > 0 ? yac : null;
  agg.teamTargetsRecon = agg.targetShareWeeks > 0 ? teamTargets : null;
  return agg;
}

/** Sort ascending by (season, week); stable and deterministic. */
function sortChronological(rows: readonly WeeklyStatRecord[]): WeeklyStatRecord[] {
  return [...rows].sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.week - b.week,
  );
}

export function aggregateWindows(
  rows: readonly WeeklyStatRecord[],
  cfg: AggregateConfig,
): Record<StatWindow, WindowAggregate> {
  const chrono = sortChronological(rows);
  const upToCurrent = chrono.filter((r) => r.season <= cfg.currentSeason);
  // Newest-first for trailing windows.
  const newestFirst = [...upToCurrent].reverse();

  return {
    CAREER: fold(chrono, 'CAREER'),
    CURRENT_SEASON: fold(
      chrono.filter((r) => r.season === cfg.currentSeason),
      'CURRENT_SEASON',
    ),
    PREVIOUS_SEASON: fold(
      chrono.filter((r) => r.season === cfg.currentSeason - 1),
      'PREVIOUS_SEASON',
    ),
    LAST_4: fold(newestFirst.slice(0, 4), 'LAST_4'),
    LAST_8: fold(newestFirst.slice(0, 8), 'LAST_8'),
  };
}
