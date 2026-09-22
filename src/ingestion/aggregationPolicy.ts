import type { GameStatRecord } from './types';

/** Explicit opt-in: recorded v1/v2 experiments and ordinary callers retain legacy bytes. */
export const BETA_AGGREGATION_VERSION = 'playerticker.controlled-beta.observed-aggregation/v1' as const;
export type AggregationPolicy = typeof BETA_AGGREGATION_VERSION;

export interface AggregationOptions {
  readonly policy: AggregationPolicy;
  readonly targetDenominators: ReadonlyMap<string, number | null>;
}

/** Peers must belong to the same provider capture, team and game, not another season/team. */
function denominatorKey(g: GameStatRecord): string {
  return JSON.stringify([g.freshness.provider, g.freshness.fetchedAt, g.sourceTimestamp, g.team, g.gameId]);
}

/**
 * nflfastR defines target_share as player targets / all team targets, not pass attempts.
 * https://nflfastr.com/reference/nfl_stats_variables.html
 * Recover that SAME count from a positive-target peer; never sum a partial roster or borrow
 * a pass-play denominator. All usable peers must agree on the integer count. The tolerance
 * accommodates decimal serialization only; it is not a statistical/model threshold.
 */
export function betaAggregationOptions(games: readonly GameStatRecord[]): AggregationOptions {
  const targetDenominators = new Map<string, number | null>();
  for (const g of games) {
    if (g.seasonType !== 'REG' || g.targets === null || g.targetShare === null) continue;
    if (g.targets === 0 && g.targetShare === 0) continue; // 0/0 supplies no denominator.
    const key = denominatorKey(g);
    const raw = g.targets / g.targetShare;
    const count = Math.round(raw);
    const valid = Number.isInteger(g.targets) && g.targets > 0 && Number.isFinite(g.targetShare)
      && g.targetShare > 0 && g.targetShare <= 1 && Number.isFinite(raw) && count > 0
      && Math.abs(raw - count) <= 1e-6 * Math.max(1, count);
    const previous = targetDenominators.get(key);
    targetDenominators.set(key, !valid || previous === null || (previous !== undefined && previous !== count) ? null : count);
  }
  return { policy: BETA_AGGREGATION_VERSION, targetDenominators };
}

export interface TargetShareCoverage {
  readonly value: number | null;
  readonly missingGameIds: readonly string[];
  readonly conflictingGameIds: readonly string[];
}

/** Whole-window observation: an unknown denominator cannot quietly narrow the window. */
export function betaTargetShare(games: readonly GameStatRecord[], options: AggregationOptions): TargetShareCoverage {
  let numerator = 0;
  let denominator = 0;
  const missingGameIds: string[] = [];
  const conflictingGameIds: string[] = [];
  for (const g of games) {
    const total = options.targetDenominators.get(denominatorKey(g));
    if (total === null) { conflictingGameIds.push(g.gameId); continue; }
    if (total === undefined || !Number.isInteger(g.targets) || g.targets === null || g.targets < 0 || g.targets > total) {
      missingGameIds.push(g.gameId);
      continue;
    }
    numerator += g.targets; // Includes observed zero-target appearances.
    denominator += total;
  }
  return {
    value: denominator > 0 && missingGameIds.length === 0 && conflictingGameIds.length === 0 ? numerator / denominator : null,
    missingGameIds: [...new Set(missingGameIds)].sort(),
    conflictingGameIds: [...new Set(conflictingGameIds)].sort(),
  };
}

/** A partial column cannot be passed off as a total over the complete appearance count. */
export function hasUnobservedColumn(games: readonly GameStatRecord[], key: keyof GameStatRecord): boolean {
  return games.some((g) => typeof g[key] !== 'number' || !Number.isFinite(g[key]));
}
