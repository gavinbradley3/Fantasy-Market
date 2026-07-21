import { describe, expect, it } from 'vitest';
import { emissionDecision, type FieldKind } from '@/inference/readiness/integration';
import type { InferenceStatus } from '@/inference/types';

describe('emission matrix (REGISTRY §20.F3)', () => {
  const kinds: FieldKind[] = ['nullable', 'nonNullableNumeric', 'enumNeutral', 'boolDefault'];

  it('emits present-value for AVAILABLE and LOW_CONFIDENCE across all kinds', () => {
    for (const status of ['AVAILABLE', 'LOW_CONFIDENCE'] as InferenceStatus[]) {
      for (const kind of kinds) {
        expect(emissionDecision(status, kind)).toBe('present-value');
      }
    }
  });

  it('handles the non-evaluable statuses per kind', () => {
    for (const status of [
      'INSUFFICIENT_DATA',
      'UNAVAILABLE',
      'NOT_APPLICABLE',
    ] as InferenceStatus[]) {
      expect(emissionDecision(status, 'nullable')).toBe('present-null');
      expect(emissionDecision(status, 'nonNullableNumeric')).toBe('omit');
      expect(emissionDecision(status, 'enumNeutral')).toBe('present-value');
      expect(emissionDecision(status, 'boolDefault')).toBe('present-value');
    }
  });

  it('REGISTRY §22 Fx3: enum keeps the player evaluable, numeric omit → NOT_READY', () => {
    // enum with authorized neutral → present (readiness satisfied)
    expect(emissionDecision('INSUFFICIENT_DATA', 'enumNeutral')).toBe('present-value');
    // non-nullable numeric that cannot be estimated → omitted (readiness fails)
    expect(emissionDecision('UNAVAILABLE', 'nonNullableNumeric')).toBe('omit');
  });
});
