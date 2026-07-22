// End-to-end multi-player board integration (Phase 6 correction 2). A real multi-player
// refresh is persisted, published as a complete board, the DB is closed and reopened, the
// current board is retrieved, and the persisted raw envelopes are replayed through Phase 5
// with the network hard-disabled — reproducing the same snapshot, checksums, and board id.

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
import { computeBoardIdentity } from './canonical';
import { SCHEMA_VERSIONS } from './types';
import { ALL_LIVE, FETCHED_AT, mockedSuccessfulRefresh, tempDbPath } from './__fixtures';

const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };
const paths: string[] = [];
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

describe('K. end-to-end multi-player board', () => {
  it('persist → publish board → reopen → retrieve → replay (no network) reproduces the board', async () => {
    const { result, builds } = await mockedSuccessfulRefresh();
    expect(builds.length).toBeGreaterThanOrEqual(2); // genuinely multi-player (WR + QB)
    const p = tempDbPath();
    paths.push(p);

    // Persist and publish the complete board.
    let store = PersistenceStore.open(p, () => '2026-01-01T00:00:10.000Z');
    const outcome = persistRefreshResult(store, { result, inferenceBuilds: builds, ...META });
    const publishedId = store.publishBoard({ runId: outcome.runId }).publicationId;
    store.close();

    // Reopen and retrieve the current board.
    store = PersistenceStore.open(p, () => '2026-01-02T00:00:00.000Z');
    const bundle = store.getCurrentPublication()!;
    expect(bundle.publication.publicationId).toBe(publishedId);
    expect(bundle.entries.length).toBe(builds.length);
    const coords = bundle.entries.map((e) => `${e.canonicalId}:${e.position}`);
    expect(coords).toEqual([...coords].sort()); // deterministic ordering

    // Independently reproduce the board id from the retrieved entries.
    const recomputed = computeBoardIdentity(
      SCHEMA_VERSIONS.publication,
      bundle.publication.snapshotId,
      bundle.entries.map((e) => ({ canonicalId: e.canonicalId, position: e.position, normalizedInputChecksum: e.normalizedInput.checksum, outputChecksum: e.output.checksum })),
    );
    expect(recomputed.publicationId).toBe(publishedId);

    // Replay persisted raw envelopes through Phase 5 with the network disabled.
    const replayStore = new MemoryPayloadStore();
    let networkCalls = 0;
    for (const src of bundle.sources) {
      if (!src.payloadChecksum) continue;
      await replayStore.put(store.getRawEnvelopeByChecksum(src.payloadChecksum)!);
    }
    const deps: RefreshDeps = {
      registry: buildDefaultRegistry(),
      config: defaultTransportConfig(),
      store: replayStore,
      client: new HttpClient({ fetchFn: () => { networkCalls++; throw new Error('NETWORK DISABLED'); }, clock: fixedClock(FETCHED_AT), random: zeroRandom, sleep: noSleep, retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 } }),
      clock: fixedClock(FETCHED_AT),
    };
    const replayReqs: RefreshRequest[] = ALL_LIVE.map((r) => ({ ...r, mode: 'replay' as const }));
    const replayed = await refreshSources({ sources: replayReqs, inference: builds }, deps);

    expect(networkCalls).toBe(0);
    expect(replayed.snapshot!.snapshotId).toBe(result.snapshot!.snapshotId);

    // Every persisted board entry's checksums match the replayed inference.
    for (const entry of bundle.entries) {
      const replayOutcome = replayed.inference.find((o) => o.canonicalId === entry.canonicalId && o.position === entry.position)!;
      expect(replayOutcome.result!.normalizedInputChecksum).toBe(entry.normalizedInput.checksum);
      expect(replayOutcome.result!.outputChecksum).toBe(entry.output.checksum);
    }

    // The board id reproduced from the REPLAYED results equals the published id.
    const fromReplay = computeBoardIdentity(
      SCHEMA_VERSIONS.publication,
      replayed.snapshot!.snapshotId,
      builds.map((b) => {
        const o = replayed.inference.find((x) => x.canonicalId === b.canonicalId && x.position === b.position)!;
        return { canonicalId: b.canonicalId, position: b.position, normalizedInputChecksum: o.result!.normalizedInputChecksum, outputChecksum: o.result!.outputChecksum };
      }),
    );
    expect(fromReplay.publicationId).toBe(publishedId);
    store.close();
  });
});
