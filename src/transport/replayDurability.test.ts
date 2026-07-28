// Replay durability across an upstream change.
//
// nflverse rebuilds its releases continually: the stamp moves and the asset bytes change.
// A historical board must not move with it. These tests use the ON-DISK capture store, so
// they also prove the bytes are retained locally rather than re-fetched, and they drive the
// network through a client that THROWS if touched — a replay that silently re-downloaded
// would fail here rather than quietly pass.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixedClock, noSleep, zeroRandom } from './clock';
import { HttpClient } from './client';
import { buildDefaultRegistry, defaultTransportConfig } from './defaultRegistry';
import { FilePayloadStore } from './fileStore';
import { DEFAULT_RETRY_POLICY } from './retry';
import { refreshSources, type RefreshDeps } from './refresh';
import { loadReplayEnvelopeByChecksum } from './replay';
import type { RefreshRequest } from './types';
import {
  EFFECTIVE, FETCHED_AT, RELEASE_STAMP, SEASON,
  csv, defaultRoutes, manifest, nflverseAssetUrl, nflverseManifestUrl,
  nflverseGamesRows, nflverseIdentityRows, routingFetch, type RouteResponse,
} from './__fixtures';

const CLOCK = fixedClock(FETCHED_AT);
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function captureDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'pt-captures-'));
  dirs.push(d);
  return d;
}

const NETWORK_FORBIDDEN = () => {
  throw new Error('network must not be used during replay');
};

function deps(routes: Record<string, RouteResponse> | 'offline', store: FilePayloadStore, at = FETCHED_AT): RefreshDeps {
  const clock = fixedClock(at);
  return {
    registry: buildDefaultRegistry(),
    config: defaultTransportConfig(),
    store,
    client: new HttpClient({
      fetchFn: routes === 'offline' ? NETWORK_FORBIDDEN : routingFetch(routes),
      clock, random: zeroRandom, sleep: noSleep,
      retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 0 },
    }),
    clock,
  };
}

const SOURCES: RefreshRequest[] = [
  { provider: 'nflverse', capability: 'identity', mode: 'live', effectiveDate: EFFECTIVE },
  { provider: 'nflverse', capability: 'games', mode: 'live', effectiveDate: EFFECTIVE, params: { season: SEASON } },
];
const REPLAY = SOURCES.map((s) => ({ ...s, mode: 'replay' as const }));

/** The same releases, rebuilt upstream: a newer stamp AND changed asset bytes. */
function changedUpstream(): Record<string, RouteResponse> {
  const routes = { ...defaultRoutes() };
  for (const capability of ['identity', 'games'] as const) {
    routes[nflverseManifestUrl(capability)] = manifest('2026-01-01 04:00:00 EST');
  }
  routes[nflverseAssetUrl('identity')] = csv([
    ...nflverseIdentityRows,
    { gsis_id: '00-NEW', player_name: 'Late Signing', position: 'WR', team: 'CIN', age: 24, seasons: 1, draft_round: 3, status: 'ACTIVE' },
  ]);
  routes[nflverseAssetUrl('games')] = csv(
    nflverseGamesRows.map((r) => ('targets' in r ? { ...r, targets: 99 } : r)),
  );
  return routes;
}

describe('captures are retained locally as raw bytes', () => {
  it('writes one file per capture, carrying the payload and its checksum', async () => {
    const dir = captureDir();
    const result = await refreshSources({ sources: SOURCES }, deps(defaultRoutes(), new FilePayloadStore(dir)));
    expect(result.status).toBe('success');

    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(SOURCES.length);
    for (const f of files) {
      const env = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      expect(typeof env.payload).toBe('string');
      expect(env.payload.length).toBeGreaterThan(0);
      expect(env.payloadChecksum).toMatch(/^sha-/);
      expect(env.sourceVersion).toBe(RELEASE_STAMP);
    }
  });
});

describe('a changed upstream release cannot alter an existing replay', () => {
  it('replays the captured bytes, not the new ones, with the network unavailable', async () => {
    const dir = captureDir();
    const store = new FilePayloadStore(dir);

    const original = await refreshSources({ sources: SOURCES }, deps(defaultRoutes(), store));
    const originalSnapshot = original.snapshot!.snapshotId;
    const originalChecksums = original.summary.payloadChecksums;

    // Upstream moves on. The replay is offline, so it cannot observe the change even if it
    // tried — and it must not try.
    void changedUpstream();
    const replayed = await refreshSources({ sources: REPLAY }, deps('offline', new FilePayloadStore(dir)));

    expect(replayed.status).toBe('success');
    expect(replayed.snapshot!.snapshotId).toBe(originalSnapshot);
    expect(replayed.summary.payloadChecksums).toEqual(originalChecksums);
    expect(replayed.sources.every((s) => s.freshness?.sourceVersion === RELEASE_STAMP)).toBe(true);
    // The changed export added a player; the replay must not have him.
    expect(replayed.snapshot!.players.some((p) => p.providerIds.gsis === '00-NEW')).toBe(false);
  });

  it('performs no discovery request during replay', async () => {
    // Re-resolving the release would both hit the network and risk binding the capture to a
    // version it was not taken at.
    const dir = captureDir();
    await refreshSources({ sources: SOURCES }, deps(defaultRoutes(), new FilePayloadStore(dir)));

    const calls: string[] = [];
    const store = new FilePayloadStore(dir);
    const replayed = await refreshSources({ sources: REPLAY }, {
      ...deps('offline', store),
      client: new HttpClient({
        fetchFn: routingFetch(changedUpstream(), calls),
        clock: CLOCK, random: zeroRandom, sleep: noSleep,
      }),
    });
    expect(replayed.status).toBe('success');
    expect(calls).toEqual([]); // neither manifest nor asset was requested
  });

  it('keeps the original capture addressable after a later live fetch supersedes it', async () => {
    // Re-fetching does not overwrite history: the earlier bytes stay on disk under their own
    // checksum, so a board published from them can still be reproduced exactly.
    const dir = captureDir();
    const first = await refreshSources({ sources: SOURCES }, deps(defaultRoutes(), new FilePayloadStore(dir)));
    const firstChecksums = [...first.summary.payloadChecksums];

    const second = await refreshSources(
      { sources: SOURCES },
      deps(changedUpstream(), new FilePayloadStore(dir), '2026-01-02T00:00:00.000Z'),
    );
    expect(second.summary.payloadChecksums).not.toEqual(firstChecksums);

    // Both generations are retained; the original is still readable and still verifies.
    const store = new FilePayloadStore(dir);
    for (const checksum of firstChecksums) {
      const env = await loadReplayEnvelopeByChecksum(store, checksum);
      expect(env.payloadChecksum).toBe(checksum);
      expect(env.sourceVersion).toBe(RELEASE_STAMP);
    }
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(SOURCES.length * 2);
  });
});

describe('replay works from retained artifacts alone', () => {
  it('reproduces the run in a process that never saw the original fetch', async () => {
    const dir = captureDir();
    const original = await refreshSources({ sources: SOURCES }, deps(defaultRoutes(), new FilePayloadStore(dir)));

    // A brand-new store object over the same directory — nothing in memory carries over.
    const fresh = await refreshSources({ sources: REPLAY }, deps('offline', new FilePayloadStore(dir)));
    expect(fresh.snapshot!.snapshotId).toBe(original.snapshot!.snapshotId);
    expect(fresh.summary.replays).toBe(SOURCES.length);
  });
});
