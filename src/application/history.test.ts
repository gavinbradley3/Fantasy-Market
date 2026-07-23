// HistoryService tests (Phase 8): latest/recent from the observed-execution recorder, durable
// by-run-id lookup delegated to persistence, argument validation, and error normalization.

import { describe, expect, it } from 'vitest';
import { HistoryService } from './HistoryService';
import { RefreshService } from './RefreshService';
import { InMemoryExecutionRecorder } from './recorder';
import { ApplicationError } from './errors';
import { FakeStore, InstantScheduler, execResult, fixedNow } from './__fixtures';
import type { RefreshRunView } from '@/persistence';

function make() {
  const store = new FakeStore();
  const recorder = new InMemoryExecutionRecorder(50);
  const scheduler = new InstantScheduler();
  const refresh = new RefreshService(scheduler, recorder, fixedNow);
  const svc = new HistoryService(store, recorder);
  return { svc, store, recorder, refresh, scheduler };
}

describe('observed execution history', () => {
  it('latest + recent(N) report newest-first observed executions', async () => {
    const { svc, refresh, scheduler } = make();
    for (const id of ['a', 'b', 'c']) {
      scheduler.setNextResult(execResult({ runId: id }));
      await refresh.triggerRefresh();
    }
    expect(svc.latest()?.runId).toBe('c');
    expect(svc.recent(2).map((e) => e.runId)).toEqual(['c', 'b']);
  });

  it('latest is null before anything runs', () => {
    expect(make().svc.latest()).toBeNull();
  });
});

describe('durable by-run-id lookup', () => {
  it('delegates to the persistence run port', () => {
    const { svc, store } = make();
    const view = { run: { runId: 'R1' }, sources: [], inference: [] } as unknown as RefreshRunView;
    store.runs.set('R1', view);
    expect(svc.byRunId('R1')).toBe(view);
    expect(svc.byRunId('missing')).toBeNull();
  });

  it('rejects an empty run id', () => {
    expect(() => make().svc.byRunId('')).toThrow(ApplicationError);
  });

  it('normalizes a persistence throw to PERSISTENCE_UNAVAILABLE', () => {
    const { svc, store } = make();
    store.throwOn.add('getRefreshRun');
    const err = (() => { try { svc.byRunId('R1'); } catch (e) { return e as ApplicationError; } })();
    expect(err?.code).toBe('PERSISTENCE_UNAVAILABLE');
    expect(err?.detail).toBe('READ_FAILURE');
  });
});
