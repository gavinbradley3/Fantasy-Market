import { describe, expect, it } from 'vitest';
import { resolveIdentities, type IdentityMap } from '@/pipeline/identity';
import type { ProviderRecord } from '@/pipeline/providers/types';

function rec(partial: Partial<ProviderRecord> & Pick<ProviderRecord, 'provider' | 'providerPlayerId' | 'position'>): ProviderRecord {
  return { crossIds: {}, ...partial };
}

describe('resolveIdentities', () => {
  it('joins records across providers by a shared strong id', () => {
    const records = [
      rec({ provider: 'sleeper', providerPlayerId: '6794', position: 'WR', fullName: 'Ja Marr Chase', crossIds: { sleeper: '6794', gsis: 'G1' } }),
      rec({ provider: 'nflverse', providerPlayerId: 'G1', position: 'WR', fullName: 'Ja Marr Chase', crossIds: { gsis: 'G1', sleeper: '6794' } }),
    ];
    const res = resolveIdentities(records);
    expect(res.clusters).toHaveLength(1);
    expect(res.crossProviderMatches).toBe(1);
    expect(res.clusters[0].records).toHaveLength(2);
    expect(res.clusters[0].identity.provider_ids).toMatchObject({ sleeper: '6794', gsis: 'G1' });
  });

  it('uses a persisted mapping to fix the canonical id', () => {
    const map: IdentityMap = { version: 1, map: { 'sleeper:6794': 'pt_0001' } };
    const records = [rec({ provider: 'sleeper', providerPlayerId: '6794', position: 'WR', fullName: 'Chase', crossIds: { sleeper: '6794' } })];
    const res = resolveIdentities(records, map);
    expect(res.persistedMatches).toBe(1);
    expect(res.clusters[0].identity.canonical_id).toBe('pt_0001');
    expect(res.clusters[0].identity.newly_created).toBe(false);
    expect(res.clusters[0].matchMethod).toBe('PERSISTED_MAP');
  });

  it('mints a deterministic canonical id for a new single-provider player', () => {
    const records = [rec({ provider: 'sleeper', providerPlayerId: '11565', position: 'WR', fullName: 'Malik Nabers', crossIds: { sleeper: '11565' } })];
    const a = resolveIdentities(records);
    const b = resolveIdentities(records);
    expect(a.clusters[0].identity.canonical_id).toBe(b.clusters[0].identity.canonical_id);
    expect(a.clusters[0].identity.canonical_id).toMatch(/^pt-[0-9a-f]+$/);
    expect(a.newIdentities).toBe(1);
    expect(a.clusters[0].matchMethod).toBe('NEW_SINGLE_PROVIDER');
  });

  it('NEVER merges two different players that only share a name', () => {
    const records = [
      rec({ provider: 'sleeper', providerPlayerId: '7056', position: 'WR', fullName: 'Mike Williams', crossIds: { sleeper: '7056', gsis: 'GA' } }),
      rec({ provider: 'nflverse', providerPlayerId: 'GB', position: 'WR', fullName: 'Mike Williams', crossIds: { gsis: 'GB' } }),
    ];
    const res = resolveIdentities(records);
    // Two separate canonical players, not one merged record.
    expect(res.clusters).toHaveLength(2);
    // ...reported as an ambiguous name collision.
    expect(res.nameCollisions).toHaveLength(1);
    expect(res.nameCollisions[0].canonicalIds).toHaveLength(2);
  });

  it('surfaces duplicate canonical ids from an inconsistent map instead of merging silently', () => {
    // Two players with different strong ids both mapped to the same canonical id.
    const map: IdentityMap = { version: 1, map: { 'sleeper:1': 'pt_dup', 'sleeper:2': 'pt_dup' } };
    const records = [
      rec({ provider: 'sleeper', providerPlayerId: '1', position: 'WR', fullName: 'Player One', crossIds: { sleeper: '1' } }),
      rec({ provider: 'sleeper', providerPlayerId: '2', position: 'WR', fullName: 'Player Two', crossIds: { sleeper: '2' } }),
    ];
    const res = resolveIdentities(records, map);
    expect(res.clusters).toHaveLength(2); // not merged
    expect(res.duplicateCanonicalIds).toEqual([{ canonicalId: 'pt_dup', clusterCount: 2 }]);
  });

  it('produces deterministic, sorted cluster order', () => {
    const records = [
      rec({ provider: 'sleeper', providerPlayerId: 'z', position: 'WR', fullName: 'Zed', crossIds: { sleeper: 'z' } }),
      rec({ provider: 'sleeper', providerPlayerId: 'a', position: 'RB', fullName: 'Abe', crossIds: { sleeper: 'a' } }),
    ];
    const ids = resolveIdentities(records).clusters.map((c) => c.identity.canonical_id);
    expect([...ids]).toEqual([...ids].sort());
  });
});
