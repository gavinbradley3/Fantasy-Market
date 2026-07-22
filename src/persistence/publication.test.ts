// Publication tests (Phase 6): atomic current-pointer advance, history immutability,
// rejection of non-success / incomplete-artifact-set / partial publications, idempotent
// re-publish, coherent current bundle, and previous-state survival on a failed advance.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { PersistenceStore } from './store';
import { persistRefreshResult, type PersistRefreshOutcome } from './persistRefreshResult';
import { PersistenceError } from './errors';
import { mockedPartialRefresh, mockedSuccessfulRefresh, tempDbPath, type MockedRefresh } from './__fixtures';

const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };
const paths: string[] = [];
function openStore(p = tempDbPath()) {
  paths.push(p);
  let t = 0;
  return { path: p, store: PersistenceStore.open(p, () => `2026-01-01T00:00:${String(10 + t++).padStart(2, '0')}.000Z`) };
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

function persist(store: PersistenceStore, m: MockedRefresh, runId?: string): PersistRefreshOutcome {
  return persistRefreshResult(store, { result: m.result, inferenceBuilds: m.builds, ...(runId ? { runId } : {}), ...META });
}
function publishFirst(store: PersistenceStore, outcome: PersistRefreshOutcome) {
  const ref = outcome.inference[0];
  return store.publish({ runId: outcome.runId, snapshotId: outcome.snapshotId!, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: ref.outputChecksum });
}

describe('publication', () => {
  it('publishes a successful run and advances current atomically; bundle is coherent', async () => {
    const { store } = openStore();
    const m = await mockedSuccessfulRefresh();
    const outcome = persist(store, m);
    const pub = publishFirst(store, outcome);
    expect(pub.runId).toBe(outcome.runId);

    const bundle = store.getCurrentPublication()!;
    expect(bundle.publication.publicationId).toBe(pub.publicationId);
    expect(bundle.snapshot.snapshotId).toBe(outcome.snapshotId);
    expect(bundle.output.checksum).toBe(outcome.inference[0].outputChecksum);
    expect(bundle.normalizedInput.checksum).toBe(outcome.inference[0].normalizedInputChecksum);
    // All the artifact generations in the bundle are internally consistent.
    expect(bundle.output.normalizedInputChecksum).toBe(bundle.normalizedInput.checksum);
    expect(bundle.normalizedInput.snapshotId).toBe(bundle.snapshot.snapshotId);
    store.close();
  });

  it('a partial run cannot publish by default', async () => {
    const { store } = openStore();
    const m = await mockedPartialRefresh();
    const outcome = persist(store, m);
    expect(outcome.status).toBe('partial');
    const ref = outcome.inference[0];
    try {
      store.publish({ runId: outcome.runId, snapshotId: outcome.snapshotId!, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: ref.outputChecksum });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('PUBLICATION_NOT_ALLOWED');
    }
    expect(store.getCurrentPublication()).toBeNull();
    store.close();
  });

  it('rejects publishing an incomplete artifact set', async () => {
    const { store } = openStore();
    const m = await mockedSuccessfulRefresh();
    const outcome = persist(store, m);
    const ref = outcome.inference[0];
    try {
      store.publish({ runId: outcome.runId, snapshotId: outcome.snapshotId!, normalizedInputChecksum: ref.normalizedInputChecksum, outputChecksum: 'sha-notreal' });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('INVALID_ARTIFACT_SET');
    }
    store.close();
  });

  it('advances current across runs; previous publication remains in history', async () => {
    const { store } = openStore();
    const first = persist(store, await mockedSuccessfulRefresh());
    const pub1 = publishFirst(store, first);
    const second = persist(store, await mockedSuccessfulRefresh(), 'run-second');
    const pub2 = publishFirst(store, second);

    expect(store.getCurrentPublicationRecord()!.publicationId).toBe(pub2.publicationId);
    expect(pub2.supersededPublicationId).toBe(pub1.publicationId);
    const history = store.getPublicationHistory();
    expect(history.map((p) => p.publicationId)).toContain(pub1.publicationId);
    expect(history.map((p) => p.publicationId)).toContain(pub2.publicationId);
    // The superseded publication is still fully retrievable & coherent.
    const oldBundle = store.getPublicationBundle(pub1.publicationId)!;
    expect(oldBundle.publication.publicationId).toBe(pub1.publicationId);
    store.close();
  });

  it('publishing the same run twice is idempotent (one current, one row)', async () => {
    const { store } = openStore();
    const outcome = persist(store, await mockedSuccessfulRefresh());
    const a = publishFirst(store, outcome);
    const b = publishFirst(store, outcome);
    expect(a.publicationId).toBe(b.publicationId);
    expect(store.getPublicationHistory().length).toBe(1);
    expect(store.getCurrentPublicationRecord()!.publicationId).toBe(a.publicationId);
    store.close();
  });

  it('a failed publication transaction leaves the previous current state intact', async () => {
    const { store } = openStore();
    const first = persist(store, await mockedSuccessfulRefresh());
    const pub1 = publishFirst(store, first);
    // Attempt an invalid publish (bad artifact set) — must not disturb current.
    expect(() => store.publish({ runId: first.runId, snapshotId: first.snapshotId!, normalizedInputChecksum: 'sha-bad', outputChecksum: 'sha-bad' })).toThrowError(PersistenceError);
    expect(store.getCurrentPublicationRecord()!.publicationId).toBe(pub1.publicationId);
    store.close();
  });
});
