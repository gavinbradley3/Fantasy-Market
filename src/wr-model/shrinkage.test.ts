import { describe, expect, it } from 'vitest';
import { shrinkTPRR, shrinkCROE, shrinkDepthAdjYpt, priorTPRR } from '@/wr-model/shrinkage';
import { DEFAULT_REFERENCE_DISTRIBUTIONS as REF } from '@/wr-model/referenceDistributions';
import { referenceMedian } from '@/wr-model/percentiles';

describe('TPRR shrinkage (§26.6)', () => {
  it('returns the draft-round prior when career routes are zero', () => {
    const r = shrinkTPRR(0.3, 0, 1);
    expect(r.shrunkTPRR).toBeCloseTo(priorTPRR(1), 9);
    expect(r.priorTPRR).toBe(0.21);
  });

  it('moves toward the observed value as the sample grows', () => {
    const small = shrinkTPRR(0.3, 50, 1).shrunkTPRR;
    const large = shrinkTPRR(0.3, 5000, 1).shrunkTPRR;
    expect(large).toBeGreaterThan(small);
    expect(large).toBeCloseTo(0.3, 2); // nearly all observed at 5000 routes
  });

  it('more career routes reduce the influence of the prior (monotone sample weight)', () => {
    const w = (n: number) => shrinkTPRR(0.3, n, 1).sampleWeight;
    expect(w(500)).toBeGreaterThan(w(100));
    expect(w(2000)).toBeGreaterThan(w(500));
  });

  it('a Round-1 and an undrafted rookie with identical observed TPRR shrink differently', () => {
    const r1 = shrinkTPRR(0.25, 40, 1).shrunkTPRR;
    const udfa = shrinkTPRR(0.25, 40, null).shrunkTPRR;
    expect(r1).not.toBeCloseTo(udfa, 6);
    expect(r1).toBeGreaterThan(udfa); // R1 prior 0.21 > UDFA prior 0.17
  });

  it('draft round has minimal influence at very large samples', () => {
    const r1 = shrinkTPRR(0.28, 8000, 1).shrunkTPRR;
    const udfa = shrinkTPRR(0.28, 8000, null).shrunkTPRR;
    expect(Math.abs(r1 - udfa)).toBeLessThan(0.001);
  });
});

describe('efficiency shrinkage (§26.6)', () => {
  it('CROE returns the neutral prior (0) at zero routes and moves toward observed with sample', () => {
    expect(shrinkCROE(0.1, 0)).toBeCloseTo(0, 9);
    expect(shrinkCROE(0.1, 250)).toBeCloseTo(0.05, 9); // w=0.5
    expect(shrinkCROE(0.1, 5000)).toBeGreaterThan(shrinkCROE(0.1, 250));
  });

  it('depth-adjusted Y/T returns the reference median at zero routes', () => {
    const med = referenceMedian('depth_adjusted_yards_per_target', REF);
    expect(shrinkDepthAdjYpt(2.0, 0, REF)).toBeCloseTo(med, 9);
    // Large sample moves most of the way toward the observed 2.0 (a small
    // residual prior pull remains — w = 10000/10250 ≈ 0.976).
    expect(shrinkDepthAdjYpt(2.0, 10000, REF)).toBeGreaterThan(1.9);
    expect(shrinkDepthAdjYpt(2.0, 10000, REF)).toBeGreaterThan(shrinkDepthAdjYpt(2.0, 250, REF));
  });
});
