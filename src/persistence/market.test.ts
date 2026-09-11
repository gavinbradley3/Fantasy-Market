// External market snapshot persistence (migration 4).
//
// The invariant under test is APPEND-ONLY. Every movement window and every model-vs-market
// history view is reconstructed by reading successive rows, so a write that overwrote
// yesterday would not lose a number — it would lose the ability to say anything moved.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { PersistenceStore } from './store';
import { LATEST_MIGRATION_VERSION } from './migrations';
import { openDatabase } from './sqlite/db';
import { tempDbPath } from './__fixtures';
import type { MarketSnapshot } from '@/market/types';

const paths: string[] = [];
function store() {
  const p = tempDbPath();
  paths.push(p);
  return PersistenceStore.open(p, () => '2026-09-11T18:00:00.000Z');
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

const JOSH = 'pt-d80f2bd29165c373';

const snap = (over: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  canonicalPlayerId: JOSH,
  source: 'dynastyprocess',
  format: 'dynasty_superflex',
  value: 10256,
  overallRank: 1,
  positionRank: 1,
  sourceConsensusRank: 1,
  sourcePlayerId: '17298',
  sourcePosition: 'QB',
  sourceTeam: 'BUF',
  sourceTimestamp: '2026-09-11T00:00:00.000Z',
  sourceVersion: '2026-09-11',
  ingestedAt: '2026-09-11T18:00:00.000Z',
  freshness: 'fresh',
  provenance: 'external',
  ...over,
});

describe('market snapshot schema', () => {
  it('is created by the production migration chain, not a side-channel', () => {
    const s = store();
    s.close();
    const p = paths[paths.length - 1];
    const db = openDatabase(p);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toContain('market_snapshot');
    const version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number };
    expect(version.v).toBe(LATEST_MIGRATION_VERSION);
    db.close();
  });

  it('opens a database this build just migrated without rejecting its own version', () => {
    // Regression: the read-path guard once compared against a separately-maintained copy of
    // the migration number, which went stale the moment a migration was added.
    const s = store();
    expect(() => s.assertVersion()).not.toThrow();
    s.close();
  });
});

describe('market snapshot store', () => {
  it('round-trips a snapshot with every provenance field intact', () => {
    const s = store();
    expect(s.appendMarketSnapshots([snap()])).toBe(1);
    const hist = s.getMarketSnapshotHistory(JOSH, 'dynastyprocess', 'dynasty_superflex');
    expect(hist).toHaveLength(1);
    expect(hist[0]).toEqual(snap());
    s.close();
  });

  it('APPENDS a later capture instead of overwriting yesterday', () => {
    const s = store();
    s.appendMarketSnapshots([snap({ ingestedAt: '2026-09-04T18:00:00.000Z', value: 10000 })]);
    s.appendMarketSnapshots([snap({ ingestedAt: '2026-09-11T18:00:00.000Z', value: 10256 })]);

    const hist = s.getMarketSnapshotHistory(JOSH, 'dynastyprocess', 'dynasty_superflex');
    expect(hist).toHaveLength(2);
    expect(hist.map((h) => h.value)).toEqual([10000, 10256]); // oldest first — the series
    expect(hist[0].ingestedAt).toBe('2026-09-04T18:00:00.000Z');
    s.close();
  });

  it('supports 7-day movement arithmetic across captures', () => {
    const s = store();
    s.appendMarketSnapshots([snap({ ingestedAt: '2026-09-04T18:00:00.000Z', value: 9000 })]);
    s.appendMarketSnapshots([snap({ ingestedAt: '2026-09-11T18:00:00.000Z', value: 10256 })]);
    const hist = s.getMarketSnapshotHistory(JOSH, 'dynastyprocess', 'dynasty_superflex');
    expect((hist.at(-1)!.value ?? 0) - (hist[0].value ?? 0)).toBe(1256);
    s.close();
  });

  it('is idempotent for the identical capture — re-running an ingest does not duplicate', () => {
    const s = store();
    expect(s.appendMarketSnapshots([snap()])).toBe(1);
    expect(s.appendMarketSnapshots([snap()])).toBe(0);
    expect(s.getMarketSnapshotHistory(JOSH, 'dynastyprocess', 'dynasty_superflex')).toHaveLength(1);
    s.close();
  });

  it('keeps the two formats separate — a 1QB value never answers a Superflex query', () => {
    const s = store();
    s.appendMarketSnapshots([snap({ format: 'dynasty_superflex', value: 10256 })]);
    s.appendMarketSnapshots([snap({ format: 'dynasty_1qb', value: 7000 })]);
    expect(s.getMarketSnapshotHistory(JOSH, 'dynastyprocess', 'dynasty_superflex')[0].value).toBe(10256);
    expect(s.getMarketSnapshotHistory(JOSH, 'dynastyprocess', 'dynasty_1qb')[0].value).toBe(7000);
    s.close();
  });

  it('latest() returns one row per player — the most recent capture for each', () => {
    const s = store();
    s.appendMarketSnapshots([
      snap({ ingestedAt: '2026-09-04T18:00:00.000Z', value: 10000 }),
      snap({ canonicalPlayerId: 'pt-other', ingestedAt: '2026-09-04T18:00:00.000Z', value: 500, overallRank: 2 }),
    ]);
    s.appendMarketSnapshots([snap({ ingestedAt: '2026-09-11T18:00:00.000Z', value: 10256 })]);

    const latest = s.getLatestMarketSnapshots('dynastyprocess', 'dynasty_superflex');
    expect(latest).toHaveLength(2);
    expect(latest.find((x) => x.canonicalPlayerId === JOSH)?.value).toBe(10256);
    // A player the newest capture omitted keeps their last known quote, stamped with its own
    // older instant, rather than dropping out of the market entirely.
    const other = latest.find((x) => x.canonicalPlayerId === 'pt-other');
    expect(other?.value).toBe(500);
    expect(other?.ingestedAt).toBe('2026-09-04T18:00:00.000Z');
    s.close();
  });

  it('preserves a null value as null rather than coercing it to zero', () => {
    const s = store();
    s.appendMarketSnapshots([snap({ value: null, overallRank: null, positionRank: null, sourceVersion: null })]);
    const row = s.getMarketSnapshotHistory(JOSH, 'dynastyprocess', 'dynasty_superflex')[0];
    expect(row.value).toBeNull();
    expect(row.overallRank).toBeNull();
    expect(row.sourceVersion).toBeNull();
    s.close();
  });

  it('lists distinct capture instants — the snapshot timeline', () => {
    const s = store();
    s.appendMarketSnapshots([snap({ ingestedAt: '2026-09-04T18:00:00.000Z' })]);
    s.appendMarketSnapshots([snap({ ingestedAt: '2026-09-11T18:00:00.000Z' })]);
    expect(s.getMarketCaptureInstants('dynastyprocess', 'dynasty_superflex')).toEqual([
      '2026-09-04T18:00:00.000Z',
      '2026-09-11T18:00:00.000Z',
    ]);
    s.close();
  });

  it('reports which (source, format) pairs hold data', () => {
    const s = store();
    s.appendMarketSnapshots([snap(), snap({ format: 'dynasty_1qb' })]);
    expect(s.getMarketSources()).toEqual([
      { source: 'dynastyprocess', format: 'dynasty_1qb' },
      { source: 'dynastyprocess', format: 'dynasty_superflex' },
    ]);
    s.close();
  });

  it('writes a batch atomically — a half-written capture would fake a market-wide move', () => {
    const s = store();
    // A row whose NOT NULL source_timestamp is missing fails mid-batch; nothing may land.
    const broken = { ...snap({ canonicalPlayerId: 'pt-broken' }), sourceTimestamp: null } as unknown as MarketSnapshot;
    expect(() => s.appendMarketSnapshots([snap(), broken])).toThrow();
    expect(s.getLatestMarketSnapshots('dynastyprocess', 'dynasty_superflex')).toEqual([]);
    s.close();
  });

  it('appending nothing is a no-op rather than an empty capture', () => {
    const s = store();
    expect(s.appendMarketSnapshots([])).toBe(0);
    expect(s.getMarketCaptureInstants('dynastyprocess', 'dynasty_superflex')).toEqual([]);
    s.close();
  });
});
