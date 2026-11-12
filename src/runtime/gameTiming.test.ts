// Game timing: real scheduled kickoffs, provenance, eligibility at completion, and exclusion of
// observations whose date cannot be established.

import { describe, expect, it } from 'vitest';
import { easternWallClockToIso } from '@/ingestion/weekTiming';
import { indexSchedule, resolveGameTiming } from '@/ingestion/gameTiming';
import { nflverseAdapter } from '@/ingestion/adapters/nflverse';
import { ingest, buildNormalizedInferenceInput, type ProviderSource } from '@/ingestion/buildInput';
import { freshness } from '@/ingestion/__fixtures';
import { selectInferenceBuilds } from './selection';
import type { IngestionWarning } from '@/ingestion/types';

describe('easternWallClockToIso', () => {
  it.each([
    ['2026-09-13', '13:00', '2026-09-13T17:00:00.000Z'], // EDT
    ['2026-11-08', '13:00', '2026-11-08T18:00:00.000Z'], // EST (DST ended Nov 1 2026)
    ['2026-11-01', '13:00', '2026-11-01T18:00:00.000Z'], // the changeover Sunday, after 02:00
    ['2026-11-05', '20:15', '2026-11-06T01:15:00.000Z'], // Thursday night crosses midnight UTC
    ['2026-03-08', '13:00', '2026-03-08T17:00:00.000Z'], // DST began 2026-03-08
    ['2006-10-22', '13:00', '2006-10-22T17:00:00.000Z'], // pre-2007 rule: still EDT
    ['2006-10-29', '13:00', '2006-10-29T18:00:00.000Z'], // pre-2007 rule: last Sunday of October
  ])('%s %s ET is %s', (date, time, expected) => {
    expect(easternWallClockToIso(date, time)).toBe(expected);
  });

  it('agrees with the platform time-zone database for every NFL kickoff slot, 2010–2030', () => {
    // An independent oracle: Intl's America/New_York rendering of the computed instant must
    // reproduce the original wall clock.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    for (let year = 2010; year <= 2030; year++) {
      for (const month of [0, 1, 8, 9, 10, 11]) {
        for (let day = 1; day <= 28; day += 3) {
          for (const time of ['09:30', '13:00', '16:25', '20:15']) {
            const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const iso = easternWallClockToIso(date, time)!;
            const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
            expect(`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`).toBe(`${date} ${time}`);
          }
        }
      }
    }
  });

  it('rejects unreadable input instead of guessing', () => {
    expect(easternWallClockToIso('2026-13-01', '13:00')).toBeNull();
    expect(easternWallClockToIso('2026-11-08', '25:00')).toBeNull();
    expect(easternWallClockToIso(null, '13:00')).toBeNull();
  });
});

describe('schedule rows carry their kickoff provenance', () => {
  it('gameday + gametime is SCHEDULE_TIME; gameday alone is SCHEDULE_DATE', () => {
    const { records } = nflverseAdapter.normalizeSchedule!([
      { game_id: '2026_09_A_B', season: 2026, week: 9, game_type: 'REG', home_team: 'KC', away_team: 'DEN', gameday: '2026-11-08', gametime: '16:25' },
      { game_id: '2026_09_C_D', season: 2026, week: 9, game_type: 'REG', home_team: 'NYG', away_team: 'DAL', gameday: '2026-11-08' },
    ], freshness('nflverse'));
    expect(records[0]).toEqual(expect.objectContaining({ kickoff: '2026-11-08T21:25:00.000Z', kickoffSource: 'SCHEDULE_TIME' }));
    expect(records[1]).toEqual(expect.objectContaining({ kickoff: '2026-11-08T05:00:00.000Z', kickoffSource: 'SCHEDULE_DATE' }));
  });
});

describe('resolveGameTiming', () => {
  const schedule = indexSchedule([
    { canonicalId: null, providerRef: { key: 'game', value: 'g' }, freshness: freshness('nflverse'), sourceTimestamp: 'x',
      gameId: '2026_09_KC_DEN', season: 2026, week: 9, seasonType: 'REG', homeTeam: 'KC', awayTeam: 'DEN',
      kickoff: '2026-11-08T21:25:00.000Z', kickoffSource: 'SCHEDULE_TIME' },
  ]);
  const row = (over: Record<string, unknown>) => ({
    canonicalId: 'c', providerRef: { key: 'gsis', value: '1' }, freshness: freshness('nflverse'), sourceTimestamp: 'x',
    gameId: '2026_09_KC_DEN', kickoff: '2026-11-05T00:00:00.000Z', kickoffSource: 'WEEK_BOUNDARY', season: 2026,
    seasonType: 'REG', team: 'KC', ...over,
  }) as never;

  it('replaces a week-boundary placeholder with the scheduled kickoff, available 5h later', () => {
    const [g] = resolveGameTiming([row({})], schedule, []);
    expect(g).toEqual(expect.objectContaining({ kickoff: '2026-11-08T21:25:00.000Z', kickoffSource: 'SCHEDULE_TIME', availableAt: '2026-11-09T02:25:00.000Z' }));
  });

  it('joins a derived game id by season, week and team', () => {
    const [g] = resolveGameTiming([row({ gameId: '2026_09_DEN', team: 'DEN' })], schedule, []);
    expect(g.kickoffSource).toBe('SCHEDULE_TIME');
  });

  it('EXCLUDES and reports an observation whose game cannot be found, never dating it by its week', () => {
    const warnings: IngestionWarning[] = [];
    const out = resolveGameTiming([row({ gameId: '2026_09_NYJ_MIA', team: 'NYJ' })], schedule, warnings);
    expect(out).toHaveLength(0);
    expect(warnings).toEqual([expect.objectContaining({ code: 'UNSCHEDULED_OBSERVATION' })]);
  });

  it('keeps a kickoff the row itself supplied, labelled PROVIDER', () => {
    const [g] = resolveGameTiming([row({ kickoffSource: 'PROVIDER', kickoff: '2026-11-08T18:00:00.000Z' })], schedule, []);
    expect(g).toEqual(expect.objectContaining({ kickoff: '2026-11-08T18:00:00.000Z', kickoffSource: 'PROVIDER', availableAt: '2026-11-08T23:00:00.000Z' }));
  });
});

describe('historical cutoffs before, during and after a game week (Week 9, 2026)', () => {
  // Four players on four teams, one game each, in the real Week 9 slots.
  const slots = [
    { gsis: '00-THU', team: 'CIN', away: 'CLE', gameday: '2026-11-05', gametime: '20:15' }, // TNF
    { gsis: '00-SUN1', team: 'NYG', away: 'DAL', gameday: '2026-11-08', gametime: '13:00' }, // early Sunday
    { gsis: '00-SNF', team: 'KC', away: 'DEN', gameday: '2026-11-08', gametime: '20:20' }, // SNF
    { gsis: '00-MNF', team: 'GB', away: 'CHI', gameday: '2026-11-09', gametime: '20:15' }, // MNF
  ];
  const source: ProviderSource = {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse', '2026-11-12T12:00:00.000Z'),
    payloads: {
      identity: slots.map((s) => ({ gsis_id: s.gsis, player_name: s.gsis, position: 'WR', team: s.team })),
      // The weekly stats export: no dates, only season/week/game_id — exactly the production shape.
      games: slots.map((s) => ({ player_id: s.gsis, game_id: `2026_09_${s.away}_${s.team}`, season: 2026, week: 9, season_type: 'REG', recent_team: s.team, targets: 6, receptions: 4, receiving_yards: 50 })),
      schedule: slots.map((s) => ({ game_id: `2026_09_${s.away}_${s.team}`, season: 2026, week: 9, game_type: 'REG', home_team: s.team, away_team: s.away, gameday: s.gameday, gametime: s.gametime })),
    },
  };
  const { snapshot } = ingest([source]);
  const visibleAt = (asOf: string) =>
    selectInferenceBuilds(snapshot, { asOf }).map((b) => snapshot.players.find((p) => p.canonicalId === b.canonicalId)!.providerIds.gsis).sort();

  it('every observation is dated by its scheduled kickoff, not the Thursday boundary', () => {
    for (const g of snapshot.games) expect(g.kickoffSource).toBe('SCHEDULE_TIME');
    const sun = snapshot.games.find((g) => g.team === 'NYG')!;
    expect(sun.kickoff).toBe('2026-11-08T18:00:00.000Z');
  });

  it.each([
    ['before the week (Thursday noon ET)', '2026-11-05T17:00:00.000Z', []],
    ['during TNF', '2026-11-06T02:00:00.000Z', []],
    ['Friday, after TNF is final', '2026-11-06T09:00:00.000Z', ['00-THU']],
    ['Sunday 2pm ET, early games in progress', '2026-11-08T19:00:00.000Z', ['00-THU']],
    ['Sunday evening, early games final, SNF not yet played', '2026-11-08T23:30:00.000Z', ['00-SUN1', '00-THU']],
    ['Monday morning, SNF final', '2026-11-09T12:00:00.000Z', ['00-SNF', '00-SUN1', '00-THU']],
    ['Tuesday, the week complete', '2026-11-10T12:00:00.000Z', ['00-MNF', '00-SNF', '00-SUN1', '00-THU']],
  ])('%s', (_label, asOf, expected) => {
    expect(visibleAt(asOf)).toEqual(expected);
  });

  it('fact timestamps never precede the game being final', () => {
    const p = snapshot.players.find((x) => x.providerIds.gsis === '00-SUN1')!;
    const input = buildNormalizedInferenceInput(snapshot, { canonicalId: p.canonicalId!, position: 'WR', asOf: '2026-11-10T12:00:00.000Z', engineVersion: 'wr-mvp-1.0' })!;
    for (const ts of Object.values(input.factTimestamps ?? {})) expect(ts).toBe('2026-11-08T23:00:00.000Z');
  });
});
