// M1 correction tests (Phase 5): refreshSources() must reject duplicate logical request
// coordinates (provider + capability + normalized params → requestKey) fail-fast, BEFORE
// any network call, replay read, ingestion, inference, or cache write — deterministically
// and independent of input order. Mocked transport only; no real external calls.

import { describe, expect, it, vi } from 'vitest';
import { fixedClock, noSleep, zeroRandom } from './clock';
import { HttpClient, type FetchFn } from './client';
import { buildDefaultRegistry, defaultTransportConfig } from './defaultRegistry';
import { MemoryPayloadStore } from './memoryStore';
import { DEFAULT_RETRY_POLICY } from './retry';
import { refreshSources, type RefreshDeps } from './refresh';
import { TransportError } from './errors';
import type { RawPayloadStore } from './store';
import type { RefreshRequest } from './types';
import { EFFECTIVE, FETCHED_AT, NFLVERSE, SEASON, defaultRoutes, json, nflverseGamesRows, routingFetch, type RouteResponse } from './__fixtures';

const CLOCK = fixedClock(FETCHED_AT);

/** Deps whose fetch and store throw if touched — proving zero transport side effects. */
function tripwireDeps() {
  const fetchFn = vi.fn(() => {
    throw new Error('TRIPWIRE: network called');
  });
  const store = {
    put: vi.fn(() => Promise.reject(new Error('TRIPWIRE: store.put called'))),
    getByChecksum: vi.fn(() => Promise.reject(new Error('TRIPWIRE: store.getByChecksum called'))),
    getLatest: vi.fn(() => Promise.reject(new Error('TRIPWIRE: store.getLatest called'))),
  };
  const deps: RefreshDeps = {
    registry: buildDefaultRegistry(),
    config: defaultTransportConfig(),
    store: store as unknown as RawPayloadStore,
    client: new HttpClient({ fetchFn: fetchFn as unknown as FetchFn, clock: CLOCK, random: zeroRandom, sleep: noSleep, retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 } }),
    clock: CLOCK,
  };
  return { deps, fetchFn, store };
}

function liveDeps(extraRoutes: Record<string, RouteResponse> = {}): RefreshDeps {
  return {
    registry: buildDefaultRegistry(),
    config: defaultTransportConfig(),
    store: new MemoryPayloadStore(),
    client: new HttpClient({ fetchFn: routingFetch({ ...defaultRoutes(), ...extraRoutes }), clock: CLOCK, random: zeroRandom, sleep: noSleep, retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 1, baseDelayMs: 0 } }),
    clock: CLOCK,
  };
}

function req(provider: RefreshRequest['provider'], capability: RefreshRequest['capability'], params?: Record<string, string>, mode: RefreshRequest['mode'] = 'live'): RefreshRequest {
  return { provider, capability, mode, effectiveDate: EFFECTIVE, ...(params ? { params } : {}) };
}

async function expectDuplicateError(sources: RefreshRequest[], deps: RefreshDeps): Promise<TransportError> {
  try {
    await refreshSources({ sources }, deps);
    throw new Error('expected DUPLICATE_REFRESH_REQUEST to be thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(TransportError);
    const te = err as TransportError;
    expect(te.code).toBe('DUPLICATE_REFRESH_REQUEST');
    expect(te.retryable).toBe(false);
    expect(te.stage).toBe('config');
    return te;
  }
}

describe('M1 — exact duplicate rejection with zero side effects', () => {
  it('rejects two identical games requests before any transport work', async () => {
    const { deps, fetchFn, store } = tripwireDeps();
    await expectDuplicateError([req('nflverse', 'games', { season: SEASON }), req('nflverse', 'games', { season: SEASON })], deps);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
    expect(store.getByChecksum).not.toHaveBeenCalled();
    expect(store.getLatest).not.toHaveBeenCalled();
  });

  it('the thrown error names the duplicated coordinate and leaks no secrets', async () => {
    const { deps } = tripwireDeps();
    const te = await expectDuplicateError([req('nflverse', 'games', { season: SEASON }), req('nflverse', 'games', { season: SEASON })], deps);
    expect(te.requestKey).toBe('nflverse:games?season=2025');
    expect(te.provider).toBe('nflverse');
    expect(te.capability).toBe('games');
    expect(`${te.message} ${te.detail ?? ''}`).not.toMatch(/authorization|token|apikey|api_key|password|secret/i);
  });
});

describe('M1 — logical identity includes provider, capability, and normalized params', () => {
  it('param key ORDER does not create a false distinction (same coordinate collides)', async () => {
    const { deps } = tripwireDeps();
    // Both normalize to the same requestKey (computeRequestKey sorts param keys).
    await expectDuplicateError(
      [req('nflverse', 'games', { season: SEASON, week: '4' }), req('nflverse', 'games', { week: '4', season: SEASON })],
      deps,
    );
  });

  it('distinct seasons are NOT rejected', async () => {
    // Provide a distinct 2024 stats route so both seasons are genuinely fetchable.
    const season2024 = { [`${NFLVERSE}/stats/player_stats_2024.json`]: json(nflverseGamesRows) };
    const result = await refreshSources(
      { sources: [req('nflverse', 'identity'), req('nflverse', 'games', { season: '2024' }), req('nflverse', 'games', { season: '2025' })] },
      liveDeps(season2024),
    );
    expect(result.status).toBe('success');
    // Two distinct game sources were accepted (distinct requestKeys).
    expect(result.sources.filter((s) => s.capability === 'games').map((s) => s.requestKey).sort()).toEqual([
      'nflverse:games?season=2024',
      'nflverse:games?season=2025',
    ]);
  });

  it('same capability across different providers is NOT rejected', async () => {
    // nflverse:identity and sleeper:identity are distinct logical coordinates.
    const result = await refreshSources(
      { sources: [req('nflverse', 'identity'), req('sleeper', 'identity')] },
      liveDeps(),
    );
    expect(result.status).toBe('success');
  });
});

describe('M1 — mode does not separate logical sources', () => {
  it('a live and a replay request for the same coordinate collide before either executes', async () => {
    const { deps, fetchFn, store } = tripwireDeps();
    await expectDuplicateError(
      [req('nflverse', 'games', { season: SEASON }, 'live'), req('nflverse', 'games', { season: SEASON }, 'replay')],
      deps,
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store.getLatest).not.toHaveBeenCalled();
  });
});

describe('M1 — input-order invariance and multiple duplicate groups', () => {
  it('[A, B, dup-A] and [dup-A, B, A] produce the same duplicate set', async () => {
    const { deps } = tripwireDeps();
    const A = req('nflverse', 'games', { season: SEASON });
    const B = req('sleeper', 'identity');
    const e1 = await expectDuplicateError([A, B, { ...A }], deps);
    const e2 = await expectDuplicateError([{ ...A }, B, A], deps);
    expect(e1.requestKey).toBe(e2.requestKey);
    expect(e1.detail).toBe(e2.detail);
  });

  it('reports multiple duplicated coordinates in canonical sorted order', async () => {
    const { deps } = tripwireDeps();
    // A=nflverse:games?season=2025 (x2), C=nflverse:identity (x2), B=sleeper:identity (x1)
    const A = req('nflverse', 'games', { season: SEASON });
    const B = req('sleeper', 'identity');
    const C = req('nflverse', 'identity');
    const te = await expectDuplicateError([A, { ...A }, B, C, { ...C }], deps);
    // Canonical sorted order: nflverse:games?season=2025 < nflverse:identity
    expect(te.detail).toBe('nflverse:games?season=2025, nflverse:identity');
  });
});

describe('M1 — original 4→8 corruption regression', () => {
  it('a single games request yields 4 WR games; a duplicated request is rejected, never 8', async () => {
    const single = await refreshSources(
      { sources: [req('nflverse', 'identity'), req('nflverse', 'games', { season: SEASON })] },
      liveDeps(),
    );
    const wr = single.snapshot!.players.find((p) => p.providerIds.gsis === '00-WR')!.canonicalId;
    const singleGames = single.snapshot!.games.filter((g) => g.canonicalId === wr).length;
    expect(singleGames).toBe(4);

    // The previously-corrupting input is now rejected before ingestion (no 8-game snapshot).
    await expectDuplicateError(
      [req('nflverse', 'identity'), req('nflverse', 'games', { season: SEASON }), req('nflverse', 'games', { season: SEASON })],
      liveDeps(),
    );
  });
});

describe('M1 — existing distinct-request behavior preserved', () => {
  it('a full distinct multi-provider refresh still succeeds', async () => {
    const result = await refreshSources(
      {
        sources: [
          req('nflverse', 'identity'),
          req('nflverse', 'roster', { season: SEASON }),
          req('nflverse', 'schedule', { season: SEASON }),
          req('nflverse', 'games', { season: SEASON }),
          req('nflverse', 'participation', { season: SEASON }),
          req('nflverse', 'officialStarts', { season: SEASON }),
          req('sleeper', 'identity'),
        ],
      },
      liveDeps(),
    );
    expect(result.status).toBe('success');
    expect(result.summary.failures).toBe(0);
  });
});
