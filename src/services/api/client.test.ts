// API client tests (Phase 10). Every failure mode the UI has to distinguish is pinned here,
// because the UI switches on `ApiError.kind` and nothing else.

import { describe, expect, it, vi } from 'vitest';
import { ApiClient, joinUrl, normalizeBaseUrl, resolveApiBaseUrl } from './client';
import { ApiError, isApiError } from './errors';
import { fetchCurrentPublication } from './publication';
import { fetchHealth } from './health';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Capture the URL each call was made with, and reply from a queue. */
function stubFetch(replies: (() => Promise<Response>)[]): { fetchFn: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  let i = 0;
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return reply();
  }) as unknown as typeof fetch;
  return { fetchFn, urls };
}

describe('base URL handling', () => {
  it('normalizes trailing slashes so requests never contain a double slash', () => {
    expect(normalizeBaseUrl('http://api.test/')).toBe('http://api.test');
    expect(normalizeBaseUrl('http://api.test///')).toBe('http://api.test');
    expect(normalizeBaseUrl('/api/')).toBe('/api');
    expect(normalizeBaseUrl('')).toBe('');
  });

  it('joins base and path without duplicating or dropping the separator', () => {
    expect(joinUrl('http://api.test/', '/publication')).toBe('http://api.test/publication');
    expect(joinUrl('http://api.test', 'publication')).toBe('http://api.test/publication');
    expect(joinUrl('http://api.test/v1/', '/health')).toBe('http://api.test/v1/health');
    expect(joinUrl('', '/publication')).toBe('/publication'); // same-origin
  });

  it('requests the configured base URL', async () => {
    const { fetchFn, urls } = stubFetch([async () => jsonResponse({ ok: true })]);
    const client = new ApiClient({ baseUrl: 'https://api.example.com/pt/', fetchFn });
    await client.getJson('/publication');
    expect(urls).toEqual(['https://api.example.com/pt/publication']);
  });

  it('resolves the base URL from the environment, hard-coding no host', () => {
    expect(resolveApiBaseUrl({ VITE_PLAYERTICKER_API_URL: 'https://api.example.com/' })).toBe(
      'https://api.example.com',
    );
    expect(resolveApiBaseUrl({ VITE_PLAYERTICKER_API_URL: '   ' , DEV: true })).toBe('/api');
    expect(resolveApiBaseUrl({ DEV: true })).toBe('/api'); // dev → the Vite proxy prefix
    expect(resolveApiBaseUrl({ DEV: false })).toBe(''); // build → the app's own origin
    expect(resolveApiBaseUrl()).toBe('');
  });
});

describe('response handling', () => {
  it('parses a successful JSON response', async () => {
    const { fetchFn } = stubFetch([async () => jsonResponse({ hello: 'world' })]);
    const client = new ApiClient({ fetchFn });
    await expect(client.getJson('/x')).resolves.toEqual({ hello: 'world' });
  });

  it('maps non-success statuses onto the kinds the UI switches on', async () => {
    const cases: [number, string][] = [
      [400, 'badRequest'],
      [404, 'notFound'],
      [500, 'server'],
      [502, 'server'],
      [503, 'unavailable'],
    ];
    for (const [status, kind] of cases) {
      const { fetchFn } = stubFetch([
        async () => jsonResponse({ error: { code: 'X_CODE', message: 'boom' } }, status),
      ]);
      const client = new ApiClient({ fetchFn });
      const err = await client.getJson('/x').catch((e: unknown) => e);
      expect(isApiError(err)).toBe(true);
      expect((err as ApiError).kind).toBe(kind);
      expect((err as ApiError).status).toBe(status);
      // The API's own code is preserved for logs — and never rewritten.
      expect((err as ApiError).code).toBe('X_CODE');
    }
  });

  it('treats a malformed JSON body as invalidResponse, not as a network or status failure', async () => {
    const { fetchFn } = stubFetch([
      async () => new Response('{"broken":', { status: 200, headers: { 'content-type': 'application/json' } }),
    ]);
    const client = new ApiClient({ fetchFn });
    const err = await client.getJson('/x').catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('invalidResponse');
  });

  it('treats an empty 200 body as invalidResponse', async () => {
    const { fetchFn } = stubFetch([async () => new Response('', { status: 200 })]);
    const client = new ApiClient({ fetchFn });
    const err = await client.getJson('/x').catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('invalidResponse');
  });

  it('reports a network failure as network', async () => {
    const { fetchFn } = stubFetch([
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ]);
    const client = new ApiClient({ fetchFn });
    const err = await client.getJson('/x').catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('network');
    expect((err as ApiError).retryable).toBe(true);
  });
});

describe('cancellation', () => {
  it('reports a caller abort as cancelled, never as an outage', async () => {
    const controller = new AbortController();
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })) as unknown as typeof fetch;

    const client = new ApiClient({ fetchFn });
    const promise = client.getJson('/x', { signal: controller.signal });
    controller.abort();
    const err = await promise.catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('cancelled');
    expect((err as ApiError).retryable).toBe(false);
  });

  it('an already-aborted signal fails fast without a completed request', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        if (init?.signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        resolve(jsonResponse({}));
      })) as unknown as typeof fetch;
    const client = new ApiClient({ fetchFn });
    const err = await client.getJson('/x', { signal: controller.signal }).catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('cancelled');
  });

  it('aborts on timeout and reports it as cancelled', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = ((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('timed out');
            err.name = 'AbortError';
            reject(err);
          });
        })) as unknown as typeof fetch;
      const client = new ApiClient({ fetchFn, timeoutMs: 50 });
      // The catch is attached BEFORE time is advanced, so the rejection is never unhandled.
      const settled = client.getJson('/x').catch((e: unknown) => e as ApiError);
      await vi.advanceTimersByTimeAsync(60);
      const err = await settled;
      expect((err as ApiError).kind).toBe('cancelled');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('endpoint readers', () => {
  const publicationBody = {
    publication: {
      publicationId: 'pub-1',
      runId: 'run-1',
      snapshotId: 'snap-1',
      boardChecksum: 'chk',
      entryCount: 0,
      publishedAt: '2026-01-01T00:00:00.000Z',
      supersededPublicationId: null,
    },
    entries: [],
  };

  it('GET /publication parses a valid response', async () => {
    const { fetchFn, urls } = stubFetch([async () => jsonResponse(publicationBody)]);
    const client = new ApiClient({ baseUrl: '/api', fetchFn });
    const result = await fetchCurrentPublication(client);
    expect(result.publication.publicationId).toBe('pub-1');
    expect(urls).toEqual(['/api/publication']);
  });

  it('GET /publication rejects a body that does not match the contract', async () => {
    const { fetchFn } = stubFetch([async () => jsonResponse({ publication: { publicationId: 'p' } })]);
    const client = new ApiClient({ fetchFn });
    const err = await fetchCurrentPublication(client).catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('invalidResponse');
  });

  it('GET /publication surfaces 404 as notFound so the UI can show an empty state', async () => {
    const { fetchFn } = stubFetch([
      async () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'no current publication' } }, 404),
    ]);
    const client = new ApiClient({ fetchFn });
    const err = await fetchCurrentPublication(client).catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('notFound');
  });

  it('GET /health parses a valid report and rejects a malformed one', async () => {
    const healthBody = {
      status: 'ok',
      scheduler: { enabled: true, running: false, state: 'idle' },
      persistence: { available: true },
      publication: { hasCurrent: false, currentPublicationId: null, boardChecksum: null },
      replay: { available: true },
      transport: { requiredProviders: ['nflverse'], replayEnabled: true },
      checkedAt: '2026-01-01T00:00:00.000Z',
    };
    const ok = new ApiClient({ fetchFn: stubFetch([async () => jsonResponse(healthBody)]).fetchFn });
    await expect(fetchHealth(ok)).resolves.toMatchObject({ status: 'ok' });

    const bad = new ApiClient({ fetchFn: stubFetch([async () => jsonResponse({ status: 'weird' })]).fetchFn });
    const err = await fetchHealth(bad).catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('invalidResponse');
  });

  it('a 503 health check reaches the caller as unavailable', async () => {
    const { fetchFn } = stubFetch([
      async () => jsonResponse({ status: 'degraded', persistence: { available: false } }, 503),
    ]);
    const err = await fetchHealth(new ApiClient({ fetchFn })).catch((e: unknown) => e as ApiError);
    expect((err as ApiError).kind).toBe('unavailable');
  });
});
