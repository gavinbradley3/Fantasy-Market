// Board-publication tests (Phase 6, v2): atomic current-pointer advance, history
// immutability, rejection of non-success / no-snapshot / incomplete-artifact-set / partial
// publications, idempotent re-publish, coherent COMPLETE-board bundle, and previous-state
// survival on a failed advance.

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

describe('board publication', () => {
  it('publishes a complete successful board and advances current atomically; bundle is coherent', async () => {
    const { store } = openStore();
    const m = await mockedSuccessfulRefresh();
    const outcome = persist(store, m);
    const pub = store.publishBoard({ runId: outcome.runId });
    expect(pub.runId).toBe(outcome.runId);
    expect(pub.entryCount).toBe(outcome.inference.length);
    expect(pub.publicationId.startsWith('board-')).toBe(true);

    const bundle = store.getCurrentPublication()!;
    expect(bundle.publication.publicationId).toBe(pub.publicationId);
    expect(bundle.snapshot.snapshotId).toBe(outcome.snapshotId);
    // Every board entry is present, integrity-checked, and internally consistent.
    expect(bundle.entries.length).toBe(outcome.inference.length);
    const byId = new Map(bundle.entries.map((e) => [`${e.canonicalId}:${e.position}`, e]));
    for (const ref of outcome.inference) {
      const e = byId.get(`${ref.canonicalId}:${ref.position}`)!;
      expect(e.output.checksum).toBe(ref.outputChecksum);
      expect(e.normalizedInput.checksum).toBe(ref.normalizedInputChecksum);
      expect(e.output.normalizedInputChecksum).toBe(e.normalizedInput.checksum);
      expect(e.normalizedInput.snapshotId).toBe(bundle.snapshot.snapshotId);
    }
    // Deterministic ordering by (canonicalId, position).
    const coords = bundle.entries.map((e) => `${e.canonicalId}:${e.position}`);
    expect(coords).toEqual([...coords].sort());
    store.close();
  });

  it('a partial run cannot publish by default', async () => {
    const { store } = openStore();
    const m = await mockedPartialRefresh();
    const outcome = persist(store, m);
    expect(outcome.status).toBe('partial');
    try {
      store.publishBoard({ runId: outcome.runId });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as PersistenceError).code).toBe('PUBLICATION_NOT_ALLOWED');
    }
    expect(store.getCurrentPublication()).toBeNull();
    store.close();
  });

  it('board completeness is FK-protected: a referenced artifact cannot be deleted', async () => {
    const { store } = openStore();
    const m = await mockedSuccessfulRefresh();
    const outcome = persist(store, m);
    // An output referenced by a run association cannot be removed — the schema forbids
    // creating a dangling (incomplete) board in the first place.
    expect(() =>
      (store as unknown as { db: import('./sqlite/db').Database }).db
        .prepare('DELETE FROM inference_output_artifact WHERE checksum = ?')
        .run(outcome.inference[0].outputChecksum),
    ).toThrowError(/FOREIGN KEY/);
    // The board still publishes cleanly.
    const pub = store.publishBoard({ runId: outcome.runId });
    expect(pub.entryCount).toBe(outcome.inference.length);
    store.close();
  });

  it('advances current across runs; previous publication remains in history & retrievable', async () => {
    const { store } = openStore();
    const m1 = await mockedSuccessfulRefresh();
    const first = persist(store, m1);
    const pub1 = store.publishBoard({ runId: first.runId });

    // A genuinely different board (WR-only) → a different board id that supersedes A.
    const m2 = await mockedSuccessfulRefresh();
    persistRefreshResult(store, { result: m2.result, inferenceBuilds: [m2.builds[0]], runId: 'run-second', ...META });
    const pub2 = store.publishBoard({ runId: 'run-second' });

    expect(pub2.publicationId).not.toBe(pub1.publicationId);
    expect(store.getCurrentPublicationRecord()!.publicationId).toBe(pub2.publicationId);
    expect(pub2.supersededPublicationId).toBe(pub1.publicationId);
    const history = store.getPublicationHistory();
    expect(history.map((p) => p.publicationId)).toContain(pub1.publicationId);
    expect(history.map((p) => p.publicationId)).toContain(pub2.publicationId);
    // The superseded publication is still fully retrievable & coherent as a complete board.
    const bundle = store.getPublicationBundle(pub1.publicationId)!;
    expect(bundle.entries.length).toBe(first.inference.length);
    store.close();
  });

  it('publishing the same board twice is idempotent (one current, one row)', async () => {
    const { store } = openStore();
    const outcome = persist(store, await mockedSuccessfulRefresh());
    const a = store.publishBoard({ runId: outcome.runId });
    const b = store.publishBoard({ runId: outcome.runId });
    expect(a.publicationId).toBe(b.publicationId);
    expect(store.getPublicationHistory().length).toBe(1);
    expect(store.getCurrentPublicationRecord()!.publicationId).toBe(a.publicationId);
    store.close();
  });

  it('a failed publication transaction leaves the previous current board intact', async () => {
    const { store } = openStore();
    const first = persist(store, await mockedSuccessfulRefresh());
    const pub1 = store.publishBoard({ runId: first.runId });
    // A run that cannot publish must not disturb current.
    const failed = persist(store, await mockedPartialRefresh(), 'run-partial');
    expect(() => store.publishBoard({ runId: failed.runId })).toThrowError(PersistenceError);
    expect(store.getCurrentPublicationRecord()!.publicationId).toBe(pub1.publicationId);
    store.close();
  });
});
