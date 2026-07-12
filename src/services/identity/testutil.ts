// Shared fixture builders for the identity-layer tests. Everything is built
// in-memory and deterministically — no file I/O, no network, no Date.now.

import type { NflverseIdentityRecord, SleeperIdentityRecord } from '@/services/identity/types';
import { nameKey } from '@/services/identity/normalize';
import type { Position } from '@/types/market';

export const FIXED_NOW = new Date('2025-09-01T12:00:00.000Z');
export const FIXED_NOW_ISO = FIXED_NOW.toISOString();

/** Raw Sleeper /players/nfl map entry (provider-shaped, snake_case). */
export function rawSleeper(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    player_id: id,
    full_name: 'Test Player',
    first_name: 'Test',
    last_name: 'Player',
    birth_date: '2000-01-15',
    age: 25,
    position: 'WR',
    fantasy_positions: ['WR'],
    team: 'DET',
    status: 'Active',
    injury_status: null,
    practice_participation: null,
    depth_chart_order: 1,
    years_exp: 3,
    active: true,
    gsis_id: null,
    espn_id: 12345,
    yahoo_id: null,
    ...overrides,
  };
}

/** Validated Sleeper identity record (post-extraction shape). */
export function sleeperRecord(
  overrides: Partial<SleeperIdentityRecord> & { sleeperId: string; fullName: string },
): SleeperIdentityRecord {
  const position = (overrides.position ?? 'WR') as Position;
  return {
    firstName: null,
    lastName: null,
    birthDate: null,
    age: null,
    fantasyPositions: [position],
    teamRaw: overrides.team ?? null,
    team: null,
    yearsExperience: null,
    status: 'Active',
    injuryStatus: null,
    practiceStatus: null,
    depthChartOrder: null,
    active: true,
    gsisId: null,
    espnId: null,
    yahooId: null,
    nameKey: nameKey(overrides.fullName),
    ...overrides,
    position,
  };
}

/** Validated nflverse identity record (post-extraction shape). */
export function nflverseRecord(
  overrides: Partial<NflverseIdentityRecord> & { gsisId: string; fullName: string },
): NflverseIdentityRecord {
  const position = (overrides.position ?? 'WR') as Position;
  return {
    firstName: null,
    lastName: null,
    birthDate: null,
    teamRaw: overrides.team ?? null,
    team: null,
    season: 2025,
    rosterStatus: 'ACT',
    yearsExperience: null,
    draftRound: null,
    sleeperId: null,
    espnId: null,
    nameKey: nameKey(overrides.fullName),
    ...overrides,
    position,
  };
}

export interface RosterRowSpec {
  season?: number | string;
  team?: string;
  position?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  gsis_id?: string;
  sleeper_id?: string;
  espn_id?: string;
  years_exp?: string;
  status?: string;
}

/** Build a roster_{season}.csv body from row specs (NA = nflverse missing). */
export function rosterCsv(rows: RosterRowSpec[]): string {
  const header =
    'season,team,position,status,full_name,first_name,last_name,birth_date,gsis_id,sleeper_id,espn_id,years_exp';
  const lines = rows.map((r) =>
    [
      r.season ?? 2025,
      r.team ?? 'DET',
      r.position ?? 'WR',
      r.status ?? 'ACT',
      r.full_name ?? 'Test Player',
      r.first_name ?? 'NA',
      r.last_name ?? 'NA',
      r.birth_date ?? 'NA',
      r.gsis_id ?? 'NA',
      r.sleeper_id ?? 'NA',
      r.espn_id ?? 'NA',
      r.years_exp ?? 'NA',
    ].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

/** Build a players.csv body (enrichment dataset). */
export function playersCsv(
  rows: Array<{ gsis_id: string; display_name: string; birth_date?: string; draft_round?: string }>,
): string {
  const header = 'gsis_id,display_name,birth_date,draft_round';
  const lines = rows.map((r) =>
    [r.gsis_id, r.display_name, r.birth_date ?? 'NA', r.draft_round ?? 'NA'].join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
