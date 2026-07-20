// Join weekly stat records to canonical players by GSIS id — the strong key
// approved by the audit. Never by name, never fuzzy. Everything unmatched,
// missing, colliding, or position-mismatched is reported, and an unsafe
// identity collision (two canonical players claiming one GSIS) fails the run.

import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import { aggregateWindows, type AggregateConfig } from '@/pipeline/stats/aggregate';
import type { PlayerStatAggregate, WeeklyStatRecord } from '@/pipeline/stats/types';

export interface StatsJoinResult {
  readonly aggregates: readonly PlayerStatAggregate[];
  /** GSIS ids present in the stats feed with no canonical player. */
  readonly unmatchedGsis: readonly string[];
  /** Canonical players (of supported positions) that received no stat rows. */
  readonly canonicalWithoutStats: readonly string[];
  /** Canonical players with no GSIS id at all (cannot be joined). */
  readonly canonicalWithoutGsis: readonly string[];
  /** GSIS ids whose stat rows' position never matches the canonical position. */
  readonly positionMismatches: readonly string[];
  /** UNSAFE: a GSIS claimed by more than one canonical player. Fails the run. */
  readonly identityCollisions: readonly string[];
}

function groupByGsis(records: readonly WeeklyStatRecord[]): Map<string, WeeklyStatRecord[]> {
  const map = new Map<string, WeeklyStatRecord[]>();
  for (const r of records) {
    const list = map.get(r.gsis);
    if (list) list.push(r);
    else map.set(r.gsis, [r]);
  }
  return map;
}

export function joinStats(
  players: readonly CanonicalPlayer[],
  records: readonly WeeklyStatRecord[],
  cfg: AggregateConfig,
): StatsJoinResult {
  const byGsis = groupByGsis(records);

  // Map GSIS → canonical players (detect collisions).
  const gsisToCanonical = new Map<string, CanonicalPlayer[]>();
  const canonicalWithoutGsis: string[] = [];
  for (const p of players) {
    const gsis = p.identity.provider_ids.gsis;
    if (!gsis) {
      canonicalWithoutGsis.push(p.identity.canonical_id);
      continue;
    }
    const list = gsisToCanonical.get(gsis);
    if (list) list.push(p);
    else gsisToCanonical.set(gsis, [p]);
  }

  const identityCollisions: string[] = [];
  for (const [gsis, claimants] of gsisToCanonical) {
    if (claimants.length > 1) identityCollisions.push(gsis);
  }

  const aggregates: PlayerStatAggregate[] = [];
  const canonicalWithoutStats: string[] = [];
  const positionMismatches: string[] = [];

  for (const [gsis, claimants] of gsisToCanonical) {
    if (claimants.length !== 1) continue; // collisions handled above
    const player = claimants[0];
    const rows = byGsis.get(gsis);
    if (!rows || rows.length === 0) {
      canonicalWithoutStats.push(player.identity.canonical_id);
      continue;
    }
    // Position sanity: at least one stat row should agree with canonical
    // position (OTHER rows are ignored, never merged into a valued position).
    const position: SupportedPosition = player.position;
    const anyMatch = rows.some((r) => r.position === position);
    if (!anyMatch) positionMismatches.push(gsis);
    const windows = aggregateWindows(rows, cfg);
    aggregates.push({
      canonicalId: player.identity.canonical_id,
      position,
      gsis,
      windows,
    });
  }

  const unmatchedGsis: string[] = [];
  for (const gsis of byGsis.keys()) {
    if (!gsisToCanonical.has(gsis)) unmatchedGsis.push(gsis);
  }

  // Deterministic ordering everywhere.
  aggregates.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  const sortStr = (arr: string[]) => [...new Set(arr)].sort();

  return {
    aggregates,
    unmatchedGsis: sortStr(unmatchedGsis),
    canonicalWithoutStats: sortStr(canonicalWithoutStats),
    canonicalWithoutGsis: sortStr(canonicalWithoutGsis),
    positionMismatches: sortStr(positionMismatches),
    identityCollisions: sortStr(identityCollisions),
  };
}
