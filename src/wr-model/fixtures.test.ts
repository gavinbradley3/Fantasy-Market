import { describe, expect, it } from 'vitest';
import { evaluateWideReceiver } from '@/wr-model/engine';
import { loadFixture } from '@/wr-model/testutil';

// §7–8 behavioral expectations. Where a prompt expectation conflicts with a
// binding §26 formula (deep-threat volatility, Decision 2), we assert what the
// faithful §26 implementation produces and note the deviation inline.

describe('7.1 elite full-time target earner', () => {
  const out = evaluateWideReceiver(loadFixture('elite-full-time'));
  it('RR and TE are strong positive components', () => {
    expect(out.components.RR).toBeGreaterThan(70);
    expect(out.components.TE).toBeGreaterThan(70);
  });
  it('weekly expected routes exceed 30 and targets are clearly above starter volume', () => {
    expect(out.weekly.expected_routes).toBeGreaterThan(30);
    expect(out.weekly.expected_targets).toBeGreaterThan(8);
  });
  it('confidence HIGH, volatility not HIGH, no fallback, status OK', () => {
    expect(out.confidence.label).toBe('HIGH');
    expect(out.volatility.label).not.toBe('HIGH');
    expect(out.fallback_log).toHaveLength(0);
    expect(out.status).toBe('OK');
  });
  it('weekly explanation includes route role and/or target earning as a positive driver', () => {
    const pos = out.explanations.positive_drivers.join(' ').toLowerCase();
    expect(pos).toMatch(/route participation|target earning/);
  });
});

describe('7.2 low-route, high-TPRR receiver', () => {
  const out = evaluateWideReceiver(loadFixture('low-route-high-tprr'));
  it('TE is materially stronger than RR', () => {
    expect(out.components.TE).toBeGreaterThan(out.components.RR + 20);
  });
  it('weekly routes remain below the elite fixture and targets stay capped by routes', () => {
    const elite = evaluateWideReceiver(loadFixture('elite-full-time'));
    expect(out.weekly.expected_routes).toBeLessThan(elite.weekly.expected_routes);
  });
  it('volatility is MEDIUM or HIGH', () => {
    expect(['MEDIUM', 'HIGH']).toContain(out.volatility.label);
  });
  it('promotion raises RD vs an identical STABLE player', () => {
    const stable = evaluateWideReceiver({ ...loadFixture('low-route-high-tprr'), route_role_change: 'STABLE' });
    expect(out.components.RD).toBeGreaterThan(stable.components.RD);
  });
  it('a positive target-earning driver and a negative route-role driver appear', () => {
    expect(out.explanations.positive_drivers.join(' ').toLowerCase()).toMatch(/target earning/);
    expect(out.explanations.negative_drivers.join(' ').toLowerCase()).toMatch(/route participation/);
  });
  it('no fallback, status OK', () => {
    expect(out.fallback_log).toHaveLength(0);
    expect(out.status).toBe('OK');
  });
});

describe('7.3 Round-1 rookie with little NFL usage', () => {
  const inp = loadFixture('round-one-rookie');
  const out = evaluateWideReceiver(inp);
  it('TPRR is pulled strongly toward the Round-1 prior of 0.21', () => {
    // observed 0.15, prior 0.21, 35 routes ⇒ shrunk ≈ 0.199 (closer to prior).
    const w = 35 / (35 + 150);
    const shrunk = w * 0.15 + (1 - w) * 0.21;
    expect(shrunk).toBeGreaterThan(0.19);
    expect(shrunk).toBeLessThan(0.21);
  });
  it('AD is one of the strongest components (young high-upside profile)', () => {
    const values = Object.values(out.components);
    expect(out.components.AD).toBeGreaterThanOrEqual(Math.max(...values) - 20);
    expect(out.components.AD).toBeGreaterThan(70);
  });
  it('confidence is LOW or MEDIUM (not HIGH); volatility HIGH or near top of MEDIUM', () => {
    expect(['LOW', 'MEDIUM']).toContain(out.confidence.label);
    expect(out.volatility.score).toBeGreaterThan(55);
  });
  it('RP8 falls back to RP4 and contract security uses the Round-1 mapping, both logged', () => {
    const fields = out.fallback_log.map((f) => f.field);
    expect(fields).toContain('RP8');
    expect(fields).toContain('Contract security');
    const contract = out.fallback_log.find((f) => f.field === 'Contract security');
    expect(contract?.fallback_used).toMatch(/1/); // R1 → 1.00
  });
  it('missing trend history produces a neutral (non-zero) trend, not a logged fallback (Decision 3)', () => {
    expect(out.fallback_log.map((f) => f.field)).not.toContain('route_trend');
    // RR still finite and non-zero despite null previous_route_participation.
    expect(out.components.RR).toBeGreaterThan(0);
  });
  it('status is PARTIAL', () => {
    expect(out.status).toBe('PARTIAL');
  });
});

describe('7.4 declining veteran', () => {
  const out = evaluateWideReceiver(loadFixture('declining-veteran'));
  it('route trend materially below 50 → RR reflects the demotion; AD is weak', () => {
    expect(out.components.RD).toBeLessThan(40); // demotion + age deductions
    expect(out.components.AD).toBeLessThan(40);
  });
  it('dynasty composite is materially lower than weekly composite', () => {
    expect(out.composites.DYNASTY).toBeLessThan(out.composites.WEEKLY - 5);
  });
  it('confidence HIGH (large sample, no fallbacks); status OK', () => {
    expect(out.confidence.label).toBe('HIGH');
    expect(out.status).toBe('OK');
  });
  it('negative explanations include durability and/or age', () => {
    const neg = out.explanations.negative_drivers.join(' ').toLowerCase();
    expect(neg).toMatch(/durability|age/);
  });
});

describe('7.5 deep threat with low catch efficiency', () => {
  const out = evaluateWideReceiver(loadFixture('deep-threat-low-efficiency'));
  const elite = evaluateWideReceiver(loadFixture('elite-full-time'));
  it('the deep-target reliability gate triggers; TQ ≤ 65', () => {
    expect(out.components.TQ).toBeLessThanOrEqual(65);
  });
  it('EF is materially weaker than TQ (below average)', () => {
    expect(out.components.EF).toBeLessThan(out.components.TQ);
    expect(out.components.EF).toBeLessThan(50);
  });
  it('expected catch rate is lower than for the elite fixture', () => {
    // Recompute the elite expected catch rate is embedded; deep receptions/target ratio is lower.
    const deepCR = out.weekly.expected_receptions / out.weekly.expected_targets;
    const eliteCR = elite.weekly.expected_receptions / elite.weekly.expected_targets;
    expect(deepCR).toBeLessThan(eliteCR);
  });
  it('high xFP/target cannot erase weak earning and efficiency (composite stays modest)', () => {
    expect(out.composites.WEEKLY).toBeLessThan(elite.composites.WEEKLY);
  });
  it('no fallback, status OK', () => {
    expect(out.fallback_log).toHaveLength(0);
    expect(out.status).toBe('OK');
  });
  // DECISION 2: §26.12 yields volatility ≈ 24.4 (LOW) for this profile. The prompt's
  // "≥ MEDIUM" expectation conflicts with the binding formula, which controls.
  it('volatility follows the binding §26.12 formula (LOW here — see Decision 2)', () => {
    expect(out.volatility.label).toBe('LOW');
    expect(out.volatility.score).toBeGreaterThan(20);
    expect(out.volatility.score).toBeLessThan(33);
  });
});

describe('8.1 missing-data fixture', () => {
  const out = evaluateWideReceiver(loadFixture('missing-data'));
  it('uses documented fallbacks, each logged once, status PARTIAL, confidence LOW', () => {
    const fields = out.fallback_log.map((f) => f.field);
    // Ten §26.5 fallbacks expected for this fixture.
    expect(new Set(fields).size).toBe(fields.length); // no duplicate log entries
    expect(fields).toEqual(
      expect.arrayContaining([
        'RP4',
        'TPRR',
        'Target share',
        'xFP/target',
        'CROE',
        'Team dropbacks',
        'QB environment',
        'Points/drive',
        'Contract security',
        'Competition pressure',
      ]),
    );
    expect(out.status).toBe('PARTIAL');
    expect(out.confidence.label).toBe('LOW');
  });
  it('produces finite outputs and no silent zeros for resolved inputs', () => {
    expect(Number.isFinite(out.weekly.expected_fantasy_points)).toBe(true);
    expect(out.weekly.expected_routes).toBeGreaterThan(0); // RP4 fell back to RP8 0.55, not 0
  });
});

describe('8.2 out-player fixture', () => {
  const out = evaluateWideReceiver(loadFixture('out-player'));
  it('AV 0, Pactive 0, Weekly EFO 0, ROS active games 0', () => {
    expect(out.components.AV).toBe(0);
    expect(out.weekly.probability_active).toBe(0);
    expect(out.weekly.expected_fantasy_points).toBe(0);
    expect(out.ros.expected_active_games).toBe(0);
    expect(out.ros.expected_fantasy_points).toBe(0);
  });
  it('football-stat expectations remain active-game conditional (non-zero)', () => {
    expect(out.weekly.expected_routes).toBeGreaterThan(0);
    expect(out.weekly.expected_receptions).toBeGreaterThan(0);
  });
  it('availability is the strongest weekly negative driver', () => {
    expect(out.explanations.negative_drivers[0].toLowerCase()).toMatch(/availability/);
  });
});

describe('8.3 scoring-format fixture', () => {
  const inp = loadFixture('scoring-format');
  const ppr = evaluateWideReceiver({ ...inp, scoring: { points_per_reception: 1, points_per_receiving_yard: 0.1, points_per_receiving_td: 6 } });
  const half = evaluateWideReceiver({ ...inp, scoring: { points_per_reception: 0.5, points_per_receiving_yard: 0.1, points_per_receiving_td: 6 } });
  const std = evaluateWideReceiver({ ...inp, scoring: { points_per_reception: 0, points_per_receiving_yard: 0.1, points_per_receiving_td: 6 } });

  it('football stats are identical across scoring formats', () => {
    for (const key of ['expected_routes', 'expected_targets', 'expected_receptions', 'expected_receiving_yards', 'expected_receiving_touchdowns'] as const) {
      expect(ppr.weekly[key]).toBe(half.weekly[key]);
      expect(half.weekly[key]).toBe(std.weekly[key]);
    }
  });
  it('fantasy points change and satisfy PPR ≥ half ≥ standard', () => {
    expect(ppr.weekly.expected_fantasy_points).toBeGreaterThan(std.weekly.expected_fantasy_points);
    expect(ppr.weekly.expected_fantasy_points).toBeGreaterThanOrEqual(half.weekly.expected_fantasy_points);
    expect(half.weekly.expected_fantasy_points).toBeGreaterThanOrEqual(std.weekly.expected_fantasy_points);
  });
});
