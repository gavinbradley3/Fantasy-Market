// §26.16.1.2 horizon-weight rows sum to 1.00; composites don't feed EFO (§26.16.1.10).
import { describe, expect, it } from 'vitest';
import { HORIZON_WEIGHTS } from '@/rb-model/constants';
import { computeComposites } from '@/rb-model/composites';
import type { ComponentScores, Horizon } from '@/rb-model/types';

const HORIZONS: Horizon[] = ['WEEKLY', 'ROS', 'ONE_YEAR', 'THREE_YEAR', 'DYNASTY'];

describe('§26.9 composites', () => {
  it('every horizon weight row sums to 1.00', () => {
    for (const h of HORIZONS) {
      const w = HORIZON_WEIGHTS[h];
      const sum = (Object.keys(w) as (keyof ComponentScores)[]).reduce((s, k) => s + w[k], 0);
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });

  it('composite = Σ component × horizon weight', () => {
    const c: ComponentScores = { WRK: 80, OQ: 70, RE: 60, RU: 50, TC: 40, RD: 30, AD: 20, AV: 90 };
    const out = computeComposites(c);
    for (const h of HORIZONS) {
      const w = HORIZON_WEIGHTS[h];
      const expected = (Object.keys(w) as (keyof ComponentScores)[]).reduce(
        (s, k) => s + c[k] * w[k],
        0,
      );
      expect(out[h]).toBeCloseTo(expected, 10);
    }
  });
});
