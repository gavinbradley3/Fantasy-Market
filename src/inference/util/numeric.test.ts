import { describe, expect, it } from 'vitest';
import { clamp, lowerMedian, pct, roundHalfAwayFromZero } from '@/inference/util/numeric';

describe('roundHalfAwayFromZero', () => {
  it('rounds halves away from zero', () => {
    expect(roundHalfAwayFromZero(2.5, 0)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5, 0)).toBe(-3);
    expect(roundHalfAwayFromZero(0.125, 2)).toBe(0.13);
    expect(roundHalfAwayFromZero(53.125, 0)).toBe(53); // REGISTRY §22 Fx1
  });

  it('normalizes negative zero', () => {
    expect(Object.is(roundHalfAwayFromZero(-0.0001, 2), 0)).toBe(true);
  });

  it('throws on non-finite input', () => {
    expect(() => roundHalfAwayFromZero(Number.NaN, 2)).toThrow();
    expect(() => roundHalfAwayFromZero(Number.POSITIVE_INFINITY, 2)).toThrow();
  });
});

describe('pct (mid-rank percentile)', () => {
  const tppd = [
    1.2, 1.35, 1.45, 1.55, 1.65, 1.75, 1.85, 1.95, 2.05, 2.15, 2.25, 2.35, 2.5, 2.65, 2.8, 3.0,
  ];

  it('reproduces REGISTRY §22 Fx1: pct(2.05) = 53.125 → 53', () => {
    expect(pct(2.05, tppd)).toBeCloseTo(53.125, 10);
    expect(roundHalfAwayFromZero(pct(2.05, tppd), 0)).toBe(53);
  });

  it('clamps to [0,100] and handles extremes', () => {
    expect(pct(0, tppd)).toBe(0);
    expect(pct(100, tppd)).toBe(100);
  });

  it('throws on an empty reference', () => {
    expect(() => pct(1, [])).toThrow();
  });
});

describe('clamp / lowerMedian', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('lower-median uses floor((N-1)/2), no averaging', () => {
    expect(lowerMedian([3, 1, 2])).toBe(2);
    expect(lowerMedian([4, 1, 3, 2])).toBe(2); // index floor(3/2)=1 of [1,2,3,4]
  });
});
