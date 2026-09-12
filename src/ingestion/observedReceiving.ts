// Observed receiving RATES for the WR engine.
//
// WHY THIS IS A SEPARATE MODULE
// `observedFacts.ts` is deliberately counting-only — "it derives no rate, share, efficiency
// or projection". The two values here are ratios, so they do not belong in it. They are
// nonetheless observations rather than estimates: both numerator and denominator come from
// columns the provider publishes for the game in question, and a window that supplies
// neither yields `undefined` rather than a number.
//
// WHAT WAS WRONG BEFORE
// The WR engine declares `target_share` and `average_depth_of_target` as inputs. Neither was
// ever supplied, so every WR in the league received the engine's fallbacks — `RP4 × TPRR`
// capped at 0.35, which resolves to the same 0.09 for everyone, and a flat aDOT of 10. Two of
// the eight WR component scores were therefore identical for all 645 receivers on the board,
// and the model's own confidence correctly reported that as near-zero. The data was in the
// snapshot the whole time: `receiving_air_yards` and `target_share` are 100% populated in the
// weekly export the pipeline already downloads, and the ingestion adapter simply did not read
// them.
//
// NO METHODOLOGY CHANGED. The engine's treatment of these inputs, its weights and its
// fallback ladder are all untouched; it now receives observations where it previously
// received constants.

import { roleWindowGames } from './observedProduction';
import type { GameStatRecord } from './types';

/** The window both rates are measured over: the player's CURRENT role. */
export { roleWindowGames };

export interface ObservedReceivingRates {
  /**
   * Share of the team's targets over the role window.
   *
   * Built from the PROVIDER'S weekly share, not from a reconstructed team total: each game's
   * team-target denominator is recovered as `targets ÷ target_share`, and the window share is
   * `Σ targets ÷ Σ recovered denominators`. That keeps the provider's real denominator
   * instead of PlayerTicker's floor, so the result is a measurement rather than an upper
   * bound. Weeks that cannot supply a denominator contribute to NEITHER side of the ratio.
   */
  readonly target_share?: number;
  /** Average depth of target: Σ receiving air yards ÷ Σ targets over the same window. */
  readonly average_depth_of_target?: number;
}

/** A finite number, or null. Guards against a provider NaN reaching arithmetic. */
function finite(v: number | null): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Observed receiving rates over a player's current-role window.
 *
 * `games` must already be filtered to the player and to the as-of by the caller — this
 * function only picks the window, so it cannot reach past the as-of.
 */
export function observedReceivingRates(games: readonly GameStatRecord[]): ObservedReceivingRates {
  const window = roleWindowGames(games);
  const out: { target_share?: number; average_depth_of_target?: number } = {};
  if (window.length === 0) return out;

  // --- target share ---
  let playerTargets = 0;
  let teamTargets = 0;
  let shareGames = 0;
  for (const g of window) {
    const targets = finite(g.targets);
    const share = finite(g.targetShare);
    // A zero share cannot recover a denominator, and a zero-target game carries no
    // information about the split either way. Both are skipped rather than counted as 0.
    if (targets === null || targets <= 0 || share === null || share <= 0) continue;
    playerTargets += targets;
    teamTargets += targets / share;
    shareGames += 1;
  }
  if (shareGames > 0 && teamTargets > 0) out.target_share = playerTargets / teamTargets;

  // --- average depth of target ---
  let airYards = 0;
  let aDotTargets = 0;
  let aDotGames = 0;
  for (const g of window) {
    const targets = finite(g.targets);
    const air = finite(g.receivingAirYards);
    if (targets === null || targets <= 0 || air === null) continue;
    airYards += air;
    aDotTargets += targets;
    aDotGames += 1;
  }
  if (aDotGames > 0 && aDotTargets > 0) out.average_depth_of_target = airYards / aDotTargets;

  return out;
}
