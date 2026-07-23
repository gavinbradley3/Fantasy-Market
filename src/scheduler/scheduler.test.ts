// Scheduler lifecycle tests (Phase 7): startup, triggers, interval, disabled, the single-run
// lock, clean shutdown, and metrics.

import { describe, expect, it } from 'vitest';
import { Scheduler } from './scheduler';
import { FakeTimer, deferred, makePipeline, silentLogger, terminalError } from './__fixtures';
import type { SchedulerConfig } from './config';

function build(over: Partial<SchedulerConfig> = {}) {
  const timer = new FakeTimer();
  const pipeline = over.pipeline ?? makePipeline();
  const scheduler = new Scheduler({ pipeline, timer, logger: silentLogger, sleep: () => Promise.resolve(), intervalMs: 1000, nowIso: () => new Date().toISOString(), ...over });
  return { scheduler, timer, pipeline: pipeline as ReturnType<typeof makePipeline> };
}

describe('startup lifecycle', () => {
  it('starts once and arms exactly one interval timer', () => {
    const { scheduler, timer } = build();
    scheduler.start();
    expect(scheduler.getState()).toBe('idle');
    expect(timer.pending()).toBe(1);
    scheduler.start(); // duplicate start ignored
    expect(timer.pending()).toBe(1);
  });

  it('stop() cancels the timer and moves to stopped; restart works', () => {
    const { scheduler, timer } = build();
    scheduler.start();
    scheduler.stop();
    expect(scheduler.getState()).toBe('stopped');
    expect(timer.pending()).toBe(0);
    scheduler.start(); // restart
    expect(scheduler.getState()).toBe('idle');
    expect(timer.pending()).toBe(1);
  });

  it('a disabled scheduler never runs', async () => {
    const { scheduler, timer, pipeline } = build({ enabled: false });
    expect(scheduler.getState()).toBe('disabled');
    scheduler.start();
    expect(timer.pending()).toBe(0);
    const r = await scheduler.triggerNow();
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('disabled');
    expect(pipeline.refresh).not.toHaveBeenCalled();
  });
});

describe('disabled-state lifecycle invariant (Phase 7 lifecycle correction)', () => {
  // A scheduler disabled at construction must stay disabled across any lifecycle sequence:
  // stop() must not force it to 'stopped' (which would let a later start() re-arm it).
  it('A. disabled + stop() + start() stays disabled, arms no timer, never executes', async () => {
    const { scheduler, timer, pipeline } = build({ enabled: false });
    expect(scheduler.getState()).toBe('disabled');
    scheduler.stop();
    expect(scheduler.getState()).toBe('disabled'); // stop() does not force 'stopped'
    scheduler.start();
    expect(scheduler.getState()).toBe('disabled'); // start() guard still applies
    expect(timer.pending()).toBe(0); // no interval armed
    timer.fireNext(); // even a stray callback must not run anything
    await new Promise((r) => setTimeout(r, 0));
    expect(pipeline.refresh).not.toHaveBeenCalled();
  });

  it('B. repeated stop()/start() on a disabled scheduler never leaks a timer, run, or metric', async () => {
    const { scheduler, timer, pipeline } = build({ enabled: false });
    for (const op of ['stop', 'start', 'stop', 'start'] as const) {
      scheduler[op]();
      expect(scheduler.getState()).toBe('disabled');
      expect(timer.pending()).toBe(0);
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(pipeline.refresh).not.toHaveBeenCalled();
    expect(pipeline.persist).not.toHaveBeenCalled();
    expect(pipeline.publish).not.toHaveBeenCalled();
    expect(scheduler.getMetrics()).toMatchObject({ executions: 0, successes: 0, failures: 0, publications: 0 });
  });

  it('E. manual trigger contract on a disabled scheduler is preserved (skipped, reason "disabled")', async () => {
    const { scheduler, pipeline } = build({ enabled: false });
    scheduler.stop();
    scheduler.start();
    const r = await scheduler.triggerNow();
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('disabled');
    expect(pipeline.refresh).not.toHaveBeenCalled();
    expect(scheduler.getMetrics().skipped).toBe(1); // recorded as a skip, not an execution
  });
});

describe('enabled restart regression (unchanged by the lifecycle correction)', () => {
  it('C. start → one timer → stop → zero timers → start → one timer → executes normally', async () => {
    const { scheduler, timer, pipeline } = build();
    scheduler.start();
    expect(timer.pending()).toBe(1);
    scheduler.stop();
    expect(scheduler.getState()).toBe('stopped');
    expect(timer.pending()).toBe(0);
    scheduler.start();
    expect(scheduler.getState()).toBe('idle');
    expect(timer.pending()).toBe(1);
    const r = await scheduler.triggerNow();
    expect(r.success).toBe(true);
    expect(pipeline.calls.map((c) => c.step)).toEqual(['refresh', 'persist', 'publish']);
    scheduler.stop();
  });

  it('D. duplicate start()/stop() stay idempotent: no duplicate timer, no illegal transition', async () => {
    const { scheduler, timer } = build();
    scheduler.start();
    scheduler.start(); // duplicate
    expect(timer.pending()).toBe(1);
    scheduler.stop();
    scheduler.stop(); // duplicate
    expect(scheduler.getState()).toBe('stopped');
    expect(timer.pending()).toBe(0);
    scheduler.start(); // restart after double-stop
    expect(scheduler.getState()).toBe('idle');
    expect(timer.pending()).toBe(1);
    scheduler.stop();
  });
});

describe('triggers', () => {
  it('manual trigger runs the full pipeline and updates metrics', async () => {
    const { scheduler, pipeline } = build();
    const r = await scheduler.triggerNow();
    expect(r.success).toBe(true);
    expect(r.trigger).toBe('manual');
    expect(pipeline.calls.map((c) => c.step)).toEqual(['refresh', 'persist', 'publish']);
    const m = scheduler.getMetrics();
    expect(m).toMatchObject({ executions: 1, successes: 1, failures: 0, publications: 1 });
  });

  it('interval tick runs the pipeline and re-arms', async () => {
    const { scheduler, timer, pipeline } = build();
    scheduler.start();
    timer.fireNext();
    // allow the async execution to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(pipeline.refresh).toHaveBeenCalledTimes(1);
    expect(pipeline.calls[0]?.runId.startsWith('run-interval-')).toBe(true);
    expect(timer.pending()).toBe(1); // re-armed
  });

  it('manual trigger disabled → skipped', async () => {
    const { scheduler } = build({ allowManualTrigger: false });
    const r = await scheduler.triggerNow();
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('manual-trigger-disabled');
  });
});

describe('single-run lock', () => {
  it('an overlapping trigger while one is active is skipped (not queued)', async () => {
    const gate = deferred();
    const pipeline = makePipeline({ refresh: async () => { await gate.promise; return {}; } });
    const { scheduler } = build({ pipeline });

    const first = scheduler.triggerNow(); // acquires the lock, blocks in refresh
    await new Promise((r) => setTimeout(r, 0));
    expect(scheduler.isRunning()).toBe(true);

    const second = await scheduler.triggerNow(); // overlapping → skipped
    expect(second.skipped).toBe(true);
    expect(second.skipReason).toBe('already-running');

    gate.resolve();
    const firstResult = await first;
    expect(firstResult.success).toBe(true);
    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.getMetrics().skipped).toBe(1);
  });

  it('releases the lock after success and after failure', async () => {
    // success
    const { scheduler } = build();
    await scheduler.triggerNow();
    expect(scheduler.isRunning()).toBe(false);
    // failure
    const failing = makePipeline({ refresh: () => { throw terminalError('INVALID_ARTIFACT_SET'); } });
    const s2 = build({ pipeline: failing }).scheduler;
    const r = await s2.triggerNow();
    expect(r.status).toBe('errored');
    expect(s2.isRunning()).toBe(false);
    // lock free → can run again
    const r2 = await s2.triggerNow();
    expect(r2.status).toBe('errored'); // still fails, but the lock was free to try
  });
});

describe('shutdown drains cleanly', () => {
  it('stop() during an active run lets it finish and ends stopped with no armed timer', async () => {
    const gate = deferred();
    const pipeline = makePipeline({ refresh: async () => { await gate.promise; return {}; } });
    const { scheduler, timer } = build({ pipeline });
    scheduler.start();
    const running = scheduler.triggerNow();
    await new Promise((r) => setTimeout(r, 0));
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop(); // request stop while active
    expect(timer.pending()).toBe(0); // interval timer canceled immediately

    gate.resolve();
    const result = await running; // active run drains to completion
    expect(result.success).toBe(true);
    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.getState()).toBe('stopped');
  });

  it('a stopped scheduler does not run on a stale interval callback', async () => {
    const { scheduler, timer, pipeline } = build();
    scheduler.start();
    scheduler.stop();
    // Even if a stale timer callback were invoked, the tick is guarded.
    timer.fireNext(); // no-op: queue already cleared, but guard also protects
    await new Promise((r) => setTimeout(r, 0));
    expect(pipeline.refresh).not.toHaveBeenCalled();
  });
});

describe('metrics counters', () => {
  it('aggregates executions, successes, failures, skipped, publications', async () => {
    const { scheduler } = build();
    await scheduler.triggerNow(); // success + publication
    const gate = deferred();
    // force an overlap to bump skipped
    const overlapPipeline = makePipeline({ refresh: async () => { await gate.promise; return {}; } });
    const s2 = build({ pipeline: overlapPipeline }).scheduler;
    const active = s2.triggerNow();
    await new Promise((r) => setTimeout(r, 0));
    await s2.triggerNow(); // skipped
    gate.resolve();
    await active;
    const m = s2.getMetrics();
    expect(m.executions).toBe(1);
    expect(m.successes).toBe(1);
    expect(m.skipped).toBe(1);
    expect(m.publications).toBe(1);
  });
});
