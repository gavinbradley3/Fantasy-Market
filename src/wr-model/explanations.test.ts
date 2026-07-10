import { describe, expect, it } from 'vitest';
import { computeExplanations } from '@/wr-model/explanations';
import type { ComponentScores } from '@/wr-model/types';

const comp: ComponentScores = { RR: 85, TE: 80, TQ: 55, EF: 45, TC: 60, RD: 20, AD: 30, AV: 95 };

describe('explanations (§26.13)', () => {
  it('returns at most three positive and three negative drivers', () => {
    const e = computeExplanations(comp, 'WEEKLY');
    expect(e.positive_drivers.length).toBeLessThanOrEqual(3);
    expect(e.negative_drivers.length).toBeLessThanOrEqual(3);
  });

  it('positive drivers are ordered by largest positive weighted contribution', () => {
    // Weekly: AV weighted = 45×0.18=8.1; RR = 35×0.22=7.7; TE = 30×0.22=6.6.
    const e = computeExplanations(comp, 'WEEKLY');
    expect(e.positive_drivers[0]).toMatch(/availability/i);
    expect(e.positive_drivers[1]).toMatch(/route participation/i);
  });

  it('omits drivers whose absolute weighted contribution is below 1.0', () => {
    // TQ deviation 5 × weekly weight 0.10 = 0.5 → omitted.
    const e = computeExplanations(comp, 'WEEKLY');
    expect(e.positive_drivers.join(' ')).not.toMatch(/high-value target/i);
  });

  it('Weekly and Dynasty explanations can differ because weights differ', () => {
    const weekly = computeExplanations(comp, 'WEEKLY');
    const dynasty = computeExplanations(comp, 'DYNASTY');
    // RD deviation −30: weekly −1.5 (weight .05), dynasty −6.9 (weight .23) →
    // durability is a much stronger negative at dynasty.
    expect(dynasty.negative_drivers[0]).toMatch(/durability|Age/i);
    expect(weekly.negative_drivers).not.toEqual(dynasty.negative_drivers);
  });

  it('uses plain language without claiming proof of future performance', () => {
    const all = computeExplanations(comp, 'WEEKLY');
    const text = [...all.positive_drivers, ...all.negative_drivers].join(' ').toLowerCase();
    expect(text).not.toMatch(/guarantee|will (score|finish|produce)|proven to/);
  });
});
