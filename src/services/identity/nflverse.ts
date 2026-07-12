// Loads identity records from published nflverse datasets (plain CSV — no R,
// no Python, no parquet dependency).
//
// DATASETS (pinned; see docs/PLAYER_IDENTITY_PHASE1.md):
//   rosters  https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv
//            One row per player-team-season. Carries gsis_id AND sleeper_id —
//            this is the published Sleeper↔GSIS crosswalk the resolver uses.
//   players  https://github.com/nflverse/nflverse-data/releases/download/players/players.csv
//            One row per player all-time. Used only as ENRICHMENT for players
//            already in the roster (draft round, birth date backfill).
//
// Pure functions of CSV text — fetching/caching live in the ingestion
// orchestrator. Missing REQUIRED columns throw (schema drift must be loud);
// malformed individual rows are quarantined and counted, never fatal.

import { parseCsv, CsvParseError } from '@/services/identity/csv';
import {
  nameKey,
  normalizeBirthDate,
  normalizePosition,
  normalizeTeam,
} from '@/services/identity/normalize';
import type { NflverseIdentityRecord } from '@/services/identity/types';

export const NFLVERSE_ROSTER_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;
export const NFLVERSE_PLAYERS_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';

export class NflverseSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NflverseSchemaError';
  }
}

export interface NflverseExtraction {
  records: NflverseIdentityRecord[];
  invalidRecords: number;
  unsupportedPosition: number;
  /** Rows skipped because a later row for the same gsis_id already loaded. */
  duplicateIds: number;
  /** Rows skipped because they belong to a different season than requested. */
  otherSeasonRows: number;
  issues: string[];
}

const MAX_ISSUES = 25;

const ROSTER_REQUIRED_COLUMNS = ['season', 'team', 'position', 'full_name', 'gsis_id'] as const;

function cell(row: Record<string, string | undefined>, name: string): string | null {
  const v = row[name];
  if (v === undefined) return null;
  const t = v.trim();
  return t === '' || t === 'NA' ? null : t; // nflverse CSVs use NA for missing
}

function intCell(row: Record<string, string | undefined>, name: string): number | null {
  const v = cell(row, name);
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/**
 * Parse a roster_{season}.csv into identity records for the requested season.
 * Throws NflverseSchemaError when required columns are absent (schema drift);
 * quarantines malformed rows individually.
 */
export function loadNflverseRoster(csvText: string, season: number): NflverseExtraction {
  let table;
  try {
    table = parseCsv(csvText);
  } catch (err) {
    if (err instanceof CsvParseError) throw new NflverseSchemaError(`roster CSV unreadable: ${err.message}`);
    throw err;
  }
  const missing = ROSTER_REQUIRED_COLUMNS.filter((c) => !table.header.includes(c));
  if (missing.length > 0) {
    throw new NflverseSchemaError(`roster CSV is missing required column(s): ${missing.join(', ')}`);
  }

  const records: NflverseIdentityRecord[] = [];
  const seen = new Set<string>();
  const issues: string[] = [];
  let invalidRecords = 0;
  let unsupportedPosition = 0;
  let duplicateIds = 0;
  let otherSeasonRows = 0;

  for (const row of table.rows) {
    const rowSeason = intCell(row, 'season');
    if (rowSeason !== season) {
      otherSeasonRows += 1; // historical/foreign season rows are not errors
      continue;
    }
    const position = normalizePosition(cell(row, 'position'));
    if (position === null) {
      unsupportedPosition += 1;
      continue;
    }
    const gsisId = cell(row, 'gsis_id');
    const fullName = cell(row, 'full_name');
    if (!gsisId || !fullName) {
      invalidRecords += 1;
      if (issues.length < MAX_ISSUES) {
        issues.push(`nflverse roster row for "${fullName ?? gsisId ?? '?'}" lacks gsis_id/full_name`);
      }
      continue;
    }
    if (seen.has(gsisId)) {
      // Rosters can repeat a player (weekly rosters, team moves). First row
      // wins; repeats are counted so real duplicates stay observable.
      duplicateIds += 1;
      continue;
    }
    seen.add(gsisId);

    const teamRaw = cell(row, 'team');
    records.push({
      gsisId,
      fullName,
      firstName: cell(row, 'first_name'),
      lastName: cell(row, 'last_name'),
      birthDate: normalizeBirthDate(cell(row, 'birth_date')),
      position,
      teamRaw,
      team: normalizeTeam(teamRaw).team,
      season: rowSeason,
      rosterStatus: cell(row, 'status'),
      yearsExperience: intCell(row, 'years_exp'),
      draftRound: null, // filled from players.csv enrichment when available
      sleeperId: cell(row, 'sleeper_id'),
      espnId: cell(row, 'espn_id'),
      nameKey: nameKey(fullName),
    });
  }

  return { records, invalidRecords, unsupportedPosition, duplicateIds, otherSeasonRows, issues };
}

export interface NflversePlayersEnrichment {
  /** gsis_id → enrichment fields from players.csv. */
  byGsisId: Map<string, { draftRound: number | null; birthDate: string | null }>;
  invalidRecords: number;
}

/**
 * Parse players.csv into an enrichment map (draft round, birth-date backfill).
 * Requires gsis_id + display_name columns; other columns are optional.
 */
export function loadNflversePlayersEnrichment(csvText: string): NflversePlayersEnrichment {
  let table;
  try {
    table = parseCsv(csvText);
  } catch (err) {
    if (err instanceof CsvParseError) throw new NflverseSchemaError(`players CSV unreadable: ${err.message}`);
    throw err;
  }
  for (const col of ['gsis_id', 'display_name']) {
    if (!table.header.includes(col)) {
      throw new NflverseSchemaError(`players CSV is missing required column: ${col}`);
    }
  }
  const byGsisId = new Map<string, { draftRound: number | null; birthDate: string | null }>();
  let invalidRecords = 0;
  for (const row of table.rows) {
    const gsisId = cell(row, 'gsis_id');
    if (!gsisId) {
      invalidRecords += 1;
      continue;
    }
    if (byGsisId.has(gsisId)) continue; // first row wins
    byGsisId.set(gsisId, {
      draftRound: intCell(row, 'draft_round'),
      birthDate: normalizeBirthDate(cell(row, 'birth_date')),
    });
  }
  return { byGsisId, invalidRecords };
}

/** Apply players.csv enrichment onto roster records (returns new records). */
export function enrichNflverseRecords(
  records: NflverseIdentityRecord[],
  enrichment: NflversePlayersEnrichment | null,
): NflverseIdentityRecord[] {
  if (!enrichment) return records;
  return records.map((r) => {
    const extra = enrichment.byGsisId.get(r.gsisId);
    if (!extra) return r;
    return {
      ...r,
      draftRound: r.draftRound ?? extra.draftRound,
      birthDate: r.birthDate ?? extra.birthDate,
    };
  });
}
