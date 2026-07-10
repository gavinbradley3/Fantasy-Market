// §10.4 shrinkage tests (§26.6).
import { describe, expect, it } from 'vitest';
import {
  shrinkCatchRate,
  shrinkExplosiveRate,
  shrinkTPRR,
  shrinkYPC,
  validCareerPrior,
} from '@/rb-model/shrinkage';
import { SHRINK, TPRR_PRIOR } from '@/rb-model/constants';

describe('§10.4 / §26.6 shrinkage', () => {
  it('zero route sample returns the TPRR draft-round prior', () => {
    const r = shrinkTPRR(0.28, 0, 1);
    expect(r.shrunkTPRR).toBeCloseTo(TPRR_PRIOR[1], 10); // w = 0/(0+120) = 0
  });

  it('larger route sample moves TPRR toward the observation', () => {
    const small = shrinkTPRR(0.28, 60, 1).shrunkTPRR;
    const large = shrinkTPRR(0.28, 6000, 1).shrunkTPRR;
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(0.28);
    expect(large).toBeGreaterThan(0.27); // most of the way to observation
  });

  it('zero carry sample heavily shrinks YPC toward the neutral prior', () => {
    // no career prior → neutral 4.20
    expect(shrinkYPC(6.8, 0, 6.8, null)).toBeCloseTo(SHRINK.ypc_prior, 10);
  });

  it('explosive rate is heavily shrunk (large k = 280)', () => {
    // small sample: observation 0.23 pulled far toward 0.10
    const shrunk = shrinkExplosiveRate(0.23, 30);
    const w = 30 / (30 + 280);
    expect(shrunk).toBeCloseTo(w * 0.23 + (1 - w) * 0.1, 10);
    expect(shrunk).toBeLessThan(0.13);
  });

  it('established players receive more observed-signal weight than low-sample players', () => {
    const rookie = shrinkTPRR(0.28, 40, 2);
    const vet = shrinkTPRR(0.28, 1400, 2);
    expect(vet.sampleWeight).toBeGreaterThan(rookie.sampleWeight);
  });

  it('non-overlapping career prior is used when it differs from the current sample', () => {
    // current 5.0, career 4.6 (distinct) → prior is 4.6, not neutral 4.20
    expect(validCareerPrior(5.0, 4.6, SHRINK.ypc_prior)).toBe(4.6);
  });

  it('overlapping current and career samples use the neutral prior (§26.16.10.7)', () => {
    // career equals current → treated as self-blend → neutral prior
    expect(validCareerPrior(4.6, 4.6, SHRINK.ypc_prior)).toBe(SHRINK.ypc_prior);
    // reflected end-to-end in shrinkYPC
    const overlap = shrinkYPC(4.6, 300, 4.6, 4.6);
    const neutral = shrinkYPC(4.6, 300, 4.6, null);
    expect(overlap).toBeCloseTo(neutral, 10);
  });

  it('missing career prior falls back to neutral for catch rate', () => {
    expect(validCareerPrior(0.9, null, SHRINK.catch_prior)).toBe(SHRINK.catch_prior);
    expect(shrinkCatchRate(0.9, 0, 0.9, null)).toBeCloseTo(SHRINK.catch_prior, 10);
  });
});
