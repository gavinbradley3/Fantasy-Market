// Versioned normalization utilities for cross-provider identity comparison.
//
// Everything here is PURE and deterministic. Raw provider values are always
// preserved alongside normalized ones (the extractors keep `teamRaw`, and name
// keys live next to the raw full name) so audit output can show both.
//
// NORMALIZATION_VERSION is recorded in every directory snapshot: if these
// rules change, previously committed snapshots are distinguishable from ones
// produced under the new rules.

import type { Position } from '@/types/market';

export const NORMALIZATION_VERSION = 1;

// ---------- positions ----------

const SUPPORTED_POSITIONS: ReadonlySet<string> = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Map a raw provider position label to a supported PlayerTicker position, or
 * null when unsupported (K, DEF, FB, OL, IDP…). Only exact, unambiguous
 * synonyms are mapped — FB is deliberately NOT treated as RB.
 */
export function normalizePosition(raw: string | null | undefined): Position | null {
  if (raw == null) return null;
  const p = raw.trim().toUpperCase();
  if (SUPPORTED_POSITIONS.has(p)) return p as Position;
  return null;
}

/** True when two positions may refer to the same player across providers. */
export function positionsCompatible(
  a: Position,
  b: Position,
  fantasyPositions: readonly string[] = [],
): boolean {
  if (a === b) return true;
  // A provider's multi-position list (e.g. Sleeper fantasy_positions) can
  // reconcile a primary-position disagreement (TE listed as WR elsewhere).
  return fantasyPositions.some((fp) => normalizePosition(fp) === b);
}

// ---------- teams ----------

/** The 32 canonical franchise abbreviations PlayerTicker uses (Sleeper-style). */
export const CANONICAL_TEAMS: ReadonlySet<string> = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET',
  'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE',
  'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
]);

// Aliases seen across providers (nflverse, ESPN-style, PFR-style) plus
// relocated-franchise history. Values are canonical abbreviations.
const TEAM_ALIASES: Readonly<Record<string, string>> = {
  JAC: 'JAX',
  WSH: 'WAS',
  LA: 'LAR',
  STL: 'LAR',
  SD: 'LAC',
  OAK: 'LV',
  GNB: 'GB',
  KAN: 'KC',
  NWE: 'NE',
  NOR: 'NO',
  SFO: 'SF',
  TAM: 'TB',
  LVR: 'LV',
  ARZ: 'ARI',
  BLT: 'BAL',
  CLV: 'CLE',
  HST: 'HOU',
};

// Values providers use to mean "no team".
const FREE_AGENT_VALUES: ReadonlySet<string> = new Set(['', 'FA', 'FA*', 'NONE', 'NULL']);

export interface TeamNormalization {
  /** Canonical abbreviation, or null for free agent / unknown. */
  team: string | null;
  /** True when the raw value was recognized (incl. explicit free-agent values). */
  recognized: boolean;
}

export function normalizeTeam(raw: string | null | undefined): TeamNormalization {
  if (raw == null) return { team: null, recognized: true }; // null team = free agent
  const t = raw.trim().toUpperCase();
  if (FREE_AGENT_VALUES.has(t)) return { team: null, recognized: true };
  if (CANONICAL_TEAMS.has(t)) return { team: t, recognized: true };
  const alias = TEAM_ALIASES[t];
  if (alias) return { team: alias, recognized: true };
  // Unknown label: do NOT guess a franchise. Treat as no-team but flag it.
  return { team: null, recognized: false };
}

// ---------- names ----------

const NAME_SUFFIXES: ReadonlySet<string> = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/**
 * Normalized comparison key for a person name: lowercase, diacritics stripped,
 * punctuation (apostrophes, periods, hyphens) removed, generational suffixes
 * dropped, whitespace collapsed. "Ja'Marr Chase" → "jamarrchase";
 * "Odell Beckham Jr." → "odellbeckham"; "Amon-Ra St. Brown" → "amonrastbrown".
 *
 * Keys are for CANDIDATE COMPARISON only — the raw display name is always
 * preserved on the record. A key never erases a real distinction on its own:
 * two different players sharing a key is exactly the ambiguity the resolver
 * refuses to guess about.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z ]/g, ' ') // apostrophes, periods, hyphens, digits → space
    .split(/\s+/)
    .filter((w) => w.length > 0 && !NAME_SUFFIXES.has(w))
    .join('');
}

/**
 * Normalize a birth date to YYYY-MM-DD, or null when absent/unparseable.
 * Accepts ISO dates and US-style M/D/YYYY (seen in provider data). Rejects
 * impossible calendar dates rather than letting them silently pass.
 */
export function normalizeBirthDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '') return null;

  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (us) {
    [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])];
  } else {
    return null;
  }
  // Validate as a real calendar date (Date.UTC would roll 2000-02-31 over).
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  if (y < 1900 || y > 2100) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}
