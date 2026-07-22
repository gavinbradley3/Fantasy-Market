// nflverse-shaped reference adapter (Phase 4 §2). Normalizes already-fetched raw rows
// (arrays of objects) — no HTTP here. Advertises the stats-side capabilities. Never
// performs inference; only normalization + validation + enum/team/timestamp mapping.

import type { ProviderAdapter, NormalizeResult } from '../capabilities';
import {
  normalizePosition,
  normalizeStatus,
  normalizeTeam,
  normalizeTimestamp,
} from '../ordering';
import type {
  Capability,
  FreshnessMeta,
  GameStatRecord,
  IngestionWarning,
  OfficialStartRecord,
  ParticipationRecord,
  PlayerRecord,
  RosterRecord,
  ScheduleGameRecord,
} from '../types';
import { asRows, bool, num, str } from './helpers';

const CAPS = new Set<Capability>(['identity', 'roster', 'schedule', 'games', 'participation', 'officialStarts']);

function ref(gsis: string | null): { key: string; value: string } | null {
  return gsis ? { key: 'gsis', value: gsis } : null;
}

function seasonType(v: string | null): 'REG' | 'POST' | 'PRE' {
  const up = (v ?? 'REG').toUpperCase();
  return up === 'POST' || up === 'PRE' ? up : 'REG';
}

export const nflverseAdapter: ProviderAdapter = {
  provider: 'nflverse',
  capabilities: CAPS,

  normalizeIdentity(raw: unknown, freshness: FreshnessMeta): NormalizeResult<PlayerRecord> {
    const records: PlayerRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const gsis = str(row, 'gsis_id') ?? str(row, 'player_id');
      const name = str(row, 'player_name') ?? str(row, 'full_name');
      const r = ref(gsis);
      if (!r || !name) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'identity row missing gsis_id or name' });
        continue;
      }
      const pos = normalizePosition(str(row, 'position'));
      if (str(row, 'position') && pos === null) {
        warnings.push({ code: 'UNSUPPORTED_POSITION', provider: 'nflverse', detail: `${gsis}: ${String(row.position)}` });
      }
      records.push({
        canonicalId: null,
        providerRef: r,
        freshness,
        sourceTimestamp: freshness.effectiveDate,
        providerIds: { gsis: r.value },
        nameNormalized: name.toLowerCase(),
        position: pos,
        team: normalizeTeam(str(row, 'team')),
        age: num(row, 'age'),
        nflSeasonsCompleted: num(row, 'seasons') ?? num(row, 'years_exp'),
        draftRound: num(row, 'draft_round'),
        status: normalizeStatus(str(row, 'status')),
        injuryDesignation: str(row, 'injury'),
      });
    }
    return { records, warnings };
  },

  normalizeRoster(raw: unknown, freshness: FreshnessMeta): NormalizeResult<RosterRecord> {
    const records: RosterRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const gsis = str(row, 'gsis_id');
      const team = normalizeTeam(str(row, 'team'));
      const season = num(row, 'season');
      const r = ref(gsis);
      if (!r || !team || season === null) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'roster row missing gsis/team/season' });
        continue;
      }
      const rs = (str(row, 'roster_status') ?? 'ACTIVE').toUpperCase();
      const valid = ['ACTIVE', 'IR', 'PUP', 'NFI', 'SUSPENDED', 'PRACTICE_SQUAD', 'RESERVE'];
      const rosterStatus = (valid.includes(rs) ? rs : 'ACTIVE') as RosterRecord['rosterStatus'];
      if (!valid.includes(rs)) warnings.push({ code: 'UNKNOWN_ENUM', provider: 'nflverse', detail: `roster_status ${rs}` });
      records.push({ canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate, team, season, position: normalizePosition(str(row, 'position')), rosterStatus });
    }
    return { records, warnings };
  },

  normalizeSchedule(raw: unknown, freshness: FreshnessMeta): NormalizeResult<ScheduleGameRecord> {
    const records: ScheduleGameRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const gameId = str(row, 'game_id');
      const home = normalizeTeam(str(row, 'home_team'));
      const away = normalizeTeam(str(row, 'away_team'));
      const kickoffRaw = str(row, 'kickoff') ?? str(row, 'gameday');
      const season = num(row, 'season');
      const week = num(row, 'week');
      if (!gameId || !home || !away || !kickoffRaw || season === null || week === null) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'schedule row incomplete' });
        continue;
      }
      let kickoff: string;
      try {
        kickoff = normalizeTimestamp(kickoffRaw);
      } catch {
        warnings.push({ code: 'MISSING_TIMESTAMP', provider: 'nflverse', detail: `bad kickoff ${kickoffRaw}` });
        continue;
      }
      // Schedule is a team-level record; providerRef carries the game id as the key.
      records.push({ canonicalId: null, providerRef: { key: 'game', value: gameId }, freshness, sourceTimestamp: freshness.effectiveDate, gameId, season, week, seasonType: seasonType(str(row, 'season_type')), homeTeam: home, awayTeam: away, kickoff });
    }
    return { records, warnings };
  },

  normalizeGames(raw: unknown, freshness: FreshnessMeta): NormalizeResult<GameStatRecord> {
    const records: GameStatRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const gsis = str(row, 'gsis_id');
      const gameId = str(row, 'game_id');
      const kickoffRaw = str(row, 'kickoff');
      const team = normalizeTeam(str(row, 'team'));
      const r = ref(gsis);
      if (!r || !gameId || !kickoffRaw || !team) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'game stat row incomplete' });
        continue;
      }
      let kickoff: string;
      try {
        kickoff = normalizeTimestamp(kickoffRaw);
      } catch {
        warnings.push({ code: 'MISSING_TIMESTAMP', provider: 'nflverse', detail: `bad kickoff ${kickoffRaw}` });
        continue;
      }
      const snaps = num(row, 'snaps');
      const teamSnaps = num(row, 'team_snaps');
      records.push({
        canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate,
        gameId, kickoff, season: num(row, 'season') ?? 0, seasonType: seasonType(str(row, 'season_type')), team,
        passAttempts: num(row, 'pass_attempts'), carries: num(row, 'carries'), targets: num(row, 'targets'),
        snaps, teamSnaps, qbSnapShare: snaps !== null && teamSnaps !== null && teamSnaps > 0 ? snaps / teamSnaps : num(row, 'qb_snap_share'),
      });
    }
    return { records, warnings };
  },

  normalizeParticipation(raw: unknown, freshness: FreshnessMeta): NormalizeResult<ParticipationRecord> {
    const records: ParticipationRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const gsis = str(row, 'gsis_id');
      const gameId = str(row, 'game_id');
      const kickoffRaw = str(row, 'kickoff');
      const r = ref(gsis);
      if (!r || !gameId || !kickoffRaw) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'participation row incomplete' });
        continue;
      }
      let kickoff: string;
      try {
        kickoff = normalizeTimestamp(kickoffRaw);
      } catch {
        warnings.push({ code: 'MISSING_TIMESTAMP', provider: 'nflverse', detail: `bad kickoff ${kickoffRaw}` });
        continue;
      }
      records.push({ canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate, gameId, kickoff, passPlaySnaps: num(row, 'pass_play_snaps'), teamDropbacks: num(row, 'team_dropbacks'), covered: bool(row, 'covered') });
    }
    return { records, warnings };
  },

  normalizeOfficialStarts(raw: unknown, freshness: FreshnessMeta): NormalizeResult<OfficialStartRecord> {
    const records: OfficialStartRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const gsis = str(row, 'gsis_id');
      const gameId = str(row, 'game_id');
      const r = ref(gsis);
      if (!r || !gameId) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'official-start row incomplete' });
        continue;
      }
      records.push({ canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate, gameId, started: bool(row, 'started') });
    }
    return { records, warnings };
  },
};
