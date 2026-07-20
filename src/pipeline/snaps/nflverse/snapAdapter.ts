// nflverse snap-count adapter → provider-neutral SnapRecord[]. Rejects bad rows
// without throwing; deterministic sort-before-dedup so conflicting duplicates
// resolve identically regardless of input order.

import { isSupportedPosition } from '@/pipeline/types';
import { nflverseSnapSchema, type NflverseSnapRaw } from '@/pipeline/snaps/nflverse/snapSchema';
import type { SeasonType, SnapPosition, SnapRecord } from '@/pipeline/snaps/types';

export type SnapRejectReason =
  | 'MALFORMED'
  | 'MISSING_GSIS'
  | 'UNSUPPORTED_SEASON'
  | 'DUPLICATE_ROW';

export interface SnapRejection {
  readonly reason: SnapRejectReason;
  readonly locator: string;
}

export interface SnapAdapterResult {
  readonly records: readonly SnapRecord[];
  readonly rejected: readonly SnapRejection[];
  readonly unsupportedPositionRows: number;
}

export interface SnapAdapterOptions {
  readonly seasons?: readonly number[];
  readonly includePostseason?: boolean;
}

function count(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// offense_pct arrives as 0–1 (modern nflreadr) or 0–100 (older). Normalize to
// 0–1; anything outside a sane band → null (unknown, never 0).
function pct(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '' || s === 'NA') return null;
  let n = typeof s === 'number' ? s : Number(s);
  if (!Number.isFinite(n)) return null;
  if (n > 1) n = n / 100; // 0–100 form
  return n > 0 && n <= 1 ? n : n === 0 ? 0 : null;
}

function intOf(v: number | string): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function positionOf(p: string | null | undefined): SnapPosition {
  return p && isSupportedPosition(p) ? p : 'OTHER';
}

function seasonTypeOf(a: string | null | undefined, b: string | null | undefined): SeasonType {
  const s = (a ?? b ?? 'REG').toUpperCase();
  return s.startsWith('POST') || s === 'POST' ? 'POST' : 'REG';
}

function toRecord(r: NflverseSnapRaw): SnapRecord | null {
  const season = intOf(r.season);
  const week = intOf(r.week);
  if (season === null || week === null) return null;
  const name = r.player_name ?? r.player ?? undefined;
  return {
    gsis: r.gsis_id,
    ...(name ? { playerName: name } : {}),
    position: positionOf(r.position),
    ...(r.team ? { team: r.team } : {}),
    season,
    week,
    seasonType: seasonTypeOf(r.season_type, r.game_type),
    offenseSnaps: count(r.offense_snaps),
    offensePct: pct(r.offense_pct),
  };
}

export function parseSnaps(raw: unknown, opts: SnapAdapterOptions = {}): SnapAdapterResult {
  const rejected: SnapRejection[] = [];
  const records: SnapRecord[] = [];
  let unsupportedPositionRows = 0;

  if (!Array.isArray(raw)) {
    return { records: [], rejected: [{ reason: 'MALFORMED', locator: '<payload>' }], unsupportedPositionRows: 0 };
  }

  const seasonFilter = opts.seasons ? new Set(opts.seasons) : null;
  const candidates: SnapRecord[] = [];
  raw.forEach((entry, i) => {
    const parsed = nflverseSnapSchema.safeParse(entry);
    if (!parsed.success) {
      // Distinguish a genuinely missing GSIS from other shape failures.
      const hasGsis = typeof (entry as { gsis_id?: unknown })?.gsis_id === 'string';
      rejected.push({ reason: hasGsis ? 'MALFORMED' : 'MISSING_GSIS', locator: `row_${i}` });
      return;
    }
    const rec = toRecord(parsed.data);
    if (!rec) {
      rejected.push({ reason: 'MALFORMED', locator: `row_${i}` });
      return;
    }
    if (!opts.includePostseason && rec.seasonType === 'POST') return; // filtered
    if (seasonFilter && !seasonFilter.has(rec.season)) {
      rejected.push({ reason: 'UNSUPPORTED_SEASON', locator: `${rec.gsis}:${rec.season}` });
      return;
    }
    candidates.push(rec);
  });

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
