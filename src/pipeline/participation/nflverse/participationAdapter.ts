// nflverse participation adapter → neutral ParticipationPlay[]. Parses the
// semicolon-delimited GSIS offense list, dedups ids within a play, flags
// incomplete personnel, and rejects bad rows without throwing. Deterministic
// sort-before-dedup on (game_id, play_id).

import { qualifyPlay } from '@/pipeline/participation/playQualification';
import {
  participationPlaySchema,
  type ParticipationPlayRaw,
} from '@/pipeline/participation/nflverse/participationSchema';
import type { ParticipationPlay, SeasonType } from '@/pipeline/participation/types';

export type ParticipationRejectReason =
  | 'MALFORMED'
  | 'MISSING_GAME_OR_PLAY_ID'
  | 'MALFORMED_PLAYERS'
  | 'UNSUPPORTED_SEASON'
  | 'DUPLICATE_PLAY';

export interface ParticipationRejection {
  readonly reason: ParticipationRejectReason;
  readonly locator: string;
}

export interface ParticipationAdapterResult {
  readonly plays: readonly ParticipationPlay[];
  readonly rejected: readonly ParticipationRejection[];
  readonly incompletePersonnelPlays: number;
}

export interface ParticipationAdapterOptions {
  readonly seasons?: readonly number[];
  readonly includePostseason?: boolean;
  /** Minimum offensive ids for a play's personnel to count as complete. */
  readonly minPersonnel?: number;
}

function intOf(v: number | string): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function seasonTypeOf(v: string | null | undefined): SeasonType {
  return (v ?? 'REG').toUpperCase().startsWith('POST') ? 'POST' : 'REG';
}

// Parse a ";"-delimited GSIS list; dedup; drop blanks. Returns null when the raw
// value is present but unparseable into any id.
function parsePlayers(raw: string | null | undefined): { ids: string[]; malformed: boolean } {
  if (raw === null || raw === undefined || raw.trim() === '') return { ids: [], malformed: false };
  const parts = raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // A non-empty raw string that yields no GSIS-shaped token is malformed.
  const malformed = parts.length === 0;
  return { ids: [...new Set(parts)], malformed };
}

export function parseParticipation(
  raw: unknown,
  opts: ParticipationAdapterOptions = {},
): ParticipationAdapterResult {
  const rejected: ParticipationRejection[] = [];
  const plays: ParticipationPlay[] = [];
  let incompletePersonnelPlays = 0;

  if (!Array.isArray(raw)) {
    return { plays: [], rejected: [{ reason: 'MALFORMED', locator: '<payload>' }], incompletePersonnelPlays: 0 };
  }

  const seasonFilter = opts.seasons ? new Set(opts.seasons) : null;
  const minPersonnel = opts.minPersonnel ?? 5;

  interface Candidate extends ParticipationPlay {
    readonly _key: string;
  }
  const candidates: Candidate[] = [];

  raw.forEach((entry, i) => {
    const parsed = participationPlaySchema.safeParse(entry);
    if (!parsed.success) {
      rejected.push({ reason: 'MALFORMED', locator: `row_${i}` });
      return;
    }
    const p: ParticipationPlayRaw = parsed.data;
    const gameId = String(p.game_id ?? p.nflverse_game_id ?? '').trim();
    const playId = String(p.play_id ?? '').trim();
    if (!gameId || !playId) {
      rejected.push({ reason: 'MISSING_GAME_OR_PLAY_ID', locator: `row_${i}` });
      return;
    }
    const season = intOf(p.season);
    const week = intOf(p.week);
    if (season === null || week === null) {
      rejected.push({ reason: 'MALFORMED', locator: `${gameId}:${playId}` });
      return;
    }
    const seasonType = seasonTypeOf(p.season_type);
    if (!opts.includePostseason && seasonType === 'POST') return; // filtered
    if (seasonFilter && !seasonFilter.has(season)) {
      rejected.push({ reason: 'UNSUPPORTED_SEASON', locator: `${gameId}:${season}` });
      return;
    }
    const { ids, malformed } = parsePlayers(p.offense_players);
    if (malformed) {
      rejected.push({ reason: 'MALFORMED_PLAYERS', locator: `${gameId}:${playId}` });
      return;
    }
    const offenseTeam = (p.posteam ?? p.possession_team ?? '').trim();
    const personnelComplete = ids.length >= minPersonnel;
    if (ids.length > 0 && !personnelComplete) incompletePersonnelPlays += 1;
    candidates.push({
      _key: `${gameId}|${playId}`,
      gameId,
      playId,
      season,
      week,
      seasonType,
      offenseTeam,
      offensePlayers: ids,
      isDropback: qualifyPlay(p).isDropback,
      personnelComplete,
    });
  });

  candidates.sort((a, b) =>
    a.gameId !== b.gameId
      ? a.gameId.localeCompare(b.gameId)
      : a.playId !== b.playId
        ? a.playId.localeCompare(b.playId)
        : JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );

  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c._key)) {
      rejected.push({ reason: 'DUPLICATE_PLAY', locator: c._key });
      continue;
    }
    seen.add(c._key);
    const { _key, ...play } = c;
    void _key;
    plays.push(play);
  }

  rejected.sort((a, b) =>
    a.reason !== b.reason ? a.reason.localeCompare(b.reason) : a.locator.localeCompare(b.locator),
  );
  return { plays, rejected, incompletePersonnelPlays };
}
