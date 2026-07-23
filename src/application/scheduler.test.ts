// SchedulerService tests (Phase 8): read-only status projection, enabled-derivation from
// state, and last-execution sourcing from the shared recorder. No lifecycle mutation.

import { describe, expect, it } from 'vitest';
import { SchedulerService } from './SchedulerService';
import { RefreshService } from './RefreshService';
import { InMemoryExecutionRecorder } from './recorder';
import { InstantScheduler, execResult, fixedNow } from './__fixtures';

function make() {
  const scheduler = new InstantScheduler();
  const recorder = new InMemoryExecutionRecorder(50);
  const svc = new SchedulerService(scheduler, recorder, fixedNow);
  const refresh = new RefreshService(scheduler, recorder, fixedNow);
  return { svc, scheduler, recorder, refresh };
}

describe('status', () => {
  it('projects running/enabled/state/metrics/activeRunId', () => {
    const { svc, scheduler } = make();
    scheduler.metrics = { executions: 4, successes: 3, failures: 1, retries: 2, skipped: 1, publications: 3 };
    const s = svc.status();
    expect(s.running).toBe(false);
    expect(s.enabled).toBe(true);
    expect(s.state).toBe('idle');
    expect(s.metrics.executions).toBe(4);
    expect(s.lastExecution).toBeNull();
    expect(s.nextScheduledExecutionAt).toBeNull();
  });

  it('derives enabled=false only for the disabled state', () => {
    const { svc, scheduler } = make();
    scheduler.state = 'disabled';
    expect(svc.enabled()).toBe(false);
    expect(svc.status().enabled).toBe(false);
    scheduler.state = 'stopped';
    expect(svc.enabled()).toBe(true); // stopped-but-enabled is still enabled
  });

  it('surfaces the most-recent execution via the shared recorder', async () => {
    const { svc, refresh, scheduler } = make();
    scheduler.setNextResult(execResult({ runId: 'LAST' }));
    await refresh.triggerRefresh();
    expect(svc.status().lastExecution?.runId).toBe('LAST');
  });

  it('uses an injected next-run estimator when provided', () => {
    const scheduler = new InstantScheduler();
    const recorder = new InMemoryExecutionRecorder(50);
    const svc = new SchedulerService(scheduler, recorder, fixedNow, () => '2026-07-23T00:05:00.000Z');
    expect(svc.status().nextScheduledExecutionAt).toBe('2026-07-23T00:05:00.000Z');
  });
});
