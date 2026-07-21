import { describe, expect, it } from 'vitest';
import {
  computeCareerRoutes,
  rbRouteParticipationLast4,
  routeTierPenalty,
} from '@/inference/d1/routeExposure';
import { LIMITATION_CODES } from '@/inference/types';

describe('D1 effective route exposure (REGISTRY §8)', () => {
  it('WR authorized proxy below the cap (PROXY, ×0.97)', () => {
    const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [50, 50, 50] });
    expect(r.provenance).toBe('PROXY');
    expect(r.emittedValue).toBe(146); // round(3*50*0.97)=146
    expect(r.uncappedEstimate).toBe(146);
    expect(r.routeProxyPenalty).toBe(120);
    expect(r.limitations).toContain(LIMITATION_CODES.ROUTE_PROXY);
  });

  it('WR estimate above the cap emits 299; sidecar keeps the uncapped value; tier penalty uses capped', () => {
    const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: Array(10).fill(200) });
    expect(r.emittedValue).toBe(299); // capped
    expect(r.uncappedEstimate).toBe(1940); // round(10*200*0.97)
    expect(r.tierPenalty).toBe(80); // 100-299 tier — engine low-exposure penalty stays in force
  });

  it('WR uncovered pbp component makes it a MODEL_ESTIMATE', () => {
    const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [50, 50], wrUncoveredPassPlaySnaps: [60] });
    expect(r.provenance).toBe('MODEL_ESTIMATE');
  });

  it('WR with < 3 covered games → UNAVAILABLE', () => {
    const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [50, 50] });
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.emittedValue).toBeNull();
  });

  it('direct charted routes → DERIVED and may exceed the ceiling', () => {
    const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: 1500 });
    expect(r.provenance).toBe('DERIVED');
    expect(r.emittedValue).toBe(1500);
    expect(r.routeProxyPenalty).toBe(0);
    expect(r.tierPenalty).toBe(0); // ≥300 → no tier penalty (real charted data)
  });

  it('guardrail: WR factor never leaks to RB or TE (no estimate path)', () => {
    // RB/TE ignore WR covered data → UNAVAILABLE unless charted.
    expect(computeCareerRoutes({ position: 'RB', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [50, 50, 50] }).status).toBe('UNAVAILABLE');
    expect(computeCareerRoutes({ position: 'TE', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [50, 50, 50] }).status).toBe('UNAVAILABLE');
  });

  it('TE charted uses TE tier ceiling penalties (§8.2)', () => {
    expect(routeTierPenalty('TE', 399)).toBe(60);
    expect(routeTierPenalty('TE', 400)).toBe(0);
    expect(routeTierPenalty('WR', 99)).toBe(150);
    expect(routeTierPenalty('WR', 100)).toBe(80);
  });

  it('RB route_participation_last4 uses the RB 0.42 factor only (never 0.97)', () => {
    // 0.42 * (30/40) = 0.315
    expect(rbRouteParticipationLast4(30, 40)).toBe(0.315);
    expect(rbRouteParticipationLast4(30, 0)).toBeNull(); // zero denominator
    expect(rbRouteParticipationLast4(null, 40)).toBeNull();
  });

  it('no estimated route value can remove the engine low-exposure penalty', () => {
    // Any WR estimate is capped ≤ 299 → tier penalty is always ≥ 80 (never 0).
    for (const n of [3, 5, 10, 50]) {
      const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: Array(n).fill(300) });
      expect(r.emittedValue).toBeLessThanOrEqual(299);
      expect(r.tierPenalty).toBeGreaterThanOrEqual(80);
    }
  });
});
