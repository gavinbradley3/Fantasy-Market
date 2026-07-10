// Dependency injection for the market data door. The composition root
// (src/main.tsx) constructs ONE concrete service and injects it here;
// everything below consumes the MarketDataService interface. Tests inject
// fakes (including intentionally failing services) the same way.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { IDLE_STATE, QueryClient, type QueryState, type QueryStatus } from '@/services/query/QueryClient';
import type { MarketDataService } from '@/services/marketData/types';

interface MarketDataContextValue {
  service: MarketDataService;
  client: QueryClient;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export function MarketDataProvider({
  service,
  children,
}: {
  service: MarketDataService;
  children: ReactNode;
}) {
  // One QueryClient per injected service: swapping the service (tests, future
  // live toggle) gets a clean cache — no cross-implementation bleed.
  const value = useMemo(() => ({ service, client: new QueryClient() }), [service]);
  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>;
}

function useMarketDataContext(): MarketDataContextValue {
  const ctx = useContext(MarketDataContext);
  if (!ctx) {
    throw new Error('useMarketDataService must be used inside <MarketDataProvider>');
  }
  return ctx;
}

/** The injected MarketDataService — for imperative flows (e.g. watchlist add). */
export function useMarketDataService(): MarketDataService {
  return useMarketDataContext().service;
}

/** The provider's query cache — exposed for invalidation (e.g. future refresh). */
export function useQueryClient(): QueryClient {
  return useMarketDataContext().client;
}

export interface UseQueryResult<T> {
  status: QueryStatus;
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  refetch: () => void;
}

export interface UseMarketQueryOptions {
  staleTimeMs?: number;
}

/**
 * Subscribe to a cached async query against the injected service.
 * - `key === null` disables the query (status 'idle') — used for e.g. empty
 *   search input.
 * - Results are cached per stringified key; concurrent mounts share one fetch.
 * - After `invalidate()` the subscription self-heals: the notify re-runs the
 *   ensure-effect, which sees `updatedAt === 0` and refetches.
 */
export function useMarketQuery<T>(
  key: readonly unknown[] | null,
  fetcher: (service: MarketDataService) => Promise<T>,
  options: UseMarketQueryOptions = {},
): UseQueryResult<T> {
  const { service, client } = useMarketDataContext();
  const keyStr = key === null ? null : JSON.stringify(key);
  const staleTimeMs = options.staleTimeMs;

  // Latest fetcher without making it an effect dependency (callers pass inline
  // closures; identity churn must not trigger refetches).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const subscribe = useCallback(
    (onChange: () => void) => (keyStr === null ? () => {} : client.subscribe(keyStr, onChange)),
    [client, keyStr],
  );
  const getSnapshot = useCallback(
    () => (keyStr === null ? IDLE_STATE : client.getState(keyStr)),
    [client, keyStr],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as QueryState<T>;

  useEffect(() => {
    if (keyStr === null) return;
    if (state.isFetching) return;
    // Fetch when never-loaded or invalidated; `ensure` re-checks freshness.
    if (state.updatedAt === 0 || staleTimeMs !== undefined) {
      void client.ensure(keyStr, () => fetcherRef.current(service), { staleTimeMs });
    }
  }, [client, service, keyStr, state, staleTimeMs]);

  const refetch = useCallback(() => {
    if (keyStr === null) return;
    void client.ensure(keyStr, () => fetcherRef.current(service), { force: true });
  }, [client, service, keyStr]);

  return { status: state.status, data: state.data, error: state.error, isFetching: state.isFetching, refetch };
}
