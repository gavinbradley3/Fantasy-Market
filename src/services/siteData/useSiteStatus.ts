// The freshness hook.
//
// Reads the published status document through the SAME provider, client and query cache the
// board uses, so there is one in-flight request per document however many surfaces ask, and no
// component fetches for itself.
//
// A source that publishes no status document — the development API has no scheduled refresh to
// describe — yields `null` rather than an error. That is an absence, not a failure.
//
// A FAILURE TO READ STATUS IS NOT A FAILURE OF THE BOARD. The board is fetched separately and
// may be perfectly good; losing this document only means the age cannot be stated. So the strip
// that consumes it says nothing rather than claiming freshness it cannot verify.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { isApiError } from '@/services/api';
import type { QueryState } from '@/services/query/QueryClient';
import { usePublicationContext } from '@/services/publication';
import { fetchStatusDocument, type StatusDocument } from './documents';

export interface UseSiteStatusResult {
  readonly status: StatusDocument | null;
  readonly loading: boolean;
  /** True when the document could not be read or did not validate. */
  readonly failed: boolean;
}

export function useSiteStatus(): UseSiteStatusResult {
  const { client, source, query, getSignal } = usePublicationContext();
  const key = JSON.stringify(['site-status', source.statusPath]);

  const fetcher = useCallback(async (): Promise<StatusDocument | null> => {
    if (source.statusPath === null) return null;
    const signal = getSignal();
    try {
      return await fetchStatusDocument(client, source, { signal });
    } catch (err) {
      // "Not published yet" is a real answer on a first deploy, not an error.
      if (isApiError(err) && err.kind === 'notFound') return null;
      throw err;
    }
  }, [client, source, getSignal]);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const subscribe = useCallback((onChange: () => void) => query.subscribe(key, onChange), [query, key]);
  const getSnapshot = useCallback(() => query.getState(key), [query, key]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as QueryState<StatusDocument | null>;

  useEffect(() => {
    if (state.isFetching) return;
    // A settled error is terminal. Freshness is decoration; retrying it in a loop against an
    // unreachable host would cost the reader bandwidth to learn nothing.
    if (state.status === 'error') return;
    if (state.updatedAt === 0) void query.ensure(key, () => fetcherRef.current());
  }, [query, key, state]);

  return {
    status: state.data ?? null,
    loading: state.status === 'loading',
    failed: state.status === 'error',
  };
}
