// The board's cross-position dynasty value, projected onto published entries.
//
// WHY IT IS COMPUTED HERE. Utility is a statement about the whole board — a player's standing
// is against his position, and the published scale is against the league's best asset — so it
// cannot be carried on a per-player artifact any more than positional rank can. It is assigned
// over the projected board, from values that were already published, and re-runs no valuation.
//
// THE RAW COMPOSITES STAY INTERNAL. `composites` continues to travel on each entry for
// diagnosis and for the position views, but it is no longer what the board ranks on. Sorting
// four positions' internal composites together was never valid — every position spec says so
// in its own words — and this is what replaces it.

import {
  DYNASTY_SUPERFLEX_12,
  computeUtilityBoard,
  UTILITY_POSITIONS,
  type LeagueSchema,
  type UtilityInput,
  type UtilityPosition,
} from '@/utility';
import type { PublishedPlayerProjection } from './publicationProjection';

/** What the board publishes about one player's cross-position value. */
export interface UtilityProjection {
  /** PlayerTicker's cross-position dynasty value, 0–100 on its own scale. */
  readonly dynastyValue: number | null;
  /** Production above positional replacement, in fantasy points per team game. */
  readonly dynastySurplus: number | null;
  /** The bounded below-replacement optionality term, in the same units. */
  readonly dynastyDepth: number | null;
  /** Which term the published value came from: ABOVE_REPLACEMENT, DEPTH, BOTH or NONE. */
  readonly dynastyValueSource: string | null;
  /** Rank within the player's position on the dynasty horizon. */
  readonly dynastyPositionRank: number | null;
  /** Overall rank across all positions, by dynasty value. */
  readonly dynastyOverallRank: number | null;
  /** The league format the value was computed for — a value means nothing without it. */
  readonly leagueSchemaId: string;
  /** The production reference the value was measured against, so a value traces to its evidence. */
  readonly productionCurveVersion: string;
}

type Entry = PublishedPlayerProjection & { position: string; canonicalId: string; age?: number | null };

function isUtilityPosition(p: string): p is UtilityPosition {
  return (UTILITY_POSITIONS as readonly string[]).includes(p);
}

/**
 * Rank each position on its published DYNASTY composite.
 *
 * The composite's magnitude never leaves this function — only the order it implies. That is
 * the whole discipline of the layer: an engine's composite is authoritative about who is better
 * than whom at that position, and says nothing comparable about anyone at another.
 */
function dynastyPositionRanks(entries: readonly Entry[]): Map<string, number> {
  const byPosition = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!isUtilityPosition(e.position)) continue;
    if (e.composites?.dynasty === null || e.composites?.dynasty === undefined) continue;
    const list = byPosition.get(e.position);
    if (list) list.push(e);
    else byPosition.set(e.position, [e]);
  }
  const ranks = new Map<string, number>();
  for (const list of byPosition.values()) {
    // Ties break on canonical id so the ordering is total and replay-stable.
    const ordered = [...list].sort(
      (a, b) =>
        (b.composites?.dynasty ?? 0) - (a.composites?.dynasty ?? 0) ||
        a.canonicalId.localeCompare(b.canonicalId),
    );
    ordered.forEach((e, i) => ranks.set(e.canonicalId, i + 1));
  }
  return ranks;
}

/**
 * Attach the shared dynasty value to every entry on a board.
 *
 * A player the engines published no dynasty composite for keeps `null` throughout rather than
 * a zero: unvalued and worth-nothing are different claims, and only one of them is being made.
 */
export function withDynastyUtility<T extends Entry>(
  entries: readonly T[],
  schema: LeagueSchema = DYNASTY_SUPERFLEX_12,
): (T & UtilityProjection)[] {
  const positionRanks = dynastyPositionRanks(entries);

  const inputs: UtilityInput[] = entries
    .filter((e): e is T & { position: UtilityPosition } => isUtilityPosition(e.position))
    .map((e) => ({
      playerId: e.canonicalId,
      position: e.position,
      positionRank: positionRanks.get(e.canonicalId) ?? null,
      age: typeof e.age === 'number' && Number.isFinite(e.age) ? e.age : null,
    }));

  const board = computeUtilityBoard(inputs, schema);
  const byId = new Map(board.players.map((p) => [p.playerId, p]));

  // Overall rank is assigned over the players who actually carry a value, so an unvalued
  // player does not occupy a rank that suggests the board placed him somewhere.
  // Same ordering rule as `rankUtilityBoard`.
  const ordered = [...board.players]
    .filter((p) => p.positionRank !== null)
    .sort(
      (a, b) => b.total - a.total || b.production - a.production || a.playerId.localeCompare(b.playerId),
    );
  const overall = new Map(ordered.map((p, i) => [p.playerId, i + 1]));

  return entries.map((e) => {
    const u = byId.get(e.canonicalId);
    const rank = positionRanks.get(e.canonicalId) ?? null;
    return {
      ...e,
      dynastyValue: u && rank !== null ? u.value : null,
      dynastySurplus: u && rank !== null ? u.surplus : null,
      dynastyDepth: u && rank !== null ? u.depth : null,
      dynastyValueSource: u && rank !== null ? u.source : null,
      dynastyPositionRank: rank,
      dynastyOverallRank: overall.get(e.canonicalId) ?? null,
      leagueSchemaId: board.schemaId,
      productionCurveVersion: board.curveVersion,
    };
  });
}
