import { describe, expect, it } from 'vitest';
import { loadRegistry, runInference } from '@/inference';

describe('AIL public entry (Phase 1)', () => {
  it('re-exports the registry loader', () => {
    expect(loadRegistry().registryVersion).toBe('air-1.1.0');
  });

  it('runInference is a deferred Phase-2 boundary that throws', () => {
    expect(() =>
      runInference({ asOf: '2025-10-01T00:00:00.000Z', snapshotIds: [] }),
    ).toThrow(/not implemented in Phase 1/);
  });
});
