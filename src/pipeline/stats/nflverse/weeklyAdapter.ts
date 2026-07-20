// nflverse weekly player-stats adapter. Turns the raw weekly dataset into
// provider-neutral WeeklyStatRecords, rejecting bad rows without throwing so one
// malformed row never poisons the feed. Deterministic output ordering.

import { isSupportedPosition } from '@/pipeline/types';
import {
  nflverseWeeklySchema,
  type NflverseWeeklyRaw,
} from '@/pipeline/stats/nflverse/weeklySchema';
import type {
  SeasonType,
  StatPosition,
  WeeklyStatRecord,
} from '@/pipeline/stats/types';

export type StatRejectReason =
  | 'MALFORMED'
  | 'MISSING_GSIS'
  | 'UNSUPPORTED_SEASON'
  | 'DUPLICATE_ROW';

export interface StatRejection {
  readonly reason: StatRejectReason;
  readonly locator: string;
}

export interface WeeklyAdapterResult {
  readonly records: readonly WeeklyStatRecord[];
  readonly rejected: readonly StatRejection[];
  /** Rows for a valid stat line whose position is not one of the four valued. */
  readonly unsupportedPositionRows: number;
}

export interface WeeklyAdapterOptions {
  /** When set, rows outside these seasons are rejected as UNSUPPORTED_SEASON. */
  readonly seasons?: readonly number[];
  /** Include postseason rows. Default false (regular season only). */
  readonly includePostseason?: boolean;
}

// nflverse numerics: number | numeric-string | "NA"/"" | null/undefined.
// A counting stat that is absent means the player recorded none → 0. A rate/
// auxiliary that is absent means unknown → null (caller decides which to use).
function count(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function optNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '' || s === 'NA') return null;
  const n = typeof s === 'number' ? s : Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOf(v: number | string): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function positionOf(p: string | null | undefined): StatPosition {
  if (p && isSupportedPosition(p)) return p;
  return 'OTHER';
}

function seasonTypeOf(v: string | null | undefined): SeasonType {
  return (v ?? 'REG').toUpperCase().startsWith('POST') ? 'POST' : 'REG';
}

function toRecord(r: NflverseWeeklyRaw): WeeklyStatRecord | null {
  const season = intOf(r.season);
  const week = intOf(r.week);
  if (season === null || week === null) return null;
  const name = r.player_display_name ?? r.player_name ?? undefined;
  return {
    gsis: r.player_id,
    ...(name ? { playerName: name } : {}),
    position: positionOf(r.position),
    ...(r.recent_team ?? r.team ? { team: (r.recent_team ?? r.team) as string } : {}),
    season,
    week,
    seasonType: seasonTypeOf(r.season_type),
    completions: count(r.completions),
    attempts: count(r.attempts),
    passingYards: count(r.passing_yards),
    passingTds: count(r.passing_tds),
    interceptions: count(r.interceptions),
    sacks: count(r.sacks),
    sackYards: count(r.sack_yards),
    carries: count(r.carries),
    rushingYards: count(r.rushing_yards),
    rushingTds: count(r.rushing_tds),
    receptions: count(r.receptions),
    targets: count(r.targets),
    receivingYards: count(r.receiving_yards),
    receivingTds: count(r.receiving_tds),
    receivingAirYards: optNumber(r.receiving_air_yards),
    receivingYardsAfterCatch: optNumber(r.receiving_yards_after_catch),
    targetShare: optNumber(r.target_share),
  };
}

export function parseWeekly(raw: unknown, opts: WeeklyAdapterOptions = {}): WeeklyAdapterResult {
  const rejected: StatRejection[] = [];
  const records: WeeklyStatRecord[] = [];
  let unsupportedPositionRows = 0;

  if (!Array.isArray(raw)) {
    return {
      records: [],
      rejected: [{ reason: 'MALFORMED', locator: '<payload>' }],
      unsupportedPositionRows: 0,
    };
  }

  const seasonFilter = opts.seasons ? new Set(opts.seasons) : null;

  // Pass 1: parse every entry into a candidate record (or a rejection). No dedup
  // here — dedup happens after a deterministic sort so which of two conflicting
  // duplicates "wins" never depends on input row order.
  const candidates: WeeklyStatRecord[] = [];
  raw.forEach((entry, i) => {
    const parsed = nflverseWeeklySchema.safeParse(entry);
    if (!parsed.success) {
      rejected.push({ reason: 'MALFORMED', locator: `row_${i}` });
      return;
    }
    const rec = toRecord(parsed.data);
    if (!rec) {
      rejected.push({ reason: 'MALFORMED', locator: `row_${i}` });
      return;
    }
    if (!rec.gsis) {
      rejected.push({ reason: 'MISSING_GSIS', locator: `row_${i}` });
      return;
    }
    if (!opts.includePostseason && rec.seasonType === 'POST') return; // filtered, not rejected
    if (seasonFilter && !seasonFilter.has(rec.season)) {
      rejected.push({ reason: 'UNSUPPORTED_SEASON', locator: `${rec.gsis}:${rec.season}` });
      return;
    }
    candidates.push(rec);
  });

  // Deterministic order: (gsis, season, week, seasonType) then full-content
  // JSON so conflicting duplicates resolve identically regardless of input order.
  candidates.sort((a, b) =>
    a.gsis !== b.gsis
      ? a.gsis.localeCompare(b.gsis)
      : a.season !== b.season
        ? a.season - b.season
        : a.week !== b.week
          ? a.week - b.week
          : a.seasonType !== b.seasonType
            ? a.seasonType.localeCompare(b.seasonType)
            : JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );

  // Pass 2: dedup by key, keeping the first (now order-independent).
  const seen = new Set<string>();
  for (const rec of candidates) {
    const key = `${rec.gsis}|${rec.season}|${rec.week}|${rec.seasonType}`;
    if (seen.has(key)) {
      rejected.push({ reason: 'DUPLICATE_ROW', locator: key });
      continue;
    }
    seen.add(key);
    if (rec.position === 'OTHER') unsupportedPositionRows += 1;
    records.push(rec);
  }

  rejected.sort((a, b) =>
    a.reason !== b.reason ? a.reason.localeCompare(b.reason) : a.locator.localeCompare(b.locator),
  );
  return { records, rejected, unsupportedPositionRows };
}
