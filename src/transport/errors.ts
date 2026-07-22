// Typed transport/ingestion error model (Phase 5). Every failure crossing the transport
// boundary is one of these — no raw provider exception, and no secret, escapes. Each
// error preserves provider, capability, request key, retryability, and the pipeline
// STAGE at which it occurred, plus a redaction-safe diagnostic context.

import type { IngestionProvider, ProviderCapability, SafeErrorInfo } from './types';

/** Every distinct, typed failure the transport/refresh path can produce. */
export type TransportErrorCode =
  | 'UNSUPPORTED_PROVIDER'
  | 'UNSUPPORTED_CAPABILITY'
  | 'INVALID_CONFIG'
  | 'DUPLICATE_REFRESH_REQUEST'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'NETWORK'
  | 'RESPONSE_TOO_LARGE'
  | 'UNEXPECTED_STATUS'
  | 'INVALID_CONTENT_TYPE'
  | 'DECODE_FAILURE'
  | 'CHECKSUM_MISMATCH'
  | 'MISSING_REPLAY_PAYLOAD'
  | 'INVALID_REVALIDATION'
  | 'ADAPTER_FAILURE'
  | 'INGESTION_FAILURE';

/** The stage of the refresh pipeline at which a failure occurred (diagnostic only). */
export type TransportStage =
  | 'config'
  | 'request'
  | 'fetch'
  | 'revalidate'
  | 'envelope'
  | 'store'
  | 'replay'
  | 'decode'
  | 'adapter'
  | 'ingest';

export interface TransportErrorContext {
  readonly provider?: IngestionProvider;
  readonly capability?: ProviderCapability;
  readonly requestKey?: string;
  readonly retryable?: boolean;
  readonly stage?: TransportStage;
  /** Only redaction-safe values belong here — never headers, tokens, or full auth URLs. */
  readonly detail?: string;
}

/**
 * Secrets that must never surface in a diagnostic. Query-string values for these keys
 * and any Authorization/API-key header value are stripped before an error is built.
 */
const SECRET_QUERY_KEYS = ['key', 'apikey', 'api_key', 'token', 'access_token', 'auth', 'secret', 'password'];

/** Redact a URL to origin + path only, dropping the entire query string (may hold auth). */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    // Drop the query string wholesale; even "safe" params can carry tokens.
    return `${u.origin}${u.pathname}`;
  } catch {
    // Not a parseable URL — strip anything after a "?" defensively.
    const q = url.indexOf('?');
    return q >= 0 ? url.slice(0, q) : url;
  }
}

/** Redact secret query parameters in a string while preserving the rest for diagnostics. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const key of SECRET_QUERY_KEYS) {
    // key=VALUE (query or header-ish) → key=***
    out = out.replace(new RegExp(`([?&#\\s;]${key}=)[^&#\\s;]+`, 'gi'), `$1***`);
  }
  return out;
}

export class TransportError extends Error {
  readonly code: TransportErrorCode;
  readonly provider?: IngestionProvider;
  readonly capability?: ProviderCapability;
  readonly requestKey?: string;
  readonly retryable: boolean;
  readonly stage: TransportStage;
  readonly detail?: string;

  constructor(code: TransportErrorCode, message: string, context: TransportErrorContext = {}) {
    // The message itself is redacted so a thrown/logged error never carries a secret.
    super(redactSecrets(message));
    this.name = 'TransportError';
    this.code = code;
    this.provider = context.provider;
    this.capability = context.capability;
    this.requestKey = context.requestKey;
    this.retryable = context.retryable ?? false;
    this.stage = context.stage ?? 'fetch';
    this.detail = context.detail ? redactSecrets(context.detail) : undefined;
  }

  /** A redaction-safe projection for operational summaries. */
  toSafeInfo(): SafeErrorInfo {
    return { code: this.code, stage: this.stage, retryable: this.retryable, message: this.message };
  }
}

/** Narrow an unknown thrown value into a TransportError, tagging stage/context. */
export function asTransportError(
  err: unknown,
  fallbackCode: TransportErrorCode,
  context: TransportErrorContext,
): TransportError {
  if (err instanceof TransportError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new TransportError(fallbackCode, message, context);
}
