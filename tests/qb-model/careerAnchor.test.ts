// §26.6.3-CA — the career anchor (methodology revision).
//
// The behaviour under test, stated as the spec revision states it: career performance
// establishes the baseline, recent performance adjusts it, and how far recent form can move
// the baseline depends on how much career stands behind it.
//
// The most important test in this file is the backwards-compatibility one. A caller that does
// not supply career inputs must get the engine's previous output byte for byte — otherwise
// this is not an extension, it is a rewrite.

import { describe, expect, it } from 'vitest';
import { careerAnchoredShrink } from "../../src/qb-model/shrinkage.js";
import { shrink } from "../../src/qb-model/math.js";

const PRIOR = 6.8;
const K_CAREER = 500;
const K_RECENT = 250;

function call(over: Partial<Parameters<typeof careerAnchoredShrink>[0]> = {}) {
  return careerAnchoredShrink({
    recentRate: 7.0,
    recentSample: 250,
    careerRate: null,
    careerSample: 0,
    prior: PRIOR,
    kCareer: K_CAREER,
    kRecent: K_RECENT,
    ...over,
  });
}

describe('backwards compatibility', () => {
  it('reproduces the ORIGINAL single-stage shrinkage when no career rate is supplied', () => {
    // This is what the engine did before the revision, and what every golden fixture encodes.
    for (const [rate, n] of [[7.0, 250], [12.8, 74], [6.5, 289], [0, 0]] as const) {
      expect(call({ recentRate: rate, recentSample: n, careerRate: null, careerSample: 1680 }))
        .toBeCloseTo(shrink(rate, n, PRIOR, K_RECENT), 12);
    }
  });

  it('ignores the career SAMPLE when there is no career RATE', () => {
    // An anchor that is entirely the prior carries no career evidence, so it must not resist
    // the recent window as though it did.
    expect(call({ careerSample: 5000 })).toBeCloseTo(call({ careerSample: 0 }), 12);
  });

  it('treats undefined exactly as null', () => {
    expect(call({ careerRate: undefined, careerSample: 1680 })).toBeCloseTo(call({ careerRate: null }), 12);
  });
});

describe('career establishes the baseline', () => {
  it('a large career sample pulls the estimate toward the career rate, not the draft prior', () => {
    const established = call({ recentRate: 6.5, recentSample: 289, careerRate: 8.0, careerSample: 4000 });
    const noCareer = call({ recentRate: 6.5, recentSample: 289, careerRate: null, careerSample: 0 });
    expect(established).toBeGreaterThan(noCareer);
    // With 4,000 attempts behind it the estimate sits close to the career rate.
    expect(established).toBeGreaterThan(7.5);
  });

  it('a small career sample barely moves the baseline off the draft prior', () => {
    const backup = call({ recentRate: 12.8, recentSample: 74, careerRate: 11.5, careerSample: 94 });
    const noCareer = call({ recentRate: 12.8, recentSample: 74, careerRate: null, careerSample: 0 });
    // It moves — 94 attempts is real evidence — but only a little.
    expect(backup).toBeGreaterThan(noCareer);
    expect(backup - noCareer).toBeLessThan(1.0);
  });
});

describe('recent form adjusts, but cannot erase an established record', () => {
  it('the same eight-game collapse moves a career backup far more than a career starter', () => {
    const collapse = { recentRate: 4.0, recentSample: 250 };
    const starterBefore = call({ recentRate: 8.0, recentSample: 250, careerRate: 8.0, careerSample: 4000 });
    const starterAfter = call({ ...collapse, careerRate: 8.0, careerSample: 4000 });
    const backupBefore = call({ recentRate: 8.0, recentSample: 250, careerRate: 8.0, careerSample: 120 });
    const backupAfter = call({ ...collapse, careerRate: 8.0, careerSample: 120 });
    expect(Math.abs(backupAfter - backupBefore)).toBeGreaterThan(Math.abs(starterAfter - starterBefore));
  });

  it('a short hot streak cannot lift a small sample above a strong established career', () => {
    // The success condition of the revision, in one assertion.
    const hotBackup = call({ recentRate: 12.8, recentSample: 74, careerRate: 11.5, careerSample: 94 });
    const provenStarter = call({ recentRate: 8.2, recentSample: 280, careerRate: 8.6, careerSample: 4000 });
    expect(provenStarter).toBeGreaterThan(hotBackup);
  });

  it('recent form still matters substantially — it is damped, never removed', () => {
    const good = call({ recentRate: 9.5, recentSample: 280, careerRate: 8.0, careerSample: 4000 });
    const bad = call({ recentRate: 5.5, recentSample: 280, careerRate: 8.0, careerSample: 4000 });
    expect(good - bad).toBeGreaterThan(0.3);
  });
});

describe('emerging young quarterbacks stay responsive', () => {
  it('one strong full season moves a young QB decisively', () => {
    // ~550 career attempts: his career IS his recent form, and both point the same way.
    const rookieSeason = call({ recentRate: 9.0, recentSample: 280, careerRate: 9.0, careerSample: 550 });
    const leagueAverage = call({ recentRate: 6.8, recentSample: 280, careerRate: 6.8, careerSample: 550 });
    expect(rookieSeason - leagueAverage).toBeGreaterThan(1.0);
    expect(rookieSeason).toBeGreaterThan(8.0);
  });

  it('a young riser is not held down by a veteran-sized anchor he does not have', () => {
    const young = call({ recentRate: 9.0, recentSample: 280, careerRate: 9.0, careerSample: 550 });
    const veteranSameForm = call({ recentRate: 9.0, recentSample: 280, careerRate: 7.0, careerSample: 4000 });
    expect(young).toBeGreaterThan(veteranSameForm);
  });
});

describe('degenerate inputs', () => {
  it('a zero recent sample returns the anchor itself', () => {
    expect(call({ recentRate: 99, recentSample: 0, careerRate: 8.0, careerSample: 4000 }))
      .toBeCloseTo(shrink(8.0, 4000, PRIOR, K_CAREER), 12);
  });

  it('a negative career sample is treated as none rather than inverting the weights', () => {
    expect(call({ careerRate: 8.0, careerSample: -100 })).toBeCloseTo(call({ careerRate: 8.0, careerSample: 0 }), 12);
  });

  it('a non-finite career rate degrades to the prior', () => {
    expect(call({ careerRate: Number.NaN, careerSample: 4000 })).toBeCloseTo(call({ careerRate: null }), 12);
  });

  it('is deterministic', () => {
    const a = call({ careerRate: 8.0, careerSample: 4000 });
    const b = call({ careerRate: 8.0, careerSample: 4000 });
    expect(a).toBe(b);
  });
});
