// Release-backed ingestion through the transport, against a mocked provider.
//
// These cover the properties the live path depends on but a unit test of any single piece
// cannot show: that discovery happens through the same client, that the provider's own
// version reaches Phase 4 freshness AND survives replay, that one payload can feed two
// capabilities, and that a provider is never asked for data it does not publish.

import { describe, expect, it } from 'vitest';
import { fixedClock, noSleep, zeroRandom } from './clock';
import { HttpClient } from './client';
import { buildDefaultRegistry, defaultTransportConfig } from './defaultRegistry';
import { MemoryPayloadStore } from './memoryStore';
import { DEFAULT_RETRY_POLICY } from './retry';
import { refreshSources, type RefreshDeps } from './refresh';
import { TransportError } from './errors';
import type { RefreshRequest } from './types';
import {
  EFFECTIVE, FETCHED_AT, RELEASE_STAMP, RELEASE_STAMP_ISO, SEASON,
  defaultRoutes, manifest, nflverseManifestUrl, routingFetch, type RouteResponse,
} from './__fixtures';

const CLOCK = fixedClock(FETCHED_AT);

function deps(routes: Record<string, RouteResponse>, calls?: string[]): RefreshDeps {
  return {
    registry: buildDefaultRegistry(),
    config: defaultTransportConfig(),
    store: new MemoryPayloadStore(),
    client: new HttpClient({
      fetchFn: routingFetch(routes, calls),
      clock: CLOCK, random: zeroRandom, sleep: noSleep,
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
    }),
    clock: CLOCK,
  };
}

const live = (capability: RefreshRequest['capability'], params?: Record<string, string>): RefreshRequest => ({
  provider: 'nflverse', capability, mode: 'live', effectiveDate: EFFECTIVE, ...(params ? { params } : {}),
});

describe('release discovery', () => {
  it('reads the release manifest before fetching the asset, through the same client', () => {
    const calls: string[] = [];
    return refreshSources({ sources: [live('identity')] }, deps(defaultRoutes(), calls)).then((result) => {
      expect(result.status).toBe('success');
      expect(calls[0]).toBe(nflverseManifestUrl('identity'));
      expect(calls[1]).toContain('/players/players.csv');
    });
  });

  it("records the provider's own version on the envelope and in Phase 4 freshness", async () => {
    const result = await refreshSources({ sources: [live('games', { season: SEASON })] }, deps(defaultRoutes()));
    const source = result.sources[0];
    expect(source.envelope?.sourceVersion).toBe(RELEASE_STAMP);
    expect(source.envelope?.sourceLastUpdated).toBe(RELEASE_STAMP_ISO);
    // What the confidence model actually reads.
    expect(source.freshness?.sourceVersion).toBe(RELEASE_STAMP);
    expect(source.freshness?.lastUpdated).toBe(RELEASE_STAMP_ISO);
  });

  it('replays the captured version with no network access', async () => {
    const store = new MemoryPayloadStore();
    await refreshSources({ sources: [live('games', { season: SEASON })] }, { ...deps(defaultRoutes()), store });

    const offline = {
      ...deps({}),
      store,
      client: new HttpClient({
        fetchFn: () => { throw new Error('network must not be used during replay'); },
        clock: CLOCK, random: zeroRandom, sleep: noSleep,
      }),
    };
    const replayed = await refreshSources(
      { sources: [{ ...live('games', { season: SEASON }), mode: 'replay' }] },
      offline,
    );
    expect(replayed.status).toBe('success');
    // A replay reports the version it was CAPTURED at — it does not re-discover one.
    expect(replayed.sources[0].freshness?.sourceVersion).toBe(RELEASE_STAMP);
    expect(replayed.sources[0].freshness?.lastUpdated).toBe(RELEASE_STAMP_ISO);
  });

  it('still ingests when the manifest carries no readable version', async () => {
    // The release exists and its asset is fetchable; it simply reports no version.
    const routes = { ...defaultRoutes(), [nflverseManifestUrl('identity')]: manifest('build 42') };
    const result = await refreshSources({ sources: [live('identity')] }, deps(routes));
    expect(result.status).toBe('success');
    expect(result.sources[0].freshness?.sourceVersion).toBe('build 42');
    expect(result.sources[0].freshness?.lastUpdated).toBeNull();
  });

  it('fails the source when discovery itself fails, without fetching the asset', async () => {
    const calls: string[] = [];
    const routes = { ...defaultRoutes(), [nflverseManifestUrl('identity')]: { status: 500, body: 'boom' } as RouteResponse };
    const result = await refreshSources({ sources: [live('identity')] }, deps(routes, calls));
    expect(result.sources[0].outcome).toBe('failed');
    expect(calls.some((u) => u.includes('players.csv'))).toBe(false);
  });
});

describe('capability registration reflects what the provider publishes', () => {
  it('rejects a season-scoped request with no season instead of guessing one', () => {
    // Silently defaulting would fetch a different year than the caller asked for.
    return refreshSources({ sources: [live('games')] }, deps(defaultRoutes())).then((result) => {
      expect(result.sources[0].outcome).toBe('failed');
      expect(result.sources[0].error?.code).toBe('INVALID_CONFIG');
    });
  });

  it('answers a capability nflverse does not publish with an explicit typed error', () => {
    const registry = buildDefaultRegistry();
    expect(() => registry.lookup('nflverse', 'injuries')).toThrow(TransportError);
    try {
      registry.lookup('nflverse', 'injuries');
    } catch (err) {
      expect((err as TransportError).code).toBe('UNSUPPORTED_CAPABILITY');
    }
  });

  it('registers officialStarts nowhere, yet delivers it from the schedule payload', async () => {
    const registry = buildDefaultRegistry();
    expect(registry.has('nflverse', 'officialStarts')).toBe(false);

    const calls: string[] = [];
    const result = await refreshSources({ sources: [live('identity'), live('schedule')] }, deps(defaultRoutes(), calls));
    // One asset fetch, two record types.
    expect(calls.filter((u) => u.includes('games.csv'))).toHaveLength(1);
    expect(result.snapshot!.schedule.length).toBeGreaterThan(0);
    expect(result.snapshot!.officialStarts.length).toBeGreaterThan(0);
    expect(result.snapshot!.officialStarts.every((o) => o.started)).toBe(true);
  });
});

describe('CSV releases reach the Phase 4 boundary intact', () => {
  it('normalizes the release vocabulary and keeps an absent column null', async () => {
    const result = await refreshSources(
      { sources: [live('identity'), live('games', { season: SEASON }), live('participation', { season: SEASON })] },
      deps(defaultRoutes()),
    );
    expect(result.status).toBe('success');

    const wr = result.snapshot!.games.filter((g) => g.targets !== null);
    expect(wr.length).toBeGreaterThan(0);
    // The WR rows supply no passing columns; they must be null, never 0.
    expect(wr[0].passingYards).toBeNull();
    expect(wr[0].completions).toBeNull();
    expect(wr[0].targets).toBe(8);
  });

  it('folds play-level participation into per player per game counts', async () => {
    const result = await refreshSources(
      { sources: [live('identity'), live('participation', { season: SEASON })] },
      deps(defaultRoutes()),
    );
    const records = result.snapshot!.participation;
    expect(records.length).toBeGreaterThan(0);
    // Each fixture game has 5 dropbacks and one run play; only the dropbacks count, and
    // both sides of the ratio use that same rule.
    for (const r of records) {
      expect(r.passPlaySnaps).toBe(5);
      expect(r.teamDropbacks).toBe(5);
      expect(r.covered).toBe(false); // 2025 is past the charted era
    }
  });
});
