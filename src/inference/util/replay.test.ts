import { describe, expect, it } from 'vitest';
import { buildReproducibilityId, enforceAsOf, withinAsOf } from '@/inference/util/replay';

describe('replay helpers (SPEC §25.1 / §18.2)', () => {
  const asOf = '2025-10-01T00:00:00.000Z';

  it('withinAsOf is inclusive of the cutoff', () => {
    expect(withinAsOf(asOf, asOf)).toBe(true);
    expect(withinAsOf(asOf, '2025-09-30T00:00:00.000Z')).toBe(true);
    expect(withinAsOf(asOf, '2025-10-02T00:00:00.000Z')).toBe(false);
  });

  it('enforceAsOf drops future facts and preserves order', () => {
    const facts = [
      { sourceTimestamp: '2025-09-01T00:00:00.000Z', id: 'a' },
      { sourceTimestamp: '2025-10-02T00:00:00.000Z', id: 'future' },
      { sourceTimestamp: '2025-09-15T00:00:00.000Z', id: 'b' },
    ];
    expect(enforceAsOf(facts, asOf).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('buildReproducibilityId sorts snapshot ids and carries versions', () => {
    const id = buildReproducibilityId({
      snapshotIds: ['s2', 's1'],
      normalizedInputChecksum: 'abc',
      registryVersion: 'air-1.1.0',
      inferenceLayerVersion: 'air-1.1.0',
      asOf,
      engineVersion: 'wr-mvp-1.0',
    });
    expect(id.snapshotIds).toEqual(['s1', 's2']);
    expect(id.registryVersion).toBe('air-1.1.0');
  });
});
