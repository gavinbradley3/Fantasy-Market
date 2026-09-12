// nflverse-shaped reference adapter (Phase 4 §2). Normalizes already-fetched raw rows
// (arrays of objects) — no HTTP here. Advertises the stats-side capabilities. Never
// performs inference; only normalization + validation + enum/team/timestamp mapping.

import type { ProviderAdapter, NormalizeResult } from '../capabilities';
import {
  attestedAt,
  compareOrdinal,
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
import { ageFromBirthDate, derivedGameId, parseNflverseGameId, seasonsCompletedAsOf, weekBoundaryIso } from '../weekTiming';

const CAPS = new Set<Capability>(['identity', 'roster', 'schedule', 'games', 'participation', 'officialStarts']);

function ref(gsis: string | null): { key: string; value: string } | null {
  return gsis ? { key: 'gsis', value: gsis } : null;
}

/**
 * Season type from the provider's own vocabulary.
 *
 * The weekly stats export writes `REG`/`POST`/`PRE` directly; the schedules export writes
 * the specific postseason round instead (`WC`, `DIV`, `CON`, `SB`). Both are folded to the
 * three types the models use. Getting this wrong would silently pull postseason games into
 * career/recent windows that REGISTRY §20.F11 excludes.
 */
const POSTSEASON_ROUNDS: ReadonlySet<string> = new Set(['POST', 'WC', 'DIV', 'CON', 'SB']);

function seasonType(v: string | null): 'REG' | 'POST' | 'PRE' {
  const up = (v ?? 'REG').toUpperCase();
  if (POSTSEASON_ROUNDS.has(up)) return 'POST';
  return up === 'PRE' ? 'PRE' : 'REG';
}

/**
 * nflverse weekly roster `status` codes → the normalized roster-status union.
 *
 * Only the provider's documented codes are mapped; anything else keeps the existing
 * unknown-code behaviour (an `ACTIVE` default plus an `UNKNOWN_ENUM` warning). `CUT`/`RET`
 * have no exact member — `RESERVE` is the closest truthful reading ("carried by the team's
 * record for this week but not on the active roster") and is never `ACTIVE`.
 */
const ROSTER_STATUS_MAP: Readonly<Record<string, RosterRecord['rosterStatus']>> = {
  ACT: 'ACTIVE', ACTIVE: 'ACTIVE',
  DEV: 'PRACTICE_SQUAD', PRACTICE_SQUAD: 'PRACTICE_SQUAD',
  RES: 'RESERVE', RESERVE: 'RESERVE', INA: 'RESERVE', CUT: 'RESERVE', RET: 'RESERVE',
  EXE: 'RESERVE', TRC: 'RESERVE', TRD: 'RESERVE', NWT: 'RESERVE',
  IR: 'IR', PUP: 'PUP', NFI: 'NFI',
  SUS: 'SUSPENDED', SUSPENDED: 'SUSPENDED',
};

/** The last season the repository treats as the charted participation era (see §8.1). */
const CHARTED_ERA_LAST_SEASON = 2023;

/** Participation already aggregated to one row per player per game. */
function participationFromPlayerGames(
  rows: readonly Record<string, unknown>[],
  freshness: FreshnessMeta,
): NormalizeResult<ParticipationRecord> {
  const records: ParticipationRecord[] = [];
  const warnings: IngestionWarning[] = [];
  for (const row of rows) {
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
    records.push({
      canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate,
      gameId, kickoff, passPlaySnaps: num(row, 'pass_play_snaps'), teamDropbacks: num(row, 'team_dropbacks'),
      covered: bool(row, 'covered'),
    });
  }
  return { records, warnings };
}

/** One accumulating (game, player) cell while folding play rows. */
interface PlayerGameTally {
  gameId: string;
  gsis: string;
  passPlaySnaps: number;
}

/** Fold nflverse's play-by-play participation rows into per-player-per-game records. */
function participationFromPlays(
  rows: readonly Record<string, unknown>[],
  freshness: FreshnessMeta,
): NormalizeResult<ParticipationRecord> {
  const warnings: IngestionWarning[] = [];
  const players = new Map<string, PlayerGameTally>();
  const teamDropbacks = new Map<string, number>();
  const gameSeason = new Map<string, number>();
  let malformed = 0;

  for (const row of rows) {
    const gameId = str(row, 'nflverse_game_id') ?? str(row, 'game_id');
    if (!gameId) {
      malformed++;
      continue;
    }
    // The play-level export carries no timestamp; season/week come from the provider's own
    // game id, which is the only temporal information the resource supplies.
    const parsed = parseNflverseGameId(gameId);
    if (!parsed) {
      malformed++;
      continue;
    }
    gameSeason.set(gameId, parsed.season);

    // Not a dropback → contributes to neither counter. Both sides use the same rule.
    if (num(row, 'time_to_throw') === null) continue;

    teamDropbacks.set(gameId, (teamDropbacks.get(gameId) ?? 0) + 1);

    const offense = str(row, 'offense_players');
    if (!offense) continue;
    // A player appearing twice on one play (a malformed row) is counted once.
    for (const gsis of new Set(offense.split(';').map((s) => s.trim()).filter((s) => s.length > 0))) {
      const key = `${gameId}|${gsis}`;
      const tally = players.get(key);
      if (tally) tally.passPlaySnaps += 1;
      else players.set(key, { gameId, gsis, passPlaySnaps: 1 });
    }
  }

  if (malformed > 0) {
    warnings.push({
      code: 'DISCARDED_MALFORMED',
      provider: 'nflverse',
      detail: `${malformed} participation play row(s) had no parseable nflverse game id`,
    });
  }

  // Emit in a canonical order so the record set is byte-stable regardless of row order.
  const records: ParticipationRecord[] = [];
  for (const key of [...players.keys()].sort(compareOrdinal)) {
    const tally = players.get(key)!;
    const kickoff = weekBoundaryIso(gameSeason.get(tally.gameId) ?? null, parseNflverseGameId(tally.gameId)?.week ?? null);
    if (!kickoff) continue; // unreachable for a parsed id; keeps the type honest
    const season = gameSeason.get(tally.gameId) ?? 0;
    records.push({
      canonicalId: null,
      providerRef: { key: 'gsis', value: tally.gsis },
      freshness,
      sourceTimestamp: freshness.effectiveDate,
      gameId: tally.gameId,
      kickoff,
      passPlaySnaps: tally.passPlaySnaps,
      // The team total for the game the player was on the field for.
      teamDropbacks: teamDropbacks.get(tally.gameId) ?? null,
      covered: season <= CHARTED_ERA_LAST_SEASON,
    });
  }
  return { records, warnings };
}

export const nflverseAdapter: ProviderAdapter = {
  provider: 'nflverse',
  capabilities: CAPS,

  normalizeIdentity(raw: unknown, freshness: FreshnessMeta): NormalizeResult<PlayerRecord> {
    const records: PlayerRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      // The provider spells identity differently across resources: the players release uses
      // gsis_id/display_name/latest_team, the weekly stats export uses
      // player_id/player_name/team. First spelling found wins, so a resource that supplies a
      // real value is never overridden by a weaker one.
      const gsis = str(row, 'gsis_id') ?? str(row, 'player_id');
      const name = str(row, 'player_name') ?? str(row, 'full_name') ?? str(row, 'display_name');
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
        // The players export is a CURRENT-STATE resource — it states team/status as of the
        // provider's last rebuild, not as of the pipeline's window. See `attestedAt`.
        sourceTimestamp: attestedAt(freshness),
        // A pfr id, when the provider supplies one, is registered as a second stable
        // identity token so a resource keyed by pfr id can join to the same canonical
        // player. It never mints an identity on its own — gsis stays the primary token.
        providerIds: { gsis: r.value, ...(str(row, 'pfr_id') ? { pfr: str(row, 'pfr_id')! } : {}) },
        nameNormalized: name.toLowerCase(),
        position: pos,
        team: normalizeTeam(str(row, 'team') ?? str(row, 'latest_team')),
        // The provider publishes `age` on some resources and `birth_date` on others; age is
        // derived from the birth date only when no age column was supplied.
        age: num(row, 'age') ?? ageFromBirthDate(str(row, 'birth_date'), freshness.effectiveDate),
        // Derived from the time-invariant rookie season AT the source's effective date, so a
        // past board gets the experience the player actually had then. The provider's own
        // experience column is a CURRENT count and is only a fallback.
        nflSeasonsCompleted:
          seasonsCompletedAsOf(num(row, 'rookie_season') ?? num(row, 'rookie_year'), freshness.effectiveDate) ??
          num(row, 'seasons') ?? num(row, 'years_exp') ?? num(row, 'years_of_experience'),
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
      // The weekly-rosters release spells this `status` with the provider's three-letter
      // codes; older shapes used `roster_status` with the normalized names. Both map through
      // one table, and a code in neither vocabulary still warns rather than passing silently.
      const rs = (str(row, 'roster_status') ?? str(row, 'status') ?? 'ACTIVE').toUpperCase();
      const mapped = ROSTER_STATUS_MAP[rs];
      const rosterStatus = mapped ?? 'ACTIVE';
      if (!mapped) warnings.push({ code: 'UNKNOWN_ENUM', provider: 'nflverse', detail: `roster status ${rs}` });

      // A weekly roster row is a HISTORICAL statement: this team, this status, that week.
      // Timestamping it at the week boundary is what lets as-of clamping recover where a
      // player actually was at a past date, instead of reporting where he is today.
      const week = num(row, 'week');
      const asAt = weekBoundaryIso(season, week) ?? freshness.effectiveDate;
      records.push({
        canonicalId: null, providerRef: r, freshness, sourceTimestamp: asAt,
        team, season, week, position: normalizePosition(str(row, 'position')), rosterStatus,
      });
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
      // The schedules release publishes `gameday` (a calendar date) and `gametime` (a
      // US-Eastern wall clock with no offset). Only the DATE is used: folding in a local
      // time with an offset the provider never stated would misstate the instant, and the
      // windows and as-of clamp this feeds are date/week-resolution questions anyway.
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
      records.push({ canonicalId: null, providerRef: { key: 'game', value: gameId }, freshness, sourceTimestamp: freshness.effectiveDate, gameId, season, week, seasonType: seasonType(str(row, 'season_type') ?? str(row, 'game_type')), homeTeam: home, awayTeam: away, kickoff });
    }
    return { records, warnings };
  },

  normalizeGames(raw: unknown, freshness: FreshnessMeta): NormalizeResult<GameStatRecord> {
    const records: GameStatRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      // The provider ships this resource in two shapes. The schedule-joined shape uses
      // gsis_id / game_id / kickoff / team; the weekly player-stats export — the ordinary
      // nflverse download — uses player_id / season+week / recent_team and carries no
      // timestamp. Both are accepted; the first spelling found wins, so a row that supplies
      // real values is never overridden by a derived one.
      const gsis = str(row, 'gsis_id') ?? str(row, 'player_id');
      const team = normalizeTeam(str(row, 'team') ?? str(row, 'recent_team'));
      const season = num(row, 'season');
      const week = num(row, 'week');
      const r = ref(gsis);
      if (!r || !team) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'game stat row incomplete' });
        continue;
      }

      const gameId = str(row, 'game_id') ?? derivedGameId(season, week, team);
      const kickoffRaw = str(row, 'kickoff');
      // A real kickoff is always preferred. The derived week boundary is an ordering /
      // as-of key only (see weekTiming.ts) and is never presented as an observed kickoff.
      const derivedKickoff = kickoffRaw === null ? weekBoundaryIso(season, week) : null;
      if (!gameId || (!kickoffRaw && !derivedKickoff)) {
        warnings.push({
          code: 'DISCARDED_MALFORMED',
          provider: 'nflverse',
          detail: 'game stat row has neither a game_id/kickoff nor a usable season+week',
        });
        continue;
      }

      let kickoff: string;
      if (kickoffRaw !== null) {
        try {
          kickoff = normalizeTimestamp(kickoffRaw);
        } catch {
          warnings.push({ code: 'MISSING_TIMESTAMP', provider: 'nflverse', detail: `bad kickoff ${kickoffRaw}` });
          continue;
        }
      } else {
        kickoff = derivedKickoff as string;
      }

      const snaps = num(row, 'snaps');
      const teamSnaps = num(row, 'team_snaps');
      records.push({
        canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate,
        gameId, kickoff, season: season ?? 0, seasonType: seasonType(str(row, 'season_type') ?? str(row, 'game_type')), team,
        passAttempts: num(row, 'pass_attempts') ?? num(row, 'attempts'),
        carries: num(row, 'carries'), targets: num(row, 'targets'),
        snaps, teamSnaps, qbSnapShare: snaps !== null && teamSnaps !== null && teamSnaps > 0 ? snaps / teamSnaps : num(row, 'qb_snap_share'),
        // Carried verbatim from the provider row; an absent column stays null. Two columns
        // were renamed when nflverse moved the weekly export from the `player_stats` release
        // to `stats_player` (`interceptions` → `passing_interceptions`, `sacks` →
        // `sacks_suffered`); both spellings are read so either release normalizes.
        completions: num(row, 'completions'),
        passingYards: num(row, 'passing_yards'),
        passingTds: num(row, 'passing_tds'),
        interceptions: num(row, 'interceptions') ?? num(row, 'passing_interceptions'),
        sacks: num(row, 'sacks') ?? num(row, 'sacks_suffered'),
        rushingYards: num(row, 'rushing_yards'),
        rushingTds: num(row, 'rushing_tds'),
        receptions: num(row, 'receptions'),
        receivingYards: num(row, 'receiving_yards'),
        receivingTds: num(row, 'receiving_tds'),
        // Both are published in this same export and were previously dropped, which left the
        // WR engine's `average_depth_of_target` and `target_share` on constant fallbacks for
        // every receiver in the league. Read verbatim; an absent column stays null.
        receivingAirYards: num(row, 'receiving_air_yards'),
        targetShare: num(row, 'target_share'),
      });
    }
    return { records, warnings };
  },

  /**
   * Participation.
   *
   * nflverse publishes this PLAY BY PLAY: one row per play, carrying the game id, the
   * possessing team, and `offense_players` — the semicolon-separated GSIS ids of the eleven
   * players on the field. The normalized record is per player per game, so the play rows are
   * folded into that shape here. Folding rows into the record the boundary declares is
   * normalization, the same as mapping a team abbreviation; no rate, share or projection is
   * computed, and nothing is estimated.
   *
   * DROPBACK RULE. A play counts as a dropback exactly when the provider recorded a
   * `time_to_throw` for it — a throw-timing measurement only exists on a play the passer
   * dropped back for. This is the provider's own signal, not a reconstruction from
   * personnel or formation. It is deliberately conservative: a sack or a scramble with no
   * recorded throw time is not counted, so `passPlaySnaps` and `teamDropbacks` are both
   * floors rather than inflated guesses, and the ratio between them stays honest because
   * the same rule defines both.
   *
   * COVERAGE. `covered` marks the charted era (≤2023) that the route model treats as a
   * PROXY rung; later seasons are reported as uncovered, which routes them to the strictly
   * more cautious estimate rung. Where the provider's own era classification is unclear the
   * under-claiming side is taken on purpose.
   *
   * The per-player-game shape (`gsis_id` + `pass_play_snaps` + `team_dropbacks`) is still
   * accepted, so a provider that publishes participation already aggregated normalizes
   * through the same method.
   */
  normalizeParticipation(raw: unknown, freshness: FreshnessMeta): NormalizeResult<ParticipationRecord> {
    const rows = asRows(raw);
    const isPlayLevel = rows.some((row) => str(row, 'offense_players') !== null);
    return isPlayLevel
      ? participationFromPlays(rows, freshness)
      : participationFromPlayerGames(rows, freshness);
  },

  /**
   * Official starts.
   *
   * nflverse publishes no per-player starts resource, but its SCHEDULES release names the
   * starting quarterback for each team in each game (`home_qb_id` / `away_qb_id`, as GSIS
   * ids). That is the provider stating who started — an official fact, not an inference —
   * so a schedule row yields one `started: true` record per named starter.
   *
   * Only starters are emitted. A player with no record for a game is NOT recorded as "did
   * not start": the absence means the provider named someone else, and the downstream D2
   * ladder already distinguishes official starts from inferred functional starts. Emitting
   * a false `started` for every other player would manufacture a fact from silence.
   *
   * The per-player shape (`gsis_id` + `started`) is still accepted, so a provider or
   * resource that does publish explicit start flags normalizes without a second adapter.
   */
  normalizeOfficialStarts(raw: unknown, freshness: FreshnessMeta): NormalizeResult<OfficialStartRecord> {
    const records: OfficialStartRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const gameId = str(row, 'game_id');
      if (!gameId) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: 'official-start row has no game_id' });
        continue;
      }

      const starterIds = [str(row, 'home_qb_id'), str(row, 'away_qb_id')].filter((v): v is string => v !== null);
      if (starterIds.length > 0) {
        for (const gsis of starterIds) {
          records.push({
            canonicalId: null, providerRef: { key: 'gsis', value: gsis }, freshness,
            sourceTimestamp: freshness.effectiveDate, gameId, started: true,
          });
        }
        continue;
      }

      const r = ref(str(row, 'gsis_id'));
      if (!r) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'nflverse', detail: `official-start row ${gameId} names no starter` });
        continue;
      }
      records.push({ canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate, gameId, started: bool(row, 'started') });
    }
    return { records, warnings };
  },
};
