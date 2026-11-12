// Phase 1 recovery corrections (docs/PHASE1_RECOVERY_AUDIT.md, B7–B9), each exercised through the
// production evidence builder or adapter rather than a re-implementation.

import { describe, expect, it } from 'vitest';
import { buildEvidenceFor } from './evidence';
import { buildSnapshot, EMPTY_COLLECTIONS, type NormalizedCollections } from './snapshot';
import { attestedAt } from './ordering';
import { nflverseAdapter } from './adapters/nflverse';
import type { FreshnessMeta, GameStatRecord, PlayerRecord, RosterRecord, ScheduleGameRecord } from './types';

/** A capture taken in November 2026 — LATER than every historical as-of used below. */
const NOV: FreshnessMeta = {
  provider: 'nflverse',
  fetchedAt: '2026-11-12T12:00:00.000Z',
  effectiveDate: '2026-11-12T12:00:00.000Z',
  lastUpdated: '2026-11-12T12:00:00.000Z',
  sourceVersion: '2026-11-12 07:00:00 EST',
};

function player(): PlayerRecord {
  return {
    canonicalId: null,
    providerRef: { key: 'gsis', value: '00-QB' },
    freshness: NOV,
    sourceTimestamp: attestedAt(NOV),
    providerIds: { gsis: '00-QB' },
    nameNormalized: 'test passer',
    position: 'QB',
    team: 'KC',
    age: 30,
    nflSeasonsCompleted: 9,
    draftRound: 1,
    status: 'active',
    injuryDesignation: null,
  };
}

function game(season: number, week: number, kickoff: string): GameStatRecord {
  return {
    canonicalId: null,
    providerRef: { key: 'gsis', value: '00-QB' },
    freshness: NOV,
    // The capture's effective date, which is AFTER the historical as-of: the old fact stamp.
    sourceTimestamp: NOV.effectiveDate,
    gameId: `${season}_${String(week).padStart(2, '0')}_KC_DEN`,
    kickoff,
    season,
    seasonType: 'REG',
    team: 'KC',
    passAttempts: 30, carries: 3, targets: 0, snaps: null, teamSnaps: null, qbSnapShare: null,
    completions: 20, passingYards: 250, passingTds: 2, interceptions: 1, sacks: 2,
    rushingYards: 15, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0,
    receivingAirYards: null, targetShare: null,
  } as GameStatRecord;
}

function scheduled(season: number, week: number, kickoff: string): ScheduleGameRecord {
  return {
    canonicalId: null,
    providerRef: { key: 'game', value: `${season}_${week}` },
    freshness: NOV,
    sourceTimestamp: NOV.effectiveDate,
    gameId: `${season}_${String(week).padStart(2, '0')}_KC_DEN`,
    season,
    week,
    seasonType: 'REG',
    homeTeam: 'KC',
    awayTeam: 'DEN',
    kickoff,
  };
}

function roster(season: number, week: number, rosterStatus: RosterRecord['rosterStatus'], ts: string): RosterRecord {
  return {
    canonicalId: null,
    providerRef: { key: 'gsis', value: '00-QB' },
    freshness: NOV,
    sourceTimestamp: ts,
    team: 'KC',
    season,
    week,
    position: 'QB',
    rosterStatus,
  };
}

function snapshotOf(collections: Partial<NormalizedCollections>) {
  return buildSnapshot({ ...EMPTY_COLLECTIONS, ...collections }).snapshot;
}

describe('remaining games are scoped to the as-of season (B8)', () => {
  it('counts only the as-of season, even when later schedules are present', () => {
    const AS_OF = '2025-09-01T00:00:00.000Z';
    const schedule = [
      // 17 games in 2025 after the as-of, and 17 in 2026: the old rule counted 34.
      ...Array.from({ length: 17 }, (_, i) => scheduled(2025, i + 1, new Date(Date.parse('2025-09-07T00:00:00Z') + i * 7 * 86_400_000).toISOString())),
      ...Array.from({ length: 17 }, (_, i) => scheduled(2026, i + 1, new Date(Date.parse('2026-09-13T00:00:00Z') + i * 7 * 86_400_000).toISOString())),
    ];
    const snap = snapshotOf({
      players: [player()],
      schedule,
      rosters: [roster(2024, 18, 'ACTIVE', '2025-01-02T00:00:00.000Z')],
    });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.evidence.expectedGames?.gamesLeft).toBe(17);
  });
});

describe('counting facts are stamped with the game date, not the capture date (B8)', () => {
  it('a later capture replayed at an earlier as-of keeps every pre-as-of fact', () => {
    const AS_OF = '2025-09-01T00:00:00.000Z';
    const snap = snapshotOf({
      players: [player()],
      games: [game(2024, 1, '2024-09-08T00:00:00.000Z'), game(2024, 2, '2024-09-15T00:00:00.000Z')],
    });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.facts.career_games_played).toBe(2);
    const stamps = Object.values(built.factTimestamps);
    expect(stamps.length).toBeGreaterThan(0);
    // Every stamp is the newest game's kickoff, and none is after the as-of.
    for (const ts of stamps) {
      expect(ts).toBe('2024-09-15T00:00:00.000Z');
      expect(Date.parse(ts)).toBeLessThanOrEqual(Date.parse(AS_OF));
    }
  });

  it('a game after the as-of contributes to no fact (no future leakage)', () => {
    const AS_OF = '2025-09-01T00:00:00.000Z';
    const snap = snapshotOf({
      players: [player()],
      games: [game(2024, 1, '2024-09-08T00:00:00.000Z'), game(2025, 1, '2025-09-07T00:00:00.000Z')],
    });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.facts.career_games_played).toBe(1);
    expect(built.facts.career_pass_attempts).toBe(30);
  });
});

describe('injured reserve is an injury, not "not rostered" (B9)', () => {
  const rows = (code: string, status = 'RES') => [
    { gsis_id: '00-QB', team: 'KC', season: 2025, week: 18, status, status_description_abbr: code, position: 'QB' },
  ];

  it.each([
    ['R01', 'IR'],
    ['R48', 'IR'],
    ['R04', 'PUP'],
    ['R05', 'NFI'],
    ['R02', 'RESERVE'],
    ['R27', 'RESERVE'],
  ])('RES/%s normalizes to %s', (code, expected) => {
    const { records } = nflverseAdapter.normalizeRoster!(rows(code), NOV);
    expect(records[0].rosterStatus).toBe(expected);
  });

  it('a non-reserve row is unaffected by its sub-code', () => {
    const { records } = nflverseAdapter.normalizeRoster!(rows('R48', 'ACT'), NOV);
    expect(records[0].rosterStatus).toBe('ACTIVE');
  });

  it('a player on IR at the as-of is reported injured with an IR designation', () => {
    const AS_OF = '2026-02-15T00:00:00.000Z';
    const snap = snapshotOf({
      players: [player()],
      rosters: [roster(2025, 18, 'IR', '2026-01-01T00:00:00.000Z')],
    });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.player.status).toEqual(expect.objectContaining({ present: true, value: 'injured' }));
    expect(built.player.injury_designation).toEqual(expect.objectContaining({ present: true, value: 'IR' }));
    expect(built.evidence.qbAvailability?.injuryStatus).toBe('IR');
    // Attested by the roster week, which precedes the as-of.
    const ts = (built.player.injury_designation as { sourceTimestamp: string }).sourceTimestamp;
    expect(Date.parse(ts)).toBeLessThanOrEqual(Date.parse(AS_OF));
  });
});

describe('a player on no current-season roster publishes no stale team (roster reconciliation)', () => {
  const otherPlayer: PlayerRecord = { ...player(), providerRef: { key: 'gsis', value: '00-OTHER' }, providerIds: { gsis: '00-OTHER' }, nameNormalized: 'other passer' };
  const otherRoster = (season: number, week: number, ts: string): RosterRecord => ({
    ...roster(season, week, 'ACTIVE', ts),
    providerRef: { key: 'gsis', value: '00-OTHER' },
  });

  it('in season, with the season rosters present, reports no team and not-rostered', () => {
    const AS_OF = '2026-11-12T12:00:00.000Z';
    const snap = snapshotOf({
      players: [player(), otherPlayer],
      rosters: [roster(2025, 18, 'ACTIVE', '2026-01-01T00:00:00.000Z'), otherRoster(2026, 1, '2026-09-10T00:00:00.000Z')],
    });
    const id = snap.players.find((p) => p.nameNormalized === 'test passer')!.canonicalId!;
    const built = buildEvidenceFor(snap, id, 'QB', AS_OF)!;
    expect(built.player.team.present).toBe(false);
    expect(built.player.status).toEqual(expect.objectContaining({ present: true, value: 'inactive', sourceTimestamp: '2026-09-10T00:00:00.000Z' }));
    expect(built.evidence.expectedGames?.gamesLeft).toBe(0);
  });

  it('in the offseason, before the new season rosters exist, keeps the latest roster team', () => {
    const AS_OF = '2026-07-01T00:00:00.000Z';
    const snap = snapshotOf({
      players: [player(), otherPlayer],
      // A 2026 row exists in the capture but is attested AFTER the as-of, so it does not count.
      rosters: [roster(2025, 18, 'ACTIVE', '2026-01-01T00:00:00.000Z'), otherRoster(2026, 1, '2026-09-10T00:00:00.000Z')],
    });
    const id = snap.players.find((p) => p.nameNormalized === 'test passer')!.canonicalId!;
    const built = buildEvidenceFor(snap, id, 'QB', AS_OF)!;
    expect(built.player.team).toEqual(expect.objectContaining({ present: true, value: 'KC' }));
    expect(built.player.status).toEqual(expect.objectContaining({ value: 'active' }));
  });
});
