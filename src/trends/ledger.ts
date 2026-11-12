// Ledger 2 arithmetic: exact attribution of a projection change to the inputs that moved.
//
// Challenger F projects a season as  G x share x rate.  Between two dates the fitted lines and
// the age term are unchanged within a season, so a change in the projection comes only from
// its two inputs. The split below is the symmetric (Shapley) split of a product: it always sums
// to the total change, and it does not depend on which factor is taken first.

export interface ProductSplit {
  readonly total: number;
  readonly fromShare: number;
  readonly fromRate: number;
}

/** Split Δ(G·s·r) between the share factor and the rate factor; the parts sum to the total. */
export function splitProduct(G: number, s0: number, r0: number, s1: number, r1: number): ProductSplit {
  return {
    total: G * (s1 * r1 - s0 * r0),
    fromShare: G * (s1 - s0) * (r0 + r1) / 2,
    fromRate: G * (r1 - r0) * (s0 + s1) / 2,
  };
}

/** Sum of season splits (the two-season projection is the sum of two products). */
export function addSplits(a: ProductSplit, b: ProductSplit): ProductSplit {
  return { total: a.total + b.total, fromShare: a.fromShare + b.fromShare, fromRate: a.fromRate + b.fromRate };
}

export interface ValueSplit {
  readonly total: number;
  /** Change from the player's own projection, holding replacement at its earlier level. */
  readonly fromOwnProjection: number;
  /** Change from other players' projections moving the replacement level. */
  readonly fromReplacement: number;
}

/** Two-season value above replacement, per season: Σ max(0, season − replacement). */
export function valueOf(seasons: readonly [number, number], replacement: readonly [number, number]): number {
  return Math.max(0, seasons[0] - replacement[0]) + Math.max(0, seasons[1] - replacement[1]);
}

/** Sequential substitution in a fixed order (own projection first). Exact by construction. */
export function splitValue(
  p0: readonly [number, number], rep0: readonly [number, number],
  p1: readonly [number, number], rep1: readonly [number, number],
): ValueSplit {
  const v00 = valueOf(p0, rep0);
  const v10 = valueOf(p1, rep0);
  const v11 = valueOf(p1, rep1);
  return { total: v11 - v00, fromOwnProjection: v10 - v00, fromReplacement: v11 - v10 };
}
