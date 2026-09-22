// Joining the board to the external market, for display.
//
// ONE PLAYERTICKER RANK. The model side of this comparison is the board's OWN ordering — the
// same `overallRank` the reader sees in the board's first column, computed once by the
// publication adapter over the shared cross-position `dynastyValue`.
//
// IT USED TO BE A SECOND ORDERING, and that was the defect. This file re-ranked the board on
// `composites.dynasty`: the position engine's INTERNAL dynasty composite, anchored inside its
// own position's distribution. Four positions on four scales, sorted together. So "vs Mkt" was
// not the market's disagreement with PlayerTicker — it was partly the market's disagreement
// with a ranking PlayerTicker does not publish and the reader cannot see. Brock Bowers is the
// clean example: a tight end's internal composite sits high on the TE scale, which lifted him
// in this ordering while the canonical board, ranking on cross-position value over
// replacement, placed him elsewhere. The Edge column reported the gap between our two rankings
// as though it were the market's view.
//
// THE HORIZON TRAP is still avoided, by construction rather than by a second ranking. The old
// comment here warned that `/board` ranks on the selected horizon (weekly by default) and that
// diffing a weekly rank against a dynasty quote would report a disagreement neither side
// holds. That is no longer how the board ranks: `overallRank` is ordered on `dynastyValue`,
// the multi-year value over positional replacement, whatever horizon the VALUE COLUMN is
// showing. Reusing it is therefore dynasty-vs-dynasty AND identical to what the reader sees.
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
 * The model side of the comparison: the board's published ranking, unchanged.
 *
 * This function deliberately computes NO ordering. The publication adapter ranks the board
 * once, on the shared cross-position `dynastyValue`, and that ordering is the only PlayerTicker
 * rank that exists. Re-deriving it here — from the same field or any other — would reintroduce
 * the possibility of two rankings that disagree, which is the exact defect this replaced.
 *
 * `value` carries `dynastyValue`, the quantity the ranking is over, so a consumer reading the
 * model's value and its rank sees one number and its own ordering rather than two unrelated
 * ones. A legacy composite board is deliberately not presented as canonical dynasty Market
 * Edge: its model-side value and ranks remain absent here.
 *
 * A player the board ranked `null` (no published value) stays `null` here: "unvalued" and
 * "worst" are different claims, and only one of them is true.
 */
export function buildDynastyModelSide(players: readonly PublishedPlayer[]): ModelSide[] {
  return players.map((p) => ({
    canonicalPlayerId: p.playerId,
    position: p.position,
    value: p.dynastyContract === 'legacy' ? null : p.dynastyValue,
    overallRank: p.dynastyContract === 'legacy' ? null : p.overallRank,
    positionRank: p.dynastyContract === 'legacy' ? null : p.positionRank,
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
