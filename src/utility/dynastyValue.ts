// The shared cross-position dynasty value.
//
// WHAT THIS LAYER IS FOR
// Every position spec says the same thing in its own words: the horizon composites are internal
// diagnostics, anchored inside their own position, and must not be published as universal
// values until a shared utility layer exists. This is that layer. It takes what an engine
// legitimately exports — where a player stands among others at his position — and answers the
// only question that is comparable across positions:
//
//   How much better is this player than the one you would have to start instead?
//
// WHAT IT DELIBERATELY DOES NOT DO
// It never reads a composite's magnitude. A tight end scoring 92 on the TE scale and a
// quarterback scoring 56 on the QB scale are not 36 apart; they are two numbers from two
// distributions that were never put on a common footing. Rank is the part that survives
// leaving the engine, so rank is all this layer consumes. It also applies no positional
// multiplier and no bonus: the quarterback premium below is produced entirely by the schema's
// superflex slot moving the replacement quarterback 12 places deeper.

import { replacementTable, standing, type PositionDemand } from './replacement';
import { UTILITY_POSITIONS, type LeagueSchema, type UtilityPosition } from './leagueSchema';

/** One player's input: identity, position, and where the position engine placed them. */
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
}

export interface UtilityResult {
  readonly playerId: string;
  readonly position: UtilityPosition;
  readonly positionRank: number | null;
  /** Supply-normalized standing within the position, 0–1. */
  readonly standing: number;
  /** The standing this player is measured against — the league's replacement at his position. */
  readonly replacementStanding: number;
  /**
   * Marginal dynasty utility above positional replacement, 0–1 on a common footing.
   *
   * Zero for anyone at or below replacement, whatever their internal composite says. This is
   * the quantity that is comparable across positions; everything else on this object exists to
   * explain it.
   */
  readonly surplus: number;
  /**
   * Surplus rescaled so the board's most valuable asset sits at 100.
   *
   * Normalization happens AFTER utility, purely so the number is readable. It is PlayerTicker's
   * own scale and is deliberately not mapped onto any market's — a market value is somebody
   * else's opinion in somebody else's units.
   */
  readonly value: number;
}

export interface UtilityBoard {
  readonly schemaId: string;
  readonly schemaVersion: number;
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
 * BOARD-LEVEL BY NATURE. Utility cannot be computed one player at a time: the normalization
 * needs the board's maximum, and a player's position rank only means something against the
 * whole position. Passing a partial board yields values that are correct relative to each
 * other but not comparable to another run's.
 */
export function computeUtilityBoard(
  players: readonly UtilityInput[],
  schema: LeagueSchema,
): UtilityBoard {
  const replacement = replacementTable(schema);

  const scored = players.map((p) => {
    const r = replacement[p.position];
    const s = p.positionRank === null ? 0 : standing(p.positionRank, r.supply);
    // A player at or below replacement has nothing to offer over the alternative, so their
    // surplus is zero rather than a small positive number — "replacement level" is a floor,
    // not a discount.
    const surplus = Math.max(0, s - r.replacementStanding);
    return {
      playerId: p.playerId,
      position: p.position,
      positionRank: p.positionRank,
      standing: round4(s),
      replacementStanding: round4(r.replacementStanding),
      surplus: round4(surplus),
      value: 0,
    };
  });

  const max = scored.reduce((m, p) => Math.max(m, p.surplus), 0);
  const players_ = scored.map((p) => ({
    ...p,
    // A board on which nobody clears replacement has no scale to express; every value is 0,
    // which is the honest reading rather than a division by zero.
    value: max > 0 ? round4((100 * p.surplus) / max) : 0,
  }));

  return {
    schemaId: schema.id,
    schemaVersion: schema.version,
    replacement,
    players: players_,
  };
}

/**
 * Rank a scored board overall, best first.
 *
 * ORDERING BELOW REPLACEMENT. Most of a board sits at exactly zero surplus — on the live
 * 868-player board, 86% of it — because everyone at or past their position's replacement adds
 * nothing over the player you could start instead. That is the correct VALUE, and it is not a
 * defect. But it is not an ordering: left to break on player id, five sixths of the board would
 * be sorted alphabetically by hash, which is noise presented as a ranking.
 *
 * So ties fall back to within-position standing. A replacement-level player is still worth
 * zero — the published value says so — while the board can still say that the best of them is
 * closer to useful than the worst. Player id remains the final tiebreak, so the order is total
 * and replay-stable.
 */
export function rankUtilityBoard(board: UtilityBoard): UtilityResult[] {
  return [...board.players].sort(
    (a, b) =>
      b.surplus - a.surplus ||
      b.standing - a.standing ||
      a.playerId.localeCompare(b.playerId),
  );
}

/** The positions this layer values, re-exported so consumers need not reach into the schema. */
export { UTILITY_POSITIONS };
export type { UtilityPosition };
