// Normalized client-side failures for the PlayerTicker API (Phase 10).
//
// Every way a read can fail — DNS/offline, an HTTP status, a body that is not JSON, a body
// that is JSON but the wrong shape, an aborted request — arrives at the UI as ONE error type
// with a stable `kind`. The UI switches on `kind`; it never inspects statuses, `TypeError`
// instances, or parser messages, and it never renders `message` (which is developer-facing).
// User-facing copy lives with the components, keyed off `kind`.

export type ApiErrorKind =
  /** The request never got a response: offline, DNS failure, refused connection, CORS block. */
  | 'network'
  /** The caller aborted (component unmounted, a newer request replaced this one, timeout). */
  | 'cancelled'
  /** 400 — the request itself was rejected as malformed. */
  | 'badRequest'
  /** 404 — the resource does not exist. For `/publication` this means "nothing published yet". */
  | 'notFound'
  /** 503 — the backend is up but a dependency (persistence) is unavailable. */
  | 'unavailable'
  /** Any other non-2xx status, including 5xx. */
  | 'server'
  /** A 2xx response whose body was not JSON, or whose JSON did not match the contract. */
  | 'invalidResponse';

export interface ApiErrorOptions {
  readonly status?: number;
  /** The `error.code` the API sent, when it sent an envelope. */
  readonly code?: string;
  readonly cause?: unknown;
}

/**
 * The only error this client rejects with. Developer-facing detail (`message`, `status`,
 * `code`, `cause`) is retained for logs and tests; the UI uses `kind` alone.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  /** Declared explicitly: the app compiles against ES2020, whose `Error` has no `cause`. */
  cause?: unknown;

  constructor(kind: ApiErrorKind, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /** True for failures a plain retry could plausibly clear. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'server' || this.kind === 'unavailable';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Was this thrown by an `AbortSignal` firing (fetch rejects with an AbortError DOMException)? */
export function isAbortError(value: unknown): boolean {
  if (value instanceof ApiError) return value.kind === 'cancelled';
  return typeof value === 'object' && value !== null && (value as { name?: unknown }).name === 'AbortError';
}

/** Map an HTTP status onto the kind the UI switches on. */
export function kindForStatus(status: number): ApiErrorKind {
  if (status === 400) return 'badRequest';
  if (status === 404) return 'notFound';
  if (status === 503) return 'unavailable';
  return 'server';
}
