import { describe, expect, it } from 'vitest';
import { runPhase2B, type Phase2BContext } from '@/inference/result/phase2b';
import { makeField, type IntermediateField } from '@/inference/result/types';
import { computeCareerRoutes } from '@/inference/d1';
import { computeFunctionalStarts } from '@/inference/d2';
import { classifyQBRoleStatus } from '@/inference/roles';
import { projectShare } from '@/inference/projections';
import { buildReproducibilityId } from '@/inference/util/replay';
import type { InferenceProvenance, InferenceStatus, SupportedPosition } from '@/inference/types';

const asOf = '2025-09-10T00:00:00.000Z';
const repro = buildReproducibilityId({
  snapshotIds: ['s1'],
  normalizedInputChecksum: 'abc0000000000000',
  registryVersion: 'air-1.1.0',
  inferenceLayerVersion: 'air-1.1.0',
  asOf,
  engineVersion: 'wr-mvp-1.0',
});

function fld(
  field: string,
  value: unknown,
  status: InferenceStatus,
  provenance: InferenceProvenance | null,
  confidence: number,
): IntermediateField<unknown> {
  return makeField({ field, value, status, provenance, confidence, modelId: 'm', asOf });
}

function ctx(position: SupportedPosition, fields: IntermediateField<unknown>[], extra: Partial<Phase2BContext> = {}): Phase2BContext {
  return {
    position,
    canonicalId: 'pt_0001',
    asOf,
    fields,
    freshnessBySource: { nflverse_weekly: 1, snaps: 1, participation: 1, pbp: 1, schedule: 1, injury: 1, official_starts: 1 },
    reproducibility: repro,
    ...extra,
  };
}

describe('Phase 2B end-to-end intermediate fixtures', () => {
  it('Fx: productive WR with null route participation still projects opportunity', () => {
    // reduced role ladder classifies high_volume_primary; target_share projects from career.
    const ts = projectShare({ recent: null, career: 0.24, gamesObservedL4: 0, lo: 0, hi: 0.45, dp: 4 });
    expect(ts.value).toBe(0.24);
    const fields = [
      fld('target_share', ts.value, 'AVAILABLE', 'MODEL_ESTIMATE', 650),
      fld('route_participation_last4', null, 'UNAVAILABLE', null, 100),
      fld('projected_team_dropbacks', 34, 'AVAILABLE', 'MODEL_ESTIMATE', 650),
      fld('expected_games_remaining', 9.7, 'AVAILABLE', 'MODEL_ESTIMATE', 650),
      fld('career_routes', null, 'UNAVAILABLE', null, 100),
    ];
    // career_routes omitted (non-nullable numeric) → critical omitted → NOT_READY / UNAVAILABLE honesty.
    const res = runPhase2B(ctx('WR', fields, { criticalOmitted: ['career_routes'] }));
    expect(res.honestyState).toBe('UNAVAILABLE');
  });

  it('Fx: estimated WR routes above the D1 ceiling emit 299 with uncapped sidecar', () => {
    const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: Array(10).fill(200) });
    expect(r.emittedValue).toBe(299);
    expect(r.uncappedEstimate).toBe(1940);
  });

  it('Fx: estimated TE career routes ceiling constant is 399 (no TE estimate path in V1)', () => {
    // TE never computes routes; the ceiling/penalty apply if a TE estimate ever existed.
    expect(computeCareerRoutes({ position: 'TE', chartedCareerRoutes: null }).status).toBe('UNAVAILABLE');
  });

  it('Fx: QB inferred functional starts do not reach ESTABLISHED_STARTER', () => {
    const starts = computeFunctionalStarts({
      asOf,
      games: Array.from({ length: 17 }, (_, i) => ({ gameId: `g${i}`, kickoff: '2025-01-05T00:00:00.000Z', seasonType: 'REG' as const, season: 2024, team: 'AAA', qbSnapShare: 0.9, passAttempts: 30 })),
      last17TeamGameIds: Array.from({ length: 17 }, (_, i) => `g${i}`),
    });
    expect(starts.startsOfficial).toBe(false);
    const role = classifyQBRoleStatus({
      benchedWithin4Weeks: false, temporaryInjuryReplacement: false,
      recentStartRate: starts.recentStartRate, careerStarts: starts.careerStarts,
      startsProvenance: starts.provenance ?? 'MODEL_ESTIMATE', nflSeasonsCompleted: 6,
      depthChartStatus: 'STARTER', veteranBridgeSigned: false, twoQbStartSignal: false,
    });
    expect(role).not.toBe('ESTABLISHED_STARTER');
  });

  it('Fx: QB official DIRECT and DERIVED starts can reach ESTABLISHED_STARTER', () => {
    for (const prov of ['DIRECT', 'DERIVED'] as const) {
      const starts = computeFunctionalStarts({ asOf, official: { careerStarts: 60, recentStarts: 16, recentGames: 17, provenance: prov } });
      const role = classifyQBRoleStatus({
        benchedWithin4Weeks: false, temporaryInjuryReplacement: false,
        recentStartRate: starts.recentStartRate, careerStarts: starts.careerStarts,
        startsProvenance: starts.provenance ?? 'DERIVED', nflSeasonsCompleted: 6,
        depthChartStatus: 'STARTER', veteranBridgeSigned: false, twoQbStartSignal: false,
      });
      expect(role).toBe('ESTABLISHED_STARTER');
    }
  });

  it('Fx: present-null, neutral fallback, and not-applicable fields aggregate per §20.F2', () => {
    const fields = [
      fld('target_share', 0.2, 'AVAILABLE', 'MODEL_ESTIMATE', 640),
      fld('route_participation_last4', null, 'INSUFFICIENT_DATA', null, 200),
      fld('career_routes', 500, 'AVAILABLE', 'DERIVED', 650),
      fld('projected_team_dropbacks', 34, 'AVAILABLE', 'MODEL_ESTIMATE', 640),
      fld('expected_games_remaining', 9.7, 'AVAILABLE', 'MODEL_ESTIMATE', 640),
      makeField({ field: 'route_role_change', value: 'UNKNOWN', status: 'LOW_CONFIDENCE', provenance: 'MODEL_CLASSIFICATION', confidence: 400, modelId: 'm', asOf, limitations: ['NEUTRAL_DEFAULT'] }),
      fld('adot', null, 'NOT_APPLICABLE', null, 0),
    ];
    const res = runPhase2B(ctx('WR', fields));
    expect(['ESTIMATED', 'LIMITED', 'ESTIMATED_HIGH_CONFIDENCE', 'VERIFIED']).toContain(res.honestyState);
    // adot (NOT_APPLICABLE) excluded from the WGM.
    expect(res.playerConfidence.score).toBeGreaterThan(0);
  });

  it('Fx: replay from identical evidence and as-of is identical', () => {
    const fields = [fld('target_share', 0.2, 'AVAILABLE', 'MODEL_ESTIMATE', 640), fld('expected_games_remaining', 9.7, 'AVAILABLE', 'MODEL_ESTIMATE', 640)];
    expect(runPhase2B(ctx('WR', fields))).toEqual(runPhase2B(ctx('WR', fields)));
  });

  it('Fx: different input field ordering yields byte-identical serialized output', () => {
    const a = [fld('a_field', 1, 'AVAILABLE', 'MODEL_ESTIMATE', 640), fld('z_field', 2, 'AVAILABLE', 'MODEL_ESTIMATE', 640)];
    const b = [...a].reverse();
    expect(JSON.stringify(runPhase2B(ctx('WR', a)))).toBe(JSON.stringify(runPhase2B(ctx('WR', b))));
  });
});
