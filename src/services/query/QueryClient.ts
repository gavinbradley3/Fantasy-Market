// A small internal async-query cache. Deliberately NOT TanStack Query: the
// app's data is deterministic, local, and keyed by (format, date), so the
// full library (~13KB gz + its own semantics) buys nothing we need. This
// implementation covers the contract the UI depends on — caching, in-flight
// deduplication, query keys, invalidation, staleness, and stale-response
// protection — in ~120 lines that we can unit-test exhaustively. If server
// state ever grows real complexity (pagination, mutations, offline), replace
// this file with TanStack Query behind the same hook signatures.

export type QueryStatus = 'idle' | 'loading' | 'error' | 'success';

export interface QueryState<T = unknown> {
  status: QueryStatus;
  data: T | undefined;
  error: unknown;
  /** Epoch ms of the last successful fetch; 0 = never succeeded. */
  updatedAt: number;
  /** True while a fetch (initial or background refresh) is in flight. */
  isFetching: boolean;
}

export interface EnsureOptions {
  /** Refetch if the cached data is older than this. Default: never stale. */
  staleTimeMs?: number;
  /** Bypass cache and dedup; always refetch. */
  force?: boolean;
}

interface Entry {
  state: QueryState;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
  /** Monotonic fetch sequence — a resolution from an older fetch than the
   *  latest one for this key is discarded (stale-response protection). */
  seq: number;
}

const INITIAL: QueryState = {
  status: 'loading',
  data: undefined,
  error: undefined,
  updatedAt: 0,
  isFetching: false,
};

export const IDLE_STATE: QueryState = Object.freeze({
  status: 'idle',
  data: undefined,
  error: undefined,
  updatedAt: 0,
  isFetching: false,
});

export class QueryClient {
  private entries = new Map<string, Entry>();

  private entry(key: string): Entry {
    let e = this.entries.get(key);
    if (!e) {
      e = { state: { ...INITIAL }, listeners: new Set(), inflight: null, seq: 0 };
      this.entries.set(key, e);
    }
    return e;
  }

  /** Stable state object per key; replaced immutably on every transition. */
  getState(key: string): QueryState {
    return this.entry(key).state;
  }

  subscribe(key: string, listener: () => void): () => void {
    const e = this.entry(key);
    e.listeners.add(listener);
    return () => e.listeners.delete(listener);
  }

  private setState(key: string, patch: Partial<QueryState>): void {
    const e = this.entry(key);
    e.state = { ...e.state, ...patch };
    for (const l of e.listeners) l();
  }

  /**
   * Ensure fresh-enough data exists for `key`. Concurrent callers share one
   * in-flight fetch; cached data within `staleTimeMs` short-circuits.
   */
  ensure<T>(key: string, fetcher: () => Promise<T>, opts: EnsureOptions = {}): Promise<void> {
    const { staleTimeMs = Infinity, force = false } = opts;
    const e = this.entry(key);

    if (!force) {
      if (e.inflight) return e.inflight; // dedup
      const fresh = e.state.updatedAt > 0 && Date.now() - e.state.updatedAt < staleTimeMs;
      if (fresh && e.state.status === 'success') return Promise.resolve();
    }

    e.seq += 1;
    const seq = e.seq;
    this.setState(key, {
      isFetching: true,
      // Keep showing existing data during a background refresh; only regress
      // to 'loading' when there is nothing to show.
      status: e.state.data === undefined ? 'loading' : e.state.status,
    });

    const run = fetcher().then(
      (data) => {
        if (seq !== this.entry(key).seq) return; // stale response — discard
        this.setState(key, {
          status: 'success',
          data,
          error: undefined,
          updatedAt: Date.now(),
          isFetching: false,
        });
      },
      (error: unknown) => {
        if (seq !== this.entry(key).seq) return;
        this.setState(key, { status: 'error', error, isFetching: false });
      },
    );

    e.inflight = run.finally(() => {
      if (seq === this.entry(key).seq) this.entry(key).inflight = null;
    });
    return e.inflight;
  }

  /**
   * Invalidate cached entries (all, or those whose key starts with `prefix`).
   * Entries nobody is watching are just marked stale; watched entries cannot
   * self-refetch here (the fetcher lives with the subscriber), so watchers
   * must call `ensure`/refetch — the useMarketQuery hook wires this up.
   */
  invalidate(prefix?: string): string[] {
    const invalidated: string[] = [];
    for (const [key, e] of this.entries) {
      if (prefix !== undefined && !key.startsWith(prefix)) continue;
      e.seq += 1; // also discards any in-flight response for this key
      e.inflight = null;
      e.state = { ...e.state, updatedAt: 0 };
      invalidated.push(key);
      for (const l of e.listeners) l();
    }
    return invalidated;
  }
}
