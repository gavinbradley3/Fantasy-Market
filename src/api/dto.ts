// PlayerTicker internal HTTP API (Phase 9) — transport DTOs + response projections.
//
// The API layer translates HTTP ↔ application DTOs. It exposes ONLY stable, projected shapes:
// it never returns raw persistence records (serialized payloads, schema versions, integrity
// digests are not leaked). Every field here is derived from an application-layer DTO or a
// deliberately narrowed projection of a persistence read.

import type {
  HealthReport,
  PublicationMetadata,
  RefreshExecutionResult,
  SchedulerStatus,
} from '@/application';
import type { PublicationBundle, RefreshRunView } from '@/persistence';

/** A framework-agnostic normalized request (built by the node:http adapter or tests). */
export interface ApiRequest {
  readonly method: string;
  /** Path without query string, e.g. "/publication/history". */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /** Parsed JSON body for writes, or undefined. */
  readonly body?: unknown;
}

/** A framework-agnostic response the adapter serializes to the wire. */
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Uniform error envelope. Never carries stack traces or provider payloads. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    /** Optional validation issues (field → message), for 400s. */
    readonly issues?: readonly string[];
  };
}

/** POST /refresh acknowledgement — accepted/skipped with a reason. */
export interface RefreshAckResponse {
  readonly runId: string | null;
  readonly accepted: boolean;
  readonly skipped: boolean;
  readonly reason: string | null;
  readonly status: RefreshExecutionResult['status'];
  readonly published: boolean;
  readonly publicationId: string | null;
}

/** One projected board entry (identity + content checksums only — no serialized payloads). */
export interface BoardEntryResponse {
  readonly canonicalId: string;
  readonly position: string;
  readonly normalizedInputChecksum: string;
  readonly outputChecksum: string;
}

/** GET /publication — current published board as a stable projection. */
export interface PublicationResponse {
  readonly publication: PublicationMetadata;
  readonly entries: readonly BoardEntryResponse[];
}

/** One projected source outcome for a run (no serialized payloads). */
export interface RunSourceResponse {
  readonly provider: string;
  readonly capability: string;
  readonly required: boolean;
  readonly mode: string;
  readonly status: string;
  readonly errorCode: string | null;
  readonly failureStage: string | null;
  readonly retryable: boolean | null;
}

/** GET /history/:runId — a durable run projected to a stable shape. */
export interface RunResponse {
  readonly runId: string;
  readonly status: string;
  readonly mode: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly requiredFailure: boolean;
  readonly sourceCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly snapshotId: string | null;
  readonly sources: readonly RunSourceResponse[];
}

// ---- projections (persistence/application → stable API DTOs) ----

export function toRefreshAck(r: RefreshExecutionResult): RefreshAckResponse {
  return {
    runId: r.runId || null,
    accepted: !r.skipped,
    skipped: r.skipped,
    reason: r.skipReason ?? (r.failure ? r.failure.code : null),
    status: r.status,
    published: r.published,
    publicationId: r.publicationId,
  };
}

export function toPublicationResponse(bundle: PublicationBundle, metadata: PublicationMetadata): PublicationResponse {
  return {
    publication: metadata,
    entries: bundle.entries.map((e) => ({
      canonicalId: e.canonicalId,
      position: e.position,
      normalizedInputChecksum: e.normalizedInput.checksum,
      outputChecksum: e.output.checksum,
    })),
  };
}

export function toRunResponse(view: RefreshRunView): RunResponse {
  return {
    runId: view.run.runId,
    status: view.run.status,
    mode: view.run.mode,
    startedAt: view.run.startedAt,
    completedAt: view.run.completedAt,
    requiredFailure: view.run.requiredFailure,
    sourceCount: view.run.sourceCount,
    successCount: view.run.successCount,
    failureCount: view.run.failureCount,
    snapshotId: view.run.snapshotId,
    sources: view.sources.map((s) => ({
      provider: s.provider,
      capability: s.capability,
      required: s.required,
      mode: s.mode,
      status: s.status,
      errorCode: s.errorCode,
      failureStage: s.failureStage,
      retryable: s.retryable,
    })),
  };
}

export type { HealthReport, SchedulerStatus, PublicationMetadata, RefreshExecutionResult };
