import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RefreshResult } from '@/transport';
import { mockedPartialRefresh, mockedSuccessfulRefresh, tempDbPath } from './__fixtures';
import { PersistenceError } from './errors';
import { persistRefreshResult } from './persistRefreshResult';
import { PersistenceStore } from './store';

const META = {
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:05.000Z',
};
const paths: string[] = [];

function openStore(): PersistenceStore {
  const path = tempDbPath();
  paths.push(path);
  return PersistenceStore.open(path, () => '2026-01-01T00:00:10.000Z');
}

afterEach(() => {
  for (const path of paths.splice(0)) rmSync(dirname(path), { recursive: true, force: true });
});

function expectPublicationRejected(store: PersistenceStore, runId: string, lastGoodId: string): void {
  expect(() => store.publishBoard({ runId })).toThrowError(PersistenceError);
  expect(store.getCurrentPublicationRecord()?.publicationId).toBe(lastGoodId);
}

describe('PT-02 publication completeness', () => {
  it('does not replace the last-good board when one selected player fails inference', async () => {
    const store = openStore();
    const complete = await mockedSuccessfulRefresh();
    const good = persistRefreshResult(store, { result: complete.result, inferenceBuilds: complete.builds, runId: 'run-good', ...META });
    const lastGood = store.publishBoard({ runId: good.runId });
    const failed = complete.result.inference[1];
    const result: RefreshResult = {
      ...complete.result,
      inference: [
        complete.result.inference[0],
        { canonicalId: failed.canonicalId, position: failed.position, ok: false, error: 'injected inference failure' },
      ],
    };

    const attempt = persistRefreshResult(store, { result, inferenceBuilds: complete.builds, runId: 'run-failed-player', ...META });

    expect(attempt.publishable).toBe(false);
    expectPublicationRejected(store, attempt.runId, lastGood.publicationId);
    expect(store.getCurrentPublicationRecord()?.boardChecksum).toBe(lastGood.boardChecksum);
    store.close();
  });

  it('does not replace the last-good board when a selected player has no outcome', async () => {
    const store = openStore();
    const complete = await mockedSuccessfulRefresh();
    const good = persistRefreshResult(store, { result: complete.result, inferenceBuilds: complete.builds, runId: 'run-good', ...META });
    const lastGood = store.publishBoard({ runId: good.runId });
    const result: RefreshResult = { ...complete.result, inference: complete.result.inference.slice(0, 1) };

    const attempt = persistRefreshResult(store, { result, inferenceBuilds: complete.builds, runId: 'run-missing-outcome', ...META });

    expect(attempt.publishable).toBe(false);
    expectPublicationRejected(store, attempt.runId, lastGood.publicationId);
    store.close();
  });

  it('does not treat an ok outcome with no result artifact as successful', async () => {
    const store = openStore();
    const complete = await mockedSuccessfulRefresh();
    const good = persistRefreshResult(store, { result: complete.result, inferenceBuilds: complete.builds, runId: 'run-good', ...META });
    const lastGood = store.publishBoard({ runId: good.runId });
    const absent = complete.result.inference[1];
    const result = {
      ...complete.result,
      inference: [
        complete.result.inference[0],
        { canonicalId: absent.canonicalId, position: absent.position, ok: true, result: null },
      ],
    } as unknown as RefreshResult;

    const attempt = persistRefreshResult(store, { result, inferenceBuilds: complete.builds, runId: 'run-null-result', ...META });

    expect(attempt.publishable).toBe(false);
    expectPublicationRejected(store, attempt.runId, lastGood.publicationId);
    store.close();
  });

  it('publishes a successful INSUFFICIENT outcome as a legitimate unvalued entry', async () => {
    const store = openStore();
    const complete = await mockedSuccessfulRefresh();
    const insufficient = complete.result.inference.find((outcome) => outcome.result?.modelTier === 'INSUFFICIENT');
    expect(insufficient?.ok).toBe(true);
    expect(insufficient?.result?.engineOutput).toBeNull();

    const persisted = persistRefreshResult(store, { result: complete.result, inferenceBuilds: complete.builds, runId: 'run-insufficient', ...META });
    const published = store.publishBoard({ runId: persisted.runId });

    expect(persisted.publishable).toBe(true);
    expect(published.entryCount).toBe(complete.builds.length);
    store.close();
  });

  it('still publishes after optional Sleeper degradation when selected inference is complete', async () => {
    const store = openStore();
    const degraded = await mockedPartialRefresh();
    const persisted = persistRefreshResult(store, { result: degraded.result, inferenceBuilds: degraded.builds, runId: 'run-optional-failure', ...META });

    expect(degraded.result.status).toBe('partial');
    expect(persisted.publishable).toBe(true);
    expect(store.publishBoard({ runId: persisted.runId }).entryCount).toBe(degraded.builds.length);
    store.close();
  });

  it('publishes a complete retry after an inference-failed attempt without changing methodology', async () => {
    const store = openStore();
    const complete = await mockedSuccessfulRefresh();
    const failedOutcome = complete.result.inference[1];
    const failedResult: RefreshResult = {
      ...complete.result,
      inference: [
        complete.result.inference[0],
        { canonicalId: failedOutcome.canonicalId, position: failedOutcome.position, ok: false, error: 'transient failure' },
      ],
    };
    const failed = persistRefreshResult(store, { result: failedResult, inferenceBuilds: complete.builds, runId: 'run-attempt-1', ...META });
    expect(failed.publishable).toBe(false);

    const retry = persistRefreshResult(store, { result: complete.result, inferenceBuilds: complete.builds, runId: 'run-attempt-2', ...META });
    const published = store.publishBoard({ runId: retry.runId });

    expect(retry.publishable).toBe(true);
    expect(published.entryCount).toBe(complete.builds.length);
    store.close();
  });
});
