// REAL local integration (Phase 10): the frontend's own API client, over a real socket,
// against the real Phase 9 HTTP server, the real application layer, the real scheduler and a
// real SQLite persistence store holding a genuinely published board.
//
//     browser ApiClient → node:http → ApiApp → ApplicationService → PersistenceStore
//                                   ↑ real                        ↑ real artifacts
//
// Nothing below the client is mocked and no network is touched: the publication is produced by
// replaying the committed synthetic provider payloads the persistence tests already use.
//
// This file lives under `src/api/` on purpose. `boundary.test.ts` forbids ANY file outside this
// directory from importing `@/api`, and that rule is worth more than the convenience of filing
// this test with the frontend. Nothing here weakens it: the browser-side boundary is asserted
// separately in `src/services/api/boundary.test.ts`.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AddressInfo } from 'node:net';
import { composeApi, createHttpServer } from './index';
import { persistRefreshResult, PersistenceStore } from '@/persistence';
import { mockedSuccessfulRefresh, tempDbPath } from '@/persistence/__fixtures';
import type { RefreshPipeline } from '@/scheduler';
import type { TransportConfigDescriptor } from '@/application';
import { ApiClient, fetchCurrentPublication, fetchHealth, type ApiError } from '@/services/api';
import { adaptPublication } from '@/services/publication/adapter';

const transport: TransportConfigDescriptor = { requiredProviders: ['nflverse'], replayEnabled: true };
const paths: string[] = [];
afterEach(() => {
  for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true });
});

const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };

interface LiveStack {
  readonly client: ApiClient;
  readonly publish: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Boot the whole real stack on an ephemeral port and hand back a browser client for it. */
async function bootRealStack(allowedOrigins: readonly string[] = []): Promise<LiveStack> {
  const { result, builds } = await mockedSuccessfulRefresh();
  const dbPath = tempDbPath();
  paths.push(dbPath);

  let store!: PersistenceStore;
  const pipeline: RefreshPipeline = {
    async refresh() {
      return result;
    },
    async persist(ctx) {
      const o = persistRefreshResult(store, { result, inferenceBuilds: builds, runId: ctx.runId, ...META });
      return { status: o.status, publishable: o.publishable, snapshotId: o.snapshotId };
    },
    async publish(ctx) {
      const p = store.publishBoard({ runId: ctx.runId });
      return { publicationId: p.publicationId, entryCount: p.entryCount };
    },
  };

  const composed = composeApi({ dbPath, pipeline, transport, dbNow: () => '2026-01-01T00:00:10.000Z' });
  store = composed.store;
  const server = createHttpServer(composed.api, { allowedOrigins });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    client: new ApiClient({ baseUrl: `http://127.0.0.1:${port}` }),
    async publish() {
      const ack = await composed.api.handle({ method: 'POST', path: '/refresh', query: {} });
      expect((ack.body as { published: boolean }).published).toBe(true);
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      composed.close();
      composed.close(); // idempotent, exercised on every teardown
    },
  };
}

describe('the frontend API client against the real backend', () => {
  it('reads an empty backend as a 404 the UI can render as an empty state', async () => {
    const stack = await bootRealStack();
    try {
      const err = await fetchCurrentPublication(stack.client).catch((e: unknown) => e as ApiError);
      expect((err as ApiError).kind).toBe('notFound');
      // A reachable-but-empty backend is NOT an outage, and the client says so.
      expect((err as ApiError).status).toBe(404);
    } finally {
      await stack.close();
    }
  }, 30_000);

  it('reads a real published board end to end and adapts it without inventing values', async () => {
    const stack = await bootRealStack();
    try {
      await stack.publish();

      const response = await fetchCurrentPublication(stack.client);
      expect(response.publication.publicationId).toMatch(/./);
      expect(response.entries.length).toBeGreaterThan(0);

      const market = adaptPublication(response);
      expect(market.players.length).toBe(response.entries.length);
      expect(market.rejected).toEqual([]);

      // Identity survives the whole path: canonical ids and positions are the backend's.
      const positions = new Set(market.players.map((p) => p.position));
      expect(positions.has('WR')).toBe(true);
      expect(positions.has('QB')).toBe(true);
      for (const p of market.players) {
        expect(p.playerId).toMatch(/^pt-/);
        expect(response.entries.some((e) => e.canonicalId === p.playerId)).toBe(true);
      }

      // Player identity is published, and comes through as the ingestion layer normalized it.
      expect(market.players.every((p) => typeof p.name === 'string' && p.name.length > 0)).toBe(true);
      expect(market.players.map((p) => p.team)).toEqual(market.players.map(() => 'CIN'));

      // THE HONEST STATE OF THE SYSTEM TODAY: this publication's players are NOT_READY, so the
      // inference layer published no valuation for them. Every valuation field must therefore
      // be null all the way through to the frontend model — not 0, not a placeholder.
      for (const p of market.players) {
        expect(p.readiness).toBe('NOT_READY');
        expect(p.honestyState).toBe('UNAVAILABLE');
        expect(p.value).toBeNull();
        expect(p.composites).toBeNull();
        expect(p.confidenceScore).toBeNull();
        expect(p.volatilityScore).toBeNull();
        expect(p.overallRank).toBeNull();
        expect(p.readinessMissingCount).toBeGreaterThan(0);
      }
      expect(market.valuedCount).toBe(0);
    } finally {
      await stack.close();
    }
  }, 30_000);

  it('reads /health, and reflects a publication appearing', async () => {
    const stack = await bootRealStack();
    try {
      const before = await fetchHealth(stack.client);
      expect(before.publication.hasCurrent).toBe(false);
      expect(before.persistence.available).toBe(true);

      await stack.publish();

      const after = await fetchHealth(stack.client);
      expect(after.publication.hasCurrent).toBe(true);
      expect(after.publication.currentPublicationId).toMatch(/./);
    } finally {
      await stack.close();
    }
  }, 30_000);

  it('surfaces a malformed path as a 400 the client reports as badRequest', async () => {
    const stack = await bootRealStack();
    try {
      const err = await stack.client.getJson('/publication/%zz').catch((e: unknown) => e as ApiError);
      expect((err as ApiError).kind).toBe('badRequest');
      expect((err as ApiError).status).toBe(400);
    } finally {
      await stack.close();
    }
  }, 30_000);

  it('serves a cross-origin browser read when the origin is configured', async () => {
    const origin = 'http://localhost:5173';
    const stack = await bootRealStack([origin]);
    try {
      await stack.publish();
      const url = stack.client.url('/publication');
      const direct = await fetch(url, { headers: { origin } });
      expect(direct.status).toBe(200);
      expect(direct.headers.get('access-control-allow-origin')).toBe(origin);
    } finally {
      await stack.close();
    }
  }, 30_000);

  it('reports an unreachable backend as a network failure, with no fallback data', async () => {
    // A port nothing is listening on: the exact shape of "the API is down".
    const dead = new ApiClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 2_000 });
    const err = await fetchCurrentPublication(dead).catch((e: unknown) => e as ApiError);
    expect(['network', 'cancelled']).toContain((err as ApiError).kind);
  }, 30_000);
});
