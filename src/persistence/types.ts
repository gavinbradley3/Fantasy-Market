// PlayerTicker durable persistence (Phase 6) — domain artifact types & schema versions.
//
// Persistence stores the artifacts the VERIFIED Phase 4/5 pipeline already produced; it
// never recomputes identities, normalizes provider data, rebuilds evidence, or reruns
// valuation formulas. Immutable artifacts are content-addressed (checksum / snapshot id);
// a refresh RUN is an event (generated id) that references those immutable facts. This is
// a Node-only backend module — it must never be imported by browser code.

import type { IngestionProvider, ProviderCapability, RawPayloadEnvelope } from '@/transport';

// ============================================================================
// Schema versions — every persisted artifact type is explicitly versioned, and reads
// validate the stored version against the supported set (never silently accept a newer
// one). See errors.ts `UNSUPPORTED_PERSISTED_SCHEMA`.
// ============================================================================

export const SCHEMA_VERSIONS = {
  rawEnvelope: 'transport.envelope/1', // matches ENVELOPE_SCHEMA_VERSION from Phase 5
  refreshRun: 'run/1',
  snapshot: 'snapshot/1',
  normalizedInput: 'normalized-input/1',
  inferenceOutput: 'inference-output/1',
  publication: 'publication/2', // v2: board-level publication (a complete run's player set)
} as const;

/** Migration version this build of the code understands. Reads reject a newer DB. */
export const MIGRATION_VERSION = 2;

// The supported set per artifact (a set so future versions can be added without a rewrite).
export const SUPPORTED_RAW_ENVELOPE_SCHEMAS: ReadonlySet<string> = new Set([SCHEMA_VERSIONS.rawEnvelope]);
export const SUPPORTED_RUN_SCHEMAS: ReadonlySet<string> = new Set([SCHEMA_VERSIONS.refreshRun]);
export const SUPPORTED_SNAPSHOT_SCHEMAS: ReadonlySet<string> = new Set([SCHEMA_VERSIONS.snapshot]);
export const SUPPORTED_NORMALIZED_INPUT_SCHEMAS: ReadonlySet<string> = new Set([SCHEMA_VERSIONS.normalizedInput]);
export const SUPPORTED_OUTPUT_SCHEMAS: ReadonlySet<string> = new Set([SCHEMA_VERSIONS.inferenceOutput]);
export const SUPPORTED_PUBLICATION_SCHEMAS: ReadonlySet<string> = new Set([SCHEMA_VERSIONS.publication]);

// ============================================================================
// Artifact / event records (as persisted)
// ============================================================================

export type RefreshRunStatus = 'success' | 'partial' | 'failure';
export type RefreshMode = 'live' | 'replay' | 'mixed';
export type SourceOutcomeMode = 'liveFetch' | 'replay' | 'cacheRevalidated' | 'failed';
export type SourceOutcomeStatus = 'success' | 'failure';

/** A persisted raw payload artifact (one verified RawPayloadEnvelope). */
export interface RawEnvelopeRecord extends RawPayloadEnvelope {
  /** Persistence-time timestamp (ISO); distinct from the source `fetchedAt`. */
  readonly createdAt: string;
}

export interface RefreshRunRecord {
  readonly runId: string;
  readonly schemaVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly mode: RefreshMode;
  readonly status: RefreshRunStatus;
  readonly requiredFailure: boolean;
  readonly sourceCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly codeVersion: string | null;
  readonly configFingerprint: string | null;
  /** The canonical snapshot this run produced (null when inference never completed). */
  readonly snapshotId: string | null;
  readonly createdAt: string;
}

export interface RefreshSourceOutcomeRecord {
  readonly runId: string;
  readonly provider: IngestionProvider;
  readonly capability: ProviderCapability;
  readonly requestKey: string;
  readonly required: boolean;
  readonly mode: SourceOutcomeMode;
  readonly status: SourceOutcomeStatus;
  readonly payloadChecksum: string | null;
  readonly errorCode: string | null;
  readonly failureStage: string | null;
  readonly retryable: boolean | null;
  readonly errorMessage: string | null;
}

export interface SnapshotRecord {
  readonly snapshotId: string;
  readonly schemaVersion: string;
  readonly serialized: string;
  readonly checksum: string; // digest(serialized)
  readonly createdAt: string;
}

export interface NormalizedInputRecord {
  readonly checksum: string; // normalizedInputDigest(input) — content identity
  readonly schemaVersion: string;
  readonly serialized: string;
  readonly snapshotId: string;
  readonly canonicalId: string;
  readonly position: string;
  readonly asOf: string;
  readonly engineVersion: string;
  readonly createdAt: string;
}

export interface InferenceOutputRecord {
  readonly checksum: string; // outputChecksum = digest(serialized) — content identity
  readonly schemaVersion: string;
  readonly serialized: string;
  readonly normalizedInputChecksum: string;
  readonly snapshotId: string;
  readonly registryVersion: string | null;
  readonly inferenceLayerVersion: string | null;
  readonly envReferenceVersion: string | null;
  readonly createdAt: string;
}

/** Run → produced inference artifacts (one row per computed player result). */
export interface RunInferenceRecord {
  readonly runId: string;
  readonly canonicalId: string;
  readonly position: string;
  readonly normalizedInputChecksum: string;
  readonly outputChecksum: string;
}

/** One player's place on a published board — the (input → output) pair for a coordinate. */
export interface BoardEntry {
  readonly canonicalId: string;
  readonly position: string;
  readonly normalizedInputChecksum: string;
  readonly outputChecksum: string;
}

export interface PublicationRecord {
  readonly publicationId: string;
  readonly schemaVersion: string;
  readonly runId: string;
  readonly snapshotId: string;
  /** Deterministic identity of the complete ordered board (digest, no `board-` prefix). */
  readonly boardChecksum: string;
  /** Number of player entries the board must contain — a completeness guard on read. */
  readonly entryCount: number;
  readonly publishedAt: string;
  readonly supersededPublicationId: string | null;
}

/** One fully-materialized, integrity-checked board entry inside a publication bundle. */
export interface PublicationBundleEntry {
  readonly canonicalId: string;
  readonly position: string;
  readonly normalizedInput: NormalizedInputRecord;
  readonly output: InferenceOutputRecord;
}

/** A coherent, fully-verified current/historical publication bundle (a COMPLETE board). */
export interface PublicationBundle {
  readonly publication: PublicationRecord;
  readonly run: RefreshRunRecord;
  readonly sources: readonly RefreshSourceOutcomeRecord[];
  readonly snapshot: SnapshotRecord;
  /** Every player on the board, deterministically ordered by (canonicalId, position). */
  readonly entries: readonly PublicationBundleEntry[];
}

/** A refresh run with its ordered source outcomes and produced inference artifact refs. */
export interface RefreshRunView {
  readonly run: RefreshRunRecord;
  readonly sources: readonly RefreshSourceOutcomeRecord[];
  readonly inference: readonly RunInferenceRecord[];
}
