// SchedulerService (Phase 8). Read-only operational view of the authoritative scheduler.
// It observes; it does NOT redesign lifecycle. `enabled` is derived from state: the Phase 7
// correction guarantees a disabled scheduler reports 'disabled' for its whole lifecycle and
// nothing else ever enters that state, so `state !== 'disabled'` is an exact read of the
// enabled configuration without needing a new scheduler accessor.

import type {
  ExecutionRecorderPort,
  NowIso,
  SchedulerPort,
  SchedulerStatus,
} from './types';

/** Optional estimator for the next interval fire time (the scheduler does not surface one). */
export type NextRunEstimator = () => string | null;

export class SchedulerService {
  private readonly nextRunEstimator: NextRunEstimator;

  constructor(
    private readonly scheduler: SchedulerPort,
    private readonly recorder: ExecutionRecorderPort,
    _nowIso: NowIso,
    nextRunEstimator?: NextRunEstimator,
  ) {
    this.nextRunEstimator = nextRunEstimator ?? (() => null);
  }

  running(): boolean {
    return this.scheduler.isRunning();
  }

  enabled(): boolean {
    return this.scheduler.getState() !== 'disabled';
  }

  status(): SchedulerStatus {
    return {
      running: this.scheduler.isRunning(),
      enabled: this.scheduler.getState() !== 'disabled',
      state: this.scheduler.getState(),
      activeRunId: this.scheduler.getActiveRunId(),
      metrics: this.scheduler.getMetrics(),
      lastExecution: this.recorder.latest(),
      nextScheduledExecutionAt: this.nextRunEstimator(),
    };
  }
}
