// §26.16.2 percentile tests.
import { describe, expect, it } from 'vitest';
import { percentileRank, pct, referenceMedian, type PercentileContext } from '@/rb-model/percentiles';
import { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/rb-model/referenceDistributions';
import type { RBReferenceDistributions, ReferenceKey } from '@/rb-model/types';

function ctxWith(reference: RBReferenceDistributions) {
  const missing: ReferenceKey[] = [];
  const ctx: PercentileContext = { reference, onMissingReference: (k) => missing.push(k) };
  return { ctx, missing };
}

describe('§26.16.2 percentile estimator', () => {
  it('1. an exact tie uses mid-rank', () => {
    // [1,2,2,3]: pct(2) = 100×(1 + 0.5×2)/4 = 50
    expect(percentileRank(2, [1, 2, 2, 3])).toBe(50);
  });

  it('2. unsorted arrays match sorted arrays', () => {
    const sorted = [1, 2, 3, 4, 5];
    const unsorted = [5, 1, 4, 2, 3];
    for (const x of [0.5, 1, 2.5, 3, 6]) {
      expect(percentileRank(x, unsorted)).toBe(percentileRank(x, sorted));
    }
  });

  it('3. below-minimum resolves to 0', () => {
    expect(percentileRank(-5, [1, 2, 3])).toBe(0);
  });

  it('4. above-maximum resolves to 100', () => {
    expect(percentileRank(99, [1, 2, 3])).toBe(100);
  });

  it('does not interpolate between adjacent points', () => {
    // 2.5 sits between 2 and 3 but the count-based estimator gives a step value.
    expect(percentileRank(2.5, [1, 2, 3, 4])).toBe(50);
  });

  it('5. a missing distribution → percentile 50 and records one penalty key', () => {
    const ref = { ...DEFAULT_REFERENCE_DISTRIBUTIONS, snap_share: [] } as RBReferenceDistributions;
    const { ctx, missing } = ctxWith(ref);
    expect(pct(0.5, 'snap_share', ctx)).toBe(50);
    expect(missing).toEqual(['snap_share']);
  });

  it('an all-non-finite distribution behaves as missing (neutral 50 + one penalty key)', () => {
    // "contains no finite values" → §26.4 neutral path. Arrays that MIX finite
    // and non-finite members never reach pct through the engine — configuration
    // validation rejects them (see validation.test.ts).
    const { ctx, missing } = ctxWith({ ...DEFAULT_REFERENCE_DISTRIBUTIONS, snap_share: [NaN, NaN] });
    expect(pct(0.3, 'snap_share', ctx)).toBe(50);
    expect(missing).toEqual(['snap_share']);
  });

  it('referenceMedian returns NaN for an empty/missing distribution', () => {
    expect(Number.isNaN(referenceMedian('snap_share', { ...DEFAULT_REFERENCE_DISTRIBUTIONS, snap_share: [] }))).toBe(true);
  });
});
