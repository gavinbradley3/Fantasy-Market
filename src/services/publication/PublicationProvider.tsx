// Dependency injection + caching for the published market (Phase 10).
//
// Mirrors the existing `MarketDataProvider` seam exactly: the composition root builds ONE
// concrete client and injects it; everything below consumes a hook. Tests inject a client
// built over a stubbed `fetch` the same way.
//
// State management REUSES the repository's `QueryClient` rather than adding a library. That
// buys the four things this screen needs and nothing it does not: one shared in-flight request
// no matter how many components ask (no duplicate `/publication` calls), stale-response
// protection when a request is replaced, an explicit forced refetch for the retry button, and
// a cache that survives navigation.
//
// "No publication yet" is modelled as a SUCCESSFUL result carrying `kind: 'empty'`, not as an
// error: the backend answered, and the honest reading is "the market is empty", which the UI
// must present differently from "the market could not be reached".

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
import { QueryClient, type QueryState } from '@/services/query/QueryClient';
import { ApiClient, ApiError, fetchCurrentPublication, isApiError, resolveApiBaseUrl } from '@/services/api';
import { adaptPublication } from './adapter';
import type { PublishedHorizon, PublishedMarket } from './types';

/** Marks a cancellation caused by this provider unmounting, not by a timeout or a caller. */
const LIFECYCLE_ABORT = 'LIFECYCLE_ABORT';

function isLifecycleAbort(error: unknown): boolean {
  return isApiError(error) && error.kind === 'cancelled' && error.code === LIFECYCLE_ABORT;
}

/** A settled read: either a board, or a confirmed absence of one. */
export type PublicationResult =
  | { readonly kind: 'market'; readonly market: PublishedMarket }
  | { readonly kind: 'empty' };

interface PublicationContextValue {
  readonly client: ApiClient;
  readonly query: QueryClient;
  /**
   * The signal every read is bound to. Aborted when the provider unmounts, so no request
   * outlives the tree that started it.
   *
   * It is a FUNCTION rather than a stored controller because React can unmount and immediately
   * remount a provider — StrictMode does exactly this in development, and Suspense/offscreen
   * can do it in production. A stored controller aborted by the first cleanup would still be
   * aborted on the remount, and every subsequent read would cancel instantly, leaving the page
   * permanently stuck on "cancelled". Resolving the signal lazily means a remount transparently
   * gets a live controller.
   */
  readonly getSignal: () => AbortSignal;
  /** Abort whatever is currently in flight (unmount only). */
  readonly abort: () => void;
}

const PublicationContext = createContext<PublicationContextValue | null>(null);

/** Build the app's default client from the environment. No host or port is hard-coded. */
export function createDefaultApiClient(): ApiClient {
  return new ApiClient({ baseUrl: resolveApiBaseUrl(import.meta.env) });
}

export function PublicationProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  const controllerRef = useRef<AbortController>(new AbortController());

  // One QueryClient per injected API client: swapping the client (tests, a different base URL)
  // gets a clean cache, with no cross-backend bleed.
  const value = useMemo<PublicationContextValue>(
    () => ({
      client: client ?? createDefaultApiClient(),
      query: new QueryClient(),
      getSignal: () => {
        // Replace a spent controller lazily. Child effects run BEFORE the parent's, so a
        // remount's first read reaches here before any parent effect could reinstall one.
        if (controllerRef.current.signal.aborted) controllerRef.current = new AbortController();
        return controllerRef.current.signal;
      },
      abort: () => controllerRef.current.abort(),
    }),
    [client],
  );

  useEffect(() => () => value.abort(), [value]);

  return <PublicationContext.Provider value={value}>{children}</PublicationContext.Provider>;
}

function usePublicationContext(): PublicationContextValue {
  const ctx = useContext(PublicationContext);
  if (!ctx) throw new Error('usePublishedMarket must be used inside <PublicationProvider>');
  return ctx;
}

/** The injected API client — for imperative flows that need it directly. */
export function usePublicationApiClient(): ApiClient {
  return usePublicationContext().client;
}

/** The four states the published-market screen renders. */
export type PublishedMarketStatus = 'loading' | 'success' | 'empty' | 'error';

export interface UsePublishedMarketResult {
  readonly status: PublishedMarketStatus;
  /** Present only when `status === 'success'`. */
  readonly market: PublishedMarket | undefined;
  /** Present only when `status === 'error'`; always a normalized `ApiError`. */
  readonly error: ApiError | undefined;
  /** True during a background refetch while previous data is still on screen. */
  readonly isFetching: boolean;
  /** Re-run the read without reloading the page. Does NOT trigger a backend rebuild. */
  readonly retry: () => void;
}

export interface UsePublishedMarketOptions {
  readonly horizon?: PublishedHorizon;
}

/**
 * Read the current published market.
 *
 * There is no demo fallback anywhere in this path: if the API fails, this reports an error and
 * the UI shows one. Substituting simulated players here would make an unreachable backend look
 * like a healthy market.
 */
export function usePublishedMarket(options: UsePublishedMarketOptions = {}): UsePublishedMarketResult {
  const horizon = options.horizon ?? 'weekly';
  const { client, query, getSignal } = usePublicationContext();
  const key = JSON.stringify(['publication', horizon]);

  const fetcher = useCallback(async (): Promise<PublicationResult> => {
    const signal = getSignal();
    try {
      const response = await fetchCurrentPublication(client, { signal });
      return { kind: 'market', market: adaptPublication(response, { horizon }) };
    } catch (err) {
      // 404 is the backend saying "nothing published yet" — a real answer, not a failure.
      if (isApiError(err) && err.kind === 'notFound') return { kind: 'empty' };
      // Tell apart the two things that both surface as "cancelled": OUR provider's lifetime
      // ending the read (this signal is the one that aborted) versus a request timeout (the
      // client's internal deadline fired, leaving this signal untouched). Only the former is
      // recoverable without asking the reader, and only the former is marked.
      if (isApiError(err) && err.kind === 'cancelled' && signal.aborted) {
        throw new ApiError('cancelled', 'the publication read was ended by the provider lifecycle', {
          code: LIFECYCLE_ABORT,
          cause: err,
        });
      }
      throw err;
    }
  }, [client, horizon, getSignal]);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const subscribe = useCallback((onChange: () => void) => query.subscribe(key, onChange), [query, key]);
  const getSnapshot = useCallback(() => query.getState(key), [query, key]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as QueryState<PublicationResult>;

  useEffect(() => {
    if (state.isFetching) return;
    // A settled error is terminal until the reader asks again. Without this the effect would
    // re-run on the error transition, see "never loaded", and refetch — turning an unreachable
    // API into a request storm. Recovery is the explicit retry below.
    //
    // The one exception is a read our own lifecycle ended: a remount (StrictMode in dev,
    // Suspense/offscreen in production) aborts the first attempt and then immediately mounts
    // again, and the reader must not be shown a "cancelled" screen for something the app did
    // to itself. This cannot loop — only an unmount aborts the lifetime, and after a real
    // unmount this effect no longer runs.
    if (state.status === 'error' && !isLifecycleAbort(state.error)) return;
    if (state.updatedAt === 0 || state.status === 'error') {
      void query.ensure(key, () => fetcherRef.current(), { force: state.status === 'error' });
    }
  }, [query, key, state]);

  const retry = useCallback(() => {
    void query.ensure(key, () => fetcherRef.current(), { force: true });
  }, [query, key]);

  const status: PublishedMarketStatus =
    state.status === 'error'
      ? 'error'
      : state.status === 'success'
        ? state.data?.kind === 'empty'
          ? 'empty'
          : 'success'
        : 'loading';

  return {
    status,
    market: state.data?.kind === 'market' ? state.data.market : undefined,
    error: normalizeError(state.error),
    isFetching: state.isFetching,
    retry,
  };
}

/** Anything that escaped as a non-`ApiError` still reaches the UI as one. */
function normalizeError(error: unknown): ApiError | undefined {
  if (error === undefined || error === null) return undefined;
  if (isApiError(error)) return error;
  return new ApiError('invalidResponse', 'the published market could not be read', { cause: error });
}
