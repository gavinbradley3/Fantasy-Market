// Point-in-time integrity: a board dated in the past must not be contaminated by anything
// the provider only knew later.
//
// The failure this guards against is silent and total: a current-state export (an identity
// or players resource) stamped with the caller's as-of passes as-of clamping trivially, so
// a July roster is served as February truth with nothing in the output marking it. Against
// real nflverse data that mis-stated the team of 202 of 912 modelled players and the status
// of 366. Every assertion below is written so that reverting the fix fails it.

import { describe, expect, it } from 'vitest';
import { buildEvidenceFor } from './evidence';
import { buildSnapshot, type NormalizedCollections } from './snapshot';
import { EMPTY_COLLECTIONS } from './snapshot';
import { attestedAt } from './ordering';
import { nflSeasonOf, seasonsCompletedAsOf } from './weekTiming';
import type { FreshnessMeta, PlayerRecord, RosterRecord } from './types';

const AS_OF = '2026-02-15T00:00:00.000Z';

/** A current-state export rebuilt in July — AFTER the board's as-of. */
const JULY: FreshnessMeta = {
  provider: 'nflverse',
  fetchedAt: '2026-07-27T11:17:28.000Z',
  effectiveDate: AS_OF,
  lastUpdated: '2026-07-27T11:17:28.000Z',
  sourceVersion: '2026-07-27 07:17:28 EDT',
};

/** Weekly rosters, which DO carry a historical week. */
const ROSTER_FRESHNESS: FreshnessMeta = { ...JULY, lastUpdated: '2026-07-27T10:35:46.000Z' };

function player(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    canonicalId: null,
    providerRef: { key: 'gsis', value: '00-A' },
    freshness: JULY,
    // What the adapter now does for a current-state resource.
    sourceTimestamp: attestedAt(JULY),
    providerIds: { gsis: '00-A' },
    nameNormalized: 'test passer',
    position: 'QB',
    team: 'SF', // the JULY team
    age: 30,
    nflSeasonsCompleted: 9,
    draftRound: 1,
    status: 'active', // the JULY status
    injuryDesignation: null,
    ...overrides,
  };
}

function roster(week: number, team: string, rosterStatus: RosterRecord['rosterStatus']): RosterRecord {
  // Week boundaries in the 2025 season; week 18 lands in early January 2026.
  const DAY = 86_400_000;
  const opener = Date.parse('2025-09-04T00:00:00.000Z');
  return {
    canonicalId: null,
    providerRef: { key: 'gsis', value: '00-A' },
    freshness: ROSTER_FRESHNESS,
    sourceTimestamp: new Date(opener + (week - 1) * 7 * DAY).toISOString(),
    team,
    season: 2025,
    week,
    position: 'QB',
    rosterStatus,
  };
}

function snapshotOf(collections: Partial<NormalizedCollections>) {
  return buildSnapshot({ ...EMPTY_COLLECTIONS, ...collections }).snapshot;
}

describe('a past board is not contaminated by later-known state', () => {
  it('takes the team from the roster week, not from the current identity export', () => {
    const snap = snapshotOf({
      players: [player()],
      rosters: [roster(1, 'TB', 'ACTIVE'), roster(17, 'TB', 'ACTIVE')],
    });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    // TB is where the player actually was in the 2025 season; SF is the July export.
    expect(built.player.team).toEqual(expect.objectContaining({ present: true, value: 'TB' }));
  });

  it('takes the status from the roster week, not from the current identity export', () => {
    const snap = snapshotOf({
      players: [player({ status: 'active' })],
      rosters: [roster(17, 'TB', 'RESERVE')],
    });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.player.status).toEqual(expect.objectContaining({ present: true, value: 'inactive' }));
  });

  it('ignores a roster week AFTER the as-of', () => {
    // A week-18 row precedes the as-of; a 2026-season row must not be reachable.
    const future: RosterRecord = { ...roster(1, 'SF', 'ACTIVE'), season: 2026, sourceTimestamp: '2026-09-10T00:00:00.000Z' };
    const snap = snapshotOf({ players: [player()], rosters: [roster(17, 'TB', 'ACTIVE'), future] });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.player.team).toEqual(expect.objectContaining({ value: 'TB' }));
  });

  it('reports team and status as UNAVAILABLE when only a later-known export exists', () => {
    // No roster history at all, and the identity export is attested for July. The honest
    // answer is "not known at this date" — never the July value.
    const snap = snapshotOf({ players: [player()] });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.player.team.present).toBe(false);
    expect(built.player.status.present).toBe(false);
  });

  it('still uses the identity export when the provider attests it at or before the as-of', () => {
    // A release rebuilt BEFORE the board date is legitimate evidence for that board.
    const attested: FreshnessMeta = { ...JULY, lastUpdated: '2026-01-10T00:00:00.000Z' };
    const rec = player({ freshness: attested, sourceTimestamp: attestedAt(attested), team: 'TB' });
    const snap = snapshotOf({ players: [rec] });
    const built = buildEvidenceFor(snap, snap.players[0].canonicalId!, 'QB', AS_OF)!;
    expect(built.player.team).toEqual(expect.objectContaining({ present: true, value: 'TB' }));
    expect(built.player.status).toEqual(expect.objectContaining({ present: true, value: 'active' }));
  });

  it('does not field a teammate who was on another team at the as-of', () => {
    const me = player({ position: 'WR', providerRef: { key: 'gsis', value: '00-A' }, providerIds: { gsis: '00-A' } });
    // A July teammate on the same current team, but rostered elsewhere during 2025.
    const other: PlayerRecord = {
      ...player({ position: 'WR' }),
      providerRef: { key: 'gsis', value: '00-B' },
      providerIds: { gsis: '00-B' },
      nameNormalized: 'other receiver',
    };
    const otherRoster: RosterRecord = {
      ...roster(17, 'DEN', 'ACTIVE'),
      providerRef: { key: 'gsis', value: '00-B' },
      position: 'WR',
    };
    const snap = snapshotOf({
      players: [me, other],
      rosters: [{ ...roster(17, 'TB', 'ACTIVE'), position: 'WR' }, otherRoster],
    });
    const mine = snap.players.find((p) => p.providerIds.gsis === '00-A')!;
    const built = buildEvidenceFor(snap, mine.canonicalId!, 'WR', AS_OF)!;
    // Both are on SF in July; only the as-of roster decides, and it puts them apart.
    expect(built.evidence.competition).toBeUndefined();
  });
});

describe('experience is derived historically, not read as a current count', () => {
  it('places January and February in the previous season', () => {
    expect(nflSeasonOf('2026-02-15T00:00:00.000Z')).toBe(2025);
    expect(nflSeasonOf('2026-01-02T00:00:00.000Z')).toBe(2025);
    expect(nflSeasonOf('2026-09-10T00:00:00.000Z')).toBe(2026);
  });

  it('counts seasons completed as at the reference date, from the rookie season', () => {
    // The same source row yields a different, correct answer per board date.
    expect(seasonsCompletedAsOf(2018, '2026-02-15T00:00:00.000Z')).toBe(8);
    expect(seasonsCompletedAsOf(2018, '2025-02-15T00:00:00.000Z')).toBe(7);
    expect(seasonsCompletedAsOf(null, '2026-02-15T00:00:00.000Z')).toBeNull();
    expect(seasonsCompletedAsOf(2100, '2026-02-15T00:00:00.000Z')).toBeNull();
  });
});

describe('attestation', () => {
  it("prefers the provider's own last-updated over the caller's window", () => {
    // The caller's effectiveDate is what we are valuing FOR, never evidence of when the
    // content became true.
    expect(attestedAt({ lastUpdated: '2026-07-27T00:00:00.000Z', effectiveDate: AS_OF })).toBe('2026-07-27T00:00:00.000Z');
  });

  it('falls back to the effective date only when the provider publishes no stamp', () => {
    expect(attestedAt({ lastUpdated: null, effectiveDate: AS_OF })).toBe(AS_OF);
  });
});
