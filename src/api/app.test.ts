// API route + router tests (Phase 9): every endpoint, request validation, error mapping,
// routing (404/405, static-vs-param precedence), and delegation to the application layer.

import { describe, expect, it } from 'vitest';
import { createApiApp } from './app';
import { ApplicationError } from '@/application';
import { fakeApplication } from './__fixtures';

function build() {
  const handle = fakeApplication();
  const api = createApiApp(handle.application);
  const get = (path: string, query: Record<string, string> = {}) => api.handle({ method: 'GET', path, query });
  const post = (path: string, body?: unknown, query: Record<string, string> = {}) => api.handle({ method: 'POST', path, query, body });
  return { api, handle, get, post };
}

describe('GET /health', () => {
  it('returns 200 + full report when ok', async () => {
    const { get, handle } = build();
    const r = await get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', replay: { available: true } });
    expect(handle.calls).toContain('health.report');
  });
  it('returns 503 when degraded', async () => {
    const degraded = createApiApp({ health: { report: () => ({ status: 'degraded', persistence: { available: false } }) } } as never);
    const r = await degraded.handle({ method: 'GET', path: '/health', query: {} });
    expect(r.status).toBe(503);
    expect((r.body as { status: string }).status).toBe('degraded');
  });
});

describe('GET /scheduler', () => {
  it('returns 200 + read-only status', async () => {
    const { get, handle } = build();
    const r = await get('/scheduler');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ enabled: true, state: 'idle', running: false });
    expect(handle.calls).toContain('scheduler.status');
  });
});

describe('POST /refresh', () => {
  it('accepted run → 200 ack with runId and accepted=true', async () => {
    const { post, handle } = build();
    const r = await post('/refresh');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ runId: 'run-1', accepted: true, skipped: false, reason: null, status: 'success', published: true, publicationId: 'pub-1' });
    expect(handle.calls).toContain('refresh.triggerRefresh');
  });
  it('skipped run → 200 ack with skipped=true and reason', async () => {
    const { api, handle } = build();
    handle.refreshResult = { ...handle.refreshResult, skipped: true, success: false, published: false, publicationId: null, status: 'skipped', skipReason: 'already-running', runId: '' };
    const r = await api.handle({ method: 'POST', path: '/refresh', query: {} });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ accepted: false, skipped: true, reason: 'already-running', runId: null });
  });
  it('rejects a non-empty body with 400', async () => {
    const { post } = build();
    const r = await post('/refresh', { force: true });
    expect(r.status).toBe(400);
    expect((r.body as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
  });
  it('accepts an empty-object body', async () => {
    const { post } = build();
    expect((await post('/refresh', {})).status).toBe(200);
  });
});

describe('GET /refresh/current', () => {
  it('returns the in-flight execution view', async () => {
    const { get } = build();
    const r = await get('/refresh/current');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ running: false, activeRunId: null, state: 'idle' });
  });
});

describe('GET /refresh/history', () => {
  it('defaults limit to 25 and delegates', async () => {
    const { get, handle } = build();
    const r = await get('/refresh/history');
    expect(r.status).toBe(200);
    expect((r.body as { executions: unknown[] }).executions).toHaveLength(2);
    expect(handle.calls).toContain('refresh.executionHistory:25');
  });
  it('honors a valid ?limit', async () => {
    const { get, handle } = build();
    await get('/refresh/history', { limit: '1' });
    expect(handle.calls).toContain('refresh.executionHistory:1');
  });
  it('rejects a malformed ?limit with 400', async () => {
    const { get } = build();
    expect((await get('/refresh/history', { limit: 'abc' })).status).toBe(400);
    expect((await get('/refresh/history', { limit: '-3' })).status).toBe(400);
    expect((await get('/refresh/history', { limit: '9999' })).status).toBe(400);
  });
});

describe('GET /publication', () => {
  it('returns a projected board (no raw persistence records)', async () => {
    const { get } = build();
    const r = await get('/publication');
    expect(r.status).toBe(200);
    const body = r.body as { publication: { publicationId: string }; entries: unknown[] };
    expect(body.publication.publicationId).toBe('pub-1');
    expect(body.entries).toEqual([
      { canonicalId: 'p:aaa', position: 'QB', normalizedInputChecksum: 'ni-1', outputChecksum: 'out-1' },
      { canonicalId: 'p:bbb', position: 'WR', normalizedInputChecksum: 'ni-2', outputChecksum: 'out-2' },
    ]);
    // No serialized payloads / schema versions leaked.
    expect(JSON.stringify(body)).not.toContain('serialized');
  });
  it('returns 404 when nothing is published', async () => {
    const { api, handle } = build();
    handle.currentPublicationBundle = null;
    handle.currentPublicationMeta = null;
    const r = await api.handle({ method: 'GET', path: '/publication', query: {} });
    expect(r.status).toBe(404);
  });
});

describe('GET /publication/history vs /publication/:id (route precedence)', () => {
  it('/publication/history hits the history handler, not :id', async () => {
    const { get, handle } = build();
    const r = await get('/publication/history');
    expect(r.status).toBe(200);
    expect((r.body as { publications: unknown[] }).publications).toHaveLength(2);
    expect(handle.calls).toContain('publications.publicationHistory:25');
    expect(handle.calls.some((c) => c.startsWith('publications.publicationMetadata'))).toBe(false);
  });
  it('/publication/:id returns metadata, 404 when unknown', async () => {
    const { get, handle } = build();
    expect((await get('/publication/pub-1')).status).toBe(200);
    expect(handle.calls).toContain('publications.publicationMetadata:pub-1');
    expect((await get('/publication/missing')).status).toBe(404);
  });
});

describe('GET /history/:runId', () => {
  it('returns a projected run, 404 when unknown', async () => {
    const { get } = build();
    const ok = await get('/history/run-1');
    expect(ok.status).toBe(200);
    const body = ok.body as { runId: string; sources: unknown[] };
    expect(body.runId).toBe('run-1');
    expect(body.sources).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('payloadChecksum'); // projected, not raw
    expect((await get('/history/nope')).status).toBe(404);
  });
});

describe('routing errors', () => {
  it('unknown path → 404', async () => {
    const { get } = build();
    expect((await get('/nope')).status).toBe(404);
  });
  it('known path wrong method → 405', async () => {
    const { post } = build();
    const r = await post('/scheduler');
    expect(r.status).toBe(405);
    expect((r.body as { error: { code: string } }).error.code).toBe('METHOD_NOT_ALLOWED');
  });
});

describe('error mapping', () => {
  async function refreshWith(thrown: unknown) {
    const handle = fakeApplication();
    handle.throwOnRefresh = thrown;
    return createApiApp(handle.application).handle({ method: 'POST', path: '/refresh', query: {} });
  }
  async function pubWith(thrown: unknown) {
    const handle = fakeApplication();
    handle.throwOnPublications = thrown;
    return createApiApp(handle.application).handle({ method: 'GET', path: '/publication', query: {} });
  }

  it('ApplicationError PERSISTENCE_UNAVAILABLE → 503', async () => {
    const r = await pubWith(new ApplicationError('PERSISTENCE_UNAVAILABLE', 'db down', { detail: 'READ_FAILURE' }));
    expect(r.status).toBe(503);
    expect((r.body as { error: { code: string } }).error.code).toBe('PERSISTENCE_UNAVAILABLE');
  });
  it('underlying CONFLICTING_ARTIFACT → 409', async () => {
    const r = await pubWith(new ApplicationError('PERSISTENCE_UNAVAILABLE', 'conflict', { detail: 'CONFLICTING_ARTIFACT' }));
    expect(r.status).toBe(409);
  });
  it('INVALID_ARGUMENT → 400', async () => {
    const r = await pubWith(new ApplicationError('INVALID_ARGUMENT', 'bad'));
    expect(r.status).toBe(400);
  });
  it('unknown throw → 500 INTERNAL, no leak', async () => {
    const r = await refreshWith(new Error('secret internal detail'));
    expect(r.status).toBe(500);
    const body = r.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('internal error'); // original message not leaked
  });
  it('never includes a stack trace', async () => {
    const err = new Error('boom');
    const r = await refreshWith(err);
    expect(JSON.stringify(r.body)).not.toContain('at ');
    expect(JSON.stringify(r.body)).not.toContain('.ts:');
  });
});
