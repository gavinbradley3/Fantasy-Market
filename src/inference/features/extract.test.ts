import { describe, expect, it } from 'vitest';
import {
  acquiredWithinWindow,
  currentTeam,
  gamesMissedRateLast16,
  priorSeasonTeam,
  samePositionTeammates,
  teamChanged,
  yearsWithTeam,
} from '@/inference/features/extract';
import type {
  PlayerGameUsage,
  RosterEntry,
  ScheduleGame,
  TransactionEvent,
} from '@/inference/features/types';

const asOf = '2025-09-10T00:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;

function roster(p: Partial<RosterEntry> & { canonicalId: string }): RosterEntry {
  return {
    team: 'AAA',
    position: 'WR',
    status: 'ACTIVE',
    season: 2025,
    draftRound: 1,
    sourceTimestamp: '2025-09-01T00:00:00.000Z',
    snapshotId: 's1',
    ...p,
  };
}
function usage(p: Partial<PlayerGameUsage> & { canonicalId: string; gameId: string }): PlayerGameUsage {
  return {
    team: 'AAA',
    kickoff: '2024-09-10T00:00:00.000Z',
    season: 2024,
    seasonType: 'REG',
    sourceTimestamp: '2024-09-11T00:00:00.000Z',
    targetShare: null,
    carryShare: null,
    snapShare: null,
    routeParticipation: null,
    goalLineCarryShare: null,
    adot: null,
    tprr: null,
    touches: null,
    participationCovered: false,
    ...p,
  };
}

describe('feature extraction (REGISTRY §20.F11)', () => {
  it('prior-season team = final regular-season game of the most recent completed season (multi-team)', () => {
    const rows = [
      usage({ canonicalId: 'p', gameId: 'g1', team: 'AAA', kickoff: '2024-09-08T00:00:00.000Z' }),
      usage({ canonicalId: 'p', gameId: 'g18', team: 'BBB', kickoff: '2024-12-29T00:00:00.000Z' }),
      // postseason game on a third team → excluded (REG only)
      usage({ canonicalId: 'p', gameId: 'gpost', team: 'CCC', kickoff: '2025-01-12T00:00:00.000Z', seasonType: 'POST' }),
    ];
    expect(priorSeasonTeam(rows, 'p', 2025, asOf)).toBe('BBB');
  });

  it('returns null prior team when there is no prior season', () => {
    expect(priorSeasonTeam([], 'p', 2025, asOf)).toBeNull();
  });

  it('acquired exactly 8 weeks (56 days) before as-of is within window; 57 days is not', () => {
    const mk = (daysAgo: number): TransactionEvent[] => [
      {
        canonicalId: 'p',
        type: 'SIGN',
        team: 'AAA',
        date: new Date(Date.parse(asOf) - daysAgo * DAY).toISOString(),
        sourceTimestamp: new Date(Date.parse(asOf) - daysAgo * DAY).toISOString(),
      },
    ];
    expect(acquiredWithinWindow(mk(56), 'p', asOf)).toBe(true);
    expect(acquiredWithinWindow(mk(57), 'p', asOf)).toBe(false);
  });

  it('current team follows the latest roster snapshot (transition); teamChanged detects a move', () => {
    const entries = [
      roster({ canonicalId: 'p', team: 'AAA', sourceTimestamp: '2025-08-01T00:00:00.000Z', snapshotId: 's1' }),
      roster({ canonicalId: 'p', team: 'BBB', sourceTimestamp: '2025-09-05T00:00:00.000Z', snapshotId: 's2' }),
    ];
    expect(currentTeam(entries, 'p', asOf)).toBe('BBB');
    const priorRows = [usage({ canonicalId: 'p', gameId: 'g1', team: 'AAA', kickoff: '2024-12-01T00:00:00.000Z' })];
    expect(teamChanged(entries, priorRows, 'p', 2025, asOf)).toBe(true);
  });

  it('years with team counts distinct seasons on the team', () => {
    const entries = [
      roster({ canonicalId: 'p', team: 'AAA', season: 2023 }),
      roster({ canonicalId: 'p', team: 'AAA', season: 2024 }),
      roster({ canonicalId: 'p', team: 'AAA', season: 2025 }),
      roster({ canonicalId: 'p', team: 'BBB', season: 2022 }),
    ];
    expect(yearsWithTeam(entries, 'p', 'AAA', asOf)).toBe(3);
  });

  it('same-position teammates: excludes subject/free-agents/other positions; dedups by latest record', () => {
    const entries = [
      roster({ canonicalId: 'subject', team: 'AAA', position: 'WR' }),
      roster({ canonicalId: 't1', team: 'AAA', position: 'WR', status: 'IR' }),
      roster({ canonicalId: 't1', team: 'AAA', position: 'WR', status: 'ACTIVE', sourceTimestamp: '2025-09-06T00:00:00.000Z', snapshotId: 's2' }),
      roster({ canonicalId: 't2', team: 'AAA', position: 'RB' }), // other position
      roster({ canonicalId: 't3', team: 'AAA', position: 'WR', status: 'FREE_AGENT' }),
      roster({ canonicalId: 't4', team: 'BBB', position: 'WR' }), // other team
    ];
    const mates = samePositionTeammates(entries, 'subject', 'AAA', 'WR', asOf);
    expect(mates.map((m) => m.canonicalId).sort()).toEqual(['t1']);
    // dedup keeps the latest (ACTIVE) record
    expect(mates[0].status).toBe('ACTIVE');
  });

  it('games-missed rate over the last team games (durability input)', () => {
    const schedule: ScheduleGame[] = Array.from({ length: 4 }, (_, i) => ({
      team: 'AAA',
      gameId: `w${i + 1}`,
      kickoff: new Date(Date.parse('2025-09-01T00:00:00.000Z') + i * 7 * DAY).toISOString(),
      seasonType: 'REG',
      season: 2025,
    }));
    // player played 3 of the first 4 (missed w2)
    const rows = ['w1', 'w3', 'w4'].map((g) =>
      usage({ canonicalId: 'p', gameId: g, team: 'AAA', kickoff: '2025-09-01T00:00:00.000Z', season: 2025 }),
    );
    const later = '2025-10-01T00:00:00.000Z';
    expect(gamesMissedRateLast16(schedule, rows, 'p', 'AAA', later)).toBeCloseTo(0.25, 10);
  });
});
