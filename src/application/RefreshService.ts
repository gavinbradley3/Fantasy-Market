// RefreshService (Phase 8). The single entry point for asking PlayerTicker to refresh.
// It DELEGATES entirely to the authoritative scheduler — it owns no lock, timer, run id, or
// retry logic — and merely projects the scheduler's result into the stable application DTO
// and records it for operational history. The scheduler's single-run guarantee, run-id
// ownership, and retry policy are unchanged and unduplicated.

import { ApplicationError } from './errors';
import type {
  CurrentExecutionView,
  ExecutionRecorderPort,
  NowIso,
  RefreshAcknowledgement,
  RefreshExecutionResult,
  SchedulerPort,
} from './types';
import type { SchedulerExecutionResult } from '@/scheduler';

/** Project the scheduler's internal result into the application's stable, safe DTO. */
export function projectExecution(r: SchedulerExecutionResult): RefreshExecutionResult {
  return {
    runId: r.runId,
    trigger: r.trigger,
    status: r.status,
    success: r.success,
    skipped: r.skipped,
    published: r.published,
    publicationId: r.publicationId,
    attempts: r.attempts,
    retries: r.retries,
    durationMs: r.durationMs,
    skipReason: r.skipReason ?? null,
    failure: r.failure
      ? { code: r.failure.code, message: r.failure.message, stage: r.failure.stage, retryable: r.failure.retryable }
      : null,
  };
}

export class RefreshService {
  constructor(
    private readonly scheduler: SchedulerPort,
    private readonly recorder: ExecutionRecorderPort,
    private readonly nowIso: NowIso,
  ) {}

  /**
   * Trigger a refresh and await its completed outcome. Blocking. The scheduler decides whether
   * this runs or is skipped (overlap policy); this method never bypasses that decision.
   */
  async triggerRefresh(): Promise<RefreshExecutionResult> {
    let raw: SchedulerExecutionResult;
    try {
      raw = await this.scheduler.triggerNow();
    } catch (err) {
      // The authoritative scheduler is documented never to throw; guard defensively anyway.
      throw new ApplicationError('REFRESH_DISPATCH_FAILED', 'refresh dispatch failed unexpectedly', { cause: err });
    }
    const projected = projectExecution(raw);
    this.recorder.record(projected);
    return projected;
  }

  /**
   * Dispatch a refresh without awaiting completion, returning an immediate acknowledgement.
   * The settled outcome is recorded to execution history when it resolves. (The scheduler has
   * no queue: if an execution is already active this dispatch is skipped, per the overlap
   * policy — the acknowledgement reflects the scheduler state at dispatch time.)
   */
  triggerRefreshNow(): RefreshAcknowledgement {
    const dispatchedAt = this.nowIso();
    // triggerNow() acquires the lock and assigns the active run id synchronously before its
    // first await, so reading state/activeRunId immediately after reflects this dispatch.
    const promise = this.scheduler.triggerNow();
    const activeRunId = this.scheduler.getActiveRunId();
    const state = this.scheduler.getState();
    void promise.then(
      (r) => this.recorder.record(projectExecution(r)),
      () => {
        /* scheduler never rejects; nothing to record on the impossible path */
      },
    );
    return { dispatched: true, activeRunId, state, dispatchedAt };
  }

  /** The in-flight execution, if any (read-only projection of scheduler state). */
  currentExecution(): CurrentExecutionView {
    return {
      running: this.scheduler.isRunning(),
      activeRunId: this.scheduler.getActiveRunId(),
      state: this.scheduler.getState(),
    };
  }

  /** Operational history of executions this service has observed, newest first. */
  executionHistory(limit = 20): RefreshExecutionResult[] {
    return this.recorder.recent(limit);
  }
}
