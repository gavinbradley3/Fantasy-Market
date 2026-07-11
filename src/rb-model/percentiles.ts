// Empirical percentile rank (§26.4). Mid-rank estimator with average-rank tie
// handling:
//
//   pct(x) = 100 × ( #{v < x} + 0.5·#{v == x} ) / N   clamped to [0,100]
//
// Values below the minimum return 0; above the maximum return 100; exact ties
// receive their average rank; no interpolation. The same convention is used for
// every RB signal.

import { clamp, isFiniteNumber, median } from '@/rb-model/math';
import { MISSING_REFERENCE_PENALTY, NEUTRAL_PERCENTILE } from '@/rb-model/constants';
import type { RBReferenceDistributions, ReferenceKey } from '@/rb-model/types';

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

/** A reference array is usable only if it exists and holds at least one finite value. */
function finiteMembers(dist: unknown): number[] | null {
  if (!Array.isArray(dist)) return null;
  const finite = dist.filter(isFiniteNumber);
  return finite.length > 0 ? finite : null;
}

export interface PercentileContext {
  reference: RBReferenceDistributions;
  /** Records a §26.4 five-point penalty when a distribution is missing/empty. */
  onMissingReference: (key: ReferenceKey) => void;
}

/**
 * `pct(x, key)` against the named reference distribution. If the distribution is
 * absent, empty, or contains no finite values, returns the neutral 50 and records
 * the §26.4 penalty exactly once via the context callback. Arrays containing
 * non-finite members never reach this point through the public engine — they are
 * rejected during configuration validation (§26.4 "do not silently drop them");
 * the finite filter here is defense-in-depth for direct unit-level calls only.
 */
export function pct(value: number, key: ReferenceKey, ctx: PercentileContext): number {
  const usable = finiteMembers(ctx.reference[key]);
  if (usable === null) {
    ctx.onMissingReference(key);
    return NEUTRAL_PERCENTILE;
  }
  return percentileRank(value, usable);
}

export function referenceMedian(key: ReferenceKey, reference: RBReferenceDistributions): number {
  const usable = finiteMembers(reference[key]);
  return usable === null ? NaN : median(usable);
}

export const MISSING_REFERENCE_CONFIDENCE_PENALTY = MISSING_REFERENCE_PENALTY;
