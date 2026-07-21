// Public surface of the real-data pipeline foundation. Consumers (CLI, tests,
// future services) import from here; internals stay internal.

export type {
  CanonicalPlayer,
  CanonicalIdentity,
  CanonicalStatus,
  FieldState,
  MissingReason,
  PresentField,
  MissingField,
  Provenance,
  ProviderId,
  ProviderIds,
  SupportedPosition,
} from '@/pipeline/types';
export { SUPPORTED_POSITIONS, PROVIDER_IDS, isSupportedPosition } from '@/pipeline/types';

export { normalizeName, collisionKey } from '@/pipeline/names';
export { isPresent, valueOf, present, missing, notProvided } from '@/pipeline/provenance';

export type { ProviderAdapter, ProviderRecord, AdapterResult, RejectedEntry, RejectReason } from '@/pipeline/providers/types';
export { sleeperAdapter } from '@/pipeline/providers/sleeper/adapter';
export { nflverseAdapter } from '@/pipeline/providers/nflverse/adapter';

export {
  buildSnapshot,
  verifySnapshot,
  checksumPayload,
  stableStringify,
  isStale,
  type RawSnapshot,
  type SnapshotMetadata,
} from '@/pipeline/snapshot';

export {
  resolveIdentities,
  EMPTY_IDENTITY_MAP,
  type IdentityMap,
  type IdentityResolution,
  type PlayerCluster,
  type MatchMethod,
} from '@/pipeline/identity';

export { normalizeCluster, type NormalizedPlayer, type MetadataConflict, type NormalizeConfig } from '@/pipeline/normalize';
export { validateCanonicalPlayers, validateCanonicalPlayer, type ValidationIssue } from '@/pipeline/validation';

export {
  assessReadiness,
  assessWRReadiness,
  assessRBReadiness,
  assessTEReadiness,
  assessQBReadiness,
  mergeSupplements,
  type EngineReadiness,
  type MissingRequirement,
  type ReadinessSummary,
  type MetricsSupplements,
} from '@/pipeline/readiness/engineReadiness';
export type {
  WRMetricsSupplement,
  RBMetricsSupplement,
  TEMetricsSupplement,
  QBMetricsSupplement,
} from '@/pipeline/readiness/metrics';

export { runPipeline, type PipelineInput, type PipelineResult, type PipelineConfig } from '@/pipeline/runPipeline';
export { renderReport, type PipelineReport, type StatsStageReport } from '@/pipeline/report';

// ---- statistics stage ----
export { parseWeekly, type WeeklyAdapterResult, type StatRejectReason } from '@/pipeline/stats/nflverse/weeklyAdapter';
export { aggregateWindows, type AggregateConfig } from '@/pipeline/stats/aggregate';
export { joinStats, type StatsJoinResult } from '@/pipeline/stats/join';
export { buildStatsSupplement, type BuiltStatsSupplement, type StatFieldReport } from '@/pipeline/stats/supplements';
export { runStatsStage, type StatsStageResult, type StatsStageOptions } from '@/pipeline/stats/runStats';
export {
  buildStatsSnapshot,
  verifyStatsSnapshot,
  type StatsSnapshot,
  type StatsSnapshotMetadata,
} from '@/pipeline/stats/snapshot';
export type {
  WeeklyStatRecord,
  WindowAggregate,
  PlayerStatAggregate,
  StatWindow,
} from '@/pipeline/stats/types';

// ---- snap-count stage ----
export { parseSnaps, type SnapAdapterResult, type SnapRejectReason } from '@/pipeline/snaps/nflverse/snapAdapter';
export { aggregateSnapWindows, snapShare, type SnapAggregateConfig } from '@/pipeline/snaps/aggregate';
export { buildSnapSupplement, type BuiltSnapSupplement, type SnapFieldReport } from '@/pipeline/snaps/supplements';
export { runSnapStage, type SnapStageResult, type SnapStageOptions } from '@/pipeline/snaps/runSnaps';
export {
  computeWrProxyRoutes,
  isProxyAuthorized,
  WR_ROUTE_PROXY,
  TE_ROUTE_PROXY,
  WR_PROXY_FACTOR,
  type ProxyId,
  type ProxyResult,
} from '@/pipeline/snaps/proxyRegistry';
export type { SnapRecord, SnapWindowAggregate, PlayerSnapAggregate, SnapWindow } from '@/pipeline/snaps/types';
export type { SnapStageReport } from '@/pipeline/report';

// ---- participation stage (coverage-aware WR route proxy) ----
export { parseParticipation, type ParticipationAdapterResult, type ParticipationRejectReason } from '@/pipeline/participation/nflverse/participationAdapter';
export { qualifyPlay } from '@/pipeline/participation/playQualification';
export { countParticipation, type ParticipationCounts } from '@/pipeline/participation/count';
export { computeCoverage } from '@/pipeline/participation/coverage';
export { buildParticipationSupplement, type BuiltParticipationSupplement, type ParticipationFieldReport } from '@/pipeline/participation/supplements';
export { runParticipationStage, type ParticipationStageResult, type ParticipationOptions } from '@/pipeline/participation/runParticipation';
export type { ParticipationPlay, CoverageState, CoverageInfo, PlayerParticipationAggregate } from '@/pipeline/participation/types';
export type { ParticipationStageReport } from '@/pipeline/report';
