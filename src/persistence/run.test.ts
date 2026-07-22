// Refresh-run persistence + end-to-end reopen/replay tests (Phase 6).

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  buildDefaultRegistry,
  defaultTransportConfig,
  DEFAULT_RETRY_POLICY,
  fixedClock,
  HttpClient,
  MemoryPayloadStore,
  noSleep,
  refreshSources,
  zeroRandom,
  type RefreshDeps,
  type RefreshRequest,
} from '@/transport';
import { PersistenceStore } from './store';
import { persistRefreshResult } from './persistRefreshResult';
import {
  ALL_LIVE,
  FETCHED_AT,
  mockedFailedRefresh,
  mockedPartialRefresh,
  mockedSuccessfulRefresh,
  tempDbPath,
} from './__fixtures';

const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };
const paths: string[] = [];
function openStore(p = tempDbPath()) {
  paths.push(p);
  return { path: p, store: PersistenceStore.open(p, () => '2026-01-01T00:00:10.000Z') };
}
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

describe('refresh-run persistence', () => {
  it('persists a successful run: run + ordered source outcomes + artifact associations', async () => {
    const { result, builds } = await mockedSuccessfulRefresh();
    const { store } = openStore();
    const outcome = persistRefreshResult(store, { result, inferenceBuilds: builds, requiredProviders: ['nflverse'], ...META });
    expect(outcome.status).toBe('success');
    expect(outcome.publishable).toBe(true);
    expect(outcome.snapshotId).toBe(result.snapshot!.snapshotId);

    const view = store.getRefreshRun(outcome.runId)!;
    expect(view.run.status).toBe('success');
    expect(view.run.snapshotId).toBe(result.snapshot!.snapshotId);
    expect(view.sources.length).toBe(ALL_LIVE.length);
    // Source outcomes are canonically ordered.
    const keys = view.sources.map((s) => `${s.provider}:${s.capability}`);
    expect(keys).toEqual([...keys].sort());
    // Two inference artifacts (WR + QB).
    expect(view.inference.length).toBe(2);
    store.close();
  });

  it('persists a partial run but marks it not publishable', async () => {
    const { result, builds } = await mockedPartialRefresh();
    expect(result.status).toBe('partial');
    const { store } = openStore();
    const outcome = persistRefreshResult(store, { result, inferenceBuilds: builds, requiredProviders: ['nflverse'], ...META });
    expect(outcome.status).toBe('partial');
    expect(outcome.publishable).toBe(false);
    const view = store.getRefreshRun(outcome.runId)!;
    // The failed sleeper source is recorded as a failure with a safe, redacted diagnostic.
    const sleeper = view.sources.find((s) => s.provider === 'sleeper')!;
    expect(sleeper.status).toBe('failure');
    expect(sleeper.errorCode).toBeTruthy();
    expect(`${sleeper.errorMessage}`).not.toMatch(/authorization|token|apikey/i);
    store.close();
  });

  it('persists a fully-failed run with no snapshot/artifacts', async () => {
    const { result } = await mockedFailedRefresh();
    expect(result.status).toBe('failure');
    const { store } = openStore();
    const outcome = persistRefreshResult(store, { result, requiredProviders: ['nflverse', 'sleeper'], ...META });
    expect(outcome.status).toBe('failure');
    expect(outcome.snapshotId).toBeNull();
    expect(outcome.publishable).toBe(false);
    const view = store.getRefreshRun(outcome.runId)!;
    expect(view.run.snapshotId).toBeNull();
    expect(view.run.requiredFailure).toBe(true);
    expect(view.inference.length).toBe(0);
    store.close();
  });

  it('retrying persistence with the same runId is idempotent (no duplicate rows)', async () => {
    const { result, builds } = await mockedSuccessfulRefresh();
    const { store } = openStore();
    const runId = 'run-fixed-1';
    persistRefreshResult(store, { result, inferenceBuilds: builds, runId, ...META });
    persistRefreshResult(store, { result, inferenceBuilds: builds, runId, ...META }); // retry
    const view = store.getRefreshRun(runId)!;
    expect(view.sources.length).toBe(ALL_LIVE.length);
    expect(view.inference.length).toBe(2);
    store.close();
  });
});

describe('end-to-end: persist → close → reopen → retrieve → replay (no network)', () => {
  it('reproduces the same snapshot id, normalized-input checksum, and output checksum', async () => {
    const { result, builds } = await mockedSuccessfulRefresh();
    const { path, store } = openStore();
    const outcome = persistRefreshResult(store, { result, inferenceBuilds: builds, ...META });
    store.close();

    // Reopen a brand-new store at the same path.
    const reopened = PersistenceStore.open(path, () => '2026-01-02T00:00:00.000Z');
    const view = reopened.getRefreshRun(outcome.runId)!;
    expect(view.run.snapshotId).toBe(result.snapshot!.snapshotId);

    // Retrieve the persisted raw envelopes and feed them into a Phase 5 REPLAY with the
    // network hard-disabled — this must reproduce the original deterministic artifacts.
    const replayStore = new MemoryPayloadStore();
    for (const src of view.sources) {
      if (!src.payloadChecksum) continue;
      const env = reopened.getRawEnvelopeByChecksum(src.payloadChecksum)!;
      await replayStore.put(env);
    }
    const replayDeps: RefreshDeps = {
      registry: buildDefaultRegistry(),
      config: defaultTransportConfig(),
      store: replayStore,
      client: new HttpClient({ fetchFn: () => { throw new Error('NETWORK DISABLED'); }, clock: fixedClock(FETCHED_AT), random: zeroRandom, sleep: noSleep, retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 } }),
      clock: fixedClock(FETCHED_AT),
    };
    const replayReqs: RefreshRequest[] = ALL_LIVE.map((r) => ({ ...r, mode: 'replay' as const }));
    const replayed = await refreshSources({ sources: replayReqs, inference: builds }, replayDeps);

    expect(replayed.snapshot!.snapshotId).toBe(result.snapshot!.snapshotId);
    // Output checksums match the persisted output artifacts.
    for (const ref of outcome.inference) {
      const persistedOut = reopened.getInferenceOutputByChecksum(ref.outputChecksum)!;
      const replayOutcome = replayed.inference.find((o) => o.canonicalId === ref.canonicalId)!;
      expect(replayOutcome.result!.outputChecksum).toBe(persistedOut.record.checksum);
      expect(replayOutcome.result!.normalizedInputChecksum).toBe(ref.normalizedInputChecksum);
    }
    reopened.close();
  });
});
