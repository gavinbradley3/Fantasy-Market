import { describe, expect, it } from 'vitest';
import { addSplits, splitProduct, splitValue, valueOf } from './ledger';

describe('projection split', () => {
  it('sums exactly to the change in the product, whichever factor moves', () => {
    for (const [s0, r0, s1, r1] of [[0.8, 12, 0.6, 14], [1, 10, 1, 10], [0.3, 4, 0.9, 2.5], [0, 0, 0.7, 11]]) {
      const x = splitProduct(17, s0, r0, s1, r1);
      expect(x.fromShare + x.fromRate).toBeCloseTo(x.total, 10);
      expect(x.total).toBeCloseTo(17 * (s1 * r1 - s0 * r0), 10);
    }
  });
  it('gives zero to a factor that did not move', () => {
    expect(splitProduct(17, 0.8, 12, 0.8, 15).fromShare).toBe(0);
    expect(splitProduct(17, 0.8, 12, 0.5, 12).fromRate).toBe(0);
  });
  it('adds season splits', () => {
    const t = addSplits(splitProduct(17, 0.8, 12, 0.7, 13), splitProduct(17, 0.7, 11, 0.6, 12));
    expect(t.fromShare + t.fromRate).toBeCloseTo(t.total, 10);
  });
});

describe('value split', () => {
  it('sums exactly, including across the zero floor', () => {
    const cases: [[number, number], [number, number], [number, number], [number, number]][] = [
      [[200, 150], [120, 100], [230, 170], [125, 102]],
      [[110, 90], [120, 100], [140, 120], [130, 95]],
      [[150, 140], [120, 100], [100, 90], [118, 99]],
    ];
    for (const [p0, r0, p1, r1] of cases) {
      const s = splitValue(p0, r0, p1, r1);
      expect(s.fromOwnProjection + s.fromReplacement).toBeCloseTo(s.total, 10);
      expect(s.total).toBeCloseTo(valueOf(p1, r1) - valueOf(p0, r0), 10);
    }
  });
});
