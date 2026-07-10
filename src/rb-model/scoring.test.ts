// §26.16.9 + §10.7 scoring tests.
import { describe, expect, it } from 'vitest';
import { evaluateRunningBack } from '@/rb-model/engine';
import { loadFixture } from '@/rb-model/testutil';
import type { RBMVPInput, ScoringVector } from '@/rb-model/types';

const FULL: ScoringVector = {
  points_per_reception: 1.0,
  points_per_rushing_yard: 0.1,
  points_per_receiving_yard: 0.1,
  points_per_rushing_td: 6,
  points_per_receiving_td: 6,
};
const HALF: ScoringVector = { ...FULL, points_per_reception: 0.5 };
const STD: ScoringVector = { ...FULL, points_per_reception: 0.0 };

const base = (): RBMVPInput => loadFixture('receiving-specialist'); // reception-heavy → scoring matters

describe('§26.16.9 scoring', () => {
  const full = evaluateRunningBack({ ...base(), scoring: FULL });
  const half = evaluateRunningBack({ ...base(), scoring: HALF });
  const std = evaluateRunningBack({ ...base(), scoring: STD });

  it('1. football-stat expectations are preserved across scoring formats', () => {
    for (const key of [
      'expected_carries',
      'expected_routes',
      'expected_targets',
      'expected_receptions',
      'expected_rushing_yards',
      'expected_receiving_yards',
      'expected_rushing_touchdowns',
      'expected_receiving_touchdowns',
    ] as const) {
      expect(half.weekly[key]).toBe(full.weekly[key]);
      expect(std.weekly[key]).toBe(full.weekly[key]);
    }
  });

  it('2. fantasy points change correctly (full > half > standard for a receiver)', () => {
    expect(full.weekly.expected_fantasy_points).toBeGreaterThan(half.weekly.expected_fantasy_points);
    expect(half.weekly.expected_fantasy_points).toBeGreaterThan(std.weekly.expected_fantasy_points);
    expect(full.ros.expected_fantasy_points).toBeGreaterThan(std.ros.expected_fantasy_points);
  });

  it('3/4. components, composites, and confidence are unchanged by scoring', () => {
    expect(half.components).toEqual(full.components);
    expect(std.components).toEqual(full.components);
    expect(half.composites).toEqual(full.composites);
    expect(std.composites).toEqual(full.composites);
    expect(half.confidence.score).toBe(full.confidence.score);
    expect(std.confidence.score).toBe(full.confidence.score);
  });

  it('5. volatility changes only through TD/reception point dependence', () => {
    // Standard scoring zeroes reception points → receiving_dependence drops to 0.
    expect(std.volatility.receiving_dependence).toBe(0);
    expect(full.volatility.receiving_dependence).toBeGreaterThan(0);
    // TD dependence also shifts as reception points leave the denominator.
    expect(std.volatility.td_dependence).not.toBe(full.volatility.td_dependence);
  });
});
