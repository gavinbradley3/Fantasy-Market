// Retry classification + deterministic backoff (Phase 7).
//
// The scheduler retries ONLY failures explicitly classified as retryable (a thrown error
// carrying `retryable === true`, e.g. a transient `TransportError`). It NEVER retries
// deterministic failures: transport validation, conflicting persistence retries, artifact
// conflicts, invalid publication, or integrity failures. Those codes are always terminal,
// even if some upstream flag disagreed. Backoff is deterministic (jitter derived from the
// run id), so a given run's retry schedule is reproducible — never `Math.random()`.

/** Error codes that are ALWAYS terminal — never retried, regardless of any retryable flag. */
export const NON_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  // persistence (audited)
  'CONFLICTING_ARTIFACT',
  'INVALID_ARTIFACT_SET',
  'PUBLICATION_NOT_ALLOWED',
  'INTEGRITY_VIOLATION',
  'CHECKSUM_MISMATCH',
  'UNSUPPORTED_PERSISTED_SCHEMA',
  'UNSUPPORTED_DATABASE_VERSION',
  'MIGRATION_FAILURE',
  'ARTIFACT_NOT_FOUND',
  // transport (deterministic validation)
  'DUPLICATE_REFRESH_REQUEST',
  'INVALID_CONFIG',
]);

/** Read a duck-typed string `code` off an unknown error without importing concrete classes. */
export function errorCode(err: unknown): string | undefined {
  const c = (err as { code?: unknown } | null | undefined)?.code;
  return typeof c === 'string' ? c : undefined;
}

/** A safe, redaction-free message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'unknown error';
}

/**
 * Retry only when the error is explicitly retryable AND its code is not on the terminal set.
 * Default is NON-retryable, so an unclassified failure is surfaced rather than looped.
 */
export function isRetryableError(err: unknown): boolean {
  const code = errorCode(err);
  if (code && NON_RETRYABLE_CODES.has(code)) return false;
  const retryable = (err as { retryable?: unknown } | null | undefined)?.retryable;
  return retryable === true;
}

export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  /** Fraction of the base delay added as deterministic jitter (0 = none). */
  readonly jitterRatio: number;
}

/** Deterministic unit value in [0, 1) derived from a string (FNV-1a; no RNG, no time). */
export function deterministicUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** Exponential backoff for `attempt` (1-based) with deterministic run-id jitter, capped at maxMs. */
export function computeBackoffMs(runId: string, attempt: number, opts: BackoffOptions): number {
  const exponential = opts.baseMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(opts.maxMs, exponential);
  const jitter = capped * opts.jitterRatio * deterministicUnit(`${runId}:${attempt}`);
  return Math.round(Math.min(opts.maxMs, capped + jitter));
}
