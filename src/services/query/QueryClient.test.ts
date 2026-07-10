// Query-layer tests (Phase 10): caching, in-flight dedup, invalidation,
// error capture, and stale-response protection.

import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@/services/query/QueryClient';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('QueryClient', () => {
  it('caches successful results and dedups concurrent fetches', async () => {
    const client = new QueryClient();
    const fetcher = vi.fn(async () => 42);
    await Promise.all([
      client.ensure('k', fetcher),
      client.ensure('k', fetcher),
      client.ensure('k', fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.getState('k').data).toBe(42);
    expect(client.getState('k').status).toBe('success');

    // Fresh (default staleTime = Infinity): no refetch.
    await client.ensure('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('captures errors as error state without throwing', async () => {
    const client = new QueryClient();
    await client.ensure('bad', async () => {
      throw new Error('boom');
    });
    const state = client.getState('bad');
    expect(state.status).toBe('error');
    expect((state.error as Error).message).toBe('boom');
  });

  it('invalidate marks entries stale and refetch picks up new data', async () => {
    const client = new QueryClient();
    let value = 1;
    const fetcher = async () => value;
    await client.ensure('k', fetcher);
    expect(client.getState('k').data).toBe(1);

    value = 2;
    const invalidated = client.invalidate('k');
    expect(invalidated).toContain('k');
    expect(client.getState('k').updatedAt).toBe(0);

    await client.ensure('k', fetcher); // stale → refetches
    expect(client.getState('k').data).toBe(2);
  });

  it('invalidate supports prefix matching', async () => {
    const client = new QueryClient();
    await client.ensure('["board","a"]', async () => 1);
    await client.ensure('["player","x"]', async () => 2);
    const hit = client.invalidate('["board"');
    expect(hit).toEqual(['["board","a"]']);
    expect(client.getState('["player","x"]').updatedAt).toBeGreaterThan(0);
  });

  it('discards stale responses: an older in-flight fetch cannot overwrite a newer one', async () => {
    const client = new QueryClient();
    let releaseSlow!: (v: string) => void;
    const slow = new Promise<string>((r) => (releaseSlow = r));

    // Old fetch starts, hangs.
    const oldFetch = client.ensure('k', () => slow);
    // Force a NEWER fetch that resolves immediately.
    await client.ensure('k', async () => 'new', { force: true });
    expect(client.getState('k').data).toBe('new');

    // Old fetch finally resolves — must be discarded.
    releaseSlow('old');
    await oldFetch;
    await tick();
    expect(client.getState('k').data).toBe('new');
  });

  it('background refresh keeps previous data visible (no loading regression)', async () => {
    const client = new QueryClient();
    await client.ensure('k', async () => 'first');
    let release!: (v: string) => void;
    const pending = new Promise<string>((r) => (release = r));
    const refetch = client.ensure('k', () => pending, { force: true });
    // While refetching, old data still shown with success status.
    expect(client.getState('k').status).toBe('success');
    expect(client.getState('k').data).toBe('first');
    expect(client.getState('k').isFetching).toBe(true);
    release('second');
    await refetch;
    expect(client.getState('k').data).toBe('second');
  });

  it('notifies subscribers on every transition', async () => {
    const client = new QueryClient();
    const listener = vi.fn();
    client.subscribe('k', listener);
    await client.ensure('k', async () => 7);
    expect(listener).toHaveBeenCalled();
  });
});
