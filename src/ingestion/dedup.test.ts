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

// ---------------------------------------------------------------------------
// Duplicate PER-GAME STAT rows.
//
// A provider export can carry the same (player, game) twice, typically one complete row and
// one that omits an auxiliary column. Two things then go wrong, and both were live until the
// receiving columns made them visible: the game's stats are counted twice, and the snapshot's
// bytes depend on which duplicate happened to arrive first.
// ---------------------------------------------------------------------------

function weeklyRow(over: Record<string, unknown> = {}) {
  return {
    player_id: '00-WR', season: 2025, week: 2, season_type: 'REG', recent_team: 'CIN',
    targets: 13, receptions: 9, receiving_yards: 138, receiving_tds: 2,
    receiving_air_yards: 165, target_share: 0.34,
    ...over,
  };
}

function ingestWeekly(rows: readonly Record<string, unknown>[]) {
  const source: ProviderSource = {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [{ gsis_id: '00-WR', full_name: 'Test Receiver', position: 'WR', team: 'CIN' }],
      games: rows,
    },
  };
  return ingest([source]).snapshot;
}

describe('duplicate per-game stat rows', () => {
  it('collapses a duplicated (player, game) to ONE record — the stats are not counted twice', () => {
    const snapshot = ingestWeekly([weeklyRow(), weeklyRow()]);
    expect(snapshot.games).toHaveLength(1);
    expect(snapshot.games[0].targets).toBe(13);
  });

  it('keeps the observed value when only one of the duplicates supplies a column', () => {
    // The partial row omitting air yards is not evidence AGAINST the row that has them.
    const partial = weeklyRow();
    delete (partial as Record<string, unknown>).receiving_air_yards;
    const snapshot = ingestWeekly([weeklyRow(), partial]);
    expect(snapshot.games).toHaveLength(1);
    expect(snapshot.games[0].receivingAirYards).toBe(165);
  });

  it('produces the SAME snapshot id whichever duplicate arrives first', () => {
    // The regression this pins: a stable sort left colliding records in input order, so a
    // reordered export re-ingested to a different snapshot id and therefore a different board.
    const partial = weeklyRow();
    delete (partial as Record<string, unknown>).receiving_air_yards;
    const forward = ingestWeekly([weeklyRow(), partial]);
    const reversed = ingestWeekly([partial, weeklyRow()]);
    expect(reversed.snapshotId).toBe(forward.snapshotId);
    expect(reversed.games).toEqual(forward.games);
  });

  it('reports a genuine contradiction rather than absorbing it', () => {
    const source: ProviderSource = {
      adapter: nflverseAdapter,
      freshness: freshness('nflverse'),
      payloads: {
        identity: [{ gsis_id: '00-WR', full_name: 'Test Receiver', position: 'WR', team: 'CIN' }],
        games: [weeklyRow({ targets: 13 }), weeklyRow({ targets: 9 })],
      },
    };
    const { snapshot, diagnostics } = ingest([source]);
    expect(snapshot.games).toHaveLength(1);
    expect(diagnostics.warnings.some((w) => w.detail?.includes('conflicting duplicate game stat'))).toBe(true);
  });

  it('leaves distinct games alone', () => {
    const snapshot = ingestWeekly([weeklyRow({ week: 1 }), weeklyRow({ week: 2 })]);
    expect(snapshot.games).toHaveLength(2);
  });
});
