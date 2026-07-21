import { describe, expect, it } from 'vitest';
import {
  classifyQBDepthChartStatus,
  classifyQBRoleStatus,
  classifyRBRole,
  classifyTEDepthChartRole,
  classifyTEProspectType,
  classifyTERole,
  classifyWRRole,
  type QBRoleSignals,
} from '@/inference/roles/roles';

const ev = { gamesObservedL4: 4, preseasonPriorAvailable: false };

describe('WR role ladder (REGISTRY §3.1 / §20.F4)', () => {
  it('full-signal alpha_x', () => {
    expect(classifyWRRole({ ...ev, routePartL4: 0.9, targetShare: 0.26, adot: 12 }).klass).toBe('alpha_x');
  });
  it('first-match tie: rule 1 wins at exact thresholds', () => {
    expect(classifyWRRole({ ...ev, routePartL4: 0.85, targetShare: 0.24, adot: 10 }).klass).toBe('alpha_x');
    expect(classifyWRRole({ ...ev, routePartL4: 0.75, targetShare: 0.2, adot: 10 }).klass).toBe('high_volume_primary');
  });
  it('reduced ladder: strong target share with null route → high_volume_primary (Fx4), reduced flag set', () => {
    const res = classifyWRRole({ ...ev, routePartL4: null, targetShare: 0.26, adot: 12 });
    expect(res.klass).toBe('high_volume_primary');
    expect(res.reduced).toBe(true);
  });
  it('null predicate evaluates false → catch-all', () => {
    const res = classifyWRRole({ ...ev, routePartL4: null, targetShare: 0.05, adot: null });
    expect(res.klass).toBe('uncertain');
    expect(res.catchall).toBe(true);
  });
  it('minimum-evidence gate failure → uncertain, minEvidenceMet false', () => {
    const res = classifyWRRole({ gamesObservedL4: 0, preseasonPriorAvailable: false, routePartL4: 0.9, targetShare: 0.3, adot: 12 });
    expect(res.minEvidenceMet).toBe(false);
    expect(res.klass).toBe('uncertain');
  });
});

describe('RB role ladder (REGISTRY §3.2)', () => {
  it('lead_back full-signal', () => {
    expect(classifyRBRole({ ...ev, snapShareL4: 0.7, carryShareL4: 0.65, routePartL4: 0.4, goalLineCarryShare: 0.3 }).klass).toBe('lead_back');
  });
  it('receiving_back needs route participation (skipped when null → reduced)', () => {
    expect(classifyRBRole({ ...ev, snapShareL4: 0.4, carryShareL4: 0.3, routePartL4: 0.6, goalLineCarryShare: 0 }).klass).toBe('receiving_back');
    const reduced = classifyRBRole({ ...ev, snapShareL4: 0.4, carryShareL4: 0.3, routePartL4: null, goalLineCarryShare: 0 });
    expect(reduced.reduced).toBe(true);
    expect(reduced.klass).not.toBe('receiving_back');
  });
});

describe('TE role ladder + prospect_type + depth_chart_role (REGISTRY §3.3)', () => {
  it('primary_receiving full-signal', () => {
    expect(classifyTERole({ ...ev, routePartL4: 0.85, snapShareL4: 0.8, targetShare: 0.2 }).klass).toBe('primary_receiving');
  });
  it('reduced ladder (route null) → every_down_starter', () => {
    const res = classifyTERole({ ...ev, routePartL4: null, snapShareL4: 0.8, targetShare: 0.16 });
    expect(res.klass).toBe('every_down_starter');
    expect(res.reduced).toBe(true);
  });
  it('depth_chart_role ranks by snap share', () => {
    expect(classifyTEDepthChartRole(0.7, [0.5, 0.3])).toBe('TE1');
    expect(classifyTEDepthChartRole(0.5, [0.8])).toBe('TE2');
    expect(classifyTEDepthChartRole(null, [0.8])).toBe('UNKNOWN');
  });
  it('prospect_type receiving vs unknown', () => {
    expect(classifyTEProspectType({ careerRoutes: 500, snapShareL4: 0.85, routePartL4: 0.8, tprr: 0.2 })).toBe('RECEIVING');
    expect(classifyTEProspectType({ careerRoutes: 50, snapShareL4: 0.85, routePartL4: 0.8, tprr: 0.2 })).toBe('UNKNOWN');
  });
});

describe('QB role_status + depth_chart_status (REGISTRY §3.4, D2 guardrail)', () => {
  const base: QBRoleSignals = {
    benchedWithin4Weeks: false,
    temporaryInjuryReplacement: false,
    recentStartRate: 0.94,
    careerStarts: 60,
    startsProvenance: 'DERIVED',
    nflSeasonsCompleted: 6,
    depthChartStatus: 'STARTER',
    veteranBridgeSigned: false,
    twoQbStartSignal: false,
  };
  it('official starts reach ESTABLISHED_STARTER', () => {
    expect(classifyQBRoleStatus(base)).toBe('ESTABLISHED_STARTER');
  });
  it('inferred starts (MODEL_ESTIMATE) cannot reach ESTABLISHED_STARTER (Fx8 / D2 guardrail)', () => {
    expect(classifyQBRoleStatus({ ...base, startsProvenance: 'MODEL_ESTIMATE' })).not.toBe('ESTABLISHED_STARTER');
  });
  it('benched event wins first (rule 1)', () => {
    expect(classifyQBRoleStatus({ ...base, benchedWithin4Weeks: true })).toBe('RECENTLY_BENCHED');
  });
  it('depth chart status from snaps', () => {
    expect(classifyQBDepthChartStatus({ hasTeam: true, practiceSquad: false, lastGameSnapShare: 0.9, secondQbSnapShare: 0.05 })).toBe('STARTER');
    expect(classifyQBDepthChartStatus({ hasTeam: false, practiceSquad: false, lastGameSnapShare: null, secondQbSnapShare: null })).toBe('FREE_AGENT');
  });
});
