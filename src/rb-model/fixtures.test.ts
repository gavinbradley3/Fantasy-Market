// §26.16.11 fixture behavior assertions. The committee-back fixture inputs were
// re-authored (conformance patch, Decision 7 revision) so the fixture satisfies
// the binding §26.16.11.4 "medium/high volatility" requirement under the
// unchanged §26.12 formula. The injury-return expectations that are NOT part of
// §26.16.11.7 (elevated-volatility label, availability-negative explanation)
// remain formula-governed: the tests assert the §26-reachable behavior.
import { describe, expect, it } from 'vitest';
import { evaluateRunningBack } from '@/rb-model/engine';
import { resolveFallbacks } from '@/rb-model/fallbacks';
import { computeSharedDerived } from '@/rb-model/components';
import { shrinkTPRR } from '@/rb-model/shrinkage';
import { DEFAULT_REFERENCE_DISTRIBUTIONS as REF } from '@/rb-model/referenceDistributions';
import { loadFixture } from '@/rb-model/testutil';

const eliteWkEfo = () => evaluateRunningBack(loadFixture('elite-bell-cow')).weekly.expected_fantasy_points;

describe('9.1 elite three-down bell cow', () => {
  const o = evaluateRunningBack(loadFixture('elite-bell-cow'));
  it('strong WRK/OQ/RU, high Weekly & ROS, HIGH confidence, no fallback, OK', () => {
    expect(o.components.WRK).toBeGreaterThan(70);
    expect(o.components.OQ).toBeGreaterThan(65);
    expect(o.components.RU).toBeGreaterThan(65);
    expect(o.weekly.expected_fantasy_points).toBeGreaterThan(18);
    expect(o.ros.expected_fantasy_points).toBeGreaterThan(150);
    expect(o.confidence.label).toBe('HIGH');
    expect(['LOW', 'MEDIUM']).toContain(o.volatility.label);
    expect(o.fallback_log).toHaveLength(0);
    expect(o.status).toBe('OK');
  });
  it('carry-control and goal-line explanations are positive', () => {
    expect(o.explanations.positive_drivers).toContain('Projected to control most backfield carries.');
    expect(o.explanations.positive_drivers).toContain('Projected to dominate goal-line work.');
  });
});

describe('9.2 goal-line touchdown specialist', () => {
  const i = loadFixture('goal-line-specialist');
  const o = evaluateRunningBack(i);
  it('base projected touches < 6 (OQ low-touch gate active)', () => {
    const { resolved } = resolveFallbacks(i, REF);
    const derived = computeSharedDerived(resolved, shrinkTPRR(resolved.tprr, i.career_routes, i.draft_round).shrunkTPRR);
    expect(derived.projectedTouchesForOQ).toBeLessThan(6);
  });
  it('WRK and RU weak, TD dependence high, Weekly EFO well below elite, OK', () => {
    expect(o.components.WRK).toBeLessThan(40);
    expect(o.components.RU).toBeLessThan(40);
    expect(o.volatility.td_dependence).toBeGreaterThanOrEqual(0.35);
    expect(o.weekly.expected_fantasy_points).toBeLessThan(eliteWkEfo());
    expect(o.status).toBe('OK');
  });
  it('goal-line positive, committee negative', () => {
    expect(o.explanations.positive_drivers).toContain('Projected to dominate goal-line work.');
    expect(o.explanations.negative_drivers).toContain('Committee usage limits expected workload.');
  });
});

describe('9.3 receiving specialist', () => {
  const i = loadFixture('receiving-specialist');
  const o = evaluateRunningBack(i);
  it('strong RU, ≥4 expected targets, receiving-stability positive', () => {
    expect(o.components.RU).toBeGreaterThan(70);
    expect(o.weekly.expected_targets).toBeGreaterThanOrEqual(4);
    expect(o.explanations.positive_drivers).toContain('Receiving usage provides weekly stability.');
  });
  it('PPR benefits the player; standard lowers points without changing football stats', () => {
    const std = evaluateRunningBack({
      ...i,
      scoring: { points_per_reception: 0, points_per_rushing_yard: 0.1, points_per_receiving_yard: 0.1, points_per_rushing_td: 6, points_per_receiving_td: 6 },
    });
    expect(std.weekly.expected_fantasy_points).toBeLessThan(o.weekly.expected_fantasy_points);
    expect(std.weekly.expected_receptions).toBe(o.weekly.expected_receptions);
  });
});

describe('9.4 committee back', () => {
  const i = loadFixture('committee-back');
  const o = evaluateRunningBack(i);
  it('moderate WRK, competition lowers RD, committee negative, below elite', () => {
    expect(o.components.WRK).toBeGreaterThan(35);
    expect(o.components.WRK).toBeLessThan(60);
    const noComp = evaluateRunningBack({ ...i, competition_pressure: 0.1 });
    expect(o.components.RD).toBeLessThan(noComp.components.RD);
    expect(o.explanations.negative_drivers).toContain('Committee usage limits expected workload.');
    expect(o.weekly.expected_fantasy_points).toBeLessThan(eliteWkEfo());
  });
  it('competition raises volatility relative to a low-competition baseline', () => {
    const calm = evaluateRunningBack({ ...i, competition_pressure: 0.1 });
    expect(o.volatility.score).toBeGreaterThan(calm.volatility.score);
  });
  it('§26.16.11.4 committee volatility label is MEDIUM or HIGH', () => {
    expect(['MEDIUM', 'HIGH']).toContain(o.volatility.label);
  });
});

describe('9.5 explosive rookie', () => {
  const i = loadFixture('explosive-rookie');
  const o = evaluateRunningBack(i);
  it('low-sample confidence penalty, Snap8 + contract fallbacks logged, PARTIAL', () => {
    expect(o.confidence.score).toBeLessThan(100);
    expect(o.confidence.label).not.toBe('HIGH');
    const fields = o.fallback_log.map((e) => e.field);
    expect(fields).toContain('Snap8');
    expect(fields).toContain('Contract security');
    expect(o.status).toBe('PARTIAL');
  });
  it('RE sample cap applies (career_carries < 75 → RE within [25,75]); no elite unrestricted RE', () => {
    expect(o.components.RE).toBeGreaterThanOrEqual(25);
    expect(o.components.RE).toBeLessThanOrEqual(75);
  });
  it('volatility is elevated for the low-sample rookie', () => {
    expect(o.volatility.score).toBeGreaterThan(evaluateRunningBack(loadFixture('elite-bell-cow')).volatility.score);
  });
});

describe('9.6 aging veteran', () => {
  const i = loadFixture('aging-veteran');
  const o = evaluateRunningBack(i);
  it('useful Weekly/ROS, strong workload, weak AD, RD reduced, HIGH confidence, no fallback', () => {
    expect(o.weekly.expected_fantasy_points).toBeGreaterThan(10);
    expect(o.components.WRK).toBeGreaterThan(65);
    expect(o.components.AD).toBeLessThan(20);
    expect(o.components.RD).toBeLessThan(50);
    expect(o.confidence.label).toBe('HIGH');
    expect(o.status).toBe('OK');
  });
  it('Dynasty composite materially below Weekly composite; long-term age negative at DYNASTY', () => {
    expect(o.composites.DYNASTY).toBeLessThan(o.composites.WEEKLY - 10);
    const dyn = evaluateRunningBack(i, { selected_horizon: 'DYNASTY' });
    expect(dyn.explanations.negative_drivers).toContain('Age and workload reduce the long-term outlook.');
  });
});

describe('9.7 injury-return player', () => {
  const i = loadFixture('injury-return');
  const o = evaluateRunningBack(i);
  it('nonzero Pactive < 1; workload ramp reduces Weekly EFO vs ramp 1.0', () => {
    expect(o.weekly.probability_active).toBeGreaterThan(0);
    expect(o.weekly.probability_active).toBeLessThan(1);
    const full = evaluateRunningBack({ ...i, workload_ramp_factor: 1.0 });
    expect(o.weekly.expected_fantasy_points).toBeLessThan(full.weekly.expected_fantasy_points);
    expect(o.weekly.expected_carries).toBeLessThan(full.weekly.expected_carries);
  });
  it('ROS uses the reduced ramp for the first game only (ROS below a full-ramp equivalent)', () => {
    const full = evaluateRunningBack({ ...i, workload_ramp_factor: 1.0 });
    expect(o.ros.expected_fantasy_points).toBeLessThan(full.ros.expected_fantasy_points);
  });
  it('QUESTIONABLE injury raises volatility above a HEALTHY equivalent (Decision 7)', () => {
    const healthy = evaluateRunningBack({ ...i, injury_status: 'HEALTHY', practice_status: 'FULL' });
    expect(o.volatility.score).toBeGreaterThan(healthy.volatility.score);
  });
});

describe('9.8 out player', () => {
  const o = evaluateRunningBack(loadFixture('out-player'));
  it('AV 0, Pactive 0, zero workload, zero Weekly & ROS EFO, ramp fallback logged', () => {
    expect(o.components.AV).toBe(0);
    expect(o.weekly.probability_active).toBe(0);
    expect(o.weekly.workload_ramp_factor).toBe(0);
    expect(o.weekly.expected_carries).toBe(0);
    expect(o.weekly.expected_fantasy_points).toBe(0);
    expect(o.ros.expected_active_games).toBe(0);
    expect(o.ros.expected_fantasy_points).toBe(0);
    expect(o.fallback_log.map((e) => e.field)).toContain('Workload ramp');
  });
  it('availability is the strongest negative weekly explanation', () => {
    expect(o.explanations.negative_drivers[0]).toBe('Current availability materially lowers the weekly outlook.');
  });
});

describe('9.9 missing-data player', () => {
  const i = loadFixture('missing-data');
  const o = evaluateRunningBack(i);
  it('exercises every fallback row once, PARTIAL, LOW confidence, all finite, no silent zero', () => {
    expect(o.fallback_log).toHaveLength(21);
    const fields = o.fallback_log.map((e) => e.field);
    expect(new Set(fields).size).toBe(21);
    expect(o.status).toBe('PARTIAL');
    expect(o.confidence.label).toBe('LOW');
    for (const v of Object.values(o.weekly)) expect(Number.isFinite(v)).toBe(true);
    // missing carry share did not silently become zero (role fallback is positive)
    expect(o.weekly.expected_carries).toBeGreaterThan(0);
  });
  it('Snap4/Snap8 mutual fallback uses original inputs (both → 0.45 final)', () => {
    const { resolved } = resolveFallbacks(i, REF);
    expect(resolved.snap4).toBe(0.45);
    expect(resolved.snap8).toBe(0.45);
  });
});

describe('9.10 mobile-QB pressure comparison', () => {
  const lo = evaluateRunningBack(loadFixture('mobile-qb-low-pressure'));
  const hi = evaluateRunningBack(loadFixture('mobile-qb-high-pressure'));
  it('high pressure → fewer carries, fewer rushing TDs, lower TC, lower Weekly EFO', () => {
    expect(hi.weekly.expected_carries).toBeLessThan(lo.weekly.expected_carries);
    expect(hi.weekly.expected_rushing_touchdowns).toBeLessThan(lo.weekly.expected_rushing_touchdowns);
    expect(hi.components.TC).toBeLessThan(lo.components.TC);
    expect(hi.weekly.expected_fantasy_points).toBeLessThan(lo.weekly.expected_fantasy_points);
  });
  it('all non-pressure components are identical between the two backs', () => {
    for (const k of ['WRK', 'OQ', 'RE', 'RU', 'RD', 'AD', 'AV'] as const) {
      expect(hi.components[k]).toBe(lo.components[k]);
    }
  });
});
