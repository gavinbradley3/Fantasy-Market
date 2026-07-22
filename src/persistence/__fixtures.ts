// Persistence test fixtures (Phase 6). Produces REAL Phase 5 RefreshResults from mocked
// provider responses (no network), so persistence tests exercise genuine artifacts:
// real envelopes, a real canonical snapshot, and real inference outputs.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildInputOptions } from '@/ingestion';
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
  type RefreshResult,
} from '@/transport';
import { AS_OF, EFFECTIVE, FETCHED_AT, SEASON, defaultRoutes, routingFetch, type RouteResponse } from '@/transport/__fixtures';

const CLOCK = fixedClock(FETCHED_AT);

export function transportDeps(routes: Record<string, RouteResponse> = defaultRoutes()): RefreshDeps {
  return {
    registry: buildDefaultRegistry(),
    config: defaultTransportConfig(),
    store: new MemoryPayloadStore(),
    client: new HttpClient({ fetchFn: routingFetch(routes), clock: CLOCK, random: zeroRandom, sleep: noSleep, retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 } }),
    clock: CLOCK,
  };
}

export function live(provider: RefreshRequest['provider'], capability: RefreshRequest['capability'], params?: Record<string, string>): RefreshRequest {
  return { provider, capability, mode: 'live', effectiveDate: EFFECTIVE, ...(params ? { params } : {}) };
}

export const ALL_LIVE: RefreshRequest[] = [
  live('nflverse', 'identity'),
  live('nflverse', 'roster', { season: SEASON }),
  live('nflverse', 'schedule', { season: SEASON }),
  live('nflverse', 'games', { season: SEASON }),
  live('nflverse', 'participation', { season: SEASON }),
  live('nflverse', 'officialStarts', { season: SEASON }),
  live('sleeper', 'identity'),
];

export interface MockedRefresh {
  readonly result: RefreshResult;
  readonly builds: BuildInputOptions[];
}

/** Run a full, successful multi-provider refresh with WR+QB inference. */
export async function mockedSuccessfulRefresh(sources: RefreshRequest[] = ALL_LIVE): Promise<MockedRefresh> {
  const first = await refreshSources({ sources }, transportDeps());
  const wr = first.snapshot!.players.find((p) => p.providerIds.gsis === '00-WR')!.canonicalId!;
  const qb = first.snapshot!.players.find((p) => p.providerIds.gsis === '00-QB')!.canonicalId!;
  const builds: BuildInputOptions[] = [
    { canonicalId: wr, position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' },
    { canonicalId: qb, position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0' },
  ];
  const result = await refreshSources({ sources, inference: builds }, transportDeps());
  return { result, builds };
}

/** A refresh where sleeper fails (partial). */
export async function mockedPartialRefresh(): Promise<MockedRefresh> {
  const routes = { ...defaultRoutes() };
  // Break the sleeper endpoint.
  const sleeperUrl = Object.keys(routes).find((u) => u.includes('players/nfl'))!;
  routes[sleeperUrl] = { status: 500, body: 'boom' } as RouteResponse;
  const first = await refreshSources({ sources: ALL_LIVE }, transportDeps());
  const wr = first.snapshot!.players.find((p) => p.providerIds.gsis === '00-WR')!.canonicalId!;
  const builds: BuildInputOptions[] = [{ canonicalId: wr, position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' }];
  const result = await refreshSources({ sources: ALL_LIVE, inference: builds, policy: { requiredProviders: ['nflverse'] } }, transportDeps(routes));
  return { result, builds };
}

/** A fully-failed refresh (every source 500s). */
export async function mockedFailedRefresh(): Promise<MockedRefresh> {
  const routes: Record<string, RouteResponse> = {};
  for (const url of Object.keys(defaultRoutes())) routes[url] = { status: 500, body: 'down' };
  const result = await refreshSources({ sources: ALL_LIVE, policy: { requiredProviders: ['nflverse', 'sleeper'] } }, transportDeps(routes));
  return { result, builds: [] };
}

export function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'pt-persist-')), 'playerticker.db');
}

export { AS_OF, EFFECTIVE, SEASON, FETCHED_AT };
