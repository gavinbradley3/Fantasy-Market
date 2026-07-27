// Phase 11 correction — an AUTHENTIC provider-backed player, published and served.
//
//   provider's own export → ingest → inference → readiness → frozen engine
//   → persistence → publication → GET /publication → frontend adapter
//
// The refresh result here is built from the committed nflverse exports (real GSIS ids, real
// names, the provider's own column vocabulary), not from a provider-shaped synthetic fixture.
// This file lives under src/api/ because boundary.test.ts forbids importing @/api anywhere
// else — the same rule the Phase 10 integration test follows.

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeApi } from './index';
import { PersistenceStore, persistRefreshResult } from '@/persistence';
import { tempDbPath } from '@/persistence/__fixtures';
import { ingest, buildNormalizedInferenceInput } from '@/ingestion';
import { nflverseAdapter } from '@/ingestion/adapters/nflverse';
import { runInference } from '@/inference/production/runInference';
import { adaptPublication } from '@/services/publication/adapter';
import type { RefreshPipeline } from '@/scheduler';
import type { ApiPublicationResponse } from '@/services/api';
import type { FreshnessMeta } from '@/ingestion';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readExport = (...p: string[]) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8')) as unknown[];

const AS_OF = '2025-02-01T00:00:00.000Z';
const EFFECTIVE = '2025-01-15T00:00:00.000Z';

const paths: string[] = [];
afterEach(() => { for (const p of paths.splice(0)) rmSync(dirname(p), { recursive: true, force: true }); });

function authenticSnapshot() {
  const freshness: FreshnessMeta = {
    provider: 'nflverse', fetchedAt: EFFECTIVE, effectiveDate: EFFECTIVE,
    lastUpdated: null, sourceVersion: 'nflverse-export',
  };
  return ingest([
    {
      adapter: nflverseAdapter,
      freshness,
      payloads: {
        identity: readExport('fixtures', 'pipeline', 'raw', 'nflverse.players.sample.json'),
        games: readExport('fixtures', 'pipeline', 'stats', 'raw', 'nflverse.player_stats.sample.json'),
      },
    },
  ]).snapshot;
}

/**
 * A refresh result carrying the real inference outputs for the authentic export. The shape
 * mirrors what the transport layer hands persistence; the CONTENT is produced by the real
 * ingestion → inference path above.
 */
function authenticRefresh() {
  const snapshot = authenticSnapshot();
  const targets: { gsis: string; position: 'QB' | 'WR' | 'RB' | 'TE' }[] = [
    { gsis: '00-0034857', position: 'QB' },  // Josh Allen
    { gsis: '00-0036900', position: 'WR' },  // Ja'Marr Chase
  ];
  const builds = [];
  const inference = [];
  for (const t of targets) {
    const player = snapshot.players.find((p) => p.providerIds.gsis === t.gsis);
    if (!player?.canonicalId) continue;
    const input = buildNormalizedInferenceInput(snapshot, {
      canonicalId: player.canonicalId, position: t.position, asOf: AS_OF,
      engineVersion: `${t.position.toLowerCase()}-mvp-1.0`,
    });
    if (!input) continue;
    builds.push({ canonicalId: player.canonicalId, position: t.position, asOf: AS_OF, engineVersion: `${t.position.toLowerCase()}-mvp-1.0` });
    inference.push({ canonicalId: player.canonicalId, position: t.position, ok: true, result: runInference(input) });
  }
  return { snapshot, builds, inference };
}

describe('an authentic provider-backed player is published and served', () => {
  it('reaches GET /publication with a real engine value, and survives close/reopen', async () => {
    const { snapshot, builds, inference } = authenticRefresh();
    // At least one authentic player crossed the frontier in the first place.
    const valuedInference = inference.filter((i) => i.result.engineOutput !== null);
    expect(valuedInference.length).toBeGreaterThan(0);

    const result = {
      status: 'success' as const,
      snapshot,
      sources: [],
      inference,
      summary: { total: 0, successes: 0, failures: 0, requiredFailures: [] },
    };

    const dbPath = tempDbPath();
    paths.push(dbPath);
    let store!: PersistenceStore;
    const pipeline: RefreshPipeline = {
      async refresh() { return result; },
      async persist(ctx) {
        const o = persistRefreshResult(store, {
          result: result as never, inferenceBuilds: builds as never, runId: ctx.runId,
          startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:05.000Z',
        });
        return { status: o.status, publishable: o.publishable, snapshotId: o.snapshotId };
      },
      async publish(ctx) {
        const p = store.publishBoard({ runId: ctx.runId });
        return { publicationId: p.publicationId, entryCount: p.entryCount };
      },
    };

    const composed = composeApi({
      dbPath, pipeline,
      transport: { requiredProviders: ['nflverse'], replayEnabled: true },
      dbNow: () => '2026-01-01T00:00:10.000Z',
    });
    store = composed.store;

    let first: unknown;
    try {
      const ack = await composed.api.handle({ method: 'POST', path: '/refresh', query: {} });
      expect((ack.body as { published: boolean }).published).toBe(true);

      const res = await composed.api.handle({ method: 'GET', path: '/publication', query: {} });
      expect(res.status).toBe(200);
      first = res.body;
      const body = res.body as ApiPublicationResponse;

      // A REAL player, named by the provider, carrying a real engine value.
      const josh = body.entries.find((e) => (e.name ?? '').includes('josh allen'));
      expect(josh).toBeDefined();
      expect(josh!.position).toBe('QB');
      expect(josh!.team).toBe('BUF');
      expect(josh!.readiness).toBe('READY');
      expect(josh!.engineInvoked).toBe(true);
      expect(josh!.composites).not.toBeNull();
      expect(Number.isFinite(josh!.composites!.weekly as number)).toBe(true);
      expect(josh!.confidenceScore).not.toBeNull();
      // Honest about its evidence.
      expect(josh!.publicConfidenceLabel).toBe('LOW');
      expect(josh!.honestyState).not.toBe('COMPLETE');

      // The frontend contract consumes it with no production change.
      const market = adaptPublication(body);
      expect(market.rejected).toEqual([]);
      const ranked = market.players.filter((p) => p.value !== null);
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].overallRank).toBe(1);
      // Unvalued entries stay unranked and null — never zero.
      for (const p of market.players.filter((x) => x.value === null)) {
        expect(p.overallRank).toBeNull();
        expect(p.composites).toBeNull();
      }
    } finally {
      composed.close();
    }

    // Close, reopen from disk, request again → byte-identical.
    const reopened = composeApi({
      dbPath,
      pipeline: {
        async refresh() { return {}; },
        async persist() { return { status: 'success', publishable: false, snapshotId: null }; },
        async publish() { return { publicationId: 'x', entryCount: 0 }; },
      },
      transport: { requiredProviders: ['nflverse'], replayEnabled: true },
    });
    try {
      const again = await reopened.api.handle({ method: 'GET', path: '/publication', query: {} });
      expect(JSON.stringify(again.body)).toBe(JSON.stringify(first));
    } finally {
      reopened.close();
    }
  }, 60_000);
});
