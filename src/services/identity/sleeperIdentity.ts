// Extracts validated, normalized identity records from the raw Sleeper
// GET /v1/players/nfl payload (the full player map, keyed by Sleeper id).
//
// Pure function of the payload — fetching, caching, and freshness live in the
// ingestion orchestrator. Per-record failures are quarantined and counted;
// they never discard the rest of the payload. Unsupported positions (K, DEF,
// FB, IDP…) are excluded from the extraction (the raw payload stays available
// in the ingestion cache untouched).

import {
  nameKey,
  normalizeBirthDate,
  normalizePosition,
  normalizeTeam,
} from '@/services/identity/normalize';
import { sleeperIdentityRawSchema } from '@/services/identity/schemas';
import type { SleeperIdentityRecord } from '@/services/identity/types';

export interface SleeperExtraction {
  records: SleeperIdentityRecord[];
  /** Supported-position entries that failed validation (quarantined). */
  invalidRecords: number;
  /** Entries skipped because their position is not QB/RB/WR/TE. */
  unsupportedPosition: number;
  /** Sample of validation issues for observability (bounded). */
  issues: string[];
}

const MAX_ISSUES = 25;

export class SleeperPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SleeperPayloadError';
  }
}

/**
 * Validate and normalize the raw players map. Throws SleeperPayloadError only
 * when the TOP-LEVEL shape is wrong (not an object map) — individual bad
 * records are quarantined, not fatal.
 */
export function extractSleeperIdentities(raw: unknown): SleeperExtraction {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SleeperPayloadError('Sleeper players payload is not an object map');
  }

  const records: SleeperIdentityRecord[] = [];
  const issues: string[] = [];
  let invalidRecords = 0;
  let unsupportedPosition = 0;

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // Cheap prefilter: only supported positions ever enter the directory.
    const rawPos = (value as { position?: unknown } | null)?.position;
    const position = normalizePosition(typeof rawPos === 'string' ? rawPos : null);
    if (position === null) {
      unsupportedPosition += 1;
      continue;
    }

    const parsed = sleeperIdentityRawSchema.safeParse(value);
    if (!parsed.success) {
      invalidRecords += 1;
      if (issues.length < MAX_ISSUES) {
        issues.push(`sleeper[${key}]: ${parsed.error.issues[0]?.message ?? 'invalid record'}`);
      }
      continue;
    }
    const p = parsed.data;

    const fullName =
      (p.full_name ?? '').trim() ||
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (!fullName) {
      invalidRecords += 1;
      if (issues.length < MAX_ISSUES) issues.push(`sleeper[${key}]: record has no usable name`);
      continue;
    }

    const teamNorm = normalizeTeam(p.team);
    // Sleeper's gsis_id is occasionally padded with whitespace — trim before use.
    const gsisId = (p.gsis_id ?? '').trim() || null;
    const age = typeof p.age === 'number' && p.age > 0 && p.age < 60 ? p.age : null;
    const yearsExp = typeof p.years_exp === 'number' && p.years_exp >= 0 ? p.years_exp : null;
    const depth =
      typeof p.depth_chart_order === 'number' && p.depth_chart_order >= 1
        ? p.depth_chart_order
        : null;

    records.push({
      sleeperId: p.player_id,
      fullName,
      firstName: p.first_name ?? null,
      lastName: p.last_name ?? null,
      birthDate: normalizeBirthDate(p.birth_date),
      age,
      position,
      fantasyPositions: p.fantasy_positions ?? [],
      teamRaw: p.team ?? null,
      team: teamNorm.team,
      yearsExperience: yearsExp,
      status: p.status ?? null,
      injuryStatus: p.injury_status ?? null,
      practiceStatus: p.practice_participation ?? null,
      depthChartOrder: depth,
      active: p.active ?? null,
      gsisId,
      espnId: p.espn_id != null ? String(p.espn_id) : null,
      yahooId: p.yahoo_id != null ? String(p.yahoo_id) : null,
      nameKey: nameKey(fullName),
    });
  }

  return { records, invalidRecords, unsupportedPosition, issues };
}
