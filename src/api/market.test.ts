// GET /market — the read-only external market endpoint.
//
// Three properties are load-bearing here and each has a test that fails loudly if it slips:
// the format is never inferred, attribution never falls off the response, and an un-ingested
// market answers "no data" rather than looking like a broken backend.

import { describe, expect, it } from 'vitest';
import { createApiApp } from './app';
import { ApplicationError } from '@/application';
import { fakeApplication, marketSnapshot } from './__fixtures';
import type { MarketResponse } from './dto';

function build() {
  const handle = fakeApplication();
  const api = createApiApp(handle.application);
  const get = (path: string, query: Record<string, string> = {}) => api.handle({ method: 'GET', path, query });
  return { api, handle, get };
}

async function market(query: Record<string, string> = {}) {
  const { get, handle } = build();
  const r = await get('/market', query);
  return { r, handle, body: r.body as MarketResponse };
}

describe('GET /market', () => {
  it('defaults to the primary lens — Superflex — and says so in the response', async () => {
    const { r, body, handle } = await market();
    expect(r.status).toBe(200);
    expect(body.format).toBe('dynasty_superflex');
    expect(body.source).toBe('dynastyprocess');
    expect(handle.calls).toContain('market.latest:dynastyprocess|dynasty_superflex');
  });

  it('serves the normalized contract, not raw source rows', async () => {
    const { body } = await market();
    expect(body.quotes[0]).toEqual({
      canonicalPlayerId: 'pt-d80f2bd29165c373',
      source: 'dynastyprocess',
      format: 'dynasty_superflex',
      value: 10256,
      overallRank: 1,
      positionRank: 1,
      sourceTimestamp: '2026-09-11T00:00:00.000Z',
      ingestedAt: '2026-09-11T18:00:00.000Z',
      freshness: 'fresh',
      provenance: 'external',
    });
  });

  it('does not re-serve the upstream id space or its consensus ranks', async () => {
    // Those are retained in storage for audit. Serving them would be redistributing another
    // party's dataset rather than showing what PlayerTicker compares against.
    const { body } = await market();
    const keys = Object.keys(body.quotes[0]);
    expect(keys).not.toContain('sourcePlayerId');
    expect(keys).not.toContain('sourceConsensusRank');
  });

  it('carries attribution on the envelope, including the unresolved upstream rights', async () => {
    const { body } = await market();
    expect(body.attribution.publisher).toBe('DynastyProcess');
    expect(body.attribution.licence).toBe('GPL-3.0');
    expect(body.attribution.derivedFrom).toBe('FantasyPros expert consensus');
    expect(body.attribution.usage).toContain('not PlayerTicker-owned market data');
  });

  it('reports the source cadence, so nothing downstream can call weekly data real-time', async () => {
    const { body } = await market();
    expect(body.attribution.refreshCadence).toBe('weekly');
  });

  it('reports how many captures exist — the precondition for any movement window', async () => {
    const { handle } = build();
    handle.marketByKey.set('dynastyprocess|dynasty_superflex', [
      marketSnapshot({ ingestedAt: '2026-09-04T18:00:00.000Z' }),
      marketSnapshot({ canonicalPlayerId: 'pt-b', ingestedAt: '2026-09-11T18:00:00.000Z' }),
    ]);
    const api = createApiApp(handle.application);
    const body = (await api.handle({ method: 'GET', path: '/market', query: {} })).body as MarketResponse;
    expect(body.captureCount).toBe(2);
    expect(body.capturedAt).toBe('2026-09-11T18:00:00.000Z');
  });

  it('takes its headline stamps from the NEWEST quote, not the first row', async () => {
    const { handle } = build();
    handle.marketByKey.set('dynastyprocess|dynasty_superflex', [
      marketSnapshot({ sourceTimestamp: '2026-09-04T00:00:00.000Z', sourceVersion: '2026-09-04' }),
      marketSnapshot({ canonicalPlayerId: 'pt-b', sourceTimestamp: '2026-09-11T00:00:00.000Z', sourceVersion: '2026-09-11' }),
    ]);
    const api = createApiApp(handle.application);
    const body = (await api.handle({ method: 'GET', path: '/market', query: {} })).body as MarketResponse;
    expect(body.sourceTimestamp).toBe('2026-09-11T00:00:00.000Z');
    expect(body.sourceVersion).toBe('2026-09-11');
  });

  it('serves 1QB separately — a Superflex value never answers a 1QB request', async () => {
    const { handle } = build();
    handle.marketByKey.set('dynastyprocess|dynasty_1qb', [marketSnapshot({ format: 'dynasty_1qb', value: 7000 })]);
    const api = createApiApp(handle.application);
    const body = (await api.handle({ method: 'GET', path: '/market', query: { format: 'dynasty_1qb' } })).body as MarketResponse;
    expect(body.format).toBe('dynasty_1qb');
    expect(body.quotes[0].value).toBe(7000);
  });

  it('REJECTS an unknown format rather than quietly serving Superflex', async () => {
    const { r } = await market({ format: 'redraft' });
    expect(r.status).toBe(400);
    expect((r.body as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
  });

  it('rejects a malformed source key', async () => {
    const { r } = await market({ source: '../../etc/passwd' });
    expect(r.status).toBe(400);
  });

  it('an un-ingested market is 200 with zero quotes, not an error', async () => {
    const { handle } = build();
    handle.marketByKey.clear();
    const api = createApiApp(handle.application);
    const r = await api.handle({ method: 'GET', path: '/market', query: {} });
    expect(r.status).toBe(200);
    const body = r.body as MarketResponse;
    expect(body.quotes).toEqual([]);
    expect(body.quoteCount).toBe(0);
    expect(body.captureCount).toBe(0);
    expect(body.sourceTimestamp).toBeNull();
    // Attribution is still present: an empty market is still somebody else's market.
    expect(body.attribution.publisher).toBe('DynastyProcess');
  });

  it('a null value survives as null — an absent quote is never a zero', async () => {
    const { handle } = build();
    handle.marketByKey.set('dynastyprocess|dynasty_superflex', [
      marketSnapshot({ value: null, overallRank: null, positionRank: null }),
    ]);
    const api = createApiApp(handle.application);
    const body = (await api.handle({ method: 'GET', path: '/market', query: {} })).body as MarketResponse;
    expect(body.quotes[0].value).toBeNull();
    expect(body.quotes[0].overallRank).toBeNull();
  });

  it('an unattributed source is served as unattributed, never as ours', async () => {
    const { handle } = build();
    handle.marketByKey.set('somewhere|dynasty_superflex', [marketSnapshot({ source: 'somewhere' })]);
    const api = createApiApp(handle.application);
    const body = (await api.handle({ method: 'GET', path: '/market', query: { source: 'somewhere' } })).body as MarketResponse;
    expect(body.attribution.publisher).toBe('unknown');
    expect(body.attribution.usage).toContain('third-party data');
  });

  it('maps a persistence outage to 503 rather than an empty market', async () => {
    const { handle } = build();
    handle.throwOnMarket = new ApplicationError('PERSISTENCE_UNAVAILABLE', 'db closed');
    const api = createApiApp(handle.application);
    const r = await api.handle({ method: 'GET', path: '/market', query: {} });
    expect(r.status).toBe(503);
  });

  it('is read-only: POST /market is not routable', async () => {
    const { api } = build();
    const r = await api.handle({ method: 'POST', path: '/market', query: {}, body: {} });
    expect(r.status).toBe(405);
  });
});
