// Snap-stage orchestrator (pure). Verified snap snapshots + canonical players in
// → partial snap supplements, per-field availability reports, and join
// diagnostics out. No IO; deterministic and unit-testable.

import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import { SUPPORTED_POSITIONS } from '@/pipeline/types';
import { valueOf } from '@/pipeline/provenance';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';
import { parseSnaps, type SnapRejectReason } from '@/pipeline/snaps/nflverse/snapAdapter';
import { aggregateSnapWindows } from '@/pipeline/snaps/aggregate';
import { buildSnapSupplement, type SnapFieldReport } from '@/pipeline/snaps/supplements';
import type { PlayerSnapAggregate, SnapRecord } from '@/pipeline/snaps/types';
import type { StatsSnapshot } from '@/pipeline/stats/snapshot';

export interface SnapStageOptions {
  readonly currentSeason: number;
  readonly seasons?: readonly number[];
  readonly includePostseason?: boolean;
}

export interface SnapRejectionCount {
  readonly reason: SnapRejectReason;
  readonly count: number;
}

export interface PlayerSnapFieldReport {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly fields: readonly SnapFieldReport[];
}

export interface SnapJoinDiagnostics {
  readonly unmatchedGsis: readonly string[];
  readonly canonicalWithoutSnaps: readonly string[];
  readonly canonicalWithoutGsis: readonly string[];
  readonly teamMismatches: readonly string[];
  readonly positionMismatches: readonly string[];
  readonly identityCollisions: readonly string[];
}

export interface SnapStageResult {
  readonly supplements: MetricsSupplements;
  readonly perPlayerFields: readonly PlayerSnapFieldReport[];
  readonly join: SnapJoinDiagnostics;
  readonly snapshotsLoaded: number;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  readonly rejections: readonly SnapRejectionCount[];
  readonly unsupportedPositionRows: number;
  readonly recordsByPosition: Readonly<Record<SupportedPosition, number>>;
  readonly aggregatePlayers: number;
  readonly directMetricsSupplied: number;
  readonly proxyMetricsSupplied: number;
}

function emptyByPosition(): Record<SupportedPosition, number> {
  const out = {} as Record<SupportedPosition, number>;
  for (const p of SUPPORTED_POSITIONS) out[p] = 0;
  return out;
}

export function runSnapStage(
  players: readonly CanonicalPlayer[],
  snapshots: readonly StatsSnapshot[],
  options: SnapStageOptions,
): SnapStageResult {
  const all: SnapRecord[] = [];
  const rejectionMap = new Map<SnapRejectReason, number>();
  let unsupportedPositionRows = 0;

  const sorted = [...snapshots].sort((a, b) => a.metadata.retrievedAt.localeCompare(b.metadata.retrievedAt));
  for (const snap of sorted) {
    const res = parseSnaps(snap.payload, { seasons: options.seasons, includePostseason: options.includePostseason });
    for (const r of res.records) all.push(r);
    for (const rej of res.rejected) rejectionMap.set(rej.reason, (rejectionMap.get(rej.reason) ?? 0) + 1);
    unsupportedPositionRows += res.unsupportedPositionRows;
  }

  // GSIS-only join with collision protection.
  const byGsis = new Map<string, SnapRecord[]>();
  for (const r of all) {
    const list = byGsis.get(r.gsis);
    if (list) list.push(r);
    else byGsis.set(r.gsis, [r]);
  }
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
  const canonicalWithoutSnaps: string[] = [];
  const teamMismatches: string[] = [];
  const positionMismatches: string[] = [];
  const aggregates: PlayerSnapAggregate[] = [];

  for (const [gsis, claimants] of gsisToCanonical) {
    if (claimants.length > 1) {
      identityCollisions.push(gsis);
      continue;
    }
    const player = claimants[0];
    const rows = byGsis.get(gsis);
    if (!rows || rows.length === 0) {
      canonicalWithoutSnaps.push(player.identity.canonical_id);
      continue;
    }
    if (!rows.some((r) => r.position === player.position)) positionMismatches.push(gsis);
    const canonicalTeam = valueOf(player.team);
    if (canonicalTeam && !rows.some((r) => r.team === canonicalTeam)) teamMismatches.push(gsis);
    aggregates.push({
      canonicalId: player.identity.canonical_id,
      position: player.position,
      gsis,
      windows: aggregateSnapWindows(rows, { currentSeason: options.currentSeason }),
    });
  }
  aggregates.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const unmatchedGsis: string[] = [];
  for (const gsis of byGsis.keys()) if (!gsisToCanonical.has(gsis)) unmatchedGsis.push(gsis);

  // Build supplements.
  const recordsByPosition = emptyByPosition();
  const wr: Record<string, Record<string, number | null>> = {};
  const rb: Record<string, Record<string, number | null>> = {};
  const te: Record<string, Record<string, number | null>> = {};
  const qb: Record<string, Record<string, number | null>> = {};
  const target = { WR: wr, RB: rb, TE: te, QB: qb } as const;
  const perPlayerFields: PlayerSnapFieldReport[] = [];
  let directMetricsSupplied = 0;
  let proxyMetricsSupplied = 0;

  for (const agg of aggregates) {
    const built = buildSnapSupplement(agg);
    recordsByPosition[agg.position] += 1;
    if (Object.keys(built.supplement).length > 0) target[agg.position][agg.canonicalId] = built.supplement;
    perPlayerFields.push({ canonicalId: built.canonicalId, position: built.position, fields: built.fields });
    directMetricsSupplied += built.directSupplied;
    proxyMetricsSupplied += built.proxySupplied;
  }
  perPlayerFields.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const rejections: SnapRejectionCount[] = [...rejectionMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
  const rowsRejected = rejections.reduce((s, r) => s + r.count, 0);

  const sortStr = (arr: string[]) => [...new Set(arr)].sort();
  return {
    supplements: { wr, rb, te, qb },
    perPlayerFields,
    join: {
      unmatchedGsis: sortStr(unmatchedGsis),
      canonicalWithoutSnaps: sortStr(canonicalWithoutSnaps),
      canonicalWithoutGsis: sortStr(canonicalWithoutGsis),
      teamMismatches: sortStr(teamMismatches),
      positionMismatches: sortStr(positionMismatches),
      identityCollisions: sortStr(identityCollisions),
    },
    snapshotsLoaded: snapshots.length,
    rowsAccepted: all.length,
    rowsRejected,
    rejections,
    unsupportedPositionRows,
    recordsByPosition,
    aggregatePlayers: aggregates.length,
    directMetricsSupplied,
    proxyMetricsSupplied,
  };
}
