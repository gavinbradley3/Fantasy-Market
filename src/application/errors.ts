// Application-layer errors (Phase 8). The service layer normalizes failures into a small,
// stable set of codes so future API/CLI callers get a consistent contract. It NEVER rewrites
// or masks the underlying persistence/scheduler error codes — the original code is preserved
// on `cause` for diagnostics — and it never embeds provider payloads in messages.

export type ApplicationErrorCode =
  | 'INVALID_ARGUMENT' // a caller passed a missing/empty required argument
  | 'NOT_FOUND' // a requested run/publication does not exist
  | 'PERSISTENCE_UNAVAILABLE' // a read port threw (DB closed, integrity failure, etc.)
  | 'REFRESH_DISPATCH_FAILED'; // dispatching a refresh to the scheduler threw unexpectedly

export interface ApplicationErrorContext {
  /** The original low-level error code (e.g. a PersistenceError code), preserved unchanged. */
  readonly cause?: unknown;
  readonly detail?: string;
}

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly detail?: string;
  readonly cause?: unknown;

  constructor(code: ApplicationErrorCode, message: string, context: ApplicationErrorContext = {}) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.detail = context.detail;
    this.cause = context.cause;
  }
}

/** Read the duck-typed `code` off an unknown error (e.g. a preserved PersistenceError). */
export function underlyingCode(err: unknown): string | undefined {
  const c = (err as { code?: unknown } | null | undefined)?.code;
  return typeof c === 'string' ? c : undefined;
}
