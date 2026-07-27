// Synthetic provider payloads for ingestion tests (committed-fixture policy; never
// real current player data). Two providers with a cross-id link so identity joins.

import type { FreshnessMeta } from './types';
import type { ProviderSource } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import { sleeperAdapter } from './adapters/sleeper';

export const EFFECTIVE = '2025-09-30T00:00:00.000Z';
export const AS_OF = '2025-10-01T00:00:00.000Z';

export function freshness(provider: FreshnessMeta['provider'], effectiveDate = EFFECTIVE): FreshnessMeta {
  return { provider, fetchedAt: '2025-09-30T12:00:00.000Z', effectiveDate, lastUpdated: null, sourceVersion: 'v1' };
}

// game ids and kickoffs (all before AS_OF except the final scheduled one)
const played = (i: number) => ({ gameId: `2025_${String(i).padStart(2, '0')}_CIN`, kickoff: `2025-09-${String(i * 3 + 1).padStart(2, '0')}T17:00:00.000Z` });

export function nflverseSource(): ProviderSource {
  const wrGames = [1, 2, 3, 4].map((i) => ({ gsis_id: '00-WR', game_id: played(i).gameId, kickoff: played(i).kickoff, season: 2025, season_type: 'REG', team: 'CIN', targets: 8, snaps: 55, team_snaps: 65 }));
  const qbGames = [1, 2, 3, 4].map((i) => ({ gsis_id: '00-QB', game_id: played(i).gameId, kickoff: played(i).kickoff, season: 2025, season_type: 'REG', team: 'CIN', pass_attempts: 32, snaps: 66, team_snaps: 66 }));
  return {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [
        { gsis_id: '00-WR', player_name: 'Test Receiver', position: 'WR', team: 'CIN', age: 26, seasons: 4, draft_round: 1, status: 'ACTIVE' },
        { gsis_id: '00-QB', player_name: 'Test Passer', position: 'QB', team: 'CIN', age: 28, seasons: 6, draft_round: 1, status: 'ACTIVE' },
        { gsis_id: '00-K', player_name: 'Test Kicker', position: 'K', team: 'CIN' }, // unsupported position
      ],
      roster: [
        { gsis_id: '00-WR', team: 'CIN', season: 2025, position: 'WR', roster_status: 'ACTIVE' },
        { gsis_id: '00-QB', team: 'CIN', season: 2025, position: 'QB', roster_status: 'ACTIVE' },
      ],
      schedule: [
        ...[1, 2, 3, 4].map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'CLE', kickoff: played(i).kickoff })),
        ...[5, 6, 7].map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'PIT', kickoff: played(i).kickoff })),
      ],
      games: [...wrGames, ...qbGames],
      participation: [1, 2, 3, 4].map((i) => ({ gsis_id: '00-WR', game_id: played(i).gameId, kickoff: played(i).kickoff, pass_play_snaps: 40, team_dropbacks: 42, covered: false })),
      officialStarts: [1, 2, 3, 4].map((i) => ({ gsis_id: '00-QB', game_id: played(i).gameId, started: true })),
    },
  };
}

// ---------------------------------------------------------------------------
// Four-position provider payloads (Phase 11). SYNTHETIC, but shaped exactly like the
// provider's real weekly player-stats resource — the same column names the production
// adapter reads (see src/pipeline/stats/nflverse/weeklySchema.ts). Deliberately SEPARATE
// from the two-player fixture above so existing expectations are untouched.
//
// These are provider-shaped RAW ROWS, not engine inputs: nothing here is a model fixture,
// and no supplement field appears. Everything the engines eventually see is produced by
// the real normalization → inference → readiness path.
// ---------------------------------------------------------------------------

const GAMES = [1, 2, 3, 4] as const;

/** One weekly stat row in the provider's column vocabulary. */
function weeklyRow(gsis: string, i: number, stats: Record<string, number>) {
  return {
    gsis_id: gsis,
    game_id: played(i).gameId,
    kickoff: played(i).kickoff,
    season: 2025,
    season_type: 'REG',
    team: 'CIN',
    ...stats,
  };
}

export function fourPositionNflverseSource(): ProviderSource {
  return {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [
        { gsis_id: '00-QB4', player_name: 'Frontier Passer', position: 'QB', team: 'CIN', age: 27, seasons: 5, draft_round: 1, status: 'ACTIVE' },
        { gsis_id: '00-RB4', player_name: 'Frontier Runner', position: 'RB', team: 'CIN', age: 25, seasons: 3, draft_round: 2, status: 'ACTIVE' },
        { gsis_id: '00-WR4', player_name: 'Frontier Receiver', position: 'WR', team: 'CIN', age: 26, seasons: 4, draft_round: 1, status: 'ACTIVE' },
        { gsis_id: '00-TE4', player_name: 'Frontier End', position: 'TE', team: 'CIN', age: 28, seasons: 6, draft_round: 3, status: 'ACTIVE' },
      ],
      roster: [
        { gsis_id: '00-QB4', team: 'CIN', season: 2025, position: 'QB', roster_status: 'ACTIVE' },
        { gsis_id: '00-RB4', team: 'CIN', season: 2025, position: 'RB', roster_status: 'ACTIVE' },
        { gsis_id: '00-WR4', team: 'CIN', season: 2025, position: 'WR', roster_status: 'ACTIVE' },
        { gsis_id: '00-TE4', team: 'CIN', season: 2025, position: 'TE', roster_status: 'ACTIVE' },
      ],
      schedule: [
        ...GAMES.map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'CLE', kickoff: played(i).kickoff })),
        ...[5, 6, 7].map((i) => ({ game_id: played(i).gameId, season: 2025, week: i, season_type: 'REG', home_team: 'CIN', away_team: 'PIT', kickoff: played(i).kickoff })),
      ],
      games: [
        ...GAMES.map((i) => weeklyRow('00-QB4', i, {
          attempts: 34, completions: 22, passing_yards: 265, passing_tds: 2, interceptions: 1,
          sacks: 2, carries: 4, rushing_yards: 21, rushing_tds: 0, snaps: 68, team_snaps: 68,
        })),
        ...GAMES.map((i) => weeklyRow('00-RB4', i, {
          carries: 17, rushing_yards: 74, rushing_tds: 1, targets: 4, receptions: 3,
          receiving_yards: 24, receiving_tds: 0, snaps: 41, team_snaps: 68,
        })),
        ...GAMES.map((i) => weeklyRow('00-WR4', i, {
          targets: 9, receptions: 6, receiving_yards: 82, receiving_tds: 1, snaps: 58, team_snaps: 68,
        })),
        ...GAMES.map((i) => weeklyRow('00-TE4', i, {
          targets: 6, receptions: 4, receiving_yards: 44, receiving_tds: 0, snaps: 47, team_snaps: 68,
        })),
      ],
      participation: [
        ...GAMES.map((i) => ({ gsis_id: '00-WR4', game_id: played(i).gameId, kickoff: played(i).kickoff, pass_play_snaps: 38, team_dropbacks: 41, covered: false })),
        ...GAMES.map((i) => ({ gsis_id: '00-RB4', game_id: played(i).gameId, kickoff: played(i).kickoff, pass_play_snaps: 18, team_dropbacks: 41, covered: false })),
        ...GAMES.map((i) => ({ gsis_id: '00-TE4', game_id: played(i).gameId, kickoff: played(i).kickoff, pass_play_snaps: 30, team_dropbacks: 41, covered: false })),
      ],
      officialStarts: GAMES.map((i) => ({ gsis_id: '00-QB4', game_id: played(i).gameId, started: true })),
    },
  };
}

export function fourPositionSleeperSource(): ProviderSource {
  return {
    adapter: sleeperAdapter,
    freshness: freshness('sleeper'),
    payloads: {
      identity: [
        { sleeper_id: 'S-QB4', gsis_id: '00-QB4', full_name: 'Frontier Passer', position: 'QB', team: 'CIN', age: 27, years_exp: 5, draft_round: 1, status: 'ACTIVE' },
        { sleeper_id: 'S-RB4', gsis_id: '00-RB4', full_name: 'Frontier Runner', position: 'RB', team: 'CIN', age: 25, years_exp: 3, draft_round: 2, status: 'ACTIVE' },
        { sleeper_id: 'S-WR4', gsis_id: '00-WR4', full_name: 'Frontier Receiver', position: 'WR', team: 'CIN', age: 26, years_exp: 4, draft_round: 1, status: 'ACTIVE' },
        { sleeper_id: 'S-TE4', gsis_id: '00-TE4', full_name: 'Frontier End', position: 'TE', team: 'CIN', age: 28, years_exp: 6, draft_round: 3, status: 'ACTIVE' },
      ],
    },
  };
}

export function sleeperSource(): ProviderSource {
  return {
    adapter: sleeperAdapter,
    freshness: freshness('sleeper'),
    payloads: {
      // sleeper carries the gsis cross-link so identity joins to nflverse.
      identity: [
        { sleeper_id: 'S-WR', gsis_id: '00-WR', full_name: 'Test Receiver', position: 'WR', team: 'CIN', age: 26, years_exp: 4, draft_round: 1, status: 'ACTIVE' },
        { sleeper_id: 'S-QB', gsis_id: '00-QB', full_name: 'Test Passer', position: 'QB', team: 'CIN', age: 28, years_exp: 6, draft_round: 1, status: 'ACTIVE' },
      ],
      injuries: [
        { sleeper_id: 'S-WR', injury_status: 'Q', practice_status: 'LIMITED' },
      ],
    },
  };
}
