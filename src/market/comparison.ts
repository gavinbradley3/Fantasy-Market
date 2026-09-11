// Model vs market — the comparison, and the one place its honesty is enforced.
//
// THE TRAP THIS MODULE EXISTS TO AVOID
// PlayerTicker's dynasty composite for Josh Allen is ~55.3. DynastyProcess's Superflex value
// for the same player is ~10,256. Subtracting them, or dividing one by the other, produces a
// number instantly — and that number is meaningless. The two figures are not the same
// quantity measured differently; they are different quantities. One is a 0–100 model score,
// the other a trade-currency unit with its own distribution and no published conversion. Any
// multiplier that made them line up would be invented here, not derived from either source.
//
// WHAT IS COMPARED
// Order, which both sides genuinely express:
//   • rank difference     — "PlayerTicker has him 5th, the market has him 12th" (+7)
//   • percentile          — the same question when the two boards cover different player counts
// Raw values are carried through, each labelled with the side it came from, and never combined.
//
// SIGN CONVENTION, fixed once so no consumer has to guess:
//   rank difference   = modelRank - marketRank   → NEGATIVE means PlayerTicker is HIGHER
//                                                  (a smaller rank number is a better rank)
//   percentile diff   = modelPct  - marketPct    → POSITIVE means PlayerTicker is HIGHER
// The two read in opposite directions because ranks count up as they get worse and percentiles
// count up as they get better; each is stated in the units a reader expects.
//
// MISSING IS MISSING. ~175 of the board's players have no DynastyProcess value at all. Those
// comparisons come back with the market side null and `comparable: false` — never zero, never
// "ranked last", never a filled-in estimate.

import type { MarketFormat, MarketSnapshot, ModelMarketComparison } from './types';

/**
 * PlayerTicker's own side of the comparison, in the minimum shape needed to compare order.
 *
 * Deliberately structural: this module never imports a valuation engine or a publication DTO,
 * so a change to either cannot quietly change what the comparison means.
 */
export interface ModelSide {
  readonly canonicalPlayerId: string;
  /** Used only to keep position-rank comparisons within one position. */
  readonly position: string;
  /** The model's own value, on the MODEL's scale. Carried, never converted. */
  readonly value: number | null;
  readonly overallRank: number | null;
  readonly positionRank: number | null;
  readonly modelVersion: string | null;
  readonly updatedAt: string | null;
}

export interface CompareOptions {
  readonly format: MarketFormat;
  /** Attribution for the market side, e.g. 'dynastyprocess'. */
  readonly marketSource: string;
}

/**
 * Where a rank sits in its own distribution, 0–100, where 100 is the top.
 *
 * Percentile is what makes two boards of DIFFERENT SIZE comparable: rank 50 of 441 and rank
 * 50 of 616 are not the same standing. `total` is the count of RANKED entries on that side —
 * unranked players are not part of the distribution and must not inflate the denominator.
 *
 * Rounded to one decimal so the result is deterministic across platforms and stable in a
 * snapshot test; the underlying division is exact enough that the rounding never reorders.
 */
export function percentileOfRank(rank: number | null, total: number): number | null {
  if (rank === null || !Number.isFinite(rank) || rank < 1) return null;
  if (!Number.isFinite(total) || total < 1 || rank > total) return null;
  // A one-player board has no spread to express; the single player is at the top of it.
  if (total === 1) return 100;
  return Math.round(((total - rank) / (total - 1)) * 1000) / 10;
}

function diff(model: number | null, market: number | null): number | null {
  if (model === null || market === null) return null;
  return model - market;
}

/**
 * Join one model board to one market batch on the canonical player id.
 *
 * The join key is the SAME canonical id both sides already resolved through the pipeline's
 * IdentityResolver, so no name matching happens here — the whole point of resolving market
 * identity upstream is that this function never has to guess.
 *
 * Returns one row per MODEL player, in the order given. A model player the market does not
 * cover still gets a row, with an empty market side: the board must be able to show that a
 * player is uncovered, which it cannot do if uncovered players are dropped.
 */
export function compareModelToMarket(
  modelSide: readonly ModelSide[],
  marketSnapshots: readonly MarketSnapshot[],
  options: CompareOptions,
): ModelMarketComparison[] {
  const market = new Map<string, MarketSnapshot>();
  for (const snapshot of marketSnapshots) {
    if (snapshot.format !== options.format) continue;
    // First wins: `getLatestMarketSnapshots` already returns one row per player, so a repeat
    // would be a caller error rather than a newer quote.
    if (!market.has(snapshot.canonicalPlayerId)) market.set(snapshot.canonicalPlayerId, snapshot);
  }

  // Denominators are counted from RANKED entries on each side independently, because the two
  // sides cover different player sets and a shared denominator would misplace both.
  const modelRanked = modelSide.filter((m) => m.overallRank !== null).length;
  const marketRanked = [...market.values()].filter((m) => m.overallRank !== null).length;

  return modelSide.map((model) => {
    const quote = market.get(model.canonicalPlayerId) ?? null;

    const modelPercentile = percentileOfRank(model.overallRank, modelRanked);
    const marketPercentile = quote ? percentileOfRank(quote.overallRank, marketRanked) : null;

    return {
      canonicalPlayerId: model.canonicalPlayerId,
      format: options.format,

      marketValue: quote?.value ?? null,
      marketRank: quote?.overallRank ?? null,
      marketPositionRank: quote?.positionRank ?? null,
      marketSource: quote ? quote.source : null,
      marketUpdatedAt: quote?.sourceTimestamp ?? null,

      modelValue: model.value,
      modelRank: model.overallRank,
      modelPositionRank: model.positionRank,
      modelVersion: model.modelVersion,
      modelUpdatedAt: model.updatedAt,

      overallRankDifference: diff(model.overallRank, quote?.overallRank ?? null),
      positionRankDifference:
        // Only within the same position: comparing a QB's position rank to a WR's would be a
        // join defect, and the source position is retained precisely so it can be checked.
        quote && quote.sourcePosition?.toUpperCase() === model.position.toUpperCase()
          ? diff(model.positionRank, quote.positionRank)
          : null,
      modelPercentile,
      marketPercentile,
      percentileDifference: diff(modelPercentile, marketPercentile),
      // Both sides must have said something about this player. A player with a market quote
      // but no model value is as incomparable as one with neither.
      comparable: quote !== null && quote.overallRank !== null && model.overallRank !== null,
    };
  });
}
