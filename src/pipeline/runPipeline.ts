// Pure orchestrator: verified snapshots + config in, canonical players +
// readiness + a structured report out. No file or network IO lives here, so the
// whole pipeline is deterministic and unit-testable in memory. The CLI (scripts/
// run-pipeline.ts) handles IO and hands verified snapshots to this function.

import { nflverseAdapter } from '@/pipeline/providers/nflverse/adapter';
import { sleeperAdapter } from '@/pipeline/providers/sleeper/adapter';
import type { AdapterResult, ProviderAdapter, ProviderRecord, RejectReason } from '@/pipeline/providers/types';
import { EMPTY_IDENTITY_MAP, resolveIdentities, type IdentityMap } from '@/pipeline/identity';
import { normalizeCluster, type MetadataConflict } from '@/pipeline/normalize';
import { isStale, type RawSnapshot } from '@/pipeline/snapshot';
import { validateCanonicalPlayers } from '@/pipeline/validation';
import {
  assessReadiness,
  mergeSupplements,
  type MetricsSupplements,
  type ReadinessSummary,
} from '@/pipeline/readiness/engineReadiness';
import { runStatsStage, type StatsStageOptions, type StatsStageResult } from '@/pipeline/stats/runStats';
import { runSnapStage, type SnapStageOptions, type SnapStageResult } from '@/pipeline/snaps/runSnaps';
import {
  runParticipationStage,
  type ParticipationOptions,
  type ParticipationStageResult,
} from '@/pipeline/participation/runParticipation';
import type { StatsSnapshot } from '@/pipeline/stats/snapshot';
import type {
  ParticipationStageReport,
  PipelineReport,
  RejectionCount,
  SnapStageReport,
  StaleSnapshot,
  StatsStageReport,
} from '@/pipeline/report';
import {
  PROVIDER_IDS,
  SUPPORTED_POSITIONS,
  type CanonicalPlayer,
  type ProviderId,
  type SupportedPosition,
} from '@/pipeline/types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  sleeper: sleeperAdapter,
  nflverse: nflverseAdapter,
};

export interface PipelineConfig {
  readonly mode: 'fixture' | 'live' | 'validate';
  /** Deterministic generation stamp (never Date.now inside the pipeline). */
  readonly generatedAt: string;
  /** "As of" date for age derivation; defaults to generatedAt's date. */
  readonly asOf: string;
  /** A snapshot older than this (ms) against generatedAt is flagged stale. */
  readonly staleMaxAgeMs: number;
}

export interface PipelineInput {
  readonly snapshots: readonly RawSnapshot[];
  /** Integrity failures already detected while loading (checksum/metadata). */
  readonly integrityFailures?: readonly string[];
  readonly identityMap?: IdentityMap;
  /** Authored / projection / context supplements (may be partial). */
  readonly supplements?: MetricsSupplements;
  readonly config: PipelineConfig;

  // Optional statistics stage. When statsSnapshots are supplied the stats stage
  // runs after canonical players are built, merges its stats supplements into
  // `supplements`, and the returned readiness reflects metadata + stats.
  readonly statsSnapshots?: readonly StatsSnapshot[];
  readonly statsIntegrityFailures?: readonly string[];
  readonly statsOptions?: StatsStageOptions;

  // Optional snap-count stage. Runs after the stats stage; merges snap
  // supplements over metadata + stats and re-assesses readiness.
  readonly snapSnapshots?: readonly StatsSnapshot[];
  readonly snapIntegrityFailures?: readonly string[];
  readonly snapOptions?: SnapStageOptions;

  // Optional participation stage. Runs after snaps; coverage-aware WR route proxy.
  readonly participationSnapshots?: readonly StatsSnapshot[];
  readonly participationIntegrityFailures?: readonly string[];
  readonly participationOptions?: ParticipationOptions;
}

export interface PipelineResult {
  readonly report: PipelineReport;
  readonly canonicalPlayers: readonly CanonicalPlayer[];
  readonly readiness: readonly ReadinessSummary[];
  readonly conflicts: readonly MetadataConflict[];
  /** Present when the stats stage ran; carries per-player field reports. */
  readonly statsResult?: StatsStageResult;
  /** Present when the snap stage ran; carries per-player field reports. */
  readonly snapResult?: SnapStageResult;
  /** Present when the participation stage ran; carries coverage field reports. */
  readonly participationResult?: ParticipationStageResult;
}

function emptyByProvider(): Record<ProviderId, number> {
  const out = {} as Record<ProviderId, number>;
  for (const p of PROVIDER_IDS) out[p] = 0;
  return out;
}

function emptyByPosition(): Record<SupportedPosition, number> {
  const out = {} as Record<SupportedPosition, number>;
  for (const p of SUPPORTED_POSITIONS) out[p] = 0;
  return out;
}

export function runPipeline(input: PipelineInput): PipelineResult {
  const { config } = input;
  const identityMap = input.identityMap ?? EMPTY_IDENTITY_MAP;
  const supplements = input.supplements ?? {};

  // 1) Parse each snapshot through its provider adapter.
  const allRecords: ProviderRecord[] = [];
  const providerRecordsLoaded = emptyByProvider();
  const rejectionMap = new Map<string, RejectionCount>();
  const sourceTimestamps = {} as Record<ProviderId, string>;
  for (const p of PROVIDER_IDS) sourceTimestamps[p] = config.generatedAt;
  const staleSnapshots: StaleSnapshot[] = [];

  const sortedSnapshots = [...input.snapshots].sort((a, b) =>
    a.metadata.provider === b.metadata.provider
      ? a.metadata.retrievedAt.localeCompare(b.metadata.retrievedAt)
      : a.metadata.provider.localeCompare(b.metadata.provider),
  );

  for (const snap of sortedSnapshots) {
    const provider = snap.metadata.provider;
    const adapter = ADAPTERS[provider];
    const result: AdapterResult = adapter.parse(snap.payload);
    for (const r of result.records) allRecords.push(r);
    providerRecordsLoaded[provider] += result.records.length;
    sourceTimestamps[provider] = snap.metadata.retrievedAt;
    for (const rej of result.rejected) {
      const key = `${rej.provider}:${rej.reason}`;
      const existing = rejectionMap.get(key);
      if (existing) rejectionMap.set(key, { ...existing, count: existing.count + 1 });
      else rejectionMap.set(key, { provider: rej.provider, reason: rej.reason as RejectReason, count: 1 });
    }
    if (isStale(snap.metadata, config.generatedAt, config.staleMaxAgeMs)) {
      const ageHours = Math.round(
        (Date.parse(config.generatedAt) - Date.parse(snap.metadata.retrievedAt)) / 3_600_000,
      );
      staleSnapshots.push({ provider, retrievedAt: snap.metadata.retrievedAt, ageHours });
    }
  }

  // 2) Resolve identities (strong-id only) into canonical clusters.
  const resolution = resolveIdentities(allRecords, identityMap, config.generatedAt);

  // 3) Normalize each cluster into a canonical player + record conflicts.
  const normalizeCfg = {
    generatedAt: config.generatedAt,
    asOf: config.asOf,
    sourceTimestamps,
  };
  const normalized = resolution.clusters.map((c) => normalizeCluster(c, normalizeCfg));
  const conflicts = normalized.flatMap((n) => n.conflicts);

  // 4) Validate canonical records semantically.
  const validation = validateCanonicalPlayers(normalized.map((n) => n.player));
  const canonicalPlayers = [...validation.valid].sort((a, b) =>
    a.identity.canonical_id.localeCompare(b.identity.canonical_id),
  );

  // 5) Assess engine readiness per player — metadata + authored supplements.
  const readinessBefore = canonicalPlayers
    .map((p) => assessReadiness(p, supplements, config.asOf))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  // 5b) Optional statistics stage: run, merge stats supplements, re-assess.
  let statsResult: StatsStageResult | undefined;
  let statsStageReport: StatsStageReport | undefined;
  let readiness = readinessBefore;
  let mergedSupplements = supplements;
  if (input.statsSnapshots && input.statsSnapshots.length > 0 && input.statsOptions) {
    statsResult = runStatsStage(canonicalPlayers, input.statsSnapshots, input.statsOptions);
    mergedSupplements = mergeSupplements(supplements, statsResult.supplements);
    const readinessAfter = canonicalPlayers
      .map((p) => assessReadiness(p, mergedSupplements, config.asOf))
      .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
    statsStageReport = buildStatsStageReport(
      statsResult,
      readinessBefore,
      readinessAfter,
      input.statsIntegrityFailures ?? [],
    );
    readiness = readinessAfter;
  }

  // 5c) Optional snap-count stage: run, merge snap supplements over metadata +
  // stats, re-assess. "Before snaps" is the current (metadata+stats) readiness.
  let snapResult: SnapStageResult | undefined;
  let snapStageReport: SnapStageReport | undefined;
  if (input.snapSnapshots && input.snapSnapshots.length > 0 && input.snapOptions) {
    const readinessBeforeSnaps = readiness;
    snapResult = runSnapStage(canonicalPlayers, input.snapSnapshots, input.snapOptions);
    mergedSupplements = mergeSupplements(mergedSupplements, snapResult.supplements);
    const readinessAfterSnaps = canonicalPlayers
      .map((p) => assessReadiness(p, mergedSupplements, config.asOf))
      .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
    snapStageReport = buildSnapStageReport(
      snapResult,
      readinessBeforeSnaps,
      readinessAfterSnaps,
      input.snapIntegrityFailures ?? [],
    );
    readiness = readinessAfterSnaps;
  }

  // 5d) Optional participation stage: coverage-aware WR route proxy, layered last.
  let participationResult: ParticipationStageResult | undefined;
  let participationStageReport: ParticipationStageReport | undefined;
  if (input.participationSnapshots && input.participationSnapshots.length > 0 && input.participationOptions) {
    const readinessBeforePart = readiness;
    participationResult = runParticipationStage(canonicalPlayers, input.participationSnapshots, input.participationOptions);
    mergedSupplements = mergeSupplements(mergedSupplements, participationResult.supplements);
    const readinessAfterPart = canonicalPlayers
      .map((p) => assessReadiness(p, mergedSupplements, config.asOf))
      .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
    participationStageReport = buildParticipationStageReport(
      participationResult,
      readinessBeforePart,
      readinessAfterPart,
      input.participationIntegrityFailures ?? [],
    );
    readiness = readinessAfterPart;
  }

  // 6) Assemble the report.
  const countsByPosition = emptyByPosition();
  for (const p of canonicalPlayers) countsByPosition[p.position] += 1;

  const rejectedRecords = [...rejectionMap.values()].sort((a, b) =>
    a.provider === b.provider ? a.reason.localeCompare(b.reason) : a.provider.localeCompare(b.provider),
  );
  const totalRejected = rejectedRecords.reduce((s, r) => s + r.count, 0);

  const engineReady = readiness.filter((r) => r.status === 'READY').length;
  const notReady = readiness.filter((r) => r.status === 'NOT_READY');
  const engineUnavailable = readiness.filter((r) => r.status === 'ENGINE_UNAVAILABLE').length;
  const missingRequiredFieldPlayers = notReady.filter((r) =>
    r.missing.some((m) => m.suppliedBy === 'metadata'),
  ).length;

  const notReadyReasons = notReady.map((r) => ({
    canonicalId: r.canonicalId,
    position: r.position,
    missingCount: r.missing.length,
    sample: r.missing.slice(0, 3).map((m) => m.field),
  }));

  const integrityFailures = input.integrityFailures ?? [];
  const statsIntegrityFailures = input.statsIntegrityFailures ?? [];
  const snapIntegrityFailures = input.snapIntegrityFailures ?? [];
  const participationIntegrityFailures = input.participationIntegrityFailures ?? [];
  const ok =
    integrityFailures.length === 0 &&
    statsIntegrityFailures.length === 0 &&
    snapIntegrityFailures.length === 0 &&
    participationIntegrityFailures.length === 0 &&
    allRecords.length > 0 &&
    resolution.duplicateCanonicalIds.length === 0 &&
    (statsResult?.join.identityCollisions.length ?? 0) === 0 &&
    (snapResult?.join.identityCollisions.length ?? 0) === 0 &&
    (participationResult?.identityCollisions.length ?? 0) === 0;

  const report: PipelineReport = {
    ok,
    generatedAt: config.generatedAt,
    mode: config.mode,
    providerRecordsLoaded,
    totalProviderRecords: allRecords.length,
    rejectedRecords,
    totalRejected,
    snapshotsLoaded: input.snapshots.length,
    snapshotIntegrityFailures: integrityFailures,
    staleSnapshots,
    supportedPlayersDiscovered: allRecords.length,
    canonicalPlayersGenerated: canonicalPlayers.length,
    countsByPosition,
    persistedMatches: resolution.persistedMatches,
    crossProviderMatches: resolution.crossProviderMatches,
    newIdentities: resolution.newIdentities,
    ambiguousNameCollisions: resolution.nameCollisions.length,
    duplicateCanonicalIds: resolution.duplicateCanonicalIds.length,
    metadataConflicts: conflicts.length,
    validationRejections: validation.rejected.length,
    missingRequiredFieldPlayers,
    engineReadyPlayers: engineReady,
    playersNotEngineReady: notReady.length,
    engineUnavailablePlayers: engineUnavailable,
    notReadyReasons,
    ...(statsStageReport ? { statsStage: statsStageReport } : {}),
    ...(snapStageReport ? { snapStage: snapStageReport } : {}),
    ...(participationStageReport ? { participationStage: participationStageReport } : {}),
  };

  return {
    report,
    canonicalPlayers,
    readiness,
    conflicts,
    ...(statsResult ? { statsResult } : {}),
    ...(snapResult ? { snapResult } : {}),
    ...(participationResult ? { participationResult } : {}),
  };
}

// Participation-stage report + before/after readiness delta.
function buildParticipationStageReport(
  part: ParticipationStageResult,
  before: readonly ReadinessSummary[],
  after: readonly ReadinessSummary[],
  integrityFailures: readonly string[],
): ParticipationStageReport {
  const beforeById = new Map(before.map((r) => [r.canonicalId, r]));
  const remainingGaps = { stats: 0, projections: 0, context: 0 };
  let eliminated = 0;
  let newlyReady = 0;
  for (const a of after) {
    const b = beforeById.get(a.canonicalId);
    if (b) eliminated += Math.max(0, b.missing.length - a.missing.length);
    if (a.status === 'READY' && b && b.status !== 'READY') newlyReady += 1;
    for (const m of a.missing) {
      if (m.suppliedBy === 'stats') remainingGaps.stats += 1;
      else if (m.suppliedBy === 'projections') remainingGaps.projections += 1;
      else if (m.suppliedBy === 'context') remainingGaps.context += 1;
    }
  }
  return {
    snapshotsLoaded: part.snapshotsLoaded,
    snapshotIntegrityFailures: integrityFailures,
    playsAccepted: part.playsAccepted,
    playsRejected: part.playsRejected,
    rejections: part.rejections,
    incompletePersonnelPlays: part.incompletePersonnelPlays,
    canonicalJoins: part.canonicalJoins,
    unmatchedGsis: part.unmatchedGsis.length,
    identityCollisions: part.identityCollisions.length,
    recordsByPosition: part.recordsByPosition,
    completeRouteValues: part.completeRouteValues,
    partialRouteValues: part.partialRouteValues,
    blockersSatisfied: part.blockersSatisfied,
    readinessBefore: before.filter((r) => r.status === 'READY').length,
    readinessAfter: after.filter((r) => r.status === 'READY').length,
    playersNewlyReady: newlyReady,
    playersStillNotReady: after.filter((r) => r.status === 'NOT_READY').length,
    missingFieldsEliminated: eliminated,
    remainingGaps,
  };
}

// Snap-stage report + before/after (metadata+stats → +snaps) readiness delta.
function buildSnapStageReport(
  snap: SnapStageResult,
  before: readonly ReadinessSummary[],
  after: readonly ReadinessSummary[],
  integrityFailures: readonly string[],
): SnapStageReport {
  const beforeById = new Map(before.map((r) => [r.canonicalId, r]));
  const remainingGaps = { stats: 0, projections: 0, context: 0 };
  let eliminated = 0;
  let newlyReady = 0;
  for (const a of after) {
    const b = beforeById.get(a.canonicalId);
    if (b) eliminated += Math.max(0, b.missing.length - a.missing.length);
    if (a.status === 'READY' && b && b.status !== 'READY') newlyReady += 1;
    for (const m of a.missing) {
      if (m.suppliedBy === 'stats') remainingGaps.stats += 1;
      else if (m.suppliedBy === 'projections') remainingGaps.projections += 1;
      else if (m.suppliedBy === 'context') remainingGaps.context += 1;
    }
  }
  return {
    snapshotsLoaded: snap.snapshotsLoaded,
    snapshotIntegrityFailures: integrityFailures,
    rowsAccepted: snap.rowsAccepted,
    rowsRejected: snap.rowsRejected,
    rejections: snap.rejections,
    unsupportedPositionRows: snap.unsupportedPositionRows,
    canonicalJoins: snap.aggregatePlayers,
    unmatchedSnapRows: snap.join.unmatchedGsis.length,
    canonicalPlayersWithoutSnaps: snap.join.canonicalWithoutSnaps.length,
    canonicalPlayersWithoutGsis: snap.join.canonicalWithoutGsis.length,
    teamMismatches: snap.join.teamMismatches.length,
    positionMismatches: snap.join.positionMismatches.length,
    identityCollisions: snap.join.identityCollisions.length,
    recordsByPosition: snap.recordsByPosition,
    directMetricsSupplied: snap.directMetricsSupplied,
    proxyMetricsSupplied: snap.proxyMetricsSupplied,
    readinessBeforeSnaps: before.filter((r) => r.status === 'READY').length,
    readinessAfterSnaps: after.filter((r) => r.status === 'READY').length,
    playersNewlyReady: newlyReady,
    playersStillNotReady: after.filter((r) => r.status === 'NOT_READY').length,
    missingFieldsEliminatedBySnaps: eliminated,
    remainingGaps,
  };
}

// Assemble the statistics-stage report and the metadata-only → +stats readiness
// delta. `missingFieldsEliminatedByStats` and `remainingGaps` are computed from
// the per-player missing lists so the improvement is measured, never asserted.
function buildStatsStageReport(
  stats: StatsStageResult,
  before: readonly ReadinessSummary[],
  after: readonly ReadinessSummary[],
  integrityFailures: readonly string[],
): StatsStageReport {
  const beforeById = new Map(before.map((r) => [r.canonicalId, r]));
  const readyBefore = before.filter((r) => r.status === 'READY').length;
  const readyAfter = after.filter((r) => r.status === 'READY').length;

  let eliminated = 0;
  let newlyReady = 0;
  const remainingGaps = { stats: 0, projections: 0, context: 0 };
  for (const a of after) {
    const b = beforeById.get(a.canonicalId);
    if (b) eliminated += Math.max(0, b.missing.length - a.missing.length);
    if (a.status === 'READY' && b && b.status !== 'READY') newlyReady += 1;
    for (const m of a.missing) {
      if (m.suppliedBy === 'stats') remainingGaps.stats += 1;
      else if (m.suppliedBy === 'projections') remainingGaps.projections += 1;
      else if (m.suppliedBy === 'context') remainingGaps.context += 1;
    }
  }

  // Distinct blocking-unavailable required metrics across players.
  const unavailableRequired = new Set<string>();
  for (const p of stats.perPlayerFields) {
    for (const f of p.blockingUnavailable) unavailableRequired.add(`${p.position}.${f}`);
  }

  return {
    snapshotsLoaded: stats.snapshotsLoaded,
    snapshotIntegrityFailures: integrityFailures,
    rowsByDatasetSeason: stats.rowsByDatasetSeason,
    rowsAccepted: stats.rowsAccepted,
    rowsRejected: stats.rowsRejected,
    rejections: stats.rejections,
    unsupportedPositionRows: stats.unsupportedPositionRows,
    canonicalJoins: stats.aggregatePlayers,
    unmatchedStatRows: stats.join.unmatchedGsis.length,
    canonicalPlayersWithoutStats: stats.join.canonicalWithoutStats.length,
    canonicalPlayersWithoutGsis: stats.join.canonicalWithoutGsis.length,
    positionMismatches: stats.join.positionMismatches.length,
    identityCollisions: stats.join.identityCollisions.length,
    recordsByPosition: stats.recordsByPosition,
    aggregateRecordsProduced: stats.aggregatePlayers,
    derivedMetricsProduced: stats.suppliedMetricCount,
    unavailableRequiredMetrics: unavailableRequired.size,
    readinessBeforeStats: readyBefore,
    readinessAfterStats: readyAfter,
    playersNewlyReady: newlyReady,
    playersStillNotReady: after.filter((r) => r.status === 'NOT_READY').length,
    missingFieldsEliminatedByStats: eliminated,
    remainingGaps,
  };
}
