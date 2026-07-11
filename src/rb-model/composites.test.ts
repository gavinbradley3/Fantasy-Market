// §26.16.1.2 horizon-weight rows sum to 1.00; composites don't feed EFO (§26.16.1.10);
// §26.16.7.3 intermediate calculations remain unrounded.
import { describe, expect, it } from 'vitest';
import { HORIZON_WEIGHTS } from '@/rb-model/constants';
import { computeComposites } from '@/rb-model/composites';
import { evaluateRunningBack } from '@/rb-model/engine';
import { round } from '@/rb-model/rounding';
import { loadFixture } from '@/rb-model/testutil';
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

  it('§26.16.7.3 composites use full-precision (unrounded) component values', () => {
    // Fractional components must flow through without any 1-dp rounding.
    const c: ComponentScores = {
      WRK: 80.04, OQ: 70.06, RE: 60.04, RU: 50.06, TC: 40.04, RD: 30.06, AD: 20.04, AV: 90.06,
    };
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

  it('§26.16.7.3 the engine composites are not computed from rounded components', () => {
    // For the elite fixture at ONE_YEAR, recomputing from the SERIALIZED (rounded)
    // components gives a different 1-dp result than the returned composite —
    // which is only possible if the engine composited unrounded values.
    const o = evaluateRunningBack(loadFixture('elite-bell-cow'));
    const w = HORIZON_WEIGHTS.ONE_YEAR;
    const fromRounded = round(
      (Object.keys(w) as (keyof ComponentScores)[]).reduce((s, k) => s + o.components[k] * w[k], 0),
      1,
    );
    expect(o.composites.ONE_YEAR).not.toBe(fromRounded);
  });
});
