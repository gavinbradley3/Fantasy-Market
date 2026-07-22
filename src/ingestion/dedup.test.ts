// Correction 2 — canonical player deduplication, deterministic merge, and the
// one-record-per-canonical-id snapshot invariant. Proves provider count and provider
// input order cannot change the canonical player set or its merged fields.

import { describe, expect, it } from 'vitest';
import { ingest } from './buildInput';
import { deduplicateCanonicalPlayers } from './identityMerge';
import { nflverseSource, sleeperSource } from './__fixtures';
import type { PlayerRecord } from './types';
import type { ProviderSource } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import { sleeperAdapter } from './adapters/sleeper';
import { freshness } from './__fixtures';

describe('canonical player deduplication (Correction 2)', () => {
  it('two providers supplying the same player yield ONE canonical player record', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const wr = snapshot.players.filter((p) => p.providerIds.gsis === '00-WR');
    expect(wr.length).toBe(1); // was 2 before the fix (nflverse + sleeper)
  });

  it('snapshot invariant: players hold no duplicate canonical ids', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const ids = snapshot.players.map((p) => p.canonicalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('merged player carries the UNION of provider ids, canonically ordered', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const wr = snapshot.players.find((p) => p.providerIds.gsis === '00-WR')!;
    expect(wr.providerIds).toEqual({ gsis: '00-WR', sleeper: 'S-WR' });
    // keys are canonically (lexicographically) ordered
    expect(Object.keys(wr.providerIds)).toEqual([...Object.keys(wr.providerIds)].sort());
  });

  it('provider-source order does NOT change any merged canonical player record', () => {
    const a = ingest([nflverseSource(), sleeperSource()]).snapshot;
    const b = ingest([sleeperSource(), nflverseSource()]).snapshot;
    expect(JSON.stringify(a.players)).toBe(JSON.stringify(b.players));
    expect(a.snapshotId).toBe(b.snapshotId); // byte-identical snapshot
  });

  it('field merge is order-independent and uses precedence, not input order', () => {
    // Same canonical id (shared gsis), but the two sources disagree on `age`: nflverse
    // has none, sleeper has 27. The union must recover age regardless of order.
    const nfl: ProviderSource = {
      adapter: nflverseAdapter,
      freshness: freshness('nflverse'),
      payloads: { identity: [{ gsis_id: '00-Z', player_name: 'Zed Z', position: 'WR', team: 'CIN' }] },
    };
    const slp: ProviderSource = {
      adapter: sleeperAdapter,
      freshness: freshness('sleeper'),
      payloads: { identity: [{ sleeper_id: 'S-Z', gsis_id: '00-Z', full_name: 'Zed Z', position: 'WR', team: 'CIN', age: 27 }] },
    };
    const forward = ingest([nfl, slp]).snapshot.players.find((p) => p.providerIds.gsis === '00-Z')!;
    const reverse = ingest([slp, nfl]).snapshot.players.find((p) => p.providerIds.gsis === '00-Z')!;
    expect(forward.age).toBe(27);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
  });

  it('deduplicateCanonicalPlayers drops unresolved (null canonicalId) records', () => {
    const base: Omit<PlayerRecord, 'canonicalId'> = {
      providerRef: { key: 'gsis', value: '00-1' },
      freshness: freshness('nflverse'),
      sourceTimestamp: '2025-09-30T00:00:00.000Z',
      providerIds: { gsis: '00-1' },
      nameNormalized: 'a', position: 'WR', team: 'CIN', age: null,
      nflSeasonsCompleted: null, draftRound: null, status: null, injuryDesignation: null,
    };
    const { players } = deduplicateCanonicalPlayers([
      { ...base, canonicalId: 'pt-1' },
      { ...base, canonicalId: null }, // unresolved → excluded
    ]);
    expect(players.map((p) => p.canonicalId)).toEqual(['pt-1']);
  });
});
