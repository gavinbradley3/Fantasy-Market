// §26.16.5 ROS ramp + §26.16.6 conditional-stat + §10.6 projection tests.
import { describe, expect, it } from 'vitest';
import { calculateActiveGame, computeProjections, type ProjectionInputs } from '@/rb-model/projections';
import { evaluateRunningBack } from '@/rb-model/engine';
import { DEFAULT_SCORING } from '@/rb-model/constants';
import { loadFixture } from '@/rb-model/testutil';
import type { RBMVPInput } from '@/rb-model/types';

function projInput(over: Partial<ProjectionInputs> = {}): ProjectionInputs {
  return {
    av: 98,
    inactiveList: false,
    teamNonQbRush: 25,
    carryShare: 0.6,
    qbRushPressure: 0.15,
    teamDropbacks: 34,
    routeParticipation: 0.45,
    shrunkTPRR: 0.18,
    shrunkCatchRate: 0.8,
    shrunkRecYardsPerReception: 7.5,
    shrunkYPC: 4.5,
    pointsPerDrive: 2.1,
    goalLineShare: 0.6,
    redZoneShare: 0.55,
    workloadRamp: 1.0,
    expectedGamesRemaining: 10,
    scoring: DEFAULT_SCORING,
    ...over,
  };
}
const base = (): RBMVPInput => loadFixture('elite-bell-cow');

describe('§26.16.5 ROS ramp', () => {
  it('1. healthy player at ramp 1.00 uses the same active-game expectation throughout ROS', () => {
    const p = projInput({ workloadRamp: 1.0 });
    const proj = computeProjections(p);
    // current == full, so ROS = eagr × full_fp.
    expect(proj.rosEFO).toBeCloseTo(
      proj.expectedActiveGamesRemaining * proj.fullWorkloadActiveGame.activeGameFantasyPoints,
      8,
    );
  });

  it('2/3. injury-return uses reduced ramp for the first game only; later games full', () => {
    const p = projInput({ av: 68, workloadRamp: 0.72 });
    const proj = computeProjections(p);
    const eagr = proj.expectedActiveGamesRemaining;
    const first = Math.min(eagr, 1);
    const later = Math.max(eagr - first, 0);
    const expected =
      first * proj.currentActiveGame.activeGameFantasyPoints +
      later * proj.fullWorkloadActiveGame.activeGameFantasyPoints;
    expect(proj.rosEFO).toBeCloseTo(expected, 8);
    // The reduced first game is strictly worse than a full first game.
    expect(proj.currentActiveGame.activeGameFantasyPoints).toBeLessThan(
      proj.fullWorkloadActiveGame.activeGameFantasyPoints,
    );
  });

  it('4. OUT/IR/PUP/SUSPENDED produce zero Weekly and ROS EFO', () => {
    for (const status of ['OUT', 'IR', 'PUP', 'SUSPENDED'] as const) {
      const i = base();
      i.injury_status = status;
      const o = evaluateRunningBack(i);
      expect(o.weekly.expected_fantasy_points).toBe(0);
      expect(o.weekly.expected_carries).toBe(0);
      expect(o.ros.expected_active_games).toBe(0);
      expect(o.ros.expected_fantasy_points).toBe(0);
    }
  });

  it('5. expected active games ≤ 0 produce ROS EFO of zero', () => {
    const proj = computeProjections(projInput({ expectedGamesRemaining: 0 }));
    expect(proj.rosEFO).toBe(0);
  });
});

describe('§26.16.6 conditional stats', () => {
  it('1/2. conditional carries are unchanged when only Pactive changes; Weekly EFO scales with Pactive', () => {
    const healthy = base();
    healthy.injury_status = 'HEALTHY';
    healthy.workload_ramp_factor = 1.0;
    const quest = base();
    quest.injury_status = 'QUESTIONABLE';
    quest.practice_status = 'FULL'; // AV 85, still ramp 1.0 (explicit)
    quest.workload_ramp_factor = 1.0;

    const a = evaluateRunningBack(healthy);
    const b = evaluateRunningBack(quest);
    expect(b.weekly.expected_carries).toBe(a.weekly.expected_carries);
    expect(b.weekly.probability_active).toBeLessThan(a.weekly.probability_active);
    expect(b.weekly.expected_fantasy_points).toBeLessThan(a.weekly.expected_fantasy_points);
  });

  it('3. workload ramp changes conditional weekly statistics', () => {
    const full = evaluateRunningBack({ ...base(), workload_ramp_factor: 1.0 });
    const half = evaluateRunningBack({ ...base(), workload_ramp_factor: 0.5 });
    expect(half.weekly.expected_carries).toBeLessThan(full.weekly.expected_carries);
    expect(half.weekly.expected_routes).toBeLessThan(full.weekly.expected_routes);
  });

  it('4. Pactive is applied exactly once (weekly EFO = Pactive × current active-game fp)', () => {
    const p = projInput({ av: 85, workloadRamp: 0.9 });
    const proj = computeProjections(p);
    expect(proj.weeklyEFO).toBeCloseTo(
      (p.av / 100) * proj.currentActiveGame.activeGameFantasyPoints,
      10,
    );
  });

  it('5. weekly conditional stats equal the current-ramp active-game calculation', () => {
    const p = projInput({ workloadRamp: 0.8 });
    const proj = computeProjections(p);
    const direct = calculateActiveGame(p, 0.8);
    expect(proj.currentActiveGame).toEqual(direct);
  });
});

describe('§10.6 projection monotonicity', () => {
  const carries = (i: RBMVPInput) => evaluateRunningBack(i).weekly.expected_carries;
  const targets = (i: RBMVPInput) => evaluateRunningBack(i).weekly.expected_targets;
  const receptions = (i: RBMVPInput) => evaluateRunningBack(i).weekly.expected_receptions;
  const rushYds = (i: RBMVPInput) => evaluateRunningBack(i).weekly.expected_rushing_yards;
  const rushTD = (i: RBMVPInput) => evaluateRunningBack(i).weekly.expected_rushing_touchdowns;
  const routes = (i: RBMVPInput) => evaluateRunningBack(i).weekly.expected_routes;

  it('higher carry share raises carries', () => {
    expect(carries({ ...base(), carry_share_last4: 0.75 })).toBeGreaterThan(
      carries({ ...base(), carry_share_last4: 0.4 }),
    );
  });

  it('higher route participation raises routes and targets', () => {
    const hi = { ...base(), route_participation_last4: 0.68 };
    const lo = { ...base(), route_participation_last4: 0.3 };
    expect(routes(hi)).toBeGreaterThan(routes(lo));
    expect(targets(hi)).toBeGreaterThan(targets(lo));
  });

  it('higher TPRR raises targets', () => {
    expect(targets({ ...base(), targets_per_route_run: 0.28, career_targets_per_route_run: 0.28 })).toBeGreaterThan(
      targets({ ...base(), targets_per_route_run: 0.1, career_targets_per_route_run: 0.1 }),
    );
  });

  it('higher catch rate raises receptions', () => {
    expect(receptions({ ...base(), catch_rate: 0.9, career_catch_rate: 0.9 })).toBeGreaterThan(
      receptions({ ...base(), catch_rate: 0.6, career_catch_rate: 0.6 }),
    );
  });

  it('higher YPC raises rushing yards within the effective cap', () => {
    expect(rushYds({ ...base(), yards_per_carry: 5.5, career_yards_per_carry: 5.5 })).toBeGreaterThan(
      rushYds({ ...base(), yards_per_carry: 3.2, career_yards_per_carry: 3.2 }),
    );
  });

  it('higher goal-line share raises rushing TD expectation', () => {
    expect(rushTD({ ...base(), goal_line_carry_share: 0.9 })).toBeGreaterThan(
      rushTD({ ...base(), goal_line_carry_share: 0.1 }),
    );
  });

  it('§26.16.1.7 higher QB rush pressure reduces carries and rushing TDs', () => {
    const hi = { ...base(), qb_rush_pressure: 0.7 };
    const lo = { ...base(), qb_rush_pressure: 0.1 };
    expect(carries(hi)).toBeLessThan(carries(lo));
    expect(rushTD(hi)).toBeLessThan(rushTD(lo));
  });

  it('§26.16.1.5 a high-YPC reserve stays below an otherwise identical lead back (workload gates EFO)', () => {
    const lead = base();
    lead.carry_share_last4 = 0.72;
    lead.snap_share_last4 = 0.84;
    lead.yards_per_carry = 4.3;
    const reserve = { ...lead, carry_share_last4: 0.12, snap_share_last4: 0.25, yards_per_carry: 5.5 };
    expect(evaluateRunningBack(reserve).weekly.expected_fantasy_points).toBeLessThan(
      evaluateRunningBack(lead).weekly.expected_fantasy_points,
    );
  });
});
