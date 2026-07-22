import { describe, expect, it } from 'vitest';
import { emitSupplement } from '@/inference/production/emit';
import { makeField, neutralField, type IntermediateField } from '@/inference/result/types';
import type { InferenceProvenance, InferenceStatus } from '@/inference/types';

const asOf = '2025-09-10T00:00:00.000Z';
function f(field: string, value: unknown, status: InferenceStatus, provenance: InferenceProvenance | null = 'MODEL_ESTIMATE'): IntermediateField<unknown> {
  return makeField({ field, value, status, provenance, confidence: 640, modelId: 'm', asOf });
}

describe('final supplement emission (REGISTRY §12 / §20.F3)', () => {
  it('emits values for AVAILABLE and LOW_CONFIDENCE', () => {
    const r = emitSupplement('WR', [f('target_share', 0.2, 'AVAILABLE'), f('competition_pressure', 0.4, 'LOW_CONFIDENCE')]);
    expect(r.supplement.target_share).toBe(0.2);
    expect(r.supplement.competition_pressure).toBe(0.4);
  });

  it('nullable INSUFFICIENT/UNAVAILABLE → present-null', () => {
    const r = emitSupplement('WR', [f('average_depth_of_target', null, 'INSUFFICIENT_DATA', null)]);
    expect('average_depth_of_target' in r.supplement).toBe(true);
    expect(r.supplement.average_depth_of_target).toBeNull();
  });

  it('non-nullable numeric that cannot be estimated → omitted', () => {
    const r = emitSupplement('WR', [f('career_routes', null, 'UNAVAILABLE', null)]);
    expect('career_routes' in r.supplement).toBe(false);
    expect(r.omitted).toContain('career_routes');
  });

  it('authorized neutral enum fallback → present neutral member', () => {
    const r = emitSupplement('WR', [neutralField('route_role_change', 'UNKNOWN', 'm', asOf)]);
    expect(r.supplement.route_role_change).toBe('UNKNOWN');
    // and an INSUFFICIENT enum also resolves to the neutral member
    const r2 = emitSupplement('WR', [f('practice_status', null, 'INSUFFICIENT_DATA', null)]);
    expect(r2.supplement.practice_status).toBe('UNKNOWN');
  });

  it('authorized boolean default → false when unavailable (RB)', () => {
    const r = emitSupplement('RB', [f('teammate_return_flag', null, 'INSUFFICIENT_DATA', null)]);
    expect(r.supplement.teammate_return_flag).toBe(false);
  });

  it('NOT_APPLICABLE nullable → present-null', () => {
    const r = emitSupplement('WR', [f('average_depth_of_target', null, 'NOT_APPLICABLE', null)]);
    expect(r.supplement.average_depth_of_target).toBeNull();
  });

  it('metadata fields are never emitted as supplement fields', () => {
    const r = emitSupplement('WR', [f('player_id', 'pt_1', 'AVAILABLE'), f('injury_status', 'HEALTHY', 'AVAILABLE')]);
    expect('player_id' in r.supplement).toBe(false);
    expect('injury_status' in r.supplement).toBe(false);
  });
});
