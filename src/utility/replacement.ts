// Positional demand and replacement level, derived from the league schema and the measured
// production curve.
//
// REPLACEMENT IS A LEAGUE PROPERTY. It is not a property of a player, a position, or a model:
// it is the answer to "if I did not have this player, who would be starting instead?" — and
// that depends entirely on how many of each position the league starts. Nothing here is tuned,
// and no position receives a bonus; the rank falls out of the schema's slot counts and the
// points that rank is worth fall out of nine seasons of box scores.

import {
  UTILITY_POSITIONS,
  type LeagueSchema,
  type UtilityPosition,
  validateSchema,
} from './leagueSchema';
import {
  assertScoringMatches,
  curveDepth,
  effectiveSupply,
  productionAtRank,
  PRODUCTION_CURVE,
  type GeneratedProductionReference,
} from './productionCurve';

export interface PositionDemand {
  readonly position: UtilityPosition;
  /** Players the league starts at this position every week, across all teams. */
  readonly demand: number;
  /**
   * The rank of the first player NOT startable in this league — the replacement player.
   *
   * Rounded to a whole player, because the replacement is a person, not an average.
   */
  readonly replacementRank: number;
  /** What that replacement produces, in fantasy points per team game. */
  readonly replacementProduction: number;
  /** What the best player at the position produces — the top of the curve. */
  readonly eliteProduction: number;
  /**
   * The most surplus anyone at this position can hold: elite minus replacement.
   *
   * This is the position's value ceiling, and it is now a measured quantity rather than a
   * consequence of an assumed player-pool size. In version 1 it was set by a hand-declared
   * count of NFL starters per team; four numbers nobody could support decided the whole top of
   * the board. Here it is the distance between two points on a curve built from games.
   */
  readonly ceiling: number;
  /** Median surplus across the position's startable ranks — the scale a depth term is read at. */
  readonly medianStarterSurplus: number;
  /** How deep the measured curve runs for this position. */
  readonly curveDepth: number;
}

/** Total weekly demand for one position: dedicated slots plus its share of each flex slot. */
function demandFor(schema: LeagueSchema, position: UtilityPosition): number {
  let perTeam = schema.dedicated[position];
  for (const slot of schema.flexSlots) {
    perTeam += slot.count * (slot.allocation[position] ?? 0);
  }
  return perTeam * schema.teams;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? (s[h] as number) : (((s[h - 1] as number) + (s[h] as number)) / 2);
}

/**
 * Demand, replacement and ceiling for every position under one schema.
 *
 * Deterministic and pure: the same schema and the same curve always yield the same table, which
 * is what lets a board's values be replayed and compared over time.
 */
export function replacementTable(
  schema: LeagueSchema,
  reference: GeneratedProductionReference = PRODUCTION_CURVE,
): Readonly<Record<UtilityPosition, PositionDemand>> {
  validateSchema(schema);
  assertScoringMatches(schema.scoringId, reference);
  const out = {} as Record<UtilityPosition, PositionDemand>;
  for (const position of UTILITY_POSITIONS) {
    const demand = demandFor(schema, position);
    const depth = curveDepth(position, reference);
    // At least one player, and never past the end of the measured curve: a league that started
    // more of a position than has ever produced anything would have a replacement the evidence
    // cannot describe.
    const replacementRank = Math.min(Math.max(1, Math.round(demand)), depth);
    const replacementProduction = productionAtRank(position, replacementRank, reference);
    const eliteProduction = productionAtRank(position, 1, reference);
    const starterSurpluses: number[] = [];
    for (let r = 1; r < replacementRank; r++) {
      starterSurpluses.push(productionAtRank(position, r, reference) - replacementProduction);
    }
    out[position] = {
      position,
      demand,
      replacementRank,
      replacementProduction,
      eliteProduction,
      ceiling: Math.max(0, eliteProduction - replacementProduction),
      medianStarterSurplus: median(starterSurpluses),
      curveDepth: depth,
    };
  }
  return out;
}

/**
 * Effective supply per position, DERIVED — reported for diagnosis, never multiplied by.
 *
 * The bar is one league-wide number: the lowest replacement production of any position under
 * this schema, so "supplied" means "produces at least as much as the weakest startable player
 * anywhere in this league". Applying the same bar to all four positions is what makes the
 * resulting counts comparable; a per-position threshold would simply be the old hand-declared
 * assumption wearing a different hat.
 */
export function derivedSupply(
  schema: LeagueSchema,
  reference: GeneratedProductionReference = PRODUCTION_CURVE,
): Readonly<Record<UtilityPosition, { readonly threshold: number; readonly players: number; readonly perTeam: number }>> {
  const table = replacementTable(schema, reference);
  const threshold = Math.min(...UTILITY_POSITIONS.map((p) => table[p].replacementProduction));
  const out = {} as Record<UtilityPosition, { threshold: number; players: number; perTeam: number }>;
  for (const position of UTILITY_POSITIONS) {
    const s = effectiveSupply(position, threshold, schema.nflTeams, reference);
    out[position] = { threshold, players: s.players, perTeam: s.perTeam };
  }
  return out;
}
