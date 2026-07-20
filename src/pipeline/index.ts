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
export { renderReport, type PipelineReport } from '@/pipeline/report';
