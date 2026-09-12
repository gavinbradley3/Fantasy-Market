// Reading the external market on the board.
//
// It shares the publication provider's API client, query cache and lifecycle signal rather
// than standing up a second provider: one cache, one lifetime, one place a request can be
// cancelled.
//
// THE MARKET IS SUPPLEMENTARY, AND THIS HOOK TREATS IT THAT WAY. `/board` shows PlayerTicker's
// own valuations; the market is context beside them. So a market failure is reported as a
// missing market, never as a broken board — the page must not go dark because a third party's
// CSV moved. That is the opposite of the publication read, which has no fallback by design.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { QueryState } from '@/services/query/QueryClient';
import { ApiError, fetchMarket, isApiError } from '@/services/api';
import { usePublicationContext } from '@/services/publication';
import { adaptMarket } from './adapter';
import type { ExternalMarket } from './types';

export interface UseExternalMarketResult {
  /** The market, or undefined while loading or after a failure. */
  readonly market: ExternalMarket | undefined;
  readonly isFetching: boolean;
  /**
   * True when the read settled unsuccessfully. The board uses it to say "market unavailable"
   * next to its own data, rather than rendering an error page over a perfectly good board.
   */
  readonly unavailable: boolean;
}

export function useExternalMarket(): UseExternalMarketResult {
  const { client, query, getSignal, source } = usePublicationContext();
  // The path is part of the cache key, exactly as it is for the publication read: a provider
  // swapped between the static export and the dev API must not serve one's answer for the other.
  const path = source.marketPath;
  const key = JSON.stringify(['market', 'dynasty_superflex', path]);

  const fetcher = useCallback(async (): Promise<ExternalMarket> => {
    const signal = getSignal();
    // A source that publishes no market (none does today) is a market with nothing in it,
    // which the board already renders honestly — not an error to put on screen.
    if (path === null) throw new ApiError('invalidResponse', 'this data source publishes no market document');
    return adaptMarket(await fetchMarket(client, { signal }, path));
  }, [client, getSignal, path]);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const subscribe = useCallback((onChange: () => void) => query.subscribe(key, onChange), [query, key]);
  const getSnapshot = useCallback(() => query.getState(key), [query, key]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as QueryState<ExternalMarket>;

  useEffect(() => {
    if (state.isFetching) return;
    // A settled error stays settled. Without this the error transition would re-trigger the
    // effect and refetch forever — the same request-storm the publication read guards against.
    if (state.status === 'error') return;
    if (state.updatedAt === 0) void query.ensure(key, () => fetcherRef.current());
  }, [query, key, state]);

  return {
    market: state.status === 'success' ? state.data : undefined,
    isFetching: state.isFetching,
    // A cancelled read is the provider unmounting, not a market outage, so it is not reported
    // as one; the next mount simply reads again.
    unavailable: state.status === 'error' && !(isApiError(state.error) && state.error.kind === 'cancelled'),
  };
}
