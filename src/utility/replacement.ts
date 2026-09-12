// Positional demand and replacement level, derived from the league schema.
//
// REPLACEMENT IS A LEAGUE PROPERTY. It is not a property of a player, a position, or a model:
// it is the answer to "if I did not have this player, who would be starting instead?" — and
// that depends entirely on how many of each position the league starts. Nothing here is tuned,
// and no position receives a bonus; every number below falls out of the schema's slot counts.

import {
  UTILITY_POSITIONS,
  type LeagueSchema,
  type UtilityPosition,
  validateSchema,
} from './leagueSchema';

export interface PositionDemand {
  readonly position: UtilityPosition;
  /** Players the league starts at this position every week, across all teams. */
  readonly demand: number;
  /** Players who hold a real NFL role at this position (the supply side). */
  readonly supply: number;
  /**
   * The rank of the first player NOT startable in this league — the replacement player.
   *
   * Rounded to a whole player, because the replacement is a person, not an average.
   */
  readonly replacementRank: number;
  /**
   * Replacement standing on the position's own supply-normalized 0–1 scale.
   *
   * This is the number every player at the position is measured against, and the single place
   * the league format enters the valuation. A deeper replacement rank means a WORSE player is
   * replacing yours, which means everyone above them is worth more.
   */
  readonly replacementStanding: number;
  /** Demand ÷ supply. Reported for diagnosis; nothing multiplies by it. */
  readonly tightness: number;
}

/**
 * A player's standing within their position, on a supply-normalized 0–1 scale.
 *
 * Rank 1 stands at 1; the last player holding an NFL role stands at 0; anyone beyond the
 * position's supply is clamped to 0, so a fifth-string quarterback cannot carry negative value
 * into the board.
 *
 * RANK, NOT COMPOSITE. The position engines' composites are anchored inside their own position
 * and their specs forbid publishing them as cross-position values; their ranges do not even
 * agree in width. Rank is the part of an engine's output that survives leaving it.
 */
export function standing(rank: number, supply: number): number {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  if (!Number.isFinite(supply) || supply <= 1) return rank <= 1 ? 1 : 0;
  const s = 1 - (rank - 1) / (supply - 1);
  return Math.min(1, Math.max(0, s));
}

/** Total weekly demand for one position: dedicated slots plus its share of each flex slot. */
function demandFor(schema: LeagueSchema, position: UtilityPosition): number {
  let perTeam = schema.dedicated[position];
  for (const slot of schema.flexSlots) {
    perTeam += slot.count * (slot.allocation[position] ?? 0);
  }
  return perTeam * schema.teams;
}

/**
 * Demand, supply and replacement for every position under one schema.
 *
 * Deterministic and pure: the same schema always yields the same table, which is what lets a
 * board's values be replayed and compared over time.
 */
export function replacementTable(
  schema: LeagueSchema,
): Readonly<Record<UtilityPosition, PositionDemand>> {
  validateSchema(schema);
  const out = {} as Record<UtilityPosition, PositionDemand>;
  for (const position of UTILITY_POSITIONS) {
    const demand = demandFor(schema, position);
    const supply = schema.nflStartersPerTeam[position] * schema.nflTeams;
    // At least one player, and never past the end of the supply: a league that started more
    // quarterbacks than the NFL employs would have a replacement worse than the worst player,
    // which the scale cannot express and which no real format produces.
    const replacementRank = Math.min(Math.max(1, Math.round(demand)), Math.round(supply));
    out[position] = {
      position,
      demand,
      supply,
      replacementRank,
      replacementStanding: standing(replacementRank, supply),
      tightness: supply > 0 ? demand / supply : 0,
    };
  }
  return out;
}
