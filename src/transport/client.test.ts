// Transport unit + retry tests (Phase 5). Mocked transport only — NO real external calls.
// Covers success, timeout, abort, network error, retryable 429/5xx, non-retryable 4xx,
// response-size limit, content-type rejection, secret redaction, and retry exhaustion.

import { describe, expect, it } from 'vitest';
import { HttpClient, type FetchFn } from './client';
import { fixedClock, noSleep, zeroRandom } from './clock';
import { TransportError } from './errors';
import { DEFAULT_RETRY_POLICY } from './retry';
import type { TransportRequest } from './types';

const CLOCK = fixedClock('2025-09-30T12:00:00.000Z');

function req(overrides: Partial<TransportRequest> = {}): TransportRequest {
  return {
    method: 'GET',
    url: 'https://example.test/resource.json',
    headers: { accept: 'application/json' },
    expectContentType: 'application/json',
    ...overrides,
  };
}

function makeClient(fetchFn: FetchFn, retries = 0): HttpClient {
  return new HttpClient({
    fetchFn,
    clock: CLOCK,
    random: zeroRandom,
    sleep: noSleep,
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxRetries: retries, baseDelayMs: 0 },
  });
}

const jsonRes = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('HttpClient — success + metadata capture', () => {
  it('returns the raw payload and captures status/content-type/etag/last-modified', async () => {
    const c = makeClient(async () =>
      jsonRes([{ a: 1 }], { headers: { 'content-type': 'application/json', etag: 'W/"abc"', 'last-modified': 'Tue, 30 Sep 2025 00:00:00 GMT' } }),
    );
    const outcome = await c.execute(req());
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.contentType).toContain('application/json');
    expect(outcome.etag).toBe('W/"abc"');
    expect(outcome.lastModified).toBe('Tue, 30 Sep 2025 00:00:00 GMT');
    expect(outcome.payloadEncoding).toBe('utf8');
    expect(JSON.parse(outcome.payload)).toEqual([{ a: 1 }]);
  });
});

describe('HttpClient — timeout & abort', () => {
  it('classifies a timeout as a retryable TIMEOUT error', async () => {
    // A fetch that never resolves until its signal aborts.
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    const c = makeClient(hang, 0);
    await expect(c.execute(req({ timeoutMs: 10 }))).rejects.toMatchObject({ code: 'TIMEOUT', retryable: true, stage: 'fetch' });
  });

  it('classifies an explicit external abort as a non-retryable ABORTED error', async () => {
    const controller = new AbortController();
    controller.abort();
    const c = makeClient(async () => jsonRes([]));
    await expect(c.execute(req(), undefined, controller.signal)).rejects.toMatchObject({ code: 'ABORTED', retryable: false });
  });
});

describe('HttpClient — network & status classification', () => {
  it('classifies a thrown fetch as a retryable NETWORK error', async () => {
    const c = makeClient(async () => {
      throw new TypeError('connection reset');
    }, 0);
    await expect(c.execute(req())).rejects.toMatchObject({ code: 'NETWORK', retryable: true });
  });

  it('retries a 429 then succeeds', async () => {
    let n = 0;
    const c = makeClient(async () => {
      n += 1;
      return n < 3 ? new Response('slow down', { status: 429 }) : jsonRes([{ ok: true }]);
    }, 2);
    const outcome = await c.execute(req());
    expect(outcome.kind).toBe('ok');
    expect(n).toBe(3);
  });

  it('retries a 503 then succeeds', async () => {
    let n = 0;
    const c = makeClient(async () => {
      n += 1;
      return n < 2 ? new Response('unavailable', { status: 503 }) : jsonRes([{ ok: true }]);
    }, 2);
    const outcome = await c.execute(req());
    expect(outcome.kind).toBe('ok');
    expect(n).toBe(2);
  });

  it('does NOT retry a 404 (terminal 4xx)', async () => {
    let n = 0;
    const c = makeClient(async () => {
      n += 1;
      return new Response('nope', { status: 404 });
    }, 3);
    await expect(c.execute(req())).rejects.toMatchObject({ code: 'UNEXPECTED_STATUS', retryable: false });
    expect(n).toBe(1);
  });

  it('exhausts retries on persistent 500 and throws', async () => {
    let n = 0;
    const c = makeClient(async () => {
      n += 1;
      return new Response('boom', { status: 500 });
    }, 2);
    await expect(c.execute(req())).rejects.toMatchObject({ code: 'UNEXPECTED_STATUS' });
    expect(n).toBe(3); // 1 initial + 2 retries
  });
});

describe('HttpClient — body & content-type guards', () => {
  it('rejects a body larger than the max size', async () => {
    const big = 'x'.repeat(1000);
    const c = makeClient(async () => new Response(big, { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(c.execute(req({ maxBytes: 10 }))).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE', retryable: false });
  });

  it('rejects a mismatched content-type', async () => {
    const c = makeClient(async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(c.execute(req({ expectContentType: 'application/json' }))).rejects.toMatchObject({ code: 'INVALID_CONTENT_TYPE', retryable: false });
  });
});

describe('HttpClient — secret redaction', () => {
  it('never leaks a query-string secret into an error', async () => {
    const c = makeClient(async () => new Response('nope', { status: 404 }));
    const secretUrl = 'https://example.test/resource.json?api_key=SUPERSECRET&token=abcd1234';
    try {
      await c.execute(req({ url: secretUrl }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TransportError);
      const te = err as TransportError;
      const blob = `${te.message} ${te.detail ?? ''}`;
      expect(blob).not.toContain('SUPERSECRET');
      expect(blob).not.toContain('abcd1234');
    }
  });
});
