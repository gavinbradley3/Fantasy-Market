import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openMarketStore, type MarketSnapshotStore } from './store';
import type { MarketSnapshot } from './types';

let dir: string;
let store: MarketSnapshotStore;

const snap = (over: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  canonicalPlayerId: 'pt-d80f2bd29165c373',
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
  ingestedAt: '2026-09-11T18:00:00.000Z',
  freshness: 'fresh',
  provenance: 'external',
  ...over,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pt-market-'));
  store = openMarketStore(join(dir, 'market.db'));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('market snapshot store', () => {
  it('round-trips a snapshot', () => {
    expect(store.append([snap()])).toBe(1);
    const hist = store.history('pt-d80f2bd29165c373', 'dynastyprocess', 'dynasty_superflex');
    expect(hist).toHaveLength(1);
    expect(hist[0]).toEqual(snap());
  });

  it('APPENDS a later capture instead of overwriting yesterday', () => {
    store.append([snap({ ingestedAt: '2026-09-10T18:00:00.000Z', value: 10000 })]);
    store.append([snap({ ingestedAt: '2026-09-11T18:00:00.000Z', value: 10256 })]);

    const hist = store.history('pt-d80f2bd29165c373', 'dynastyprocess', 'dynasty_superflex');
    expect(hist).toHaveLength(2);
    // Oldest first — the movement series.
    expect(hist.map((h) => h.value)).toEqual([10000, 10256]);
    // Yesterday's row is intact, which is what movement is computed from.
    expect(hist[0].ingestedAt).toBe('2026-09-10T18:00:00.000Z');
  });

  it('supports movement arithmetic across captures', () => {
    store.append([snap({ ingestedAt: '2026-09-04T18:00:00.000Z', value: 9000 })]);
    store.append([snap({ ingestedAt: '2026-09-11T18:00:00.000Z', value: 10256 })]);
    const hist = store.history('pt-d80f2bd29165c373', 'dynastyprocess', 'dynasty_superflex');
    const sevenDay = (hist.at(-1)!.value ?? 0) - (hist[0].value ?? 0);
    expect(sevenDay).toBe(1256);
  });

  it('is idempotent for the identical capture — re-running an ingest does not duplicate', () => {
    expect(store.append([snap()])).toBe(1);
    expect(store.append([snap()])).toBe(0);
    expect(store.history('pt-d80f2bd29165c373', 'dynastyprocess', 'dynasty_superflex')).toHaveLength(1);
  });

  it('keeps the two formats separate', () => {
    store.append([snap({ format: 'dynasty_superflex', value: 10256 })]);
    store.append([snap({ format: 'dynasty_1qb', value: 7000 })]);
    expect(store.history('pt-d80f2bd29165c373', 'dynastyprocess', 'dynasty_superflex')[0].value).toBe(10256);
    expect(store.history('pt-d80f2bd29165c373', 'dynastyprocess', 'dynasty_1qb')[0].value).toBe(7000);
  });

  it('latest() returns one row per player — the most recent capture', () => {
    store.append([
      snap({ ingestedAt: '2026-09-10T18:00:00.000Z', value: 10000 }),
      snap({ canonicalPlayerId: 'pt-other', ingestedAt: '2026-09-10T18:00:00.000Z', value: 500, overallRank: 2 }),
    ]);
    store.append([snap({ ingestedAt: '2026-09-11T18:00:00.000Z', value: 10256 })]);

    const latest = store.latest('dynastyprocess', 'dynasty_superflex');
    expect(latest).toHaveLength(2);
    expect(latest.find((s) => s.canonicalPlayerId === 'pt-d80f2bd29165c373')?.value).toBe(10256);
    // The player not re-captured keeps its last known value rather than disappearing.
    expect(latest.find((s) => s.canonicalPlayerId === 'pt-other')?.value).toBe(500);
  });

  it('preserves a null value as null rather than coercing it to zero', () => {
    store.append([snap({ value: null, overallRank: null, positionRank: null })]);
    const row = store.history('pt-d80f2bd29165c373', 'dynastyprocess', 'dynasty_superflex')[0];
    expect(row.value).toBeNull();
    expect(row.overallRank).toBeNull();
  });

  it('lists distinct capture instants — the snapshot timeline', () => {
    store.append([snap({ ingestedAt: '2026-09-04T18:00:00.000Z' })]);
    store.append([snap({ ingestedAt: '2026-09-11T18:00:00.000Z' })]);
    expect(store.distinctCaptureInstants('dynastyprocess', 'dynasty_superflex')).toEqual([
      '2026-09-04T18:00:00.000Z',
      '2026-09-11T18:00:00.000Z',
    ]);
  });
});
