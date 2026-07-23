// PlayerTicker scheduled-refresh orchestration (Phase 7) — public surface.
//
// A THIN, PURE operational layer over the audited pipeline. It imports NO transport,
// ingestion, inference, persistence, or Node built-ins — it drives everything through an
// injected `RefreshPipeline` (see README for how the composition root wires the real APIs:
// refreshSources → persistRefreshResult → store.publishBoard). Being import-pure keeps it
// portable and impossible to accidentally pull Node-only persistence code into a browser.

export { Scheduler } from './scheduler';
export { SchedulerError, type SchedulerErrorCode } from './errors';
export { SchedulerMetrics } from './metrics';
export { resolveConfig, defaultTimer, type SchedulerConfig, type ResolvedSchedulerConfig } from './config';
export { isRetryableError, computeBackoffMs, deterministicUnit, NON_RETRYABLE_CODES, errorCode, errorMessage } from './retry';
export { executeRun, type RunnerCallbacks } from './runner';
export { StateHolder } from './state';
export type {
  TriggerType,
  SchedulerState,
  RunStatus,
  ExecutionStatus,
  PipelineContext,
  PersistStepResult,
  PublishStepResult,
  RefreshPipeline,
  ExecutionFailure,
  SchedulerExecutionResult,
  SchedulerLogger,
  SchedulerTimer,
  TimerHandle,
  SchedulerMetricsSnapshot,
} from './types';
