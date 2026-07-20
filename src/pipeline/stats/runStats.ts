// Stats-stage orchestrator (pure). Verified stats snapshots + canonical players
// in → partial stats supplements, per-field availability reports, and join
// diagnostics out. No IO here, so it is deterministic and unit-testable; the CLI
// handles snapshot loading and hands verified snapshots to this function.

import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import { SUPPORTED_POSITIONS } from '@/pipeline/types';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';
import { parseWeekly, type StatRejectReason } from '@/pipeline/stats/nflverse/weeklyAdapter';
import { joinStats, type StatsJoinResult } from '@/pipeline/stats/join';
import { buildStatsSupplement, type StatFieldReport } from '@/pipeline/stats/supplements';
import type { StatsSnapshot } from '@/pipeline/stats/snapshot';
import type { WeeklyStatRecord } from '@/pipeline/stats/types';

export interface StatsStageOptions {
  readonly currentSeason: number;
  readonly seasons?: readonly number[];
  readonly includePostseason?: boolean;
}

export interface StatsRejectionCount {
  readonly reason: StatRejectReason;
  readonly count: number;
}

export interface PlayerFieldReport {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  readonly fields: readonly StatFieldReport[];
  readonly blockingUnavailable: readonly string[];
}

export interface StatsStageResult {
  /** Partial supplements keyed by position → canonical id, for readiness merge. */
  readonly supplements: MetricsSupplements;
  readonly perPlayerFields: readonly PlayerFieldReport[];
  readonly join: StatsJoinResult;

  // Intake diagnostics
  readonly snapshotsLoaded: number;
  readonly rowsByDatasetSeason: Readonly<Record<string, number>>;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  readonly rejections: readonly StatsRejectionCount[];
  readonly unsupportedPositionRows: number;
  readonly recordsByPosition: Readonly<Record<SupportedPosition, number>>;
  readonly aggregatePlayers: number;
  readonly suppliedMetricCount: number;
  readonly unavailableMetricCount: number;
}

function emptyByPosition(): Record<SupportedPosition, number> {
  const out = {} as Record<SupportedPosition, number>;
  for (const p of SUPPORTED_POSITIONS) out[p] = 0;
  return out;
}

export function runStatsStage(
  players: readonly CanonicalPlayer[],
  snapshots: readonly StatsSnapshot[],
  options: StatsStageOptions,
): StatsStageResult {
  const allRecords: WeeklyStatRecord[] = [];
  const rowsByDatasetSeason: Record<string, number> = {};
  const rejectionMap = new Map<StatRejectReason, number>();
  let unsupportedPositionRows = 0;

  const sorted = [...snapshots].sort((a, b) =>
    a.metadata.dataset !== b.metadata.dataset
      ? a.metadata.dataset.localeCompare(b.metadata.dataset)
      : a.metadata.retrievedAt.localeCompare(b.metadata.retrievedAt),
  );

  for (const snap of sorted) {
    const result = parseWeekly(snap.payload, {
      seasons: options.seasons,
      includePostseason: options.includePostseason,
    });
    for (const rec of result.records) {
      allRecords.push(rec);
      const key = `${snap.metadata.dataset}:${rec.season}`;
      rowsByDatasetSeason[key] = (rowsByDatasetSeason[key] ?? 0) + 1;
    }
    for (const rej of result.rejected) {
      rejectionMap.set(rej.reason, (rejectionMap.get(rej.reason) ?? 0) + 1);
    }
    unsupportedPositionRows += result.unsupportedPositionRows;
  }

  const join = joinStats(players, allRecords, { currentSeason: options.currentSeason });

  const recordsByPosition = emptyByPosition();
  const wr: Record<string, Record<string, number | null>> = {};
  const rb: Record<string, Record<string, number | null>> = {};
  const te: Record<string, Record<string, number | null>> = {};
  const qb: Record<string, Record<string, number | null>> = {};
  const target = { WR: wr, RB: rb, TE: te, QB: qb } as const;

  const perPlayerFields: PlayerFieldReport[] = [];
  let suppliedMetricCount = 0;
  let unavailableMetricCount = 0;

  for (const agg of join.aggregates) {
    const built = buildStatsSupplement(agg);
    recordsByPosition[agg.position] += 1;
    target[agg.position][agg.canonicalId] = built.supplement;
    perPlayerFields.push({
      canonicalId: built.canonicalId,
      position: built.position,
      fields: built.fields,
      blockingUnavailable: built.blockingUnavailable,
    });
    for (const f of built.fields) {
      if (f.availability === 'SUPPLIED') suppliedMetricCount += 1;
      else unavailableMetricCount += 1;
    }
  }
  perPlayerFields.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const rejections: StatsRejectionCount[] = [...rejectionMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
  const rowsRejected = rejections.reduce((s, r) => s + r.count, 0);

  return {
    supplements: { wr, rb, te, qb },
    perPlayerFields,
    join,
    snapshotsLoaded: snapshots.length,
    rowsByDatasetSeason,
    rowsAccepted: allRecords.length,
    rowsRejected,
    rejections,
    unsupportedPositionRows,
    recordsByPosition,
    aggregatePlayers: join.aggregates.length,
    suppliedMetricCount,
    unavailableMetricCount,
  };
}
