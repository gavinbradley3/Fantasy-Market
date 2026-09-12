// The positional production reference: what a rank is WORTH, in fantasy points per game.
//
// THE PROBLEM THIS SOLVES
// The first version of this layer scored a player by his rank position on a straight line from
// the best player at his position to the last one with a role. That treats the step from RB1 to
// RB5 as the same size as the step from RB61 to RB65, which is false, and it made a position's
// value ceiling a pure function of how many players that position has — so the deepest position
// (receiver, 137 quoted players) was compressed hardest, precisely backwards.
//
// Real dynasty value tracks fantasy production, and production by rank is steeply convex. So
// this module replaces the straight line with the measured curve. Every number comes from
// `productionCurve.generated.ts`, which is produced from ingested nflverse regular-season box
// scores by `scripts/generate-production-curves.ts`.
//
// WHY POINTS ARE THE RIGHT COMMON UNIT
// Fantasy points are the thing a lineup actually accumulates, so a point of production is worth
// the same to a roster whoever scored it. That is what makes a quarterback and a tight end
// comparable at all, and it is the only quantity in this system for which that is true. Ranks
// are not comparable across positions; composites are not comparable across positions; points
// are.

import { PRODUCTION_REFERENCE } from './productionCurve.generated';
import { SCORING_RULES } from './scoring';
import { UTILITY_POSITIONS, type UtilityPosition } from './leagueSchema';

/** The shape `productionCurve.generated.ts` exports. */
export interface GeneratedPositionCurve {
  readonly position: string;
  /** Median points per game at each positional rank; index 0 is rank 1. */
  readonly pointsPerGameByRank: readonly number[];
  /** Share of this position's total production produced ABOVE each integer age. */
  readonly ageSurvival: Readonly<Record<string | number, number>>;
  readonly qualifyingPlayerSeasons: number;
  readonly fieldBySeason: Readonly<Record<string | number, number>>;
}

export interface GeneratedProductionReference {
  readonly curveVersion: string;
  readonly scoringId: string;
  readonly seasons: readonly number[];
  readonly teamGamesBySeason: Readonly<Record<string | number, number>>;
  readonly snapshotChecksum: string;
  readonly positions: Readonly<Record<string, GeneratedPositionCurve>>;
}

export const PRODUCTION_CURVE: GeneratedProductionReference = PRODUCTION_REFERENCE;

export class ProductionCurveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionCurveError';
  }
}

/** Fail loudly rather than value a board against a curve built under different scoring. */
export function assertScoringMatches(scoringId: string, reference = PRODUCTION_CURVE): void {
  if (reference.scoringId !== scoringId) {
    throw new ProductionCurveError(
      `production curve was built under scoring "${reference.scoringId}" but the league schema uses "${scoringId}"`,
    );
  }
  if (!(scoringId in SCORING_RULES)) {
    throw new ProductionCurveError(`unknown scoring rules "${scoringId}"`);
  }
}

function curveFor(position: UtilityPosition, reference = PRODUCTION_CURVE): GeneratedPositionCurve {
  const c = reference.positions[position];
  if (!c) throw new ProductionCurveError(`production curve has no entry for ${position}`);
  if (c.pointsPerGameByRank.length === 0) {
    throw new ProductionCurveError(`production curve for ${position} is empty`);
  }
  return c;
}

/** How deep the measured curve runs for a position. */
export function curveDepth(position: UtilityPosition, reference = PRODUCTION_CURVE): number {
  return curveFor(position, reference).pointsPerGameByRank.length;
}

/**
 * Points per game a player at this positional rank produces in a typical season.
 *
 * Ranks past the measured curve return its floor rather than extrapolating to nothing: the
 * curve ends where the qualifying field ends, and a player beyond it is a player who did not
 * hold a role, not one who scored a negative amount.
 */
export function productionAtRank(
  position: UtilityPosition,
  rank: number,
  reference = PRODUCTION_CURVE,
): number {
  const c = curveFor(position, reference);
  const arr = c.pointsPerGameByRank;
  if (!Number.isFinite(rank) || rank < 1) return arr[0] as number;
  const i = Math.min(Math.round(rank), arr.length) - 1;
  return arr[i] as number;
}

/**
 * The share of this position's production still ahead of a player this age — the runway.
 *
 * MEASURED, NOT ASSUMED. It is the fraction of all qualifying production at the position that
 * was produced by players older than this, so it says how much of what the position does still
 * lies in front of him. It is a population statistic and not a forecast for any individual;
 * the below-replacement term that reads it is bounded accordingly.
 *
 * An unknown age yields the value at the position's typical age rather than a full runway, so a
 * missing birth date cannot buy a player optionality he has not been shown to have.
 */
export function ageRunway(
  position: UtilityPosition,
  age: number | null,
  reference = PRODUCTION_CURVE,
): number {
  const c = curveFor(position, reference);
  const survival = c.ageSurvival;
  const lookup = (a: number): number | undefined => {
    const v = survival[a] ?? survival[String(a)];
    return typeof v === 'number' ? v : undefined;
  };
  if (age === null || !Number.isFinite(age)) {
    // The median age of production: the age whose survival share is closest to one half.
    let best = 26;
    let bestGap = Infinity;
    for (let a = 20; a <= 40; a++) {
      const v = lookup(a);
      if (v === undefined) continue;
      const gap = Math.abs(v - 0.5);
      if (gap < bestGap) {
        bestGap = gap;
        best = a;
      }
    }
    return lookup(best) ?? 0;
  }
  const lo = Math.floor(age);
  const hi = Math.ceil(age);
  const loV = lookup(Math.min(Math.max(lo, 20), 40));
  const hiV = lookup(Math.min(Math.max(hi, 20), 40));
  if (loV === undefined || hiV === undefined) return 0;
  if (lo === hi) return loV;
  return loV + (age - lo) * (hiV - loV);
}

/**
 * Effective supply: players per NFL team who clear the league's easiest startable production bar.
 *
 * WHY THIS EXISTS. Version 1 of this layer carried hand-declared supply figures (one starting
 * quarterback per team, one and a half backs, three receivers, one and a half tight ends). They
 * were assumptions, they set every position's value ceiling, and nothing supported them.
 *
 * This derives the same quantity from games, with ONE rule applied identically to all four
 * positions: count the ranks whose measured production reaches `threshold`, and divide by the
 * number of NFL teams. The caller supplies the threshold — the utility layer passes the lowest
 * replacement production in the league, so the bar is "produces at least as much as the weakest
 * startable player anywhere", which is a league fact rather than a per-position judgement.
 *
 * It is REPORTED, not multiplied by. Nothing in the value calculation reads it; the production
 * curve made it unnecessary there, which is the strongest statement available about how much
 * the old assumptions were carrying.
 */
export function effectiveSupply(
  position: UtilityPosition,
  threshold: number,
  nflTeams: number,
  reference = PRODUCTION_CURVE,
): { readonly players: number; readonly perTeam: number } {
  const arr = curveFor(position, reference).pointsPerGameByRank;
  let players = 0;
  for (const ppg of arr) {
    if (ppg >= threshold) players += 1;
    else break;
  }
  return { players, perTeam: nflTeams > 0 ? players / nflTeams : 0 };
}

/** Structural validation of a generated reference, run once at import by the utility entry. */
export function validateProductionReference(reference = PRODUCTION_CURVE): void {
  if (reference.seasons.length === 0) throw new ProductionCurveError('production curve has no seasons');
  for (const position of UTILITY_POSITIONS) {
    const c = curveFor(position, reference);
    const arr = c.pointsPerGameByRank;
    for (let i = 1; i < arr.length; i++) {
      // The curve is a sorted distribution, so it must never rise with rank. A violation means
      // the generator emitted something that is not a ranking.
      if ((arr[i] as number) > (arr[i - 1] as number)) {
        throw new ProductionCurveError(`production curve for ${position} increases at rank ${i + 1}`);
      }
    }
  }
}
