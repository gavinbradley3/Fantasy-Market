// Correction 1 — identity safety at the SNAPSHOT level. Proves distinct provider
// identities are never merged on name/position, valid cross-provider joins still work,
// and conflicting cross-ids are quarantined rather than silently merged.

import { describe, expect, it } from 'vitest';
import { ingest } from './buildInput';
import type { ProviderSource } from './buildInput';
import type { FreshnessMeta, PlayerRecord } from './types';
import type { ProviderAdapter } from './capabilities';
import { nflverseSource, sleeperSource, freshness } from './__fixtures';

// A minimal test-only adapter for a provider whose id namespace is OUTSIDE the mint
// preference list — exercises the previously-unsafe name+position fallback path.
function fantasyprosAdapter(): ProviderAdapter {
  return {
    provider: 'fantasypros',
    capabilities: new Set(['identity']),
    normalizeIdentity(raw: unknown, f: FreshnessMeta) {
      const rows = raw as { fp_id: string; name: string; pos: 'WR' | 'RB' | 'QB' | 'TE' }[];
      const records: PlayerRecord[] = rows.map((r) => ({
        canonicalId: null,
        providerRef: { key: 'fantasypros', value: r.fp_id },
        freshness: f,
        sourceTimestamp: f.effectiveDate,
        providerIds: { fantasypros: r.fp_id },
        nameNormalized: r.name.toLowerCase(),
        position: r.pos,
        team: null, age: null, nflSeasonsCompleted: null, draftRound: null, status: null, injuryDesignation: null,
      }));
      return { records, warnings: [] };
    },
  };
}

describe('identity safety (Correction 1)', () => {
  it('two DISTINCT same-name players (out-of-priority namespace) get distinct canonical ids', () => {
    const src: ProviderSource = {
      adapter: fantasyprosAdapter(),
      freshness: freshness('fantasypros'),
      payloads: { identity: [
        { fp_id: 'FP-111', name: 'Mike Williams', pos: 'WR' },
        { fp_id: 'FP-999', name: 'Mike Williams', pos: 'WR' },
      ] },
    };
    const { snapshot } = ingest([src]);
    expect(snapshot.players.length).toBe(2); // NOT merged
    expect(new Set(snapshot.players.map((p) => p.canonicalId)).size).toBe(2);
  });

  it('a record with no stable provider id is unresolved (dropped) with a diagnostic, never name-merged', () => {
    const noId: ProviderAdapter = {
      provider: 'manual',
      capabilities: new Set(['identity']),
      normalizeIdentity(_raw, f: FreshnessMeta) {
        const rec: PlayerRecord = {
          canonicalId: null, providerRef: { key: 'name', value: 'john doe' }, freshness: f,
          sourceTimestamp: f.effectiveDate, providerIds: {}, nameNormalized: 'john doe',
          position: 'WR', team: null, age: null, nflSeasonsCompleted: null, draftRound: null, status: null, injuryDesignation: null,
        };
        return { records: [rec, { ...rec }], warnings: [] };
      },
    };
    const { snapshot, diagnostics } = ingest([{ adapter: noId, freshness: freshness('manual'), payloads: { identity: [{}, {}] } }]);
    expect(snapshot.players.length).toBe(0); // neither auto-merged nor kept
    expect(diagnostics.warnings.some((w) => w.code === 'UNRESOLVED_IDENTITY')).toBe(true);
  });

  it('valid cross-provider join still works: shared gsis → one canonical player, id union preserved', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const wr = snapshot.players.filter((p) => p.providerIds.gsis === '00-WR');
    expect(wr.length).toBe(1);
    expect(wr[0].providerIds).toEqual({ gsis: '00-WR', sleeper: 'S-WR' });
  });

  it('conflicting cross-ids are quarantined with a typed diagnostic, not silently merged', () => {
    // nflverse mints canonical A for gsis:00-P1 and canonical B for gsis:00-P2. A sleeper
    // record then claims BOTH gsis ids belong to one player — a genuine conflict.
    const nfl: ProviderSource = {
      adapter: nflverseSource().adapter,
      freshness: freshness('nflverse'),
      payloads: { identity: [
        { gsis_id: '00-P1', player_name: 'Player One', position: 'WR', team: 'CIN' },
        { gsis_id: '00-P2', player_name: 'Player Two', position: 'WR', team: 'CIN' },
      ] },
    };
    const badLink: ProviderSource = {
      adapter: {
        provider: 'sleeper', capabilities: new Set(['identity']),
        normalizeIdentity(_raw, f: FreshnessMeta) {
          const rec: PlayerRecord = {
            canonicalId: null, providerRef: { key: 'sleeper', value: 'S-X' }, freshness: f,
            sourceTimestamp: f.effectiveDate, providerIds: { sleeper: 'S-X', gsis: '00-P1', pfr: 'PFR-maps-to-P2-slot' },
            nameNormalized: 'player one', position: 'WR', team: 'CIN', age: null, nflSeasonsCompleted: null, draftRound: null, status: null, injuryDesignation: null,
          };
          return { records: [rec], warnings: [] };
        },
      },
      freshness: freshness('sleeper'),
      payloads: { identity: [{}] },
    };
    // Seed the pfr token to a DIFFERENT canonical id via a prior nflverse-like source so
    // the sleeper record's tokens straddle two canonical players.
    const seedP2Pfr: ProviderSource = {
      adapter: {
        provider: 'pfr', capabilities: new Set(['identity']),
        normalizeIdentity(_raw, f: FreshnessMeta) {
          const rec: PlayerRecord = {
            canonicalId: null, providerRef: { key: 'pfr', value: 'PFR-maps-to-P2-slot' }, freshness: f,
            sourceTimestamp: f.effectiveDate, providerIds: { pfr: 'PFR-maps-to-P2-slot', gsis: '00-P2' },
            nameNormalized: 'player two', position: 'WR', team: 'CIN', age: null, nflSeasonsCompleted: null, draftRound: null, status: null, injuryDesignation: null,
          };
          return { records: [rec], warnings: [] };
        },
      },
      freshness: freshness('pfr'),
      payloads: { identity: [{}] },
    };
    const { diagnostics } = ingest([nfl, seedP2Pfr, badLink]);
    expect(diagnostics.warnings.some((w) => w.code === 'IDENTITY_CONFLICT')).toBe(true);
  });
});
