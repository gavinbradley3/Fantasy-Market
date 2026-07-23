// The Scheduler (Phase 7): lifecycle, process-local execution lock, interval timer, run-id
// ownership, state, metrics, and structured logging. It delegates the actual work to
// `executeRun` and guarantees the single-run invariant: at most ONE execution is active at
// any time. A trigger that fires while an execution is active is SKIPPED (never queued).
//
// Single-process assumption: the lock is an in-process flag. No distributed/DB/Redis lock is
// implemented or implied — running two processes against the same database is out of scope.

import { resolveConfig, type ResolvedSchedulerConfig, type SchedulerConfig } from './config';
import { SchedulerMetrics } from './metrics';
import { executeRun } from './runner';
import { StateHolder } from './state';
import type { SchedulerExecutionResult, SchedulerMetricsSnapshot, SchedulerState, TimerHandle, TriggerType } from './types';

function skippedResult(trigger: TriggerType, reason: string): SchedulerExecutionResult {
  return { runId: '', trigger, attempts: 0, retries: 0, durationMs: 0, success: false, skipped: true, published: false, publicationId: null, status: 'skipped', skipReason: reason };
}

export class Scheduler<TRefresh = unknown> {
  private readonly cfg: ResolvedSchedulerConfig<TRefresh>;
  private readonly metrics = new SchedulerMetrics();
  private readonly state: StateHolder;

  private active = false; // the process-local execution lock
  private activeRunId: string | null = null;
  private started = false;
  private stopped = false;
  private timerHandle: TimerHandle | null = null;
  private runSeq = 0;

  constructor(config: SchedulerConfig<TRefresh>) {
    this.cfg = resolveConfig(config);
    this.state = new StateHolder(this.cfg.enabled ? 'idle' : 'disabled');
  }

  /** Arm the interval timer and (optionally) run once immediately. Idempotent per lifecycle. */
  start(): void {
    if (this.state.is('disabled')) {
      this.cfg.logger.warn('scheduler.start.ignored', { reason: 'disabled' });
      return;
    }
    if (this.started) {
      this.cfg.logger.warn('scheduler.start.ignored', { reason: 'already-started' });
      return;
    }
    this.started = true;
    this.stopped = false;
    this.state.to('idle');
    this.cfg.logger.info('scheduler.started', { intervalMs: this.cfg.intervalMs, runOnStart: this.cfg.runOnStart });
    if (this.cfg.runOnStart) void this.runExecution('interval');
    this.arm();
  }

  /** Prevent future interval executions; an in-flight execution is allowed to finish. */
  stop(): void {
    if (this.state.is('disabled')) {
      // A scheduler disabled at construction is inert for its whole lifecycle: enabled === false
      // is a configuration invariant, not a runtime state. stop() must NOT force it to 'stopped',
      // or a later start() (whose guard only checks 'disabled') would re-arm it. Stay disabled.
      this.cfg.logger.warn('scheduler.stop.ignored', { reason: 'disabled' });
      return;
    }
    if (!this.started && !this.state.is('running') && !this.state.is('backingOff')) {
      // idempotent: stopping an already-stopped scheduler
      this.started = false;
      this.stopped = true;
      this.state.force('stopped');
      return;
    }
    this.started = false;
    this.stopped = true;
    if (this.timerHandle != null) {
      this.cfg.timer.cancel(this.timerHandle);
      this.timerHandle = null;
    }
    // If nothing is active, we are stopped now; an active run flips to 'stopped' in its finally.
    if (!this.active) this.state.force('stopped');
    this.cfg.logger.info('scheduler.stopped', {});
  }

  /** True while an execution holds the lock. */
  isRunning(): boolean {
    return this.active;
  }

  getState(): SchedulerState {
    return this.state.get();
  }

  getMetrics(): SchedulerMetricsSnapshot {
    return this.metrics.snapshot();
  }

  getActiveRunId(): string | null {
    return this.activeRunId;
  }

  /** Run one execution immediately (subject to lock + policy). Never throws; returns a result. */
  async triggerNow(): Promise<SchedulerExecutionResult> {
    if (this.state.is('disabled')) {
      this.metrics.recordSkipped();
      this.cfg.logger.warn('scheduler.trigger.skipped', { trigger: 'manual', reason: 'disabled' });
      return skippedResult('manual', 'disabled');
    }
    if (!this.cfg.allowManualTrigger) {
      this.metrics.recordSkipped();
      this.cfg.logger.warn('scheduler.trigger.skipped', { trigger: 'manual', reason: 'manual-trigger-disabled' });
      return skippedResult('manual', 'manual-trigger-disabled');
    }
    return this.runExecution('manual');
  }

  // ---- internals ----

  private nextRunId(trigger: TriggerType): string {
    this.runSeq += 1;
    return `${this.cfg.runIdPrefix}-${trigger}-${this.cfg.nowIso()}-${this.runSeq}`;
  }

  private arm(): void {
    if (!this.started || this.stopped) return;
    this.timerHandle = this.cfg.timer.schedule(this.cfg.intervalMs, () => {
      void this.onTick();
    });
  }

  private async onTick(): Promise<void> {
    if (!this.started || this.stopped) return;
    try {
      await this.runExecution('interval');
    } finally {
      // Re-arm only if still running the lifecycle (never overlaps: next tick starts after this one).
      this.arm();
    }
  }

  private async runExecution(trigger: TriggerType): Promise<SchedulerExecutionResult> {
    // Acquire the process-local lock. The check+set is synchronous, so two triggers racing on
    // the event loop cannot both acquire it — the second observes `active` and is skipped.
    if (this.active) {
      this.metrics.recordSkipped();
      this.cfg.logger.warn('scheduler.trigger.skipped', { trigger, reason: 'already-running', activeRunId: this.activeRunId });
      return skippedResult(trigger, 'already-running');
    }
    this.active = true;
    const runId = this.nextRunId(trigger);
    this.activeRunId = runId;
    this.state.to('running');

    try {
      const result = await executeRun(this.cfg, this.metrics, runId, trigger, {
        onBackoff: () => {
          this.state.to('backingOff');
        },
        onActive: () => {
          this.state.to('running');
        },
      });
      return result;
    } finally {
      this.active = false;
      this.activeRunId = null;
      if (this.stopped) this.state.force('stopped');
      else this.state.to('idle');
    }
  }
}
