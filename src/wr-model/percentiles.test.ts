import { describe, expect, it } from 'vitest';
import { percentileRank, pct, referenceMedian } from '@/wr-model/percentiles';
import { DEFAULT_REFERENCE_DISTRIBUTIONS as REF } from '@/wr-model/referenceDistributions';
import type { PercentileContext } from '@/wr-model/percentiles';

function ctx(): PercentileContext & { missing: string[] } {
  const missing: string[] = [];
  return { reference: REF, onMissingReference: (k) => missing.push(k), missing };
}

describe('percentileRank (mid-rank, average-rank ties — Decision 1)', () => {
  const sample = [10, 20, 20, 30, 40];

  it('returns 0 below the minimum and 100 above the maximum', () => {
    expect(percentileRank(5, sample)).toBe(0);
    expect(percentileRank(50, sample)).toBe(100);
  });

  it('handles ties with average rank', () => {
    // #below=1 (10), #equal=2 (20,20) → (1 + 0.5·2)/5 = 0.4 → 40
    expect(percentileRank(20, sample)).toBeCloseTo(40, 6);
  });

  it('is non-decreasing in the query value', () => {
    let prev = -1;
    for (const x of [0, 10, 15, 20, 25, 30, 40, 100]) {
      const p = percentileRank(x, sample);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('clamps to [0,100]', () => {
    expect(percentileRank(-999, sample)).toBe(0);
    expect(percentileRank(999, sample)).toBe(100);
  });
});

describe('pct against reference distributions', () => {
  it('scores a strong route participation high', () => {
    expect(pct(0.94, 'route_participation', ctx())).toBeCloseTo((100 * 17) / 19, 6);
  });

  it('records a missing-reference event and returns neutral 50', () => {
    const c = ctx();
    const broken: PercentileContext = {
      reference: { ...REF, route_participation: [] },
      onMissingReference: c.onMissingReference,
    };
    expect(pct(0.9, 'route_participation', broken)).toBe(50);
    expect(c.missing).toContain('route_participation');
  });
});

describe('referenceMedian', () => {
  it('computes the median of an even-length distribution', () => {
    // depth_adjusted_yards_per_target median = mean(0.0, 0.2) = 0.1
    expect(referenceMedian('depth_adjusted_yards_per_target', REF)).toBeCloseTo(0.1, 6);
  });
});
