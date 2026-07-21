// Window helpers (REGISTRY §20.F11): postseason exclusion, rolling l4/l8 windows,
// season-to-date, covered games. All pure and as-of-clamped.

import { stableSortBy } from '@/inference/util/ordering';
import type { PlayerGameUsage } from './types';

/** REGISTRY §20.F11 — postseason games are excluded from all windows (V1). */
export function regularSeasonOnly(rows: readonly PlayerGameUsage[]): PlayerGameUsage[] {
  return rows.filter((r) => r.seasonType === 'REG');
}

/**
 * The player's most recent `n` regular-season games with kickoff strictly before
 * `asOf` that carry a usage row. Ordered most-recent-first; ties broken by greatest
 * gameId (REGISTRY §20.F11 rolling-window rule). Returns up to `n` rows.
 */
export function rollingWindow(
  rows: readonly PlayerGameUsage[],
  canonicalId: string,
  asOf: string,
  n: number,
): PlayerGameUsage[] {
  const asOfMs = Date.parse(asOf);
  const eligible = regularSeasonOnly(rows).filter(
    (r) => r.canonicalId === canonicalId && Date.parse(r.kickoff) < asOfMs,
  );
  // Sort most-recent-first: descending kickoff, then descending gameId.
  const sorted = stableSortBy(eligible, [
    (r) => descKey(Date.parse(r.kickoff)),
    (r) => descStr(r.gameId),
  ]);
  return sorted.slice(0, n);
}

/** Count of regular-season games covered by participation (REGISTRY §20.F11 / §8). */
export function coveredGamesCount(
  rows: readonly PlayerGameUsage[],
  canonicalId: string,
  asOf: string,
): number {
  const asOfMs = Date.parse(asOf);
  return regularSeasonOnly(rows).filter(
    (r) =>
      r.canonicalId === canonicalId &&
      r.participationCovered &&
      Date.parse(r.kickoff) <= asOfMs,
  ).length;
}

// Descending-order sort keys (ordering helpers sort ascending on strings).
function descKey(n: number): string {
  // Map to a fixed-width, order-reversed string so ascending sort = descending value.
  return (Number.MAX_SAFE_INTEGER - n).toString().padStart(20, '0');
}
function descStr(s: string): string {
  // Invert each char's code so ascending ordinal sort = descending original.
  let out = '';
  for (const ch of s) {
    out += String.fromCharCode(0xffff - ch.charCodeAt(0));
  }
  return out;
}
