// End-to-end test of the production pipeline against a mocked provider.
//
// Everything below the transport is real: real release discovery, real CSV decode, the real
// Phase 4 adapters, real identity resolution, real inference, the real SQLite store and the
// real publication. Only the network is mocked, and it is mocked at the one seam the
// production code already injects — so this exercises the same path a live run takes.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLivePipeline } from './livePipeline';
import { PersistenceStore } from '@/persistence';
import { tempDbPath } from '@/persistence/__fixtures';
import { HttpClient, MemoryPayloadStore, fixedClock, noSleep, zeroRandom, DEFAULT_RETRY_POLICY } from '@/transport';
import { defaultRoutes, routingFetch, FETCHED_AT, SEASON, RELEASE_STAMP } from '@/transport/__fixtures';
import type { PipelineContext } from '@/scheduler';

const AS_OF = '2025-10-01T00:00:00.000Z';
const CLOCK = fixedClock(FETCHED_AT);
const paths: string[] = [];
afterEach(() => { for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true }); });

function ctx(runId: string): PipelineContext {
  return { runId, trigger: 'manual', attempt: 1, startedAt: '2026-01-01T00:00:00.000Z' };
}

function harness(options: { calls?: string[]; payloadStore?: MemoryPayloadStore; replayOnly?: boolean } = {}) {
  const dbPath = tempDbPath();
  paths.push(dbPath);
  const store = PersistenceStore.open(dbPath, () => '2026-01-01T00:00:05.000Z');
  const pipeline = createLivePipeline({
    store: () => store,
    payloadStore: options.payloadStore ?? new MemoryPayloadStore(),
    seasons: [Number(SEASON)],
    asOf: () => AS_OF,
    clock: CLOCK,
    replayOnly: options.replayOnly ?? false,
    client: new HttpClient({
      fetchFn: options.replayOnly
        ? () => { throw new Error('network must not be used in replay mode'); }
        : routingFetch(defaultRoutes(), options.calls),
      clock: CLOCK, random: zeroRandom, sleep: noSleep,
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
    }),
  });
  return { store, pipeline, dbPath };
}

async function runOnce(h: ReturnType<typeof harness>, runId = 'run-1') {
  const refreshed = await h.pipeline.refresh(ctx(runId));
  const persisted = await h.pipeline.persist(ctx(runId), refreshed);
  const published = persisted.publishable ? await h.pipeline.publish(ctx(runId)) : null;
  return { refreshed, persisted, published };
}

describe('the production pipeline, end to end', () => {
  it('acquires releases, values the selected players, and publishes a board', async () => {
    const calls: string[] = [];
    const h = harness({ calls });
    try {
      const { refreshed, persisted, published } = await runOnce(h);

      expect(refreshed.result.status).toBe('success');
      expect(persisted.status).toBe('success');
      expect(published).not.toBeNull();
      expect(published!.entryCount).toBeGreaterThan(0);

      // Discovery ran for every release before its asset was fetched.
      expect(calls.filter((u) => u.endsWith('timestamp.json')).length).toBeGreaterThan(0);
      // The provider's own version reached the captured envelope.
      expect(refreshed.result.sources.every((s) => s.envelope?.sourceVersion === RELEASE_STAMP)).toBe(true);

      // The board carries at least one player with a real engine value, and every entry
      // without one is null rather than zero.
      const board = h.store.getCurrentPublicationRecord();
      expect(board).not.toBeNull();
      const valued = refreshed.result.inference.filter((i) => i.result?.engineOutput !== null);
      expect(valued.length).toBeGreaterThan(0);
      for (const outcome of refreshed.result.inference) {
        if (outcome.result?.engineOutput === null) {
          expect(outcome.result.readinessStatus).not.toBe('READY');
          expect(outcome.result.readinessMissing.length).toBeGreaterThan(0);
        }
      }
    } finally {
      h.store.close();
    }
  });

  it('selects players from the snapshot it just built, valuing only those with evidence', async () => {
    const h = harness();
    try {
      const { refreshed } = await runOnce(h);
      const selected = refreshed.builds.map((b) => b.canonicalId);
      // Exactly the modelled players carrying regular-season game records — never the
      // kicker the identity export also ships.
      const withGames = new Set(refreshed.result.snapshot!.games.map((g) => g.canonicalId));
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.every((id) => withGames.has(id))).toBe(true);
      // Canonical order, so the board's contents cannot depend on fetch timing.
      expect(selected).toEqual([...selected].sort());
    } finally {
      h.store.close();
    }
  });

  it('reproduces the same snapshot, checksums and board from captures, with no network', async () => {
    const payloadStore = new MemoryPayloadStore();
    const live = harness({ payloadStore });
    let liveSnapshotId: string;
    let liveChecksums: readonly string[];
    let liveBoard: string;
    try {
      const { refreshed, published } = await runOnce(live);
      liveSnapshotId = refreshed.result.snapshot!.snapshotId;
      liveChecksums = refreshed.result.inference.map((i) => i.result?.outputChecksum ?? '');
      liveBoard = published!.publicationId;
    } finally {
      live.store.close();
    }

    // A brand-new database, the same captures, and a client that throws if touched.
    const replay = harness({ payloadStore, replayOnly: true });
    try {
      const { refreshed, published } = await runOnce(replay);
      expect(refreshed.result.status).toBe('success');
      expect(refreshed.result.snapshot!.snapshotId).toBe(liveSnapshotId);
      expect(refreshed.result.inference.map((i) => i.result?.outputChecksum ?? '')).toEqual(liveChecksums);
      // The publication id is content-derived, so an identical id is an identical board.
      expect(published!.publicationId).toBe(liveBoard);
    } finally {
      replay.store.close();
    }
  });

  it('reports a required-provider failure instead of publishing a partial board', async () => {
    const h = harness();
    try {
      // No captures exist, so replay mode cannot acquire anything.
      const empty = createLivePipeline({
        store: () => h.store,
        payloadStore: new MemoryPayloadStore(),
        seasons: [Number(SEASON)],
        asOf: () => AS_OF,
        clock: CLOCK,
        replayOnly: true,
        client: new HttpClient({ fetchFn: () => { throw new Error('no network'); }, clock: CLOCK }),
      });
      const refreshed = await empty.refresh(ctx('run-empty'));
      expect(refreshed.result.status).toBe('failure');
      expect(refreshed.result.snapshot).toBeNull();
      expect(refreshed.builds).toEqual([]);

      const persisted = await empty.persist(ctx('run-empty'), refreshed);
      expect(persisted.publishable).toBe(false);
    } finally {
      h.store.close();
    }
  });
});
