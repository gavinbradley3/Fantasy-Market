// Ranking-change guard (pure).
//
// A refresh that changes the board a lot may be right (a new season of evidence, a corrected
// input) or catastrophically wrong (a dropped column, a mis-joined identity). The code cannot
// tell those apart, so a large change is never approved automatically: it is measured, its
// biggest movements are listed, and it is held for an owner's review.
//
// Everything is computed over players present on BOTH boards, by canonical id, using each
// board's own published overall rank. A player new to (or gone from) the candidate is counted
// separately and is never treated as a rank of zero or of last place.

export interface RankedEntry {
  readonly canonicalId: string;
  readonly name: string | null;
  readonly position: string;
  readonly overallRank: number | null;
}

export interface RankingChangeThresholds {
  /** Minimum Spearman correlation between the two boards' overall ranks (common players). */
  readonly minSpearman: number;
  /** Minimum share of the reference top-N still in the candidate top-N. */
  readonly minTopOverlap: number;
  /** The N in top-N. */
  readonly topN: number;
  /** A reference top-N player moving more than this many places counts as a large move. */
  readonly largeMovePlaces: number;
  /** Maximum number of large moves among the reference top-N. */
  readonly maxLargeMoves: number;
}

/**
 * Default thresholds. Chosen so that ordinary week-to-week refreshes (a few players moving a
 * handful of places) pass, while a board that reorders the top of the market fails. They are a
 * review trigger, not a statistical test.
 */
export const DEFAULT_RANKING_CHANGE_THRESHOLDS: RankingChangeThresholds = {
  minSpearman: 0.9,
  minTopOverlap: 0.8,
  topN: 100,
  largeMovePlaces: 40,
  maxLargeMoves: 5,
};

export interface RankMove {
  readonly canonicalId: string;
  readonly name: string | null;
  readonly position: string;
  readonly referenceRank: number;
  readonly candidateRank: number | null;
  /** Positive = moved UP the board (a smaller rank number). Null when unranked in the candidate. */
  readonly placesUp: number | null;
}

export interface RankingChangeReport {
  readonly verdict: 'PASS' | 'REVIEW_REQUIRED';
  readonly reasons: readonly string[];
  readonly thresholds: RankingChangeThresholds;
  readonly metrics: {
    readonly referenceRanked: number;
    readonly candidateRanked: number;
    readonly commonRanked: number;
    readonly spearman: number | null;
    readonly topOverlap: number | null;
    readonly largeMovesInReferenceTop: number;
    readonly referenceTopUnrankedInCandidate: number;
    readonly newlyRanked: number;
    readonly droppedFromRanking: number;
  };
  /** The largest movements among the reference top-N, biggest first. */
  readonly largestMoves: readonly RankMove[];
  /** Candidate top-N players who were not ranked on the reference board at all. */
  readonly newInCandidateTop: readonly { canonicalId: string; name: string | null; position: string; candidateRank: number }[];
}

function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k].i] = avg;
    i = j + 1;
  }
  return out;
}

export function spearman(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ra = ranks(a);
  const rb = ranks(b);
  const n = ra.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let k = 0; k < n; k++) {
    num += (ra[k] - ma) * (rb[k] - mb);
    da += (ra[k] - ma) ** 2;
    db += (rb[k] - mb) ** 2;
  }
  return da === 0 || db === 0 ? null : num / Math.sqrt(da * db);
}

export function compareRankings(
  reference: readonly RankedEntry[],
  candidate: readonly RankedEntry[],
  thresholds: RankingChangeThresholds = DEFAULT_RANKING_CHANGE_THRESHOLDS,
): RankingChangeReport {
  const refRanked = new Map(reference.filter((e) => e.overallRank !== null).map((e) => [e.canonicalId, e]));
  const candRanked = new Map(candidate.filter((e) => e.overallRank !== null).map((e) => [e.canonicalId, e]));
  const common = [...refRanked.keys()].filter((id) => candRanked.has(id)).sort();

  const rho = spearman(
    common.map((id) => refRanked.get(id)!.overallRank!),
    common.map((id) => candRanked.get(id)!.overallRank!),
  );

  const refTop = [...refRanked.values()].filter((e) => e.overallRank! <= thresholds.topN);
  const candTopIds = new Set([...candRanked.values()].filter((e) => e.overallRank! <= thresholds.topN).map((e) => e.canonicalId));
  const topOverlap = refTop.length > 0 ? refTop.filter((e) => candTopIds.has(e.canonicalId)).length / refTop.length : null;

  const moves: RankMove[] = refTop.map((e) => {
    const c = candRanked.get(e.canonicalId);
    return {
      canonicalId: e.canonicalId,
      name: e.name,
      position: e.position,
      referenceRank: e.overallRank!,
      candidateRank: c ? c.overallRank! : null,
      placesUp: c ? e.overallRank! - c.overallRank! : null,
    };
  });
  const magnitude = (m: RankMove) => (m.placesUp === null ? Number.POSITIVE_INFINITY : Math.abs(m.placesUp));
  const largeMoves = moves.filter((m) => magnitude(m) > thresholds.largeMovePlaces);
  const largestMoves = [...moves].sort((a, b) => magnitude(b) - magnitude(a) || a.referenceRank - b.referenceRank).slice(0, 25);

  const newInCandidateTop = [...candRanked.values()]
    .filter((e) => e.overallRank! <= thresholds.topN && !refRanked.has(e.canonicalId))
    .sort((a, b) => a.overallRank! - b.overallRank!)
    .map((e) => ({ canonicalId: e.canonicalId, name: e.name, position: e.position, candidateRank: e.overallRank! }));

  const reasons: string[] = [];
  if (rho === null || rho < thresholds.minSpearman) {
    reasons.push(`rank correlation ${rho === null ? 'undefined' : rho.toFixed(3)} is below ${thresholds.minSpearman}`);
  }
  if (topOverlap === null || topOverlap < thresholds.minTopOverlap) {
    reasons.push(
      `only ${topOverlap === null ? 'undefined' : (topOverlap * 100).toFixed(1) + '%'} of the previous top ${thresholds.topN} remain in the top ${thresholds.topN} (minimum ${(thresholds.minTopOverlap * 100).toFixed(0)}%)`,
    );
  }
  if (largeMoves.length > thresholds.maxLargeMoves) {
    reasons.push(
      `${largeMoves.length} of the previous top ${thresholds.topN} moved more than ${thresholds.largeMovePlaces} places or became unranked (maximum ${thresholds.maxLargeMoves})`,
    );
  }

  return {
    verdict: reasons.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
    reasons,
    thresholds,
    metrics: {
      referenceRanked: refRanked.size,
      candidateRanked: candRanked.size,
      commonRanked: common.length,
      spearman: rho,
      topOverlap,
      largeMovesInReferenceTop: largeMoves.length,
      referenceTopUnrankedInCandidate: moves.filter((m) => m.candidateRank === null).length,
      newlyRanked: [...candRanked.keys()].filter((id) => !refRanked.has(id)).length,
      droppedFromRanking: [...refRanked.keys()].filter((id) => !candRanked.has(id)).length,
    },
    largestMoves,
    newInCandidateTop,
  };
}
