// ApplicationService façade tests (Phase 8): composition wiring, a shared recorder across
// services, convenience passthroughs, and default construction from ports.

import { describe, expect, it } from 'vitest';
import { ApplicationService, createApplicationService } from './ApplicationService';
import { InstantScheduler, FakeStore, transportDescriptor, execResult, fixedNow } from './__fixtures';
import type { ApplicationDependencies } from './types';

function deps(over: Partial<ApplicationDependencies> = {}): ApplicationDependencies {
  const store = new FakeStore();
  return { scheduler: new InstantScheduler(), publications: store, runs: store, transport: transportDescriptor, nowIso: fixedNow, ...over };
}

describe('façade composition', () => {
  it('createApplicationService wires all five services from ports', () => {
    const app = createApplicationService(deps());
    expect(app).toBeInstanceOf(ApplicationService);
    expect(app.refresh).toBeDefined();
    expect(app.scheduler).toBeDefined();
    expect(app.publications).toBeDefined();
    expect(app.history).toBeDefined();
    expect(app.health).toBeDefined();
  });

  it('shares one recorder: a refresh is visible through history and scheduler status', async () => {
    const scheduler = new InstantScheduler();
    scheduler.setNextResult(execResult({ runId: 'SHARED' }));
    const app = createApplicationService(deps({ scheduler }));
    await app.triggerRefresh();
    expect(app.history.latest()?.runId).toBe('SHARED');
    expect(app.schedulerStatus().lastExecution?.runId).toBe('SHARED');
    expect(app.refresh.executionHistory()[0]?.runId).toBe('SHARED');
  });

  it('convenience passthroughs delegate to the underlying services', async () => {
    const app = createApplicationService(deps());
    const r = await app.triggerRefresh();
    expect(r.success).toBe(true);
    const ack = app.triggerRefreshNow();
    expect(ack.dispatched).toBe(true);
    expect(app.healthReport().status).toBe('ok');
    expect(app.schedulerStatus().enabled).toBe(true);
  });

  it('honors an injected next-run estimator', () => {
    const app = new ApplicationService(deps(), () => '2026-07-23T00:15:00.000Z');
    expect(app.schedulerStatus().nextScheduledExecutionAt).toBe('2026-07-23T00:15:00.000Z');
  });
});
