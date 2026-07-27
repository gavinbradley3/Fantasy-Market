// Synthetic transport fixtures. SYNTHETIC ONLY — never real current-player data.
//
// These mirror the provider's REAL delivery shape, because that is what the transport has
// to survive: nflverse serves per-dataset RELEASES (a `timestamp.json` manifest plus a CSV
// asset), and Sleeper serves a keyed JSON object map. The rows below are authored as plain
// objects and serialized to CSV here, so every test that uses them exercises the real
// discovery + CSV-decode path rather than a JSON shortcut the production code never takes.
//
// The ids mirror the Phase 4 ingestion fixtures (gsis 00-WR/00-QB, sleeper S-WR/S-QB with a
// gsis cross-link) so identity joins across providers and the full WR/QB inference path
// exercises.

import { NFLVERSE_DEFAULT_BASE_URL } from './providers/nflverse';
import { SLEEPER_DEFAULT_BASE_URL } from './providers/sleeper';
import { assetPath, manifestPath, NFLVERSE_RELEASES } from './providers/nflverseReleases';
import type { FetchFn } from './client';

export const EFFECTIVE = '2025-09-30T00:00:00.000Z';
export const AS_OF = '2025-10-01T00:00:00.000Z';
export const SEASON = '2025';
export const FETCHED_AT = '2025-09-30T12:00:00.000Z';

/** The provider's own release stamp the fixture manifests report. */
export const RELEASE_STAMP = '2025-09-29 04:22:03 EDT';
export const RELEASE_STAMP_ISO = '2025-09-29T08:22:03.000Z';

const played = (i: number) => ({
  gameId: `2025_${String(i).padStart(2, '0')}_CIN`,
  kickoff: `2025-09-${String(i * 3 + 1).padStart(2, '0')}T17:00:00.000Z`,
});

// ---- nflverse raw rows (serialized to CSV below, as the real releases are) ----

export const nflverseIdentityRows = [
  { gsis_id: '00-WR', player_name: 'Test Receiver', position: 'WR', team: 'CIN', age: 26, seasons: 4, draft_round: 1, status: 'ACTIVE' },
  { gsis_id: '00-QB', player_name: 'Test Passer', position: 'QB', team: 'CIN', age: 28, seasons: 6, draft_round: 1, status: 'ACTIVE' },
  { gsis_id: '00-K', player_name: 'Test Kicker', position: 'K', team: 'CIN' },
];

export const nflverseRosterRows = [
  { gsis_id: '00-WR', team: 'CIN', season: 2025, position: 'WR', roster_status: 'ACTIVE' },
  { gsis_id: '00-QB', team: 'CIN', season: 2025, position: 'QB', roster_status: 'ACTIVE' },
];

// `home_qb_id`/`away_qb_id` mirror the real schedules release: the provider names each
// game's starting quarterback, which is the only official start information it publishes.
export const nflverseScheduleRows = [
  ...[1, 2, 3, 4].map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'CLE', kickoff: played(i).kickoff, home_qb_id: '00-QB', away_qb_id: '00-CLEQB' })),
  ...[5, 6, 7].map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'PIT', kickoff: played(i).kickoff, home_qb_id: '00-QB', away_qb_id: '00-PITQB' })),
];

export const nflverseGamesRows = [
  ...[1, 2, 3, 4].map((i) => ({ gsis_id: '00-WR', game_id: played(i).gameId, kickoff: played(i).kickoff, season: 2025, season_type: 'REG', team: 'CIN', targets: 8, snaps: 55, team_snaps: 65 })),
  ...[1, 2, 3, 4].map((i) => ({ gsis_id: '00-QB', game_id: played(i).gameId, kickoff: played(i).kickoff, season: 2025, season_type: 'REG', team: 'CIN', pass_attempts: 32, snaps: 66, team_snaps: 66 })),
];

/**
 * Participation, in the provider's real PLAY-LEVEL shape: one row per play, with the
 * on-field offense as a semicolon-separated GSIS list and `time_to_throw` populated only on
 * dropbacks. Games 1–4 each get 5 dropbacks plus one run play that must not be counted.
 */
export const nflverseParticipationRows = [1, 2, 3, 4].flatMap((i) => [
  ...[1, 2, 3, 4, 5].map((p) => ({
    nflverse_game_id: played(i).gameId,
    play_id: i * 100 + p,
    possession_team: 'CIN',
    offense_players: '00-WR;00-QB',
    time_to_throw: 2.7,
  })),
  // A run play: no throw time, so it counts toward neither the player nor the team total.
  { nflverse_game_id: played(i).gameId, play_id: i * 100 + 9, possession_team: 'CIN', offense_players: '00-WR;00-QB', time_to_throw: null },
]);

// ---- Sleeper raw payload (keyed object map, as `/players/nfl` returns) ----

export const sleeperPlayersMap: Record<string, unknown> = {
  'S-WR': { player_id: 'S-WR', gsis_id: '00-WR', full_name: 'Test Receiver', position: 'WR', team: 'CIN', age: 26, years_exp: 4, draft_round: 1, status: 'ACTIVE' },
  'S-QB': { player_id: 'S-QB', gsis_id: '00-QB', full_name: 'Test Passer', position: 'QB', team: 'CIN', age: 28, years_exp: 6, draft_round: 1, status: 'ACTIVE' },
};

// ---- CSV serialization (fixtures only — production never writes CSV) ----

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serialize rows to RFC 4180 CSV. Columns are the union of every row's keys in first-seen
 * order, so a row that omits a column yields an EMPTY cell — which decodes back to `null`,
 * not `0`, exactly as a real sparse provider export does.
 */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  const columns: string[] = [];
  for (const row of rows) for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k);
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  return lines.join('\n') + '\n';
}

// ---- URL map for the default registry + default config ----

export const NFLVERSE = NFLVERSE_DEFAULT_BASE_URL;
export const SLEEPER = SLEEPER_DEFAULT_BASE_URL;

const release = (capability: keyof typeof NFLVERSE_RELEASES) => NFLVERSE_RELEASES[capability]!;

/** Asset URL for an nflverse capability (season ignored for season-independent datasets). */
export function nflverseAssetUrl(capability: keyof typeof NFLVERSE_RELEASES, season = SEASON): string {
  return `${NFLVERSE}${assetPath(release(capability), season)}`;
}

/** Release-manifest URL for an nflverse capability. */
export function nflverseManifestUrl(capability: keyof typeof NFLVERSE_RELEASES): string {
  return `${NFLVERSE}${manifestPath(release(capability).tag)}`;
}

export const URLS = {
  nflverseIdentity: nflverseAssetUrl('identity'),
  nflverseRoster: nflverseAssetUrl('roster'),
  nflverseSchedule: nflverseAssetUrl('schedule'),
  nflverseGames: nflverseAssetUrl('games'),
  nflverseParticipation: nflverseAssetUrl('participation'),
  sleeperIdentity: `${SLEEPER}/players/nfl`,
} as const;

/** The full route table returning 200 for every reference URL, manifests included. */
export function defaultRoutes(): Record<string, RouteResponse> {
  const routes: Record<string, RouteResponse> = {
    [URLS.nflverseIdentity]: csv(nflverseIdentityRows),
    [URLS.nflverseRoster]: csv(nflverseRosterRows),
    [URLS.nflverseSchedule]: csv(nflverseScheduleRows),
    [URLS.nflverseGames]: csv(nflverseGamesRows),
    [URLS.nflverseParticipation]: csv(nflverseParticipationRows),
    [URLS.sleeperIdentity]: json(sleeperPlayersMap),
  };
  // Every distinct release tag advertises the same stamp, so a fixture refresh is stable.
  for (const capability of Object.keys(NFLVERSE_RELEASES) as (keyof typeof NFLVERSE_RELEASES)[]) {
    routes[nflverseManifestUrl(capability)] = manifest(RELEASE_STAMP);
  }
  return routes;
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

/** A CSV release asset, served the way GitHub serves one: as an opaque octet stream. */
export function csv(rows: readonly Record<string, unknown>[], extra: Partial<RouteResponse> = {}): RouteResponse {
  return { status: 200, body: toCsv(rows), headers: { 'content-type': 'application/octet-stream' }, ...extra };
}

/** An nflverse release manifest. */
export function manifest(lastUpdated: string, extra: Partial<RouteResponse> = {}): RouteResponse {
  return {
    status: 200,
    body: JSON.stringify({ last_updated: lastUpdated }),
    headers: { 'content-type': 'application/octet-stream' },
    ...extra,
  };
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
