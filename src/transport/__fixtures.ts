// Synthetic transport fixtures (Phase 5). SYNTHETIC ONLY — never real current-player data.
// Payloads are the RAW provider shapes the transport captures verbatim: nflverse resources
// are JSON arrays; Sleeper's players resource is a keyed object map. The ids mirror the
// Phase 4 ingestion fixtures (gsis 00-WR/00-QB, sleeper S-WR/S-QB with a gsis cross-link)
// so identity joins across providers and the full WR/QB inference path exercises.

import { NFLVERSE_DEFAULT_BASE_URL } from './providers/nflverse';
import { SLEEPER_DEFAULT_BASE_URL } from './providers/sleeper';
import type { FetchFn } from './client';

export const EFFECTIVE = '2025-09-30T00:00:00.000Z';
export const AS_OF = '2025-10-01T00:00:00.000Z';
export const SEASON = '2025';
export const FETCHED_AT = '2025-09-30T12:00:00.000Z';

const played = (i: number) => ({
  gameId: `2025_${String(i).padStart(2, '0')}_CIN`,
  kickoff: `2025-09-${String(i * 3 + 1).padStart(2, '0')}T17:00:00.000Z`,
});

// ---- nflverse raw payloads (JSON arrays) ----

export const nflverseIdentityRows = [
  { gsis_id: '00-WR', player_name: 'Test Receiver', position: 'WR', team: 'CIN', age: 26, seasons: 4, draft_round: 1, status: 'ACTIVE' },
  { gsis_id: '00-QB', player_name: 'Test Passer', position: 'QB', team: 'CIN', age: 28, seasons: 6, draft_round: 1, status: 'ACTIVE' },
  { gsis_id: '00-K', player_name: 'Test Kicker', position: 'K', team: 'CIN' },
];

export const nflverseRosterRows = [
  { gsis_id: '00-WR', team: 'CIN', season: 2025, position: 'WR', roster_status: 'ACTIVE' },
  { gsis_id: '00-QB', team: 'CIN', season: 2025, position: 'QB', roster_status: 'ACTIVE' },
];

export const nflverseScheduleRows = [
  ...[1, 2, 3, 4].map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'CLE', kickoff: played(i).kickoff })),
  ...[5, 6, 7].map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'PIT', kickoff: played(i).kickoff })),
];

export const nflverseGamesRows = [
  ...[1, 2, 3, 4].map((i) => ({ gsis_id: '00-WR', game_id: played(i).gameId, kickoff: played(i).kickoff, season: 2025, season_type: 'REG', team: 'CIN', targets: 8, snaps: 55, team_snaps: 65 })),
  ...[1, 2, 3, 4].map((i) => ({ gsis_id: '00-QB', game_id: played(i).gameId, kickoff: played(i).kickoff, season: 2025, season_type: 'REG', team: 'CIN', pass_attempts: 32, snaps: 66, team_snaps: 66 })),
];

export const nflverseParticipationRows = [1, 2, 3, 4].map((i) => ({ gsis_id: '00-WR', game_id: played(i).gameId, kickoff: played(i).kickoff, pass_play_snaps: 40, team_dropbacks: 42, covered: false }));

export const nflverseStartsRows = [1, 2, 3, 4].map((i) => ({ gsis_id: '00-QB', game_id: played(i).gameId, started: true }));

// ---- Sleeper raw payload (keyed object map, as `/players/nfl` returns) ----

export const sleeperPlayersMap: Record<string, unknown> = {
  'S-WR': { player_id: 'S-WR', gsis_id: '00-WR', full_name: 'Test Receiver', position: 'WR', team: 'CIN', age: 26, years_exp: 4, draft_round: 1, status: 'ACTIVE' },
  'S-QB': { player_id: 'S-QB', gsis_id: '00-QB', full_name: 'Test Passer', position: 'QB', team: 'CIN', age: 28, years_exp: 6, draft_round: 1, status: 'ACTIVE' },
};

// ---- URL map for the default registry + default config ----

export const NFLVERSE = NFLVERSE_DEFAULT_BASE_URL;
export const SLEEPER = SLEEPER_DEFAULT_BASE_URL;

export const URLS = {
  nflverseIdentity: `${NFLVERSE}/players/players.json`,
  nflverseRoster: `${NFLVERSE}/rosters/roster_${SEASON}.json`,
  nflverseSchedule: `${NFLVERSE}/schedules/schedule_${SEASON}.json`,
  nflverseGames: `${NFLVERSE}/stats/player_stats_${SEASON}.json`,
  nflverseParticipation: `${NFLVERSE}/participation/participation_${SEASON}.json`,
  nflverseStarts: `${NFLVERSE}/starts/starts_${SEASON}.json`,
  sleeperIdentity: `${SLEEPER}/players/nfl`,
} as const;

/** The full route table returning 200 JSON for every reference URL. */
export function defaultRoutes(): Record<string, RouteResponse> {
  return {
    [URLS.nflverseIdentity]: json(nflverseIdentityRows),
    [URLS.nflverseRoster]: json(nflverseRosterRows),
    [URLS.nflverseSchedule]: json(nflverseScheduleRows),
    [URLS.nflverseGames]: json(nflverseGamesRows),
    [URLS.nflverseParticipation]: json(nflverseParticipationRows),
    [URLS.nflverseStarts]: json(nflverseStartsRows),
    [URLS.sleeperIdentity]: json(sleeperPlayersMap),
  };
}

// ---- Mock fetch machinery (no real network; real Response objects) ----

export interface RouteResponse {
  readonly status?: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
  /** Throw a network-style error instead of responding. */
  readonly networkError?: boolean;
  /** Microtask ticks to defer completion by (shuffles completion order deterministically). */
  readonly ticks?: number;
}

export function json(value: unknown, extra: Partial<RouteResponse> = {}): RouteResponse {
  return { status: 200, body: JSON.stringify(value), headers: { 'content-type': 'application/json' }, ...extra };
}

/** Build a FetchFn that serves a fixed route table. Records the URLs it was called with. */
export function routingFetch(routes: Record<string, RouteResponse>, calls?: string[]): FetchFn {
  return async (url: string): Promise<Response> => {
    calls?.push(url);
    const route = routes[url];
    if (!route) {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    for (let i = 0; i < (route.ticks ?? 0); i++) await Promise.resolve();
    if (route.networkError) throw new TypeError('simulated network failure');
    const status = route.status ?? 200;
    // 204/304 are null-body statuses — a non-null body would make `new Response` throw.
    const nullBody = status === 204 || status === 304;
    return new Response(nullBody ? null : route.body ?? '', {
      status,
      headers: route.headers ?? { 'content-type': 'application/json' },
    });
  };
}
