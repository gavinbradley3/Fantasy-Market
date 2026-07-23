// Zero-adapter wiring proof (Phase 8). The composition claim is that the AUTHORITATIVE
// `Scheduler` and `PersistenceStore` structurally satisfy the application ports with no
// adapters. This test wires the real classes into `createApplicationService` and drives a
// refresh through the façade — a compile-time + runtime proof of the seam. (Test files are
// excluded from the boundary scan, so importing the concrete classes here is intentional.)

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApplicationService } from './ApplicationService';
import { Scheduler, type RefreshPipeline } from '@/scheduler';
import { PersistenceStore } from '@/persistence';
import { tempDbPath } from '@/persistence/__fixtures';

const paths: string[] = [];
afterEach(() => { for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true }); });

// A trivial in-test pipeline; persistence semantics are covered by the Phase 6 suite. Here we
// only prove the façade drives the real scheduler and reads the real store through the ports.
function trivialPipeline(): RefreshPipeline {
  return {
    async refresh() { return {}; },
    async persist() { return { status: 'success', publishable: false, snapshotId: null }; },
    async publish() { return { publicationId: 'unused', entryCount: 0 }; },
  };
}

describe('real Scheduler + PersistenceStore satisfy the ports with zero adapters', () => {
  it('drives a refresh through the façade and reads real store health', async () => {
    const dbPath = tempDbPath();
    paths.push(dbPath);
    const store = PersistenceStore.open(dbPath, () => '2026-07-23T00:00:00.000Z');
    const scheduler = new Scheduler({ pipeline: trivialPipeline(), logger: { info() {}, warn() {}, error() {} }, sleep: () => Promise.resolve() });

    // No adapters: the concrete instances are passed directly as the ports.
    const app = createApplicationService({
      scheduler,
      publications: store,
      runs: store,
      transport: { requiredProviders: ['nflverse'], replayEnabled: true },
      nowIso: () => '2026-07-23T00:00:00.000Z',
    });

    const result = await app.triggerRefresh();
    expect(result.success).toBe(true); // persist status 'success'
    expect(result.published).toBe(false); // not publishable → not published
    expect(app.history.latest()?.runId).toBe(result.runId);

    const status = app.schedulerStatus();
    expect(status.enabled).toBe(true);
    expect(status.lastExecution?.runId).toBe(result.runId);

    const health = app.healthReport();
    expect(health.status).toBe('ok');
    expect(health.persistence.available).toBe(true);
    expect(health.publication.hasCurrent).toBe(false); // nothing published yet
    expect(health.replay.available).toBe(false);

    expect(app.publications.currentPublicationMetadata()).toBeNull();
    store.close();
  });
});
