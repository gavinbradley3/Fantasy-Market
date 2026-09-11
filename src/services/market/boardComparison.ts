// Joining the board to the external market, for display.
//
// THE HORIZON TRAP, and why this file does not simply reuse the board's own ranks.
// `/board` ranks on its selected horizon, which defaults to WEEKLY. DynastyProcess quotes
// DYNASTY value. Diffing a weekly rank against a dynasty rank would produce a number for every
// player and mean nothing for any of them — a rookie running back is a different proposition
// over one week than over five years, and the disagreement it would report is an artefact of
// the mismatch, not a view either side holds.
//
// So the model side of the comparison is built from each player's DYNASTY composite
// specifically, ranked among the players who have one, regardless of which horizon the board
// is currently displaying. The comparison is therefore dynasty-vs-dynasty whatever the reader
// has the board sorted by, and the column labels say so.
//
// The join itself lives in `@/market/comparison` and is tested there; this file is the
// projection onto its `ModelSide` input. Keeping the projection out of the comparison means
// the comparison never learns what a `PublishedPlayer` is.
//
// Computed over the WHOLE board, never the filtered rows: percentile denominators come from
// how many players each side ranks, and recomputing them per filter would make a player's
// standing move when the reader typed in the search box.

import { compareModelToMarket, type ModelSide } from '@/market/comparison';
import type { ModelMarketComparison } from '@/market/types';
import type { PublishedPlayer } from '@/services/publication';
import type { ExternalMarket } from './types';

/** The model horizon the market comparison is made on. Fixed, and named in the UI. */
export const COMPARISON_HORIZON = 'dynasty' as const;

/**
 * Rank the board on its DYNASTY composite.
 *
 * A player the engine published no dynasty value for is ranked `null` rather than last:
 * "unvalued" and "worst" are different claims, and only one of them is true.
 */
export function buildDynastyModelSide(players: readonly PublishedPlayer[]): ModelSide[] {
  const valued = players
    .filter((p) => p.composites?.dynasty != null)
    .sort(
      (a, b) =>
        (b.composites?.dynasty ?? 0) - (a.composites?.dynasty ?? 0) ||
        a.playerId.localeCompare(b.playerId),
    );

  const overallRank = new Map<string, number>();
  valued.forEach((p, i) => overallRank.set(p.playerId, i + 1));

  const positionRank = new Map<string, number>();
  const perPosition = new Map<string, number>();
  for (const p of valued) {
    const next = (perPosition.get(p.position) ?? 0) + 1;
    perPosition.set(p.position, next);
    positionRank.set(p.playerId, next);
  }

  return players.map((p) => ({
    canonicalPlayerId: p.playerId,
    position: p.position,
    value: p.composites?.dynasty ?? null,
    overallRank: overallRank.get(p.playerId) ?? null,
    positionRank: positionRank.get(p.playerId) ?? null,
    modelVersion: p.modelVersion,
    updatedAt: p.asOf,
  }));
}

/**
 * Build the per-player comparison index the board renders from.
 *
 * Returns an empty map when there is no market, so every call site has exactly one shape to
 * handle: "no comparison for this player" — which is also what an uncovered player produces.
 */
export function buildBoardComparisons(
  players: readonly PublishedPlayer[],
  market: ExternalMarket | undefined,
): ReadonlyMap<string, ModelMarketComparison> {
  if (!market) return new Map();
  const rows = compareModelToMarket(
    buildDynastyModelSide(players),
    [...market.quotesByPlayerId.values()],
    { format: market.format, marketSource: market.source },
  );
  return new Map(rows.map((r) => [r.canonicalPlayerId, r]));
}

/** How many board players the market actually covers — the honest coverage statement. */
export function countCovered(comparisons: ReadonlyMap<string, ModelMarketComparison>): number {
  let covered = 0;
  for (const c of comparisons.values()) if (c.marketRank !== null) covered++;
  return covered;
}
