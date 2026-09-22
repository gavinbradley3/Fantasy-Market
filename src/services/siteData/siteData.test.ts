// The production data layer: where data comes from, and what happens when it is wrong.
//
// The property these protect: production NEVER silently substitutes demo data for a failed
// production read, and old data is never labelled current.

import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, fetchMarket, isApiError } from '@/services/api';
import { resolveSiteDataSource } from './source';
import { fetchMarketDocument, fetchStatusDocument } from './documents';
import { describeAge, describeFreshness } from './freshness';
import { marketResponseSchema } from '@/services/api/market';

const okJson = (body: unknown) =>
  new ApiClient({
    baseUrl: '',
    fetchFn: async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  } as never);

const STATIC = resolveSiteDataSource({ BASE_URL: '/' });

describe('data source resolution', () => {
  it('a production build with NO environment variables reads the published static JSON', () => {
    // This is what keeps deployment a one-click affair rather than a configuration exercise.
    const s = resolveSiteDataSource({});
    expect(s.kind).toBe('static');
    expect(s.publicationPath).toBe('/board.json');
    expect(s.statusPath).toBe('/status.json');
    expect(s.marketPath).toBeNull();
  });

  it('honours the deployed base path, so a project page and a custom domain both work', () => {
    expect(resolveSiteDataSource({ BASE_URL: '/Fantasy-Market/' }).baseUrl).toBe('/Fantasy-Market/data');
    expect(resolveSiteDataSource({ BASE_URL: '/' }).baseUrl).toBe('/data');
  });

  it('uses the local API in development, and publishes no status document there', () => {
    const s = resolveSiteDataSource({ DEV: true });
    expect(s.kind).toBe('api');
    expect(s.baseUrl).toBe('/api');
    expect(s.publicationPath).toBe('/publication');
    // There is no scheduled refresh locally, so there is no freshness to describe.
    expect(s.statusPath).toBeNull();
  });

  it('an explicit static base wins, so the production path can be exercised locally', () => {
    const s = resolveSiteDataSource({ DEV: true, VITE_PLAYERTICKER_DATA_URL: 'http://localhost:4173/data' });
    expect(s.kind).toBe('static');
    expect(s.baseUrl).toBe('http://localhost:4173/data');
  });

  it('an explicit API base still overrides the production default', () => {
    const s = resolveSiteDataSource({ VITE_PLAYERTICKER_API_URL: 'https://api.example.com/' });
    expect(s.kind).toBe('api');
    expect(s.baseUrl).toBe('https://api.example.com');
  });
});

describe('document validation', () => {
  it('reads a well-formed status document', async () => {
    const doc = await fetchStatusDocument(
      okJson({
        generatedAt: '2026-09-12T18:00:00.000Z',
        board: { state: 'current', ageHours: 1.2, currentWithinHours: 12, publishedAt: 'x', entryCount: 867 },
        market: { state: 'stale', ageHours: 400, currentWithinHours: 336, capturedAt: 'y', sourceTimestamp: 'z', quoteCount: 439 },
        overall: 'ok',
      }),
      STATIC,
    );
    expect(doc?.board.entryCount).toBe(867);
    expect(doc?.market.state).toBe('stale');
  });

  it('tolerates NEW operational fields, so a refresh change cannot break the deployed app', async () => {
    const doc = await fetchStatusDocument(
      okJson({
        generatedAt: 'now',
        board: { state: 'current' },
        market: { state: 'unknown' },
        overall: 'ok',
        somethingAddedLater: { deeply: 'nested' },
      }),
      STATIC,
    );
    expect(doc?.board.state).toBe('current');
    // Absent numbers stay absent rather than becoming zero.
    expect(doc?.board.entryCount).toBeNull();
  });

  it('REJECTS a malformed status document instead of reading it as empty', async () => {
    // "published nonsense" and "published nothing" need different words on screen.
    await expect(fetchStatusDocument(okJson({ board: 'not an object' }), STATIC)).rejects.toSatisfy(
      (e: unknown) => isApiError(e) && e.kind === 'invalidResponse',
    );
  });

  it('rejects an unrecognised freshness state rather than guessing one', async () => {
    await expect(
      fetchStatusDocument(okJson({ generatedAt: 'x', board: { state: 'probably-fine' }, market: { state: 'current' } }), STATIC),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('does not read retained market quotes in the public release', async () => {
    const doc = await fetchMarketDocument(
      okJson({
        source: 'dynastyprocess',
        format: 'dynasty_superflex',
        attribution: { name: 'DynastyProcess', licence: 'provisional' },
        capturedAt: '2026-09-12T00:00:00.000Z',
        quoteCount: 1,
        quotes: [{ canonicalPlayerId: 'pt-a', value: 5000, overallRank: 1, positionRank: 1 }],
      }),
      STATIC,
    );
    expect(doc).toBeNull();
  });

  it('returns null — not an error — when the source publishes no such document', async () => {
    const devSource = resolveSiteDataSource({ DEV: true });
    expect(await fetchStatusDocument(okJson({}), devSource)).toBeNull();
  });
});

describe('freshness wording', () => {
  it('states the age when data is current', () => {
    expect(describeFreshness('Board', 'current', 3).label).toBe('Updated 3h ago');
    expect(describeFreshness('Board', 'current', 3).tone).toBe('normal');
  });

  it('says WHEN a stale board was updated, so a reader can judge it', () => {
    const copy = describeFreshness('Board', 'stale', 30);
    expect(copy.label).toBe('Board updated yesterday');
    expect(copy.tone).toBe('caution');
    expect(copy.detail).toContain('not completed recently');
  });

  it('escalates an expired dataset', () => {
    const copy = describeFreshness('Market', 'expired', 24 * 40);
    expect(copy.label).toContain('40 days ago');
    expect(copy.tone).toBe('warning');
  });

  it('NEVER says up to date when the update time is unknown', () => {
    // The failure this exists to prevent: old data looking current because the app is still
    // responding.
    const copy = describeFreshness('Board', 'unknown', null);
    expect(copy.label).toBe('Board update time unknown');
    expect(copy.label).not.toMatch(/up to date|updated \d/i);
    expect(copy.tone).toBe('warning');
  });

  it('leaks no operational jargon in any state', () => {
    const forbidden = /requiredProviderFailure|partial|heap|runId|snapshot|checksum|nflverse|sleeper/i;
    for (const state of ['current', 'stale', 'expired', 'unknown'] as const) {
      const copy = describeFreshness('Board', state, 5);
      expect(copy.label).not.toMatch(forbidden);
      if (copy.detail) expect(copy.detail).not.toMatch(forbidden);
    }
  });

  it('describes ages in whole units, without false precision', () => {
    expect(describeAge(0.4)).toBe('less than an hour ago');
    expect(describeAge(1.5)).toBe('1h ago');
    expect(describeAge(5.7)).toBe('5h ago');
    expect(describeAge(24)).toBe('yesterday');
    expect(describeAge(72)).toBe('3 days ago');
    expect(describeAge(null)).toBeNull();
  });
});

describe('public market exclusion', () => {
  it.each([
    {}, { DEV: true }, { VITE_PLAYERTICKER_API_URL: 'http://localhost:8787' },
    { VITE_PLAYERTICKER_DATA_URL: 'https://example.test/data' },
  ])('cannot be activated through a data-source environment choice: %j', (env) => {
    expect(resolveSiteDataSource(env).marketPath).toBeNull();
  });

  it.each(['/market', '/market-latest.json', '/market-history.jsonl'])(
    'rejects explicit browser requests to %s without sending a request', async (path) => {
      const getJson = vi.fn().mockResolvedValue(marketBody());
      const client = { getJson } as unknown as ApiClient;
      await expect(fetchMarket(client, { format: 'dynasty_superflex' }, path)).rejects.toThrow('public usage rights');
      expect(getJson).not.toHaveBeenCalled();
    },
  );

  it('blocks even an injected legacy source from the document reader', async () => {
    const getJson = vi.fn().mockResolvedValue(marketBody());
    const client = { getJson } as unknown as ApiClient;
    expect(await fetchMarketDocument(client, { ...STATIC, marketPath: '/market-latest.json' })).toBeNull();
    expect(getJson).not.toHaveBeenCalled();
  });

  it('preserves the offline private-history schema and attribution without fetching data', () => {
    const parsed = marketResponseSchema.parse(marketBody());
    expect(parsed.quotes[0].canonicalPlayerId).toBe('pt-1');
    expect(parsed.attribution.publisher).toBe('DynastyProcess');
  });
});

function marketBody() {
  return {
    source: 'dynastyprocess',
    format: 'dynasty_superflex',
    attribution: {
      publisher: 'DynastyProcess',
      url: 'https://example.test',
      licence: 'MIT',
      derivedFrom: null,
      refreshCadence: 'weekly',
      usage: 'comparison only',
    },
    sourceTimestamp: '2026-09-11T00:00:00.000Z',
    sourceVersion: null,
    capturedAt: '2026-09-11T21:33:45.639Z',
    captureCount: 2,
    quoteCount: 1,
    quotes: [
      {
        canonicalPlayerId: 'pt-1',
        source: 'dynastyprocess',
        format: 'dynasty_superflex',
        value: 10256,
        overallRank: 1,
        positionRank: 1,
        sourceTimestamp: '2026-09-11T00:00:00.000Z',
        ingestedAt: '2026-09-11T21:33:45.639Z',
        freshness: 'fresh',
        provenance: 'external',
      },
    ],
  };
}
