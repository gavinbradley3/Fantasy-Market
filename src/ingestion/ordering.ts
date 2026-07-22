// Deterministic normalization primitives (Phase 4 §5/§6): canonical ordering, enum /
// team / position / timestamp normalization, and as-of clamping. Every non-semantic
// collection is sorted before it can influence a checksum. No wall clock, no locale.

import type {
  NormalizedInjuryStatus,
  NormalizedPosition,
  NormalizedPractice,
  NormalizedStatus,
} from './types';

/** Locale-independent ordinal string compare (mirrors the AIL's `compareStrings`). */
export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable sort a copy by a string key (canonical ordering for non-semantic sets). */
export function sortByKey<T>(items: readonly T[], key: (t: T) => string): T[] {
  return [...items].sort((x, y) => compareOrdinal(key(x), key(y)));
}

/** ISO-8601 normalization to UTC millisecond form; throws on an unparseable input. */
export function normalizeTimestamp(input: string): string {
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) throw new Error(`unparseable timestamp: ${input}`);
  return new Date(ms).toISOString();
}

/** True iff `sourceTimestamp` is on or before `asOf` (inclusive). No future leakage. */
export function withinAsOf(asOf: string, sourceTimestamp: string): boolean {
  return Date.parse(sourceTimestamp) <= Date.parse(asOf);
}

const POSITION_MAP: Readonly<Record<string, NormalizedPosition>> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE',
  HB: 'RB', FB: 'RB', // fullback/halfback → RB family for our four engines
};

/** Normalize a provider position string; null when unsupported (not one of the four). */
export function normalizePosition(raw: string | null | undefined): NormalizedPosition | null {
  if (!raw) return null;
  return POSITION_MAP[raw.trim().toUpperCase()] ?? null;
}

const TEAM_ALIASES: Readonly<Record<string, string>> = {
  // relocation / abbreviation drift → canonical current abbrev
  OAK: 'LV', SD: 'LAC', STL: 'LAR', WSH: 'WAS', LA: 'LAR', JAC: 'JAX', ARZ: 'ARI',
};

/** Canonical team abbreviation (uppercased, alias-folded). */
export function normalizeTeam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  return TEAM_ALIASES[up] ?? up;
}

const STATUS_MAP: Readonly<Record<string, NormalizedStatus>> = {
  ACTIVE: 'active', ACT: 'active',
  INJURED: 'injured', INJURY: 'injured',
  SUSPENDED: 'suspended', SUSP: 'suspended',
  INACTIVE: 'inactive', INA: 'inactive', CUT: 'inactive', FA: 'inactive',
};

export function normalizeStatus(raw: string | null | undefined): NormalizedStatus | null {
  if (!raw) return null;
  return STATUS_MAP[raw.trim().toUpperCase()] ?? null;
}

const INJURY_MAP: Readonly<Record<string, NormalizedInjuryStatus>> = {
  HEALTHY: 'HEALTHY', ACTIVE: 'HEALTHY', '': 'HEALTHY',
  Q: 'QUESTIONABLE', QUESTIONABLE: 'QUESTIONABLE',
  D: 'DOUBTFUL', DOUBTFUL: 'DOUBTFUL',
  O: 'OUT', OUT: 'OUT',
  IR: 'IR', PUP: 'PUP', SUSP: 'SUSPENDED', SUSPENDED: 'SUSPENDED',
};

/** Normalize an injury designation; unknown → UNKNOWN (with a caller warning). */
export function normalizeInjuryStatus(raw: string | null | undefined): { value: NormalizedInjuryStatus; known: boolean } {
  if (raw === null || raw === undefined) return { value: 'HEALTHY', known: true };
  const mapped = INJURY_MAP[raw.trim().toUpperCase()];
  return mapped ? { value: mapped, known: true } : { value: 'UNKNOWN', known: false };
}

const PRACTICE_MAP: Readonly<Record<string, NormalizedPractice>> = {
  FULL: 'FULL', FP: 'FULL', LIMITED: 'LIMITED', LP: 'LIMITED', DNP: 'DNP', '': 'UNKNOWN',
};

export function normalizePractice(raw: string | null | undefined): NormalizedPractice {
  if (!raw) return 'UNKNOWN';
  return PRACTICE_MAP[raw.trim().toUpperCase()] ?? 'UNKNOWN';
}
