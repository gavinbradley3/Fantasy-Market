import { describe, expect, it } from 'vitest';
import { PlayerIdentityDirectory, NEVER_GENERATED } from '@/services/identity/directory';
import { buildDirectory } from '@/services/identity/resolver';
import { FIXED_NOW, FIXED_NOW_ISO, nflverseRecord, sleeperRecord } from '@/services/identity/testutil';
import type { PlayerDirectorySnapshot } from '@/services/identity/types';
import committedSnapshot from '@/data/identity/player-directory.json';

function makeSnapshot(): PlayerDirectorySnapshot {
  const resolved = buildDirectory({
    sleeper: [sleeperRecord({ sleeperId: '10', fullName: 'Dir Player', team: 'DET', gsisId: '00-1', position: 'TE' })],
    nflverse: [nflverseRecord({ gsisId: '00-1', fullName: 'Dir Player', team: 'DET', position: 'TE' })],
    priorMappings: [],
    manualMappings: [],
    generatedAt: FIXED_NOW_ISO,
    effectiveSeason: 2025,
  });
  const meta = {
    url: 'test://source',
    fetchedAt: FIXED_NOW_ISO,
    checksum: 'abc',
    recordCount: 1,
    invalidRecords: 0,
    stale: false,
    error: null,
  };
  return {
    schemaVersion: 1,
    normalizationVersion: 1,
    generatedAt: FIXED_NOW_ISO,
    effectiveSeason: 2025,
    sources: { sleeper: { ...meta }, nflverseRoster: { ...meta }, nflversePlayers: { ...meta } },
    players: resolved.players,
    sourceIdMaps: resolved.sourceIdMaps,
    review: resolved.review,
  };
}

describe('PlayerIdentityDirectory', () => {
  it('indexes lookups by PlayerTicker, Sleeper, and GSIS ids', () => {
    const dir = new PlayerIdentityDirectory(makeSnapshot());
    const p = dir.getBySleeperId('10');
    expect(p?.fullName).toBe('Dir Player');
    expect(dir.getByGsisId('00-1')).toBe(p);
    expect(dir.getByPlayerTickerId(p!.playerTickerId)).toBe(p);
    expect(dir.getBySleeperId('nope')).toBeNull();
  });

  it('resolveSleeperId returns explicit outcomes from the mapping table only', () => {
    const dir = new PlayerIdentityDirectory(makeSnapshot());
    expect(dir.resolveSleeperId('10')).toMatchObject({ status: 'MATCHED', method: 'GSIS_ID' });
    expect(dir.resolveSleeperId('999')).toMatchObject({ status: 'UNMATCHED' });
    expect(dir.resolveSleeperId('')).toMatchObject({ status: 'INVALID' });
  });

  it('filters listPlayers by position', () => {
    const dir = new PlayerIdentityDirectory(makeSnapshot());
    expect(dir.listPlayers('TE')).toHaveLength(1);
    expect(dir.listPlayers('QB')).toHaveLength(0);
  });

  it('reports freshness and staleness honestly', () => {
    const snap = makeSnapshot();
    snap.sources.sleeper.stale = true;
    snap.sources.sleeper.error = 'HTTP 503';
    const dir = new PlayerIdentityDirectory(snap);
    const fresh = dir.getFreshness();
    expect(fresh.anySourceStale).toBe(true);
    expect(fresh.errors).toEqual(['HTTP 503']);
    expect(fresh.neverIngested).toBe(false);
    expect(dir.isStale(FIXED_NOW.getTime() + 60_000)).toBe(false);
    expect(dir.isStale(FIXED_NOW.getTime() + 25 * 60 * 60_000)).toBe(true);
  });

  it('fromJson validates untrusted payloads and rejects corrupt ones', () => {
    expect(() => PlayerIdentityDirectory.fromJson({ schemaVersion: 2 })).toThrow(/invalid/);
    expect(() => PlayerIdentityDirectory.fromJson('garbage')).toThrow(/invalid/);
    const roundTripped = PlayerIdentityDirectory.fromJson(JSON.parse(JSON.stringify(makeSnapshot())));
    expect(roundTripped.listPlayers()).toHaveLength(1);
  });

  it('empty() is a safe, never-ingested default', () => {
    const dir = PlayerIdentityDirectory.empty();
    expect(dir.listPlayers()).toHaveLength(0);
    expect(dir.getFreshness().neverIngested).toBe(true);
    expect(dir.isStale(Date.now())).toBe(true);
  });

  it('the committed snapshot in src/data/identity is schema-valid', () => {
    const dir = PlayerIdentityDirectory.fromJson(committedSnapshot);
    // Placeholder until the first real ingestion run: valid but empty.
    if (dir.snapshot.generatedAt === NEVER_GENERATED) {
      expect(dir.getFreshness().neverIngested).toBe(true);
    } else {
      expect(dir.listPlayers().length).toBeGreaterThan(0);
    }
  });
});
