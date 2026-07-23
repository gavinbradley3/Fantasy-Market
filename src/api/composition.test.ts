// Composition root + integration tests (Phase 9). Wires the REAL Scheduler + REAL
// PersistenceStore + ApplicationService through composeApi, drives endpoints end-to-end, and
// exercises the node:http adapter over a real socket. No mocks below the API here.

import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AddressInfo } from 'node:net';
import { composeApi, createHttpServer } from './index';
import { persistRefreshResult, PersistenceStore } from '@/persistence';
import { mockedSuccessfulRefresh, tempDbPath } from '@/persistence/__fixtures';
import type { RefreshPipeline } from '@/scheduler';
import type { TransportConfigDescriptor } from '@/application';

const transport: TransportConfigDescriptor = { requiredProviders: ['nflverse'], replayEnabled: true };
const paths: string[] = [];
afterEach(() => { for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true }); });

function trivialPipeline(): RefreshPipeline {
  return {
    async refresh() { return {}; },
    async persist() { return { status: 'success', publishable: false, snapshotId: null }; },
    async publish() { return { publicationId: 'x', entryCount: 0 }; },
  };
}

describe('composeApi wires the real stack with zero adapters', () => {
  it('exposes read endpoints backed by the real scheduler/persistence', async () => {
    const dbPath = tempDbPath(); paths.push(dbPath);
    const composed = composeApi({ dbPath, pipeline: trivialPipeline(), transport, nowIso: () => 'T', dbNow: () => 'T' });
    try {
      const health = await composed.api.handle({ method: 'GET', path: '/health', query: {} });
      expect(health.status).toBe(200);
      expect((health.body as { persistence: { available: boolean } }).persistence.available).toBe(true);

      const sched = await composed.api.handle({ method: 'GET', path: '/scheduler', query: {} });
      expect(sched.status).toBe(200);
      expect((sched.body as { enabled: boolean }).enabled).toBe(true);

      // Nothing published yet → 404.
      expect((await composed.api.handle({ method: 'GET', path: '/publication', query: {} })).status).toBe(404);

      // POST /refresh drives the real scheduler; trivial pipeline persists but does not publish.
      const refresh = await composed.api.handle({ method: 'POST', path: '/refresh', query: {} });
      expect(refresh.status).toBe(200);
      expect((refresh.body as { accepted: boolean; published: boolean }).accepted).toBe(true);
      expect((refresh.body as { published: boolean }).published).toBe(false);
    } finally {
      composed.close();
    }
  });

  it('full publish flow: POST /refresh → GET /publication → GET /history/:runId', async () => {
    const { result, builds } = await mockedSuccessfulRefresh();
    const dbPath = tempDbPath(); paths.push(dbPath);
    const META = { startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z' };
    let store!: PersistenceStore;
    let capturedRunId = '';
    const pipeline: RefreshPipeline = {
      async refresh() { return result; },
      async persist(ctx) {
        capturedRunId = ctx.runId;
        const o = persistRefreshResult(store, { result, inferenceBuilds: builds, runId: ctx.runId, ...META });
        return { status: o.status, publishable: o.publishable, snapshotId: o.snapshotId };
      },
      async publish(ctx) { const p = store.publishBoard({ runId: ctx.runId }); return { publicationId: p.publicationId, entryCount: p.entryCount }; },
    };
    const composed = composeApi({ dbPath, pipeline, transport, dbNow: () => '2026-01-01T00:00:10.000Z' });
    store = composed.store;
    try {
      const refresh = await composed.api.handle({ method: 'POST', path: '/refresh', query: {} });
      expect((refresh.body as { published: boolean; publicationId: string }).published).toBe(true);
      const publicationId = (refresh.body as { publicationId: string }).publicationId;

      const pub = await composed.api.handle({ method: 'GET', path: '/publication', query: {} });
      expect(pub.status).toBe(200);
      const pubBody = pub.body as { publication: { publicationId: string }; entries: unknown[] };
      expect(pubBody.publication.publicationId).toBe(publicationId);
      expect(pubBody.entries.length).toBe(builds.length);

      const byId = await composed.api.handle({ method: 'GET', path: `/publication/${publicationId}`, query: {} });
      expect(byId.status).toBe(200);

      const run = await composed.api.handle({ method: 'GET', path: `/history/${capturedRunId}`, query: {} });
      expect(run.status).toBe(200);
      expect((run.body as { runId: string; status: string }).status).toBe('success');
    } finally {
      composed.close();
    }
  });
});

describe('node:http adapter serves the composed app over a real socket', () => {
  it('answers GET /health and POST /refresh with JSON', async () => {
    const dbPath = tempDbPath(); paths.push(dbPath);
    const composed = composeApi({ dbPath, pipeline: trivialPipeline(), transport, dbNow: () => 'T' });
    const server = createHttpServer(composed.api);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const h = await fetch(`http://127.0.0.1:${port}/health`);
      expect(h.status).toBe(200);
      expect(h.headers.get('content-type')).toContain('application/json');
      expect((await h.json() as { status: string }).status).toBe('ok');

      const p = await fetch(`http://127.0.0.1:${port}/refresh`, { method: 'POST' });
      expect(p.status).toBe(200);
      expect((await p.json() as { accepted: boolean }).accepted).toBe(true);

      const nf = await fetch(`http://127.0.0.1:${port}/nope`);
      expect(nf.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      composed.close();
    }
  });
});
