// §26.16.7 (volatility) + §10.9 volatility tests.
import { describe, expect, it } from 'vitest';
import { computeVolatility, volatilityLabel } from '@/rb-model/volatility';
import { round } from '@/rb-model/rounding';
import { evaluateRunningBack } from '@/rb-model/engine';
import { DEFAULT_SCORING } from '@/rb-model/constants';
import { loadFixture } from '@/rb-model/testutil';
import type { ActiveGame } from '@/rb-model/projections';
import type { RBMVPInput } from '@/rb-model/types';

const base = (): RBMVPInput => loadFixture('elite-bell-cow');

// A neutral active game (low TD/reception dependence) for isolating other terms.
function game(over: Partial<ActiveGame> = {}): ActiveGame {
  return {
    expectedCarries: 15,
    expectedRushingYards: 65,
    expectedRushingTouchdowns: 0.4,
    expectedRoutes: 15,
    expectedTargets: 3,
    expectedReceptions: 2.4,
    expectedReceivingYards: 18,
    expectedReceivingTouchdowns: 0.08,
    activeGameFantasyPoints: 14,
    ...over,
  };
}

const vol = (
  over: Partial<RBMVPInput>,
  snap4: number,
  competition: number,
  explosive: number,
  g: ActiveGame,
  routes = 800,
  carries = 800,
) =>
  computeVolatility({ ...base(), ...over }, snap4, competition, explosive, g, routes, carries, DEFAULT_SCORING).score;

describe('§10.9 volatility', () => {
  it('lower snap share raises volatility', () => {
    expect(vol({}, 0.3, 0.3, 0.1, game())).toBeGreaterThan(vol({}, 0.85, 0.3, 0.1, game()));
  });

  it('higher competition pressure raises volatility', () => {
    expect(vol({}, 0.6, 0.9, 0.1, game())).toBeGreaterThan(vol({}, 0.6, 0.1, 0.1, game()));
  });

  it('higher TD dependence raises volatility', () => {
    const highTd = game({ expectedRushingTouchdowns: 1.5, activeGameFantasyPoints: 14 });
    const lowTd = game({ expectedRushingTouchdowns: 0.1, activeGameFantasyPoints: 14 });
    expect(vol({}, 0.6, 0.3, 0.1, highTd)).toBeGreaterThan(vol({}, 0.6, 0.3, 0.1, lowTd));
  });

  it('receiving dependence contributes', () => {
    const highRec = game({ expectedReceptions: 6, activeGameFantasyPoints: 14 });
    const lowRec = game({ expectedReceptions: 0.5, activeGameFantasyPoints: 14 });
    expect(vol({}, 0.6, 0.3, 0.1, highRec)).toBeGreaterThan(vol({}, 0.6, 0.3, 0.1, lowRec));
  });

  it('prior (low-sample) dependence contributes', () => {
    const small = vol({}, 0.6, 0.3, 0.1, game(), 20, 20);
    const large = vol({}, 0.6, 0.3, 0.1, game(), 3000, 3000);
    expect(small).toBeGreaterThan(large);
  });

  it('QUESTIONABLE and UNKNOWN injury add risk', () => {
    const baseline = vol({ injury_status: 'HEALTHY' }, 0.6, 0.3, 0.1, game());
    expect(vol({ injury_status: 'QUESTIONABLE' }, 0.6, 0.3, 0.1, game())).toBeGreaterThan(baseline);
    expect(vol({ injury_status: 'UNKNOWN' }, 0.6, 0.3, 0.1, game())).toBeGreaterThan(baseline);
  });

  it('PROMOTED, DEMOTED, and UNKNOWN role add risk', () => {
    const baseline = vol({ role_change: 'STABLE' }, 0.6, 0.3, 0.1, game());
    for (const rc of ['PROMOTED', 'DEMOTED', 'UNKNOWN'] as const) {
      expect(vol({ role_change: rc }, 0.6, 0.3, 0.1, game())).toBeGreaterThan(baseline);
    }
  });

  it('teammate return adds risk', () => {
    expect(vol({ teammate_return_flag: true }, 0.6, 0.3, 0.1, game())).toBeGreaterThan(
      vol({ teammate_return_flag: false }, 0.6, 0.3, 0.1, game()),
    );
  });

  it('explosive rate at/above 0.15 adds risk', () => {
    expect(vol({}, 0.6, 0.3, 0.16, game())).toBeGreaterThan(vol({}, 0.6, 0.3, 0.14, game()));
  });

  it('§26.16.7.1 labels derive from the rounded score; raw 32.97 → 33.0 MEDIUM', () => {
    expect(round(32.97, 1)).toBe(33.0);
    expect(volatilityLabel(round(32.97, 1))).toBe('MEDIUM');
    expect(volatilityLabel(32.9)).toBe('LOW');
    expect(volatilityLabel(66.0)).toBe('HIGH');
    expect(volatilityLabel(65.9)).toBe('MEDIUM');
  });

  it('engine-reported label matches the rounded volatility score', () => {
    for (const name of ['goal-line-specialist', 'committee-back', 'missing-data']) {
      const o = evaluateRunningBack(loadFixture(name));
      expect(o.volatility.label).toBe(volatilityLabel(o.volatility.score));
    }
  });
});
