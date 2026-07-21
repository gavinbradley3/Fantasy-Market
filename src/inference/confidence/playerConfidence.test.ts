import { describe, expect, it } from 'vitest';
import { buildPlayerConfidence, membershipConfidence } from '@/inference/confidence/playerConfidence';
import { makeField, neutralField, type IntermediateField } from '@/inference/result/types';

function f(field: string, status: IntermediateField<unknown>['status'], confidence: number, provenance: IntermediateField<unknown>['provenance'] = 'MODEL_ESTIMATE'): IntermediateField<unknown> {
  return makeField({ field, value: 1, status, provenance, confidence, modelId: 'm', asOf: '2025-09-10T00:00:00.000Z' });
}

describe('player confidence membership + aggregation (REGISTRY §11.1/§20.F2)', () => {
  it('membership confidence maps null/neutral statuses to registered values', () => {
    expect(membershipConfidence(f('x', 'INSUFFICIENT_DATA', 0))).toBe(200);
    expect(membershipConfidence(f('x', 'UNAVAILABLE', 0))).toBe(100);
    expect(membershipConfidence(f('x', 'NOT_APPLICABLE', 0))).toBeNull();
    expect(membershipConfidence(neutralField('route_role_change', 'UNKNOWN', 'm', '2025-09-10T00:00:00.000Z'))).toBe(400);
    expect(membershipConfidence(f('x', 'AVAILABLE', 640))).toBe(640);
  });

  it('a low CRITICAL field caps the WGM (weakest-critical)', () => {
    const fields = [
      f('target_share', 'AVAILABLE', 700), // WR critical
      f('expected_games_remaining', 'INSUFFICIENT_DATA', 0), // WR critical → 200
      f('contract_security', 'AVAILABLE', 700), // non-critical
    ];
    const r = buildPlayerConfidence(fields, 'WR');
    expect(r.weakestCritical).toBe(200);
    expect(r.score).toBe(200);
  });

  it('NOT_APPLICABLE fields are excluded from the aggregate', () => {
    const withNa = buildPlayerConfidence([f('target_share', 'AVAILABLE', 700), f('adot', 'NOT_APPLICABLE', 0)], 'WR');
    const without = buildPlayerConfidence([f('target_share', 'AVAILABLE', 700)], 'WR');
    expect(withNa.score).toBe(without.score);
  });

  it('exact WGM at equal weights', () => {
    // two non-critical fields, conf 900 each → WGM 900
    const r = buildPlayerConfidence([f('previous_a', 'AVAILABLE', 900), f('previous_b', 'AVAILABLE', 900)], 'WR');
    expect(r.wgm).toBe(900);
  });

  it('is deterministic on repeat', () => {
    const fields = [f('target_share', 'AVAILABLE', 700), f('expected_games_remaining', 'AVAILABLE', 650)];
    expect(buildPlayerConfidence(fields, 'WR')).toEqual(buildPlayerConfidence(fields, 'WR'));
  });
});
