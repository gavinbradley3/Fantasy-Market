// PlayerTicker scheduled-refresh orchestration (Phase 7) — public types.
//
// The scheduler is a THIN operational layer. It never contains transport, ingestion,
// inference, valuation, persistence, or publication logic; it sequences those existing
// systems through an injected `RefreshPipeline`. This keeps the module pure and portable
// (it imports no `@/persistence`, `@/transport`, or Node built-ins — see boundary.test.ts).

/** How a single execution was initiated. */
export type TriggerType = 'manual' | 'interval';

/** Deterministic scheduler lifecycle states. */
export type SchedulerState = 'idle' | 'running' | 'backingOff' | 'stopped' | 'disabled';

/** The completed-run status the persistence layer reports back to the scheduler. */
export type RunStatus = 'success' | 'partial' | 'failure';

/** Final classification of one scheduler execution (scheduler metadata, not a DB record). */
export type ExecutionStatus = 'success' | 'partial' | 'failure' | 'skipped' | 'errored';

/** Context handed to every pipeline step so it can key work by the scheduler-owned run id. */
export interface PipelineContext {
  readonly runId: string;
  readonly trigger: TriggerType;
  /** 1-based attempt number for the current execution (increments on retry). */
  readonly attempt: number;
  readonly startedAt: string;
  readonly signal?: AbortSignal;
}

/** What the persist step reports so the runner can gate publication. */
export interface PersistStepResult {
  readonly status: RunStatus;
  readonly publishable: boolean;
  readonly snapshotId: string | null;
}

/** What the publish step reports. */
export interface PublishStepResult {
  readonly publicationId: string;
  readonly entryCount: number;
}

/**
 * The existing pipeline, injected. The composition root implements this over the audited
 * public APIs: refresh → `refreshSources`, persist → `persistRefreshResult`, publish →
 * `store.publishBoard`. `TRefresh` is the opaque refresh result threaded from refresh to
 * persist; the scheduler never inspects it, keeping it decoupled from those types.
 */
export interface RefreshPipeline<TRefresh = unknown> {
  refresh(ctx: PipelineContext): Promise<TRefresh>;
  persist(ctx: PipelineContext, refreshResult: TRefresh): Promise<PersistStepResult>;
  publish(ctx: PipelineContext): Promise<PublishStepResult>;
}

/** Safe, redaction-free failure summary attached to an execution result. */
export interface ExecutionFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  /** Which pipeline step failed. */
  readonly stage: 'refresh' | 'persist' | 'publish' | 'lock';
}

/** The operational outcome of one execution. Never duplicates persistence records. */
export interface SchedulerExecutionResult {
  readonly runId: string;
  readonly trigger: TriggerType;
  /** Total attempts made (1 + retries). */
  readonly attempts: number;
  readonly retries: number;
  readonly durationMs: number;
  readonly success: boolean;
  readonly skipped: boolean;
  readonly published: boolean;
  readonly publicationId: string | null;
  readonly status: ExecutionStatus;
  readonly skipReason?: string;
  readonly failure?: ExecutionFailure;
}

/** Structured operational logger. Implementations MUST NOT log provider payloads. */
export interface SchedulerLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

/** Injectable timer so intervals are deterministic and testable (no real wall clock in tests). */
export interface SchedulerTimer {
  schedule(delayMs: number, fn: () => void): TimerHandle;
  cancel(handle: TimerHandle): void;
}
export type TimerHandle = { readonly __brand: 'TimerHandle' } | unknown;

/** Lightweight runtime counters (no external metrics system). */
export interface SchedulerMetricsSnapshot {
  readonly executions: number;
  readonly successes: number;
  readonly failures: number;
  readonly retries: number;
  readonly skipped: number;
  readonly publications: number;
}
