// The shared cross-position dynasty value.
//
// WHAT THIS LAYER IS FOR
// Every position spec says the same thing in its own words: the horizon composites are internal
// diagnostics, anchored inside their own position, and must not be published as universal
// values until a shared utility layer exists. This is that layer. It takes what an engine
// legitimately exports — where a player stands among others at his position — and answers the
// only question that is comparable across positions:
//
//   How much fantasy production would a roster lose by replacing this player with the one it
//   could start instead?
//
// WHAT IT DELIBERATELY DOES NOT DO
// It never reads a composite's magnitude. A tight end scoring 92 on the TE scale and a
// quarterback scoring 56 on the QB scale are not 36 apart; they are two numbers from two
// distributions that were never put on a common footing. Rank is the part that survives leaving
// the engine, so rank is all this layer consumes from a position model. It applies no positional
// multiplier and no bonus: the quarterback premium is produced entirely by the schema's
// superflex slot moving the replacement quarterback twelve places deeper, and the shape of every
// position's value curve comes from measured box scores.
//
// AGE IS NOT APPLIED HERE, ON PURPOSE. Each position engine already carries an age-and-
// development component with real weight — a quarter of the receiver dynasty composite — so the
// rank this layer consumes has ALREADY been discounted for age. Re-applying a career horizon to
// a player's surplus would charge him for his age twice. The one place age appears below is the
// depth term, where it is doing different work and is bounded; see `DEPTH`.

import { replacementTable, type PositionDemand } from './replacement';
import { ageRunway, PRODUCTION_CURVE, productionAtRank, type GeneratedProductionReference } from './productionCurve';
import { UTILITY_POSITIONS, type LeagueSchema, type UtilityPosition } from './leagueSchema';

/**
 * The below-replacement / optionality term.
 *
 * WHY IT EXISTS. Strict value over replacement is right and, on its own, unusable: it values
 * everyone at or past their position's replacement at exactly zero, which on the live board was
 * 86% of it. A dynasty manager trades those players constantly, and a board that says a
 * 22-year-old back one rank below the line and a 31-year-old fifth receiver are both worth
 * nothing is not describing the same thing they are trading.
 *
 * WHAT IT IS. Not a second valuation model — a discount applied to the one already here. A
 * player's depth value is a fixed fraction of what a MEDIAN STARTER AT HIS OWN POSITION is
 * worth, scaled by how close his production comes to the best at his position and by how much
 * of that position's career still lies ahead of him. Everything it multiplies is measured.
 *
 * `WEIGHT` is the one judgement in this file: a below-replacement player is worth a minority of
 * a median starter, and a quarter is where that minority is set. It is stated here rather than
 * hidden, it is identical for all four positions, and the sensitivity analysis in
 * docs/UTILITY_LAYER.md reports what moving it does.
 *
 * `AGE_FLOOR` splits the optionality factor evenly between what a player already is and what is
 * still ahead of him. A full age multiplier would charge a veteran twice, since the engine rank
 * feeding this layer is already age-discounted; ignoring age entirely would say a 31-year-old
 * backup and a 22-year-old backup at the same rank hold the same dynasty optionality, which is
 * plainly false. Half of each is the compromise, and it is bounded by `WEIGHT` regardless.
 */
export const DEPTH = Object.freeze({ WEIGHT: 0.25, AGE_FLOOR: 0.5 });

/** Where a player's published value came from. */
export type ValueSource = 'ABOVE_REPLACEMENT' | 'DEPTH' | 'BOTH' | 'NONE';

/** One player's input: identity, position, where the engine placed him, and his age. */
export interface UtilityInput {
  readonly playerId: string;
  readonly position: UtilityPosition;
  /**
   * Rank within the player's own position on the dynasty horizon, 1 = best.
   *
   * `null` for a player the position engine published no value for. They are carried through
   * with zero utility rather than dropped, so the board can still show them as unvalued.
   */
  readonly positionRank: number | null;
  /** Age in years, or `null`. A missing age yields the position's median runway, never a full one. */
  readonly age: number | null;
}

export interface UtilityResult {
  readonly playerId: string;
  readonly position: UtilityPosition;
  readonly positionRank: number | null;
  /** What a player at this rank produces, in fantasy points per team game. */
  readonly production: number;
  /** What the league's replacement at this position produces. */
  readonly replacementProduction: number;
  /**
   * Production above positional replacement, in points per team game.
   *
   * Zero for anyone at or below replacement, whatever their internal composite says. This is the
   * quantity that is comparable across positions, and it is measured in the only unit for which
   * that is true: the points a lineup slot actually accumulates.
   */
  readonly surplus: number;
  /** The bounded optionality term — see `DEPTH`. Small, positive, and monotone in rank and age. */
  readonly depth: number;
  /** `surplus + depth`, the quantity the board is ordered on, in points per team game. */
  readonly total: number;
  /**
   * Total rescaled so the board's most valuable asset sits at 100.
   *
   * Normalization happens AFTER utility, purely so the number is readable. It is PlayerTicker's
   * own scale and is deliberately not mapped onto any market's — a market value is somebody
   * else's opinion in somebody else's units.
   */
  readonly value: number;
  readonly source: ValueSource;
}

export interface UtilityBoard {
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly curveVersion: string;
  readonly scoringId: string;
  readonly replacement: Readonly<Record<UtilityPosition, PositionDemand>>;
  readonly players: readonly UtilityResult[];
}

/** Ten-thousandths, so a published value is stable across platforms and replays. */
function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

/**
 * Compute the shared dynasty value for one complete board.
 *
 * BOARD-LEVEL BY NATURE. Normalization needs the board's maximum, and a player's position rank
 * only means something against the whole position. Passing a partial board yields values that
 * are correct relative to each other but not comparable to another run's.
 */
export function computeUtilityBoard(
  players: readonly UtilityInput[],
  schema: LeagueSchema,
  reference: GeneratedProductionReference = PRODUCTION_CURVE,
): UtilityBoard {
  const replacement = replacementTable(schema, reference);

  const scored = players.map((p) => {
    const r = replacement[p.position];
    const unranked = p.positionRank === null;
    const production = unranked ? 0 : productionAtRank(p.position, p.positionRank as number, reference);
    // A player at or below replacement has nothing to offer over the alternative, so his surplus
    // is zero rather than a small positive number: replacement level is a floor, not a discount.
    const surplus = unranked ? 0 : Math.max(0, production - r.replacementProduction);

    // Depth. Proximity is production-relative rather than rank-relative, so it inherits the
    // curve's convexity: a player just off the startable line keeps most of it, and one far down
    // keeps almost none.
    const proximity = r.eliteProduction > 0 ? production / r.eliteProduction : 0;
    const optionality = DEPTH.AGE_FLOOR + (1 - DEPTH.AGE_FLOOR) * ageRunway(p.position, p.age, reference);
    const depth = unranked
      ? 0
      : DEPTH.WEIGHT * r.medianStarterSurplus * Math.min(1, Math.max(0, proximity)) * optionality;

    const total = surplus + depth;
    const source: ValueSource =
      total <= 0 ? 'NONE' : surplus > 0 && depth > 0 ? 'BOTH' : surplus > 0 ? 'ABOVE_REPLACEMENT' : 'DEPTH';
    return {
      playerId: p.playerId,
      position: p.position,
      positionRank: p.positionRank,
      production: round4(production),
      replacementProduction: round4(r.replacementProduction),
      surplus: round4(surplus),
      depth: round4(depth),
      total: round4(total),
      value: 0,
      source,
    };
  });

  const max = scored.reduce((m, p) => Math.max(m, p.total), 0);
  const players_ = scored.map((p) => ({
    ...p,
    // A board on which nobody has any utility has no scale to express; every value is 0, which
    // is the honest reading rather than a division by zero.
    value: max > 0 ? round4((100 * p.total) / max) : 0,
  }));

  return {
    schemaId: schema.id,
    schemaVersion: schema.version,
    curveVersion: reference.curveVersion,
    scoringId: reference.scoringId,
    replacement,
    players: players_,
  };
}

/**
 * Rank a scored board overall, best first.
 *
 * Ordering is total utility, then raw production, then player id. The production tiebreak
 * matters at the bottom, where the measured curve has flattened to its floor and many ranks
 * carry the same value: it keeps the tail ordered by something real rather than by canonical id.
 */
export function rankUtilityBoard(board: UtilityBoard): UtilityResult[] {
  return [...board.players].sort(
    (a, b) => b.total - a.total || b.production - a.production || a.playerId.localeCompare(b.playerId),
  );
}

/** The positions this layer values, re-exported so consumers need not reach into the schema. */
export { UTILITY_POSITIONS };
export type { UtilityPosition };
