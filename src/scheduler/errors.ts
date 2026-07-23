// Typed scheduler errors (Phase 7). The scheduler NEVER masks a failure: an operational
// failure is surfaced as one of these (or the original pipeline error), carrying a safe,
// redaction-free message. It never logs or embeds provider payloads.

export type SchedulerErrorCode =
  | 'ALREADY_RUNNING' // a trigger fired while an execution held the lock (skip policy)
  | 'DISABLED' // start()/triggerNow() on a disabled scheduler
  | 'STOPPED' // triggerNow() after stop()
  | 'MANUAL_TRIGGER_DISABLED' // triggerNow() when allowManualTrigger === false
  | 'PIPELINE_FAILED'; // a pipeline step failed and is non-retryable / retries exhausted

export interface SchedulerErrorContext {
  readonly stage?: 'refresh' | 'persist' | 'publish' | 'lock';
  readonly retryable?: boolean;
  readonly cause?: unknown;
}

export class SchedulerError extends Error {
  readonly code: SchedulerErrorCode;
  readonly stage: 'refresh' | 'persist' | 'publish' | 'lock';
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(code: SchedulerErrorCode, message: string, context: SchedulerErrorContext = {}) {
    super(message);
    this.name = 'SchedulerError';
    this.code = code;
    this.stage = context.stage ?? 'lock';
    this.retryable = context.retryable ?? false;
    this.cause = context.cause;
  }
}
