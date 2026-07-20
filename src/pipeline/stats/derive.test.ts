import { describe, expect, it } from 'vitest';
import {
  adjustedYardsPerAttempt,
  averageDepthOfTarget,
  catchRate,
  interceptionRate,
  safeDiv,
  targetShare,
  yardsPerCarry,
} from '@/pipeline/stats/derive';
import type { WindowAggregate } from '@/pipeline/stats/types';

function agg(partial: Partial<WindowAggregate>): WindowAggregate {
  return {
    window: 'CAREER',
    games: 0,
    seasons: [],
    completions: 0,
    attempts: 0,
    passingYards: 0,
    passingTds: 0,
    interceptions: 0,
    sacks: 0,
    sackYards: 0,
    carries: 0,
    rushingYards: 0,
    rushingTds: 0,
    receptions: 0,
    targets: 0,
    receivingYards: 0,
    receivingTds: 0,
    receivingAirYards: null,
    airYardsWeeks: 0,
    receivingYardsAfterCatch: null,
    yacWeeks: 0,
    teamTargetsRecon: null,
    targetShareWeeks: 0,
    ...partial,
  };
}

describe('derived-stat registry', () => {
  it('safeDiv returns null (never Infinity/NaN) on zero or sub-minimum denominators', () => {
    expect(safeDiv(10, 0, 1)).toBeNull();
    expect(safeDiv(10, 2, 5)).toBeNull(); // below min
    expect(safeDiv(0, 0, 1)).toBeNull();
    expect(safeDiv(10, 5, 1)).toBe(2);
    // Never produces non-finite values.
    for (const v of [safeDiv(1, 0, 1), safeDiv(0, 0, 1)]) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });

  it('catch rate and YPC use explicit minimum denominators', () => {
    expect(catchRate(agg({ receptions: 6, targets: 10 }))).toBeCloseTo(0.6, 10);
    expect(catchRate(agg({ receptions: 0, targets: 0 }))).toBeNull(); // no targets → null, not 0
    expect(yardsPerCarry(agg({ rushingYards: 100, carries: 20 }))).toBe(5);
  });

  it('aDOT needs supplied air yards', () => {
    expect(averageDepthOfTarget(agg({ receivingAirYards: 120, targets: 10 }))).toBe(12);
    expect(averageDepthOfTarget(agg({ receivingAirYards: null, targets: 10 }))).toBeNull();
  });

  it('target share divides player targets by reconstructed team targets', () => {
    // 30 player targets over 100 reconstructed team targets → 0.30.
    expect(targetShare(agg({ targets: 30, teamTargetsRecon: 100 }))).toBeCloseTo(0.3, 10);
    expect(targetShare(agg({ targets: 30, teamTargetsRecon: null }))).toBeNull();
  });

  it('AY/A follows the PFR formula with a 10-attempt minimum', () => {
    // (300 + 20*3 - 45*1) / 40 = 315/40 = 7.875
    expect(adjustedYardsPerAttempt(agg({ passingYards: 300, passingTds: 3, interceptions: 1, attempts: 40 }))).toBeCloseTo(7.875, 10);
    expect(adjustedYardsPerAttempt(agg({ passingYards: 30, passingTds: 0, interceptions: 0, attempts: 5 }))).toBeNull(); // below min
    expect(interceptionRate(agg({ interceptions: 2, attempts: 100 }))).toBe(0.02);
  });
});
