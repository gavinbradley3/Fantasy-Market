// Observed CAREER rates for the QB engine.
//
// WHY THIS EXISTS
// The QB engine's quality components regressed an eight-game window toward a prior built from
// draft round, and nothing else. A quarterback's career was therefore invisible to Passing
// Quality and Rushing Value: 1,680 career attempts counted for exactly as much as 94. The
// observable consequence on the live board was a career backup with one strong eight-game
// stretch out-scoring an established starter having a poor season.
//
// These two rates give the engine the career baseline it had no way to see. They are
// observations, not estimates — every term is a sum of provider columns over the player's
// whole ingested history, and a window that supplies nothing yields `undefined` rather than a
// number.
//
// CAREER EVIDENCE vs RECENT-FORM EVIDENCE. This module produces only the first. The recent
// window is built separately (`observedCountingFacts`), and the engine combines them — see
// §26.6.3-CA. Keeping the two in different functions is what stops one quietly becoming the
// other.

import type { GameStatRecord } from './types';

export interface ObservedCareerRates {
  /**
   * Career adjusted yards per attempt, on the engine's own AY/A definition
   * (`(yards + 20·TD − 45·INT) / attempts`, §26.6.3) so the career term and the recent term
   * are the same quantity measured over different windows.
   */
  readonly career_adjusted_yards_per_attempt?: number;
  /**
   * Career rushing yards per START.
   *
   * Per start rather than per game, matching the engine's recent rushing rates: a quarterback
   * accumulates rushing value in the games he starts, and dividing by appearances would
   * understate a starter who also appeared in relief.
   */
  readonly career_rushing_yards_per_start?: number;
}

function finite(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Sum a column over games that supplied it; `null` when none did. */
function sumOf(games: readonly GameStatRecord[], key: keyof GameStatRecord): number | null {
  let total = 0;
  let seen = false;
  for (const g of games) {
    const v = finite(g[key] as number | null);
    if (v === null) continue;
    total += v;
    seen = true;
  }
  return seen ? total : null;
}

/**
 * Career passing and rushing rates over a quarterback's full ingested regular-season history.
 *
 * `games` must already be filtered to the player and to the as-of by the caller; this function
 * adds only the regular-season filter, so it cannot reach past the as-of.
 *
 * `careerStarts` comes from the official start records rather than being inferred here, so the
 * rushing rate's denominator is the same start count every other part of the engine uses.
 */
export function observedCareerRates(
  games: readonly GameStatRecord[],
  careerStarts: number | null,
): ObservedCareerRates {
  const reg = games.filter((g) => g.seasonType === 'REG');
  const out: { career_adjusted_yards_per_attempt?: number; career_rushing_yards_per_start?: number } = {};
  if (reg.length === 0) return out;

  const attempts = sumOf(reg, 'passAttempts');
  const yards = sumOf(reg, 'passingYards');
  const tds = sumOf(reg, 'passingTds');
  const ints = sumOf(reg, 'interceptions');
  if (attempts !== null && attempts > 0 && yards !== null && tds !== null && ints !== null) {
    out.career_adjusted_yards_per_attempt = (yards + 20 * tds - 45 * ints) / attempts;
  }

  const rushYards = sumOf(reg, 'rushingYards');
  if (rushYards !== null && careerStarts !== null && careerStarts > 0) {
    out.career_rushing_yards_per_start = rushYards / careerStarts;
  }

  return out;
}
