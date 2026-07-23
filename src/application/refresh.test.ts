// RefreshService tests (Phase 8): delegation to the scheduler, result projection, non-blocking
// acknowledgement, current-execution view, recorded history, and defensive error normalization.

import { describe, expect, it } from 'vitest';
import { RefreshService, projectExecution } from './RefreshService';
import { InMemoryExecutionRecorder } from './recorder';
import { ApplicationError } from './errors';
import { FakeScheduler, InstantScheduler, execResult, fixedNow } from './__fixtures';

function make(scheduler = new InstantScheduler()) {
  const recorder = new InMemoryExecutionRecorder(50);
  const svc = new RefreshService(scheduler, recorder, fixedNow);
  return { svc, recorder, scheduler };
}

describe('triggerRefresh delegates and projects', () => {
  it('awaits the scheduler and returns the normalized DTO', async () => {
    const { svc, scheduler } = make();
    const r = await svc.triggerRefresh();
    expect(scheduler.triggerCalls).toBe(1);
    expect(r).toEqual({
      runId: 'run-manual-T-1', trigger: 'manual', status: 'success', success: true, skipped: false,
      published: true, publicationId: 'pub-1', attempts: 1, retries: 0, durationMs: 5, skipReason: null, failure: null,
    });
  });

  it('records each execution into history (newest first)', async () => {
    const { svc, scheduler } = make();
    scheduler.setNextResult(execResult({ runId: 'A' }));
    await svc.triggerRefresh();
    scheduler.setNextResult(execResult({ runId: 'B' }));
    await svc.triggerRefresh();
    expect(svc.executionHistory().map((e) => e.runId)).toEqual(['B', 'A']);
  });

  it('projects a skipped result faithfully', async () => {
    const { svc, scheduler } = make();
    scheduler.setNextResult(execResult({ skipped: true, success: false, published: false, publicationId: null, status: 'skipped', skipReason: 'already-running', runId: '' }));
    const r = await svc.triggerRefresh();
    expect(r.skipped).toBe(true);
    expect(r.skipReason).toBe('already-running');
    expect(r.published).toBe(false);
  });

  it('projects a failure result with a safe failure view', async () => {
    const { svc, scheduler } = make();
    scheduler.setNextResult(execResult({ success: false, published: false, publicationId: null, status: 'errored', failure: { code: 'CONFLICTING_ARTIFACT', message: 'conflict', retryable: false, stage: 'persist' } }));
    const r = await svc.triggerRefresh();
    expect(r.failure).toEqual({ code: 'CONFLICTING_ARTIFACT', message: 'conflict', retryable: false, stage: 'persist' });
  });

  it('wraps an unexpected scheduler throw as REFRESH_DISPATCH_FAILED (original cause preserved)', async () => {
    const { svc, scheduler } = make();
    scheduler.failNextTrigger();
    const err = await svc.triggerRefresh().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ApplicationError);
    expect(err.code).toBe('REFRESH_DISPATCH_FAILED');
    expect((err.cause as Error).message).toBe('boom');
  });
});

describe('triggerRefreshNow acknowledges without blocking', () => {
  it('returns the active run id + state synchronously and records the settled result', async () => {
    const scheduler = new FakeScheduler();
    const { svc, recorder } = make(scheduler);
    const ack = svc.triggerRefreshNow();
    expect(ack.dispatched).toBe(true);
    expect(ack.activeRunId).toBe('run-manual-T-1'); // lock acquired synchronously
    expect(ack.state).toBe('running');
    expect(ack.dispatchedAt).toBe('2026-07-23T00:00:00.000Z');
    expect(recorder.latest()).toBeNull(); // not settled yet
    scheduler.settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(recorder.latest()?.runId).toBe('run-manual-T-1'); // recorded on settle
  });
});

describe('currentExecution reflects scheduler state', () => {
  it('reports running + active run id while in flight, idle after', async () => {
    const scheduler = new FakeScheduler();
    const { svc } = make(scheduler);
    const p = svc.triggerRefresh();
    expect(svc.currentExecution()).toEqual({ running: true, activeRunId: 'run-manual-T-1', state: 'running' });
    scheduler.settle();
    await p;
    expect(svc.currentExecution()).toEqual({ running: false, activeRunId: null, state: 'idle' });
  });
});

describe('projectExecution is a pure projection', () => {
  it('maps optional fields to null', () => {
    const r = projectExecution(execResult({ skipReason: undefined, failure: undefined }));
    expect(r.skipReason).toBeNull();
    expect(r.failure).toBeNull();
  });
});
