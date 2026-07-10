// Empirical percentile rank (§26.4, Decision 1). Mid-rank estimator with
// average-rank tie handling:
//
//   pct(x) = 100 × ( #{v < x} + 0.5·#{v == x} ) / N   clamped to [0,100]
//
// Values below the minimum return 0; above the maximum return 100; exact ties
// receive their average rank. The same convention is used for every signal.

import { clamp, median } from '@/wr-model/math';
import { MISSING_REFERENCE_PENALTY, NEUTRAL_PERCENTILE } from '@/wr-model/constants';
import type { ReferenceKey, WRReferenceDistributions } from '@/wr-model/types';

export function percentileRank(value: number, reference: number[]): number {
  const n = reference.length;
  if (n === 0) return NEUTRAL_PERCENTILE;
  let below = 0;
  let equal = 0;
  for (const v of reference) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return clamp((100 * (below + 0.5 * equal)) / n, 0, 100);
}

export interface PercentileContext {
  reference: WRReferenceDistributions;
  /** Records a §26.4 five-point penalty when a distribution is missing. */
  onMissingReference: (key: ReferenceKey) => void;
}

/**
 * `pct(x, key)` against the named reference distribution. If the distribution
 * is absent, returns the neutral 50 and records the §26.4 confidence penalty
 * exactly once via the context callback.
 */
export function pct(value: number, key: ReferenceKey, ctx: PercentileContext): number {
  const dist = ctx.reference[key];
  if (!Array.isArray(dist) || dist.length === 0) {
    ctx.onMissingReference(key);
    return NEUTRAL_PERCENTILE;
  }
  return percentileRank(value, dist);
}

export function referenceMedian(key: ReferenceKey, reference: WRReferenceDistributions): number {
  const dist = reference[key];
  return Array.isArray(dist) ? median(dist) : NaN;
}

export const MISSING_REFERENCE_CONFIDENCE_PENALTY = MISSING_REFERENCE_PENALTY;
