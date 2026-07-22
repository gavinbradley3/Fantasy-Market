// Refresh orchestration tests (Phase 5): replay determinism, provider-order invariance,
// cache revalidation (ETag / Last-Modified / 304), and provider-level failure isolation.
// Mocked transport only — no real external calls.

import { describe, expect, it } from 'vitest';
import { fixedClock, noSleep, zeroRandom } from './clock';
import { HttpClient } from './client';
import { buildDefaultRegistry, defaultTransportConfig } from './defaultRegistry';
import { MemoryPayloadStore } from './memoryStore';
import { ProviderRegistry, type TransportConfig } from './registry';
import { DEFAULT_RETRY_POLICY } from './retry';
import { refreshSources, type RefreshDeps } from './refresh';
import type { RawPayloadStore } from './store';
import type { BuildInputOptions } from '@/ingestion';
import type { RefreshRequest } from './types';
import { AS_OF, EFFECTIVE, FETCHED_AT, SEASON, URLS, defaultRoutes, json, routingFetch, type RouteResponse } from './__fixtures';

const CLOCK = fixedClock(FETCHED_AT);

function deps(routes: Record<string, RouteResponse>, opts: { store?: RawPayloadStore; registry?: ProviderRegistry; config?: TransportConfig; calls?: string[] } = {}): RefreshDeps {
  return {
    registry: opts.registry ?? buildDefaultRegistry(),
    config: opts.config ?? defaultTransportConfig(),
    store: opts.store ?? new MemoryPayloadStore(),
    client: new HttpClient({ fetchFn: routingFetch(routes, opts.calls), clock: CLOCK, random: zeroRandom, sleep: noSleep, retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 2, baseDelayMs: 0 } }),
    clock: CLOCK,
  };
}

function live(provider: RefreshRequest['provider'], capability: RefreshRequest['capability'], params?: Record<string, string>): RefreshRequest {
  return { provider, capability, mode: 'live', effectiveDate: EFFECTIVE, ...(params ? { params } : {}) };
}
function replay(provider: RefreshRequest['provider'], capability: RefreshRequest['capability'], params?: Record<string, string>): RefreshRequest {
  return { provider, capability, mode: 'replay', effectiveDate: EFFECTIVE, ...(params ? { params } : {}) };
}

const NFL_LIVE: RefreshRequest[] = [
  live('nflverse', 'identity'),
  live('nflverse', 'roster', { season: SEASON }),
  live('nflverse', 'schedule', { season: SEASON }),
  live('nflverse', 'games', { season: SEASON }),
  live('nflverse', 'participation', { season: SEASON }),
  live('nflverse', 'officialStarts', { season: SEASON }),
];
const ALL_LIVE: RefreshRequest[] = [...NFL_LIVE, live('sleeper', 'identity')];
const ALL_REPLAY: RefreshRequest[] = ALL_LIVE.map((r) => ({ ...r, mode: 'replay' as const }));

function gsisId(snapshot: NonNullable<Awaited<ReturnType<typeof refreshSources>>['snapshot']>, gsis: string): string {
  return snapshot.players.find((p) => p.providerIds.gsis === gsis)!.canonicalId!;
}

const throwOnFetch = () => {
  throw new Error('network must not be called during replay');
};

describe('refresh — live → snapshot → inference', () => {
  it('delivers raw payloads into the Phase 4 ingest boundary and runs inference', async () => {
    const result = await refreshSources({ sources: ALL_LIVE }, deps(defaultRoutes()));
    expect(result.status).toBe('success');
    expect(result.snapshot).not.toBeNull();
    const wr = gsisId(result.snapshot!, '00-WR');
    const qb = gsisId(result.snapshot!, '00-QB');

    const inf = await refreshSources(
      { sources: ALL_LIVE, inference: [
        { canonicalId: wr, position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' },
        { canonicalId: qb, position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0' },
      ] },
      deps(defaultRoutes()),
    );
    expect(inf.inference.map((i) => i.ok)).toEqual([true, true]);
    expect(inf.inference[0].result?.position).toBe('WR');
    expect(inf.inference[1].result?.position).toBe('QB');
    // Official starts flowed through to D2.
    expect(inf.inference[1].result?.d2Diagnostics?.startsOfficial).toBe(true);
  });
});

describe('refresh — replay determinism (no network)', () => {
  it('a replay of stored envelopes reproduces the exact snapshot & inference', async () => {
    const store = new MemoryPayloadStore();
    // 1. live fetch populates the store.
    const liveA = await refreshSources({ sources: ALL_LIVE }, deps(defaultRoutes(), { store }));
    const wr = gsisId(liveA.snapshot!, '00-WR');
    const qb = gsisId(liveA.snapshot!, '00-QB');
    const builds: BuildInputOptions[] = [
      { canonicalId: wr, position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' },
      { canonicalId: qb, position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0' },
    ];

    // 2. live with inference (same store, idempotent).
    const liveB = await refreshSources({ sources: ALL_LIVE, inference: builds }, deps(defaultRoutes(), { store }));
    // 3. replay with inference — the fetch fn throws if touched.
    const rep = await refreshSources({ sources: ALL_REPLAY, inference: builds }, deps({}, { store }));
    // prove no network: overwrite client with a throwing fetch and re-run replay.
    const repNoNet = await refreshSources(
      { sources: ALL_REPLAY, inference: builds },
      { ...deps({}, { store }), client: new HttpClient({ fetchFn: throwOnFetch, clock: CLOCK, random: zeroRandom, sleep: noSleep }) },
    );

    expect(rep.summary.replays).toBe(ALL_LIVE.length);
    expect(repNoNet.status).toBe('success');
    // Same snapshot id and same inference checksums across live and both replays.
    expect(liveB.snapshot!.snapshotId).toBe(rep.snapshot!.snapshotId);
    expect(liveB.snapshot!.snapshotId).toBe(repNoNet.snapshot!.snapshotId);
    for (const key of ['wr', 'qb'] as const) {
      const i = key === 'wr' ? 0 : 1;
      expect(rep.inference[i].result?.normalizedInputChecksum).toBe(liveB.inference[i].result?.normalizedInputChecksum);
      expect(rep.inference[i].result?.outputChecksum).toBe(liveB.inference[i].result?.outputChecksum);
      expect(rep.inference[i].result?.serialized).toBe(liveB.inference[i].result?.serialized);
    }
    // Replay reuses the SAME payload checksums.
    expect(rep.summary.payloadChecksums).toEqual(liveB.summary.payloadChecksums);
  });
});

describe('refresh — provider/completion-order invariance', () => {
  it('reversed order + shuffled completion + varied latency → identical snapshot & summary', async () => {
    const forward = await refreshSources({ sources: ALL_LIVE }, deps(defaultRoutes()));

    // Reverse the request order and give each route a different microtask latency so
    // completion order is shuffled relative to input order.
    const reversed = [...ALL_LIVE].reverse();
    const laggyRoutes = { ...defaultRoutes() };
    let t = 1;
    for (const url of Object.keys(laggyRoutes)) laggyRoutes[url] = { ...laggyRoutes[url], ticks: (t++ % 4) + 1 };
    const shuffled = await refreshSources({ sources: reversed }, deps(laggyRoutes));

    expect(shuffled.snapshot!.snapshotId).toBe(forward.snapshot!.snapshotId);
    expect(shuffled.summary.payloadChecksums).toEqual(forward.summary.payloadChecksums);
    // Source results are canonically ordered regardless of input/completion order.
    expect(shuffled.sources.map((s) => `${s.provider}:${s.capability}`)).toEqual(forward.sources.map((s) => `${s.provider}:${s.capability}`));
  });

  it('replaying one provider while live-fetching another yields the all-live snapshot', async () => {
    const store = new MemoryPayloadStore();
    // Seed the store with a live sleeper capture.
    await refreshSources({ sources: [live('sleeper', 'identity')] }, deps(defaultRoutes(), { store }));
    const allLive = await refreshSources({ sources: ALL_LIVE }, deps(defaultRoutes(), { store }));

    // nflverse live, sleeper replay (from the seed) — sleeper must not hit the network.
    const mixedRoutes = { ...defaultRoutes(), [URLS.sleeperIdentity]: { status: 500, body: 'should not be called' } as RouteResponse };
    const mixed = await refreshSources(
      { sources: [...NFL_LIVE, replay('sleeper', 'identity')] },
      deps(mixedRoutes, { store }),
    );
    expect(mixed.status).toBe('success');
    expect(mixed.snapshot!.snapshotId).toBe(allLive.snapshot!.snapshotId);
    expect(mixed.summary.replays).toBe(1);
    expect(mixed.summary.liveFetches).toBe(NFL_LIVE.length);
  });
});

describe('refresh — conditional revalidation', () => {
  it('reuses the cached payload on a 304 (ETag + Last-Modified) without re-downloading', async () => {
    const store = new MemoryPayloadStore();
    const routes = {
      [URLS.sleeperIdentity]: json(
        { 'S-WR': { player_id: 'S-WR', gsis_id: '00-WR', full_name: 'Test Receiver', position: 'WR' } },
        { headers: { 'content-type': 'application/json', etag: 'W/"v1"', 'last-modified': 'Tue, 30 Sep 2025 00:00:00 GMT' } },
      ),
    };
    // 1. first live fetch captures the payload + validators.
    const first = await refreshSources({ sources: [live('sleeper', 'identity')] }, deps(routes, { store }));
    expect(first.summary.liveFetches).toBe(1);

    // 2. conditional revalidation → server answers 304; the cached payload is reused.
    const notModified: Record<string, RouteResponse> = { [URLS.sleeperIdentity]: { status: 304, body: '' } };
    const second = await refreshSources(
      { sources: [{ ...live('sleeper', 'identity'), conditional: true }] },
      deps(notModified, { store }),
    );
    expect(second.summary.cacheRevalidations).toBe(1);
    expect(second.summary.payloadChecksums).toEqual(first.summary.payloadChecksums);
    expect(second.snapshot!.snapshotId).toBe(first.snapshot!.snapshotId);
  });

  it('fails explicitly when the server returns 304 but nothing is cached', async () => {
    const notModified: Record<string, RouteResponse> = { [URLS.sleeperIdentity]: { status: 304, body: '' } };
    const result = await refreshSources(
      { sources: [{ ...live('sleeper', 'identity'), conditional: true }] },
      deps(notModified),
    );
    expect(result.status).toBe('failure');
    expect(result.sources[0].outcome).toBe('failed');
    expect(result.sources[0].error?.code).toBe('INVALID_REVALIDATION');
  });
});

describe('refresh — failure isolation', () => {
  it('nflverse succeeds while sleeper fails; nflverse data stays usable', async () => {
    const routes = { ...defaultRoutes(), [URLS.sleeperIdentity]: { status: 500, body: 'boom' } as RouteResponse };
    const result = await refreshSources(
      { sources: ALL_LIVE, policy: { requiredProviders: ['nflverse'] } },
      deps(routes),
    );
    expect(result.status).toBe('partial');
    expect(result.summary.failures).toBe(1);
    // nflverse players are present in the snapshot despite the sleeper failure.
    expect(result.snapshot!.players.some((p) => p.providerIds.gsis === '00-WR')).toBe(true);
    const sleeper = result.sources.find((s) => s.provider === 'sleeper')!;
    expect(sleeper.outcome).toBe('failed');
    expect(sleeper.error?.stage).toBe('fetch');
    // The failed payload is not counted as a successful checksum.
    expect(result.summary.payloadChecksums.length).toBe(NFL_LIVE.length);
  });

  it('a required provider that wholly fails makes the refresh a complete failure', async () => {
    const routes = { ...defaultRoutes(), [URLS.sleeperIdentity]: { status: 500, body: 'boom' } as RouteResponse };
    const result = await refreshSources(
      { sources: [live('sleeper', 'identity')], policy: { requiredProviders: ['sleeper'] } },
      deps(routes),
    );
    expect(result.status).toBe('failure');
    expect(result.summary.requiredFailures).toEqual(['sleeper']);
  });

  it('a decode failure is classified at the decode stage, distinct from an HTTP failure', async () => {
    const routes = { ...defaultRoutes(), [URLS.sleeperIdentity]: { status: 200, body: 'not json at all', headers: { 'content-type': 'application/json' } } as RouteResponse };
    const result = await refreshSources({ sources: [live('sleeper', 'identity')] }, deps(routes));
    expect(result.sources[0].outcome).toBe('failed');
    expect(result.sources[0].error?.code).toBe('DECODE_FAILURE');
    expect(result.sources[0].error?.stage).toBe('decode');
  });

  it('a corrupt replay payload cannot reach ingestion', async () => {
    const store = new MemoryPayloadStore();
    await refreshSources({ sources: [live('sleeper', 'identity')] }, deps(defaultRoutes(), { store }));
    // Corrupt the stored envelope's payload in place.
    const key = 'sleeper:identity';
    const env = await store.getLatest('sleeper', 'identity', key);
    const corrupt = { ...env!, payload: env!.payload.replace('Test Receiver', 'Tampered') };
    // Overwrite by re-putting under a fresh store that returns the corrupt envelope.
    const badStore: RawPayloadStore = {
      put: () => Promise.resolve(),
      getByChecksum: () => Promise.resolve(corrupt),
      getLatest: () => Promise.resolve(corrupt),
    };
    const result = await refreshSources({ sources: [replay('sleeper', 'identity')] }, deps({}, { store: badStore }));
    expect(result.status).toBe('failure');
    expect(result.sources[0].error?.code).toBe('CHECKSUM_MISMATCH');
    expect(result.snapshot).toBeNull();
  });

  it('classifies an adapter throw as an ingestion warning, separate from a transport failure', async () => {
    // A registry whose adapter throws during normalization (transport itself succeeds).
    const registry = new ProviderRegistry();
    registry.register({
      provider: 'manual',
      capability: 'identity',
      buildRequest: () => ({ method: 'GET', url: 'https://example.test/manual.json', headers: {}, expectContentType: 'application/json' }),
      decode: () => [{ id: 'x' }],
      adapter: {
        provider: 'manual',
        capabilities: new Set(['identity']),
        normalizeIdentity: () => {
          throw new Error('adapter boom');
        },
      },
    });
    const config: TransportConfig = { manual: { baseUrl: 'https://example.test' } };
    const routes = { 'https://example.test/manual.json': json([{ id: 'x' }]) };
    const result = await refreshSources(
      { sources: [live('manual', 'identity')] },
      deps(routes, { registry, config }),
    );
    // Transport succeeded (live fetch), but the adapter failure surfaces as a diagnostic.
    expect(result.sources[0].outcome).toBe('liveFetch');
    expect(result.diagnostics!.warnings.some((w) => w.provider === 'manual' && /adapter threw/.test(w.detail))).toBe(true);
  });
});
