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

/**
 * When a CURRENT-STATE resource's content became true.
 *
 * Some provider resources carry no historical effective date at all: an identity or players
 * export states a player's team and status *as of when the provider last rebuilt it*, with
 * no way to ask what it said in February. For those, the only defensible timestamp is the
 * provider's own last-updated stamp — the instant the content is attested for.
 *
 * The caller's `effectiveDate` is NOT that instant. It is the window the pipeline is valuing
 * for, and stamping a current-state payload with it asserts that today's roster was true
 * months ago, which as-of clamping would then wave through. Preferring `lastUpdated` makes
 * the clamp able to see the difference; falling back to `effectiveDate` only when the
 * provider publishes no stamp keeps behaviour unchanged for sources that never had one.
 */
export function attestedAt(freshness: { lastUpdated: string | null; effectiveDate: string }): string {
  return freshness.lastUpdated ?? freshness.effectiveDate;
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

/**
 * Provider status code → the four canonical statuses.
 *
 * The three-letter codes are nflverse's published roster-status vocabulary, mapped to the
 * nearest canonical meaning rather than left unrecognised (an unmapped code resolves to
 * `null`, which reads as "no status" and makes the player NOT_READY). Each mapping follows
 * the provider's own documented meaning: the reserve/PUP codes describe a player held out
 * through injury, the practice-squad and released codes describe a player who is simply not
 * on the active roster, and `SUS` is an explicit suspension.
 */
const STATUS_MAP: Readonly<Record<string, NormalizedStatus>> = {
  ACTIVE: 'active', ACT: 'active',
  INJURED: 'injured', INJURY: 'injured',
  SUSPENDED: 'suspended', SUSP: 'suspended', SUS: 'suspended',
  INACTIVE: 'inactive', INA: 'inactive', CUT: 'inactive', FA: 'inactive',
  // nflverse codes: reserve / physically-unable-to-perform / reserve non-football injury.
  RES: 'injured', PUP: 'injured', NFI: 'injured', RSN: 'injured',
  // nflverse codes: practice squad, exempt, not-with-team, retired, reserve-retired,
  // trade claim / traded — all "not on the active roster", none of them an injury.
  DEV: 'inactive', EXE: 'inactive', NWT: 'inactive', RET: 'inactive', RSR: 'inactive',
  TRC: 'inactive', TRD: 'inactive',
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
