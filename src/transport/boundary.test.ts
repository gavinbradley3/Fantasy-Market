// Branch & boundary regression tests (Phase 5). Proves the transport layer stays on the
// correct side of every architectural boundary: no raw HTTP/envelope fields reach the
// AIL, no transport module imports a valuation engine or the legacy pipeline
// normalization/identity/snapshot code, and the Phase 4 identity behaviour is preserved.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixedClock, noSleep, zeroRandom } from './clock';
import { HttpClient } from './client';
import { buildDefaultRegistry, defaultTransportConfig } from './defaultRegistry';
import { MemoryPayloadStore } from './memoryStore';
import { refreshSources, type RefreshDeps } from './refresh';
import { DEFAULT_RETRY_POLICY } from './retry';
import { AS_OF, EFFECTIVE, FETCHED_AT, SEASON, defaultRoutes, routingFetch } from './__fixtures';
import type { RefreshRequest } from './types';

const CLOCK = fixedClock(FETCHED_AT);
const TRANSPORT_DIR = dirname(fileURLToPath(import.meta.url));

function deps(): RefreshDeps {
  return {
    registry: buildDefaultRegistry(),
    config: defaultTransportConfig(),
    store: new MemoryPayloadStore(),
    client: new HttpClient({ fetchFn: routingFetch(defaultRoutes()), clock: CLOCK, random: zeroRandom, sleep: noSleep, retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: 1, baseDelayMs: 0 } }),
    clock: CLOCK,
  };
}

const ALL_LIVE: RefreshRequest[] = [
  { provider: 'nflverse', capability: 'identity', mode: 'live', effectiveDate: EFFECTIVE },
  { provider: 'nflverse', capability: 'roster', mode: 'live', effectiveDate: EFFECTIVE, params: { season: SEASON } },
  { provider: 'nflverse', capability: 'schedule', mode: 'live', effectiveDate: EFFECTIVE, params: { season: SEASON } },
  { provider: 'nflverse', capability: 'games', mode: 'live', effectiveDate: EFFECTIVE, params: { season: SEASON } },
  { provider: 'nflverse', capability: 'participation', mode: 'live', effectiveDate: EFFECTIVE, params: { season: SEASON } },
  { provider: 'nflverse', capability: 'officialStarts', mode: 'live', effectiveDate: EFFECTIVE, params: { season: SEASON } },
  { provider: 'sleeper', capability: 'identity', mode: 'live', effectiveDate: EFFECTIVE },
];

/** Recursively list every non-test .ts file under src/transport. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && entry.name !== '__fixtures.ts') {
      out.push(full);
    }
  }
  return out;
}

describe('boundary — no raw HTTP/envelope fields reach the AIL', () => {
  it('inference serialized output carries no transport/envelope or provider-id fields', async () => {
    const first = await refreshSources({ sources: ALL_LIVE }, deps());
    const wr = first.snapshot!.players.find((p) => p.providerIds.gsis === '00-WR')!.canonicalId!;
    const inf = await refreshSources(
      { sources: ALL_LIVE, inference: [{ canonicalId: wr, position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' }] },
      deps(),
    );
    const res = inf.inference[0].result!;
    const merged = JSON.stringify(res.mergedSupplement);
    for (const forbidden of ['payloadChecksum', 'httpStatus', 'etag', 'sourceUrl', 'if-none-match', 'contentType', 'payloadEncoding']) {
      expect(merged.includes(forbidden)).toBe(false);
    }
    // Provider id tokens never leak into the merged supplement (Phase 4 invariant).
    expect(merged.includes('gsis')).toBe(false);
    expect(merged.includes('sleeper')).toBe(false);
  });
});

describe('boundary — import hygiene', () => {
  const files = sourceFiles(TRANSPORT_DIR);

  it('finds transport source files to scan', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it('no transport module imports a valuation engine', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (/@\/(wr-model|rb-model|te-model|qb-model)\b/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('no transport module imports legacy pipeline normalization/identity/snapshot paths', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // The ONLY sanctioned pipeline reuse (deterministic hashing) is reached indirectly
      // via @/inference/util/checksum — a direct @/pipeline import is a boundary breach.
      if (/from '@\/pipeline/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('only the refresh orchestrator imports the AIL entry point (runInference)', () => {
    const importers = files.filter((f) => /from '@\/inference\/production\/runInference'/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => f.split('/').pop())).toEqual(['refresh.ts']);
  });
});

describe('boundary — Phase 4 identity behaviour preserved through transport', () => {
  it('dropping the sleeper source keeps the same canonical id (gsis-derived, provider-count invariant)', async () => {
    const both = await refreshSources({ sources: ALL_LIVE }, deps());
    const nflOnly = await refreshSources({ sources: ALL_LIVE.filter((r) => r.provider === 'nflverse') }, deps());
    const wrBoth = both.snapshot!.players.find((p) => p.providerIds.gsis === '00-WR')!.canonicalId;
    const wrNfl = nflOnly.snapshot!.players.find((p) => p.providerIds.gsis === '00-WR')!.canonicalId;
    expect(wrNfl).toBe(wrBoth);
  });
});
