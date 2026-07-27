// Observed-fact aggregation (Phase 11). Turns the per-game stat records ALREADY in the
// normalized snapshot into the counting-stat engine inputs, which the evidence builder
// previously left undecided even though the records were sitting in the snapshot.
//
// WHAT THIS IS
// Deterministic counting only: sums and counts over provider rows, filtered to regular
// season and to `asOf`. Every value is DIRECT — a sum of observed provider columns.
//
// WHAT THIS IS NOT
// It derives no rate, share, efficiency or projection, and it never substitutes a value.
// A column the provider did not supply for ANY qualifying game yields `undefined`, and the
// field is left out so the AIL records it as unavailable — never 0. Summing "no data" to
// zero would be indistinguishable from a genuine zero, which is the exact failure this
// layer is supposed to make impossible.
//
// Windows follow the existing model vocabulary:
//   career_* → every regular-season game at or before `asOf`
//   recent_* → the most recent `RECENT_GAME_WINDOW` of those games
// Postseason is excluded (REGISTRY §20.F11, POSTSEASON_EXCLUDED).

import type { GameStatRecord } from './types';

/**
 * Games in the "recent" window for ENGINE-FACING counting facts.
 *
 * The QB engine's input contract bounds `recent_games` to [0,8]
 * (`src/qb-model/validation.ts`) and requires `recent_starts ≤ recent_games`, so every
 * `recent_*` fact below is summed over the most recent EIGHT regular-season games. These
 * fields are consumed only by the QB engine — RB/WR/TE produce career facts only — so this
 * one constant governs all of them.
 *
 * KNOWN SPECIFICATION CONFLICT. REGISTRY §9.2 sets D2's recent window to 17 team games
 * ("MVP_HEURISTIC = one season"), which is wider than the engine will accept. The two
 * cannot both hold for a field the engine validates, and the engine is the frozen artifact
 * that rejects the input outright, so the engine-facing window follows the engine. A player
 * with more than eight games — that is, almost every real quarterback — cannot be valued
 * otherwise. The conflict itself is not resolved here and is reported as an open item; this
 * constant only decides what the engine is handed.
 */
export const RECENT_GAME_WINDOW = 8;

type StatKey = keyof Pick<
  GameStatRecord,
  | 'passAttempts'
  | 'carries'
  | 'targets'
  | 'completions'
  | 'passingYards'
  | 'passingTds'
  | 'interceptions'
  | 'sacks'
  | 'rushingYards'
  | 'rushingTds'
  | 'receptions'
  | 'receivingYards'
  | 'receivingTds'
>;

/**
 * Sum a column across games. Returns `undefined` when NO game supplied the column, so the
 * caller can leave the field undecided instead of publishing a zero it did not observe.
 */
function sumOrUndefined(games: readonly GameStatRecord[], key: StatKey): number | undefined {
  let total = 0;
  let observed = false;
  for (const g of games) {
    const v = g[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v;
      observed = true;
    }
  }
  return observed ? total : undefined;
}

/** Assign only defined values, so an unobserved column never becomes a key. */
function put(target: Record<string, unknown>, field: string, value: number | undefined): void {
  if (value !== undefined) target[field] = value;
}

export interface ObservedFactWindows {
  /** Regular-season games at or before as-of, newest first. */
  readonly career: readonly GameStatRecord[];
  readonly recent: readonly GameStatRecord[];
}

/** Split a player's qualifying games into the career and recent windows. */
export function windowsFor(games: readonly GameStatRecord[]): ObservedFactWindows {
  const career = [...games]
    .filter((g) => g.seasonType === 'REG')
    .sort((a, b) => (a.kickoff === b.kickoff ? a.gameId.localeCompare(b.gameId) : a.kickoff < b.kickoff ? 1 : -1));
  return { career, recent: career.slice(0, RECENT_GAME_WINDOW) };
}

/**
 * Build the position's observed counting facts. Only fields this position's engine
 * actually declares are produced; the caller merges them as FACTS, which win over any
 * AIL estimate for the same field.
 */
export function observedCountingFacts(
  position: 'QB' | 'RB' | 'WR' | 'TE',
  games: readonly GameStatRecord[],
): Record<string, unknown> {
  const { career, recent } = windowsFor(games);
  const facts: Record<string, unknown> = {};
  if (career.length === 0) return facts;

  switch (position) {
    case 'QB': {
      // Career volume.
      facts.career_games_played = career.length;
      put(facts, 'career_pass_attempts', sumOrUndefined(career, 'passAttempts'));
      put(facts, 'career_rush_attempts', sumOrUndefined(career, 'carries'));
      // Recent form.
      facts.recent_games = recent.length;
      put(facts, 'recent_pass_attempts', sumOrUndefined(recent, 'passAttempts'));
      put(facts, 'recent_completions', sumOrUndefined(recent, 'completions'));
      put(facts, 'recent_passing_yards', sumOrUndefined(recent, 'passingYards'));
      put(facts, 'recent_passing_tds', sumOrUndefined(recent, 'passingTds'));
      put(facts, 'recent_interceptions', sumOrUndefined(recent, 'interceptions'));
      put(facts, 'recent_sacks', sumOrUndefined(recent, 'sacks'));
      put(facts, 'recent_rush_attempts', sumOrUndefined(recent, 'carries'));
      put(facts, 'recent_rushing_yards', sumOrUndefined(recent, 'rushingYards'));
      put(facts, 'recent_rushing_tds', sumOrUndefined(recent, 'rushingTds'));
      break;
    }
    case 'RB': {
      const carries = sumOrUndefined(career, 'carries');
      const targets = sumOrUndefined(career, 'targets');
      put(facts, 'career_carries', carries);
      // A touch is a carry plus a target — a definition, not an estimate. It is only
      // produced when BOTH components were observed, so it can never be a partial sum
      // masquerading as a total.
      if (carries !== undefined && targets !== undefined) facts.career_touches = carries + targets;
      break;
    }
    case 'TE': {
      put(facts, 'career_targets', sumOrUndefined(career, 'targets'));
      break;
    }
    case 'WR':
      // The WR engine's non-nullable inputs are career_routes and expected_games_remaining,
      // both owned by the inference layer (route exposure / expected games). No counting
      // fact is required here, and none is invented.
      break;
  }
  return facts;
}
