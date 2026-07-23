// HealthService tests (Phase 8): deterministic report assembly, replay-availability
// derivation, and graceful degradation when a persistence read throws. No networking.

import { describe, expect, it } from 'vitest';
import { HealthService } from './HealthService';
import { FakeScheduler, FakeStore, transportDescriptor, fixedNow } from './__fixtures';

function make(store = new FakeStore(), scheduler = new FakeScheduler()) {
  return { svc: new HealthService(scheduler, store, transportDescriptor, fixedNow), store, scheduler };
}

describe('health report', () => {
  it('reports ok with publication + replay available when a board is published', () => {
    const { svc } = make();
    const r = svc.report();
    expect(r.status).toBe('ok');
    expect(r.scheduler).toEqual({ enabled: true, running: false, state: 'idle' });
    expect(r.persistence.available).toBe(true);
    expect(r.publication).toEqual({ hasCurrent: true, currentPublicationId: 'pub-1', boardChecksum: 'checksum-abc' });
    expect(r.replay.available).toBe(true);
    expect(r.transport).toBe(transportDescriptor);
    expect(r.checkedAt).toBe('2026-07-23T00:00:00.000Z');
  });

  it('replay is unavailable when nothing is published', () => {
    const store = new FakeStore();
    store.current = null;
    const r = make(store).svc.report();
    expect(r.publication.hasCurrent).toBe(false);
    expect(r.replay.available).toBe(false);
    expect(r.status).toBe('ok'); // reachable persistence, just no board yet
  });

  it('degrades when a persistence read throws (no propagation)', () => {
    const store = new FakeStore();
    store.throwOn.add('getCurrentPublicationRecord');
    const r = make(store).svc.report();
    expect(r.status).toBe('degraded');
    expect(r.persistence.available).toBe(false);
    expect(r.replay.available).toBe(false);
  });

  it('reflects a disabled scheduler', () => {
    const scheduler = new FakeScheduler();
    scheduler.state = 'disabled';
    const r = make(new FakeStore(), scheduler).svc.report();
    expect(r.scheduler.enabled).toBe(false);
  });

  it('replay honors the transport replayEnabled flag', () => {
    const store = new FakeStore();
    const svc = new HealthService(new FakeScheduler(), store, { ...transportDescriptor, replayEnabled: false }, fixedNow);
    expect(svc.report().replay.available).toBe(false);
  });
});
