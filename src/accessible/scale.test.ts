import { describe, expect, it } from 'vitest';
import { clamp, roundHalfAwayFromZero } from './numeric';
import {
  clamp as inferenceClamp,
  roundHalfAwayFromZero as inferenceRound,
} from '@/inference/util/numeric';
import { rate, scaleFrom, score100, shrink, weightedMean, type Anchor } from './scale';

const ANCHORS: readonly Anchor[] = [
  { at: 0, score: 0 },
  { at: 10, score: 50 },
  { at: 20, score: 100 },
];

describe('numeric parity with @/inference/util/numeric', () => {
  // The accessible package duplicates these two helpers to avoid a package cycle. If the
  // duplication ever drifts, every accessible-tier score silently stops matching the
  // repository rounding convention, so parity is asserted rather than assumed.
  it('rounds identically, including the half-away-from-zero and negative-zero rules', () => {
    const cases: [number, number][] = [
      [2.5, 0], [-2.5, 0], [0.5, 0], [-0.5, 0], [1.005, 2], [-1.005, 2],
      [0.0001, 2], [-0.0001, 2], [99.95, 1], [4.3499, 2],
    ];
    for (const [v, d] of cases) {
      expect(roundHalfAwayFromZero(v, d)).toBe(inferenceRound(v, d));
    }
  });

  it('clamps identically', () => {
    for (const v of [-5, 0, 0.5, 50, 100, 150]) {
      expect(clamp(v, 0, 100)).toBe(inferenceClamp(v, 0, 100));
    }
  });
});

describe('scaleFrom', () => {
  it('interpolates linearly between anchors', () => {
    expect(scaleFrom(ANCHORS, 5)).toBe(25);
    expect(scaleFrom(ANCHORS, 15)).toBe(75);
  });

  it('returns anchor scores exactly at anchor points', () => {
    expect(scaleFrom(ANCHORS, 0)).toBe(0);
    expect(scaleFrom(ANCHORS, 10)).toBe(50);
    expect(scaleFrom(ANCHORS, 20)).toBe(100);
  });

  it('saturates instead of extrapolating outside the anchor range', () => {
    expect(scaleFrom(ANCHORS, -100)).toBe(0);
    expect(scaleFrom(ANCHORS, 1e6)).toBe(100);
  });

  it('is monotone non-decreasing across the whole range', () => {
    let previous = -1;
    for (let x = -5; x <= 25; x += 0.25) {
      const v = scaleFrom(ANCHORS, x);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it('rejects a non-finite input rather than producing NaN', () => {
    expect(() => scaleFrom(ANCHORS, Number.NaN)).toThrow(/non-finite/);
  });

  it('rejects non-ascending anchors', () => {
    // The input must fall strictly inside the range so the check is actually reached rather
    // than short-circuited by the saturation branches.
    const duplicated: Anchor[] = [
      { at: 0, score: 0 },
      { at: 0, score: 5 },
      { at: 10, score: 10 },
    ];
    expect(() => scaleFrom(duplicated, 5)).toThrow(/ascend/);
  });
});

describe('shrink', () => {
  it('returns the prior when there is no sample at all', () => {
    expect(shrink(9.9, 0, 4.3, 100)).toBe(4.3);
  });

  it('weights observation and prior equally at n === k', () => {
    expect(shrink(6, 100, 4, 100)).toBe(5);
  });

  it('approaches the observation as the sample grows', () => {
    const small = shrink(6, 10, 4, 100);
    const large = shrink(6, 10_000, 4, 100);
    expect(small).toBeLessThan(large);
    expect(large).toBeGreaterThan(5.9);
  });

  it('is monotone in the sample size', () => {
    let previous = -Infinity;
    for (const n of [1, 5, 20, 50, 130, 400, 1000]) {
      const v = shrink(6, n, 4, 130);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });
});

describe('rate — never divides by an absent or too-small denominator', () => {
  it('reports null when the numerator is unobserved', () => {
    expect(rate(null, 10)).toBeNull();
  });

  it('reports null when the denominator is unobserved', () => {
    expect(rate(10, null)).toBeNull();
  });

  it('reports null rather than dividing by zero', () => {
    expect(rate(10, 0)).toBeNull();
  });

  it('reports null below the minimum denominator', () => {
    expect(rate(10, 5, 20)).toBeNull();
    expect(rate(10, 20, 20)).toBe(0.5);
  });

  it('distinguishes an observed zero numerator from an unobserved one', () => {
    // A back who played and never carried is 0; a game with no carry column is null.
    expect(rate(0, 10)).toBe(0);
    expect(rate(null, 10)).toBeNull();
  });
});

describe('weightedMean — drops absent components and renormalizes', () => {
  it('ignores null components', () => {
    expect(weightedMean([{ value: 100, weight: 1 }, { value: null, weight: 9 }])).toBe(100);
  });

  it('returns null when every component is absent', () => {
    expect(weightedMean([{ value: null, weight: 1 }])).toBeNull();
  });

  it('renormalizes remaining weights rather than treating absence as zero', () => {
    // 80 and 40 at equal weight → 60. A null third component must not drag it toward 0.
    expect(weightedMean([
      { value: 80, weight: 0.25 },
      { value: 40, weight: 0.25 },
      { value: null, weight: 0.5 },
    ])).toBe(60);
  });
});

describe('score100', () => {
  it('clamps into 0..100 and rounds to 1dp', () => {
    expect(score100(-3)).toBe(0);
    expect(score100(120)).toBe(100);
    expect(score100(55.55)).toBe(55.6);
  });
});
