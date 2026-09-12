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
import { COMPETITION_PRESSURE_BY_QB_ROLE, ROLE_COMMITMENT_BY_QB_ROLE } from '@/inference/registry';

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

// ---------------------------------------------------------------------------
// A CURRENT STARTER IS NOT A BACKUP.
//
// The ladder asked only whether a quarterback's RECORD qualified him for a named rung, never
// whether he holds the job right now. Anyone who failed both credential tests fell through to
// the catch-all — on a production-scale board, 28 of 81 quarterbacks read depth chart STARTER
// and role BACKUP at the same time, and were then valued with a backup's competition pressure
// (0.85) and organizational commitment (0.20).
// ---------------------------------------------------------------------------

describe('QB role: the current-starter rung', () => {
  const starter: QBRoleSignals = {
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

  it('THE INVARIANT: a current depth-chart STARTER never resolves to BACKUP', () => {
    // Swept across every combination of the signals that feed the credential tests. The only
    // states a starter may hold are starter states; BACKUP is reachable only when the depth
    // chart itself says he is not starting.
    for (const recentStartRate of [null, 0, 0.3, 0.5, 0.79, 0.8, 0.89, 0.9, 1]) {
      for (const careerStarts of [null, 0, 5, 47, 48, 200]) {
        for (const nflSeasonsCompleted of [0, 1, 4, 5, 12, 22]) {
          for (const startsProvenance of ['DERIVED', 'MODEL_ESTIMATE'] as const) {
            const role = classifyQBRoleStatus({
              ...starter,
              recentStartRate,
              careerStarts,
              nflSeasonsCompleted,
              startsProvenance,
            });
            expect(
              role,
              `starter with rate=${recentStartRate} starts=${careerStarts} seasons=${nflSeasonsCompleted} resolved to ${role}`,
            ).not.toBe('BACKUP');
          }
        }
      }
    }
  });

  it('names the exceptions that DO outrank a current start record, and their order', () => {
    // The invariant above is "never BACKUP", not "never anything but a starter". Two rules sit
    // ABOVE every credential test, and each names a real event rather than an absence of
    // credentials: a benching, and standing in for an injured starter.
    expect(classifyQBRoleStatus({ ...starter, benchedWithin4Weeks: true })).toBe('RECENTLY_BENCHED');
    expect(classifyQBRoleStatus({ ...starter, temporaryInjuryReplacement: true })).toBe('TEMPORARY_INJURY_REPLACEMENT');
    // COMPETITION sits BELOW the credential rungs, so a two-QB signal does not demote an
    // established starter — it only catches a quarterback the credential tests did not name.
    expect(classifyQBRoleStatus({ ...starter, twoQbStartSignal: true })).toBe('ESTABLISHED_STARTER');
    expect(
      classifyQBRoleStatus({ ...starter, twoQbStartSignal: true, recentStartRate: 0.6, careerStarts: 20, nflSeasonsCompleted: 9 }),
    ).toBe('COMPETITION');
    // And COMPETITION still outranks the new current-starter rung, which is last by design.
  });

  it('established current starter — credentials win, the new rung does not fire', () => {
    expect(classifyQBRoleStatus(starter)).toBe('ESTABLISHED_STARTER');
  });

  it('young current starter — the credentialed young rung still wins', () => {
    expect(
      classifyQBRoleStatus({ ...starter, recentStartRate: 0.85, careerStarts: 14, nflSeasonsCompleted: 2 }),
    ).toBe('YOUNG_COMMITTED_STARTER');
  });

  it('starter with a short career — three starts short of established is not a backup', () => {
    // Brock Purdy: started his last 8 appearances, 45 career starts against a threshold of 48.
    const purdy = classifyQBRoleStatus({ ...starter, recentStartRate: 1, careerStarts: 45, nflSeasonsCompleted: 5 });
    expect(purdy).toBe('BRIDGE_STARTER');
  });

  it('veteran starter with a long career but a broken start rate — still not a backup', () => {
    // Kirk Cousins: 126 career starts, but a recent rate under the 0.9 established bar.
    expect(
      classifyQBRoleStatus({ ...starter, recentStartRate: 0.65, careerStarts: 126, nflSeasonsCompleted: 15 }),
    ).toBe('BRIDGE_STARTER');
  });

  it('a true backup still resolves to BACKUP', () => {
    expect(
      classifyQBRoleStatus({ ...starter, depthChartStatus: 'BACKUP', recentStartRate: 0.1, careerStarts: 3, nflSeasonsCompleted: 7 }),
    ).toBe('BACKUP');
  });

  it('the new rung never outranks a credentialed starter state', () => {
    // BRIDGE_STARTER sits below both ESTABLISHED_STARTER and YOUNG_COMMITTED_STARTER on the
    // competition-pressure and commitment tables, so this rung can only move a player out of
    // BACKUP — never above someone the ladder actually credentialed. Routing young
    // fall-throughs to YOUNG_COMMITTED_STARTER would have handed the model's HIGHEST
    // commitment rating (0.95) to quarterbacks who failed both credential tests.
    expect(classifyQBRoleStatus({ ...starter, recentStartRate: 0.6, careerStarts: 2, nflSeasonsCompleted: 1 })).toBe('BRIDGE_STARTER');
    expect(COMPETITION_PRESSURE_BY_QB_ROLE.BRIDGE_STARTER).toBeGreaterThan(COMPETITION_PRESSURE_BY_QB_ROLE.ESTABLISHED_STARTER!);
    expect(COMPETITION_PRESSURE_BY_QB_ROLE.BRIDGE_STARTER).toBeGreaterThan(COMPETITION_PRESSURE_BY_QB_ROLE.YOUNG_COMMITTED_STARTER!);
    expect(ROLE_COMMITMENT_BY_QB_ROLE.BRIDGE_STARTER).toBeLessThan(ROLE_COMMITMENT_BY_QB_ROLE.ESTABLISHED_STARTER!);
    expect(ROLE_COMMITMENT_BY_QB_ROLE.BRIDGE_STARTER).toBeLessThan(ROLE_COMMITMENT_BY_QB_ROLE.YOUNG_COMMITTED_STARTER!);
    // And it is still a large step up from being called a backup, which is the defect.
    expect(ROLE_COMMITMENT_BY_QB_ROLE.BRIDGE_STARTER).toBeGreaterThan(ROLE_COMMITMENT_BY_QB_ROLE.BACKUP!);
  });
});
