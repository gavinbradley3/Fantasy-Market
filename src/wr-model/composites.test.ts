import { describe, expect, it } from 'vitest';
import { composite, computeComposites } from '@/wr-model/composites';
import { HORIZON_WEIGHTS } from '@/wr-model/constants';
import type { ComponentScores, Horizon } from '@/wr-model/types';

const HORIZONS: Horizon[] = ['WEEKLY', 'ROS', 'ONE_YEAR', 'THREE_YEAR', 'DYNASTY'];

describe('horizon weights (§26.9)', () => {
  it('every row sums to 1.00', () => {
    for (const h of HORIZONS) {
      const sum = Object.values(HORIZON_WEIGHTS[h]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 9);
    }
  });
});

describe('composite (§26.9)', () => {
  const flat: ComponentScores = { RR: 50, TE: 50, TQ: 50, EF: 50, TC: 50, RD: 50, AD: 50, AV: 50 };

  it('all-50 components produce a composite of 50 at every horizon', () => {
    const c = computeComposites(flat);
    for (const h of HORIZONS) expect(c[h]).toBeCloseTo(50, 9);
  });

  it('is the weighted sum of components', () => {
    const comp: ComponentScores = { RR: 90, TE: 80, TQ: 70, EF: 60, TC: 55, RD: 40, AD: 30, AV: 95 };
    const w = HORIZON_WEIGHTS.WEEKLY;
    const expected =
      comp.RR * w.RR + comp.TE * w.TE + comp.TQ * w.TQ + comp.EF * w.EF +
      comp.TC * w.TC + comp.RD * w.RD + comp.AD * w.AD + comp.AV * w.AV;
    expect(composite(comp, 'WEEKLY')).toBeCloseTo(expected, 9);
  });
});
