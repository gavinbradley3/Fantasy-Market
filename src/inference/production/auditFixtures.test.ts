// Independent cold-audit fixtures converted to permanent regression tests. Each value
// was reproduced BY HAND in AUTOMATED_INFERENCE_LAYER_COLD_AUDIT_R2.md and is fixed by
// the current registry (air-1.1.0). Test names cite the governing registry section.

import { describe, expect, it } from 'vitest';
import { digest } from '@/pipeline/hash';
import { CANONICAL_ENV_REFERENCE_JSON } from '@/inference/registry/envReference';
import { componentPercentile } from '@/inference/environment/environment';
import { expectedGamesRemaining } from '@/inference/availability/expectedGames';
import { computeCareerRoutes, routeTierPenalty } from '@/inference/d1/routeExposure';
import { classifyQBRoleStatus } from '@/inference/roles/roles';
import { buildPlayerConfidence } from '@/inference/confidence/playerConfidence';
import { computePublicConfidence } from '@/inference/confidence/publicConfidence';
import { makeField } from '@/inference/result/types';

const T = '2026-07-01T00:00:00.000Z';

describe('Cold-audit independent fixtures (registry-fixed values)', () => {
  it('§21 env reference checksum reproduces a1b95e93d706e130', () => {
    expect(digest(CANONICAL_ENV_REFERENCE_JSON)).toBe('a1b95e93d706e130');
  });

  it('§22 Fx1: pct(2.05, team_points_per_drive) = 53.125', () => {
    expect(componentPercentile('team_points_per_drive', 2.05)).toBe(53.125);
  });

  it('§20.F6 Fx6: known 2-game suspension, 9 left, durability 1.0 → 6.8', () => {
    const r = expectedGamesRemaining({ gamesLeft: 9, availProb: 0.97, missedRateLast16: 0, suspension: { suspended: true, remainingSuspendedGames: 2 } });
    expect(r.expectedGamesRemaining).toBe(6.8);
  });

  it('§8.4 Fx7: WR estimate 1940 → emitted 299 (capped); tier penalty on capped value = 80; proxy 120', () => {
    const r = computeCareerRoutes({ position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [500, 500, 500, 500] });
    expect(r.uncappedEstimate).toBe(1940);
    expect(r.emittedValue).toBe(299);
    expect(r.provenance).toBe('PROXY');
    expect(r.tierPenalty).toBe(80);
    expect(r.routeProxyPenalty).toBe(120);
    expect(routeTierPenalty('WR', 299)).toBe(80);
  });

  it('§8.1 D1: RB and TE never compute career_routes (UNAVAILABLE)', () => {
    expect(computeCareerRoutes({ position: 'RB', chartedCareerRoutes: null }).status).toBe('UNAVAILABLE');
    expect(computeCareerRoutes({ position: 'TE', chartedCareerRoutes: null }).status).toBe('UNAVAILABLE');
  });

  it('§3.4/§23.4 Fx8: inferred starts → not ESTABLISHED; official (DERIVED) → ESTABLISHED', () => {
    const common = { benchedWithin4Weeks: false, temporaryInjuryReplacement: false, recentStartRate: 0.94, careerStarts: 60, nflSeasonsCompleted: 8, depthChartStatus: 'STARTER' as const, veteranBridgeSigned: false, twoQbStartSignal: false };
    expect(classifyQBRoleStatus({ ...common, startsProvenance: 'MODEL_ESTIMATE' })).not.toBe('ESTABLISHED_STARTER');
    expect(classifyQBRoleStatus({ ...common, startsProvenance: 'DERIVED' })).toBe('ESTABLISHED_STARTER');
  });

  it('§11.1 player WGM: {target_share@700 crit, adot@INSUFFICIENT} → 512', () => {
    const fields = [
      makeField<number>({ field: 'target_share', value: 0.2, status: 'AVAILABLE', provenance: 'MODEL_ESTIMATE', confidence: 700, modelId: 'm', asOf: T }),
      makeField<number>({ field: 'average_depth_of_target', value: null, status: 'INSUFFICIENT_DATA', provenance: null, confidence: 0, modelId: 'm', asOf: T }),
    ];
    const pc = buildPlayerConfidence(fields, 'WR');
    expect(pc.weakestCritical).toBe(700);
    expect(pc.score).toBe(512); // min(round(exp((3ln700+ln200)/4)), 700) = min(512,700)
  });

  it('§11.3 public confidence: conf 700, verified 0.5, source 1.0, engine 0.8 → 47', () => {
    const r = computePublicConfidence({ playerConfidence: 700, verifiedShare: 0.5, sourceQualityFactor: 1.0, engineConfidence01: 0.8 });
    expect(r.coverageFactor).toBeCloseTo(0.75, 10);
    expect(r.qualityFactor).toBeCloseTo(0.79, 10);
    expect(r.publicConfidence).toBe(47);
  });

  it('m1: a cosmetic boolean flag carries the minor (0.5) weight, not standard (1.0)', () => {
    // Same critical field + same low-confidence companion at conf 100. When the
    // companion is a cosmetic flag (minor 0.5) it drags the WGM LESS than when it is a
    // standard-weight field (1.0). If the flag weight were (incorrectly) 1.0 the two
    // scores would be EQUAL. flag > standard proves the 0.5 weight (Cold-audit m1).
    const crit = makeField<number>({ field: 'target_share', value: 0.2, status: 'AVAILABLE', provenance: 'MODEL_ESTIMATE', confidence: 700, modelId: 'm', asOf: T });
    const flagField = makeField<boolean>({ field: 'teammate_return_flag', value: false, status: 'AVAILABLE', provenance: 'MODEL_CLASSIFICATION', confidence: 100, modelId: 'm', asOf: T });
    const stdField = makeField<number>({ field: 'catch_rate', value: 0.6, status: 'AVAILABLE', provenance: 'MODEL_ESTIMATE', confidence: 100, modelId: 'm', asOf: T });
    const flagCase = buildPlayerConfidence([crit, flagField], 'WR');
    const stdCase = buildPlayerConfidence([crit, stdField], 'WR');
    expect(flagCase.score).toBeGreaterThan(stdCase.score); // minor 0.5 < standard 1.0
  });
});
