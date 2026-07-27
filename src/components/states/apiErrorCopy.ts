// User-facing copy for API failures (Phase 10).
//
// The client normalizes every failure to an `ApiErrorKind`; this is the single place that turns
// a kind into words a reader can act on. Deliberately kept away from the client so that raw
// developer detail — `message`, `status`, `code`, `cause`, class names, stack traces, database
// or persistence internals — has no path to the screen.

import type { ApiError, ApiErrorKind } from '@/services/api';

export interface ApiErrorCopy {
  readonly message: string;
  readonly detail: string;
  /** False when retrying cannot help (a malformed request, an unusable payload). */
  readonly retryable: boolean;
}

const COPY: Record<ApiErrorKind, ApiErrorCopy> = {
  network: {
    message: "We couldn't reach the market service.",
    detail: 'Check your connection and try again.',
    retryable: true,
  },
  cancelled: {
    message: 'That request was cancelled before it finished.',
    detail: 'Try again to load the current market.',
    retryable: true,
  },
  badRequest: {
    message: "The market service couldn't understand that request.",
    detail: 'Reloading the page usually clears this.',
    retryable: false,
  },
  notFound: {
    message: 'No market publication is available yet.',
    detail: 'The service is reachable — it just has nothing published.',
    retryable: true,
  },
  unavailable: {
    message: 'The market service is temporarily unavailable.',
    detail: "It's reachable but not ready to serve data right now.",
    retryable: true,
  },
  server: {
    message: 'The market service had a problem answering.',
    detail: 'Nothing is wrong on your side. Try again in a moment.',
    retryable: true,
  },
  invalidResponse: {
    message: "The market service returned something we couldn't read.",
    detail: 'No values are shown rather than incorrect ones.',
    retryable: false,
  },
};

export function apiErrorCopy(error: ApiError | undefined): ApiErrorCopy {
  if (!error) return COPY.server;
  return COPY[error.kind] ?? COPY.server;
}
