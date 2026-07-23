// PlayerTicker application service layer (Phase 8) — public types + ports.
//
// This layer is a THIN coordination seam over the authoritative Phase 6/7 systems
// (persistence, publication, replay, scheduler). It contains NO business logic: it
// sequences and projects results, nothing more. It depends only on narrow PORT interfaces
// (defined here) — never on concrete persistence, transport, or valuation implementations —
// so the future composition root can wire the real classes in without this layer importing
// them. `import type` is used everywhere a foreign type is referenced, so no runtime module
// (and in particular no `node:sqlite` from the persistence barrel) is pulled in transitively.

import type {
  SchedulerExecutionResult,
  SchedulerMetricsSnapshot,
  SchedulerState,
  TriggerType,
  ExecutionStatus,
} from '@/scheduler';
import type { PublicationBundle, PublicationRecord, RefreshRunView } from '@/persistence';

// ---------------------------------------------------------------------------
// Ports — the only surfaces the application services consume.
// ---------------------------------------------------------------------------

/** The subset of the authoritative Scheduler the application layer drives/observes. */
export interface SchedulerPort {
  triggerNow(): Promise<SchedulerExecutionResult>;
  isRunning(): boolean;
  getState(): SchedulerState;
  getMetrics(): SchedulerMetricsSnapshot;
  getActiveRunId(): string | null;
  start(): void;
  stop(): void;
}

/** Read-only publication surface, satisfied structurally by `PersistenceStore`. */
export interface PublicationReadPort {
  getCurrentPublicationRecord(): PublicationRecord | null;
  getPublicationRecord(publicationId: string): PublicationRecord | null;
  getPublicationHistory(limit?: number): PublicationRecord[];
  getCurrentPublication(): PublicationBundle | null;
}

/** Read-only refresh-run surface, satisfied structurally by `PersistenceStore`. */
export interface RunHistoryPort {
  getRefreshRun(runId: string): RefreshRunView | null;
}

/** Records operational execution outcomes the service observes (an app-owned concern). */
export interface ExecutionRecorderPort {
  record(result: RefreshExecutionResult): void;
  latest(): RefreshExecutionResult | null;
  recent(limit: number): RefreshExecutionResult[];
  all(): readonly RefreshExecutionResult[];
}

// ---------------------------------------------------------------------------
// Public DTOs — the stable shapes future API/CLI/worker layers depend on.
// ---------------------------------------------------------------------------

/** A safe, normalized failure summary (never carries provider payloads). */
export interface ExecutionFailureView {
  readonly code: string;
  readonly message: string;
  readonly stage: 'refresh' | 'persist' | 'publish' | 'lock';
  readonly retryable: boolean;
}

/** Normalized outcome of one refresh execution (projected from the scheduler result). */
export interface RefreshExecutionResult {
  readonly runId: string;
  readonly trigger: TriggerType;
  readonly status: ExecutionStatus;
  readonly success: boolean;
  readonly skipped: boolean;
  readonly published: boolean;
  readonly publicationId: string | null;
  readonly attempts: number;
  readonly retries: number;
  readonly durationMs: number;
  readonly skipReason: string | null;
  readonly failure: ExecutionFailureView | null;
}

/** Immediate acknowledgement of a non-blocking refresh dispatch. */
export interface RefreshAcknowledgement {
  /** The trigger was dispatched to the scheduler (the settled outcome arrives via history). */
  readonly dispatched: boolean;
  /** The run active immediately after dispatch (may be a pre-existing run if this was skipped). */
  readonly activeRunId: string | null;
  readonly state: SchedulerState;
  readonly dispatchedAt: string;
}

/** A read-only snapshot of the in-flight execution, if any. */
export interface CurrentExecutionView {
  readonly running: boolean;
  readonly activeRunId: string | null;
  readonly state: SchedulerState;
}

/** Read-only operational status of the scheduler. */
export interface SchedulerStatus {
  readonly running: boolean;
  /** Derived from state: a disabled scheduler is the only inert configuration. */
  readonly enabled: boolean;
  readonly state: SchedulerState;
  readonly activeRunId: string | null;
  readonly metrics: SchedulerMetricsSnapshot;
  readonly lastExecution: RefreshExecutionResult | null;
  /**
   * The authoritative scheduler does not surface its next interval fire time, so this is
   * null unless a caller injected an estimator. Documented as best-effort / optional.
   */
  readonly nextScheduledExecutionAt: string | null;
}

/** Publication metadata (the record only — no materialized board entries). */
export interface PublicationMetadata {
  readonly publicationId: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly boardChecksum: string;
  readonly entryCount: number;
  readonly publishedAt: string;
  readonly supersededPublicationId: string | null;
}

/** A deterministic descriptor of transport configuration (supplied; app never imports transport). */
export interface TransportConfigDescriptor {
  readonly requiredProviders: readonly string[];
  readonly replayEnabled: boolean;
  readonly [key: string]: unknown;
}

/** Internal, deterministic health report (no networking, no external calls). */
export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly scheduler: { readonly enabled: boolean; readonly running: boolean; readonly state: SchedulerState };
  readonly persistence: { readonly available: boolean };
  readonly publication: {
    readonly hasCurrent: boolean;
    readonly currentPublicationId: string | null;
    readonly boardChecksum: string | null;
  };
  readonly replay: { readonly available: boolean };
  readonly transport: TransportConfigDescriptor;
  readonly checkedAt: string;
}

/** A monotonic ISO-timestamp source, injectable for determinism in tests. */
export type NowIso = () => string;

/** Everything the application façade needs, all injected — no concrete construction here. */
export interface ApplicationDependencies {
  readonly scheduler: SchedulerPort;
  readonly publications: PublicationReadPort;
  readonly runs: RunHistoryPort;
  readonly transport: TransportConfigDescriptor;
  /** Optional: defaults to an in-memory recorder. */
  readonly recorder?: ExecutionRecorderPort;
  /** Optional: defaults to `() => new Date().toISOString()`. */
  readonly nowIso?: NowIso;
  /** Optional cap on retained in-memory execution history. Default 100. */
  readonly historyLimit?: number;
}
