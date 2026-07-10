import { describe, expect, it } from 'vitest';
import { computeProjections, type ProjectionInputs } from '@/wr-model/projections';
import { DEFAULT_SCORING } from '@/wr-model/constants';

function base(): ProjectionInputs {
  return {
    av: 98,
    teamDropbacks: 38,
    rp4: 0.9,
    shrunkTPRR: 0.25,
    adot: 10,
    shrunkCROE: 0.02,
    shrunkDepthAdjYpt: 1.0,
    xtdPerTarget: 0.06,
    expectedGamesRemaining: 10,
    scoring: DEFAULT_SCORING,
  };
}

describe('EFO chain (§26.10)', () => {
  it('follows the multiplicative opportunity chain', () => {
    const p = computeProjections(base());
    expect(p.expectedRoutes).toBeCloseTo(38 * 0.9, 9);
    expect(p.expectedTargets).toBeCloseTo(38 * 0.9 * 0.25, 9);
    expect(p.probabilityActive).toBeCloseTo(0.98, 9);
  });

  it('higher RP4 increases expected routes', () => {
    expect(computeProjections({ ...base(), rp4: 0.95 }).expectedRoutes).toBeGreaterThan(
      computeProjections({ ...base(), rp4: 0.5 }).expectedRoutes,
    );
  });

  it('higher shrunk TPRR increases expected targets and fantasy points', () => {
    const lo = computeProjections({ ...base(), shrunkTPRR: 0.15 });
    const hi = computeProjections({ ...base(), shrunkTPRR: 0.3 });
    expect(hi.expectedTargets).toBeGreaterThan(lo.expectedTargets);
    expect(hi.weeklyEFO).toBeGreaterThan(lo.weeklyEFO);
  });

  it('higher expected catch rate (via CROE) increases receptions', () => {
    const lo = computeProjections({ ...base(), shrunkCROE: -0.05 });
    const hi = computeProjections({ ...base(), shrunkCROE: 0.1 });
    expect(hi.expectedCatchRate).toBeGreaterThan(lo.expectedCatchRate);
    expect(hi.expectedReceptions).toBeGreaterThan(lo.expectedReceptions);
  });

  it('higher expected TD rate increases fantasy points', () => {
    expect(computeProjections({ ...base(), xtdPerTarget: 0.12 }).weeklyEFO).toBeGreaterThan(
      computeProjections({ ...base(), xtdPerTarget: 0.02 }).weeklyEFO,
    );
  });

  it('lower Pactive lowers Weekly EFO', () => {
    expect(computeProjections({ ...base(), av: 45 }).weeklyEFO).toBeLessThan(
      computeProjections({ ...base(), av: 98 }).weeklyEFO,
    );
  });

  it('an OUT player (AV=0) has Pactive 0, Weekly EFO 0, and 0 expected active games', () => {
    const p = computeProjections({ ...base(), av: 0 });
    expect(p.probabilityActive).toBe(0);
    expect(p.weeklyEFO).toBe(0);
    expect(p.expectedActiveGamesRemaining).toBe(0);
    expect(p.rosEFO).toBe(0);
    // Football-stat expectations remain active-game-conditional (non-zero).
    expect(p.expectedRoutes).toBeGreaterThan(0);
    expect(p.expectedTargets).toBeGreaterThan(0);
  });

  it('catch rate and yards-per-reception respect their clamps', () => {
    const deep = computeProjections({ ...base(), adot: 40, shrunkDepthAdjYpt: 20, shrunkCROE: 0.5 });
    expect(deep.expectedCatchRate).toBeLessThanOrEqual(0.85);
    expect(deep.expectedYardsPerReception).toBeLessThanOrEqual(22.0);
    const shallow = computeProjections({ ...base(), adot: 0, shrunkDepthAdjYpt: -20, shrunkCROE: -0.5 });
    expect(shallow.expectedCatchRate).toBeGreaterThanOrEqual(0.35);
    expect(shallow.expectedYardsPerReception).toBeGreaterThanOrEqual(6.0);
  });

  it('scoring vector changes fantasy points but not football stats (§26.16 #9)', () => {
    const ppr = computeProjections({ ...base(), scoring: { points_per_reception: 1, points_per_receiving_yard: 0.1, points_per_receiving_td: 6 } });
    const half = computeProjections({ ...base(), scoring: { points_per_reception: 0.5, points_per_receiving_yard: 0.1, points_per_receiving_td: 6 } });
    const std = computeProjections({ ...base(), scoring: { points_per_reception: 0, points_per_receiving_yard: 0.1, points_per_receiving_td: 6 } });
    expect(ppr.expectedReceptions).toBeCloseTo(half.expectedReceptions, 9);
    expect(half.expectedReceivingYards).toBeCloseTo(std.expectedReceivingYards, 9);
    expect(ppr.weeklyEFO).toBeGreaterThanOrEqual(half.weeklyEFO);
    expect(half.weeklyEFO).toBeGreaterThanOrEqual(std.weeklyEFO);
  });
});
