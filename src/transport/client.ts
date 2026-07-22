// Provider HTTP transport (Phase 5). The ONLY place a network `fetch` is issued. It
// constructs nothing from provider data — it takes an already-built request, applies a
// timeout + cancellation, enforces a maximum response size, validates status and
// content-type, classifies failures as retryable or terminal, and captures raw response
// bytes/text with metadata. It knows nothing of canonical players, identity, evidence,
// AIL families, or engines.

import type { Clock, Random, Sleep } from './clock';
import { realSleep, systemClock, systemRandom } from './clock';
import { redactUrl, TransportError } from './errors';
import { DEFAULT_RETRY_POLICY, isRetryableStatus, withRetry, type RetryPolicy } from './retry';
import type {
  ConditionalValidators,
  FetchOutcome,
  NotModifiedOutcome,
  PayloadEncoding,
  TransportOutcome,
  TransportRequest,
} from './types';

/** A minimal fetch surface (real global fetch satisfies it; tests inject a fake). */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  readonly fetchFn?: FetchFn;
  readonly clock?: Clock;
  readonly random?: Random;
  readonly sleep?: Sleep;
  readonly retryPolicy?: RetryPolicy;
  /** Default per-request timeout (ms) when the request does not override it. */
  readonly defaultTimeoutMs?: number;
  /** Default maximum response size (bytes) when the request does not override it. */
  readonly defaultMaxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024; // 32 MiB — the Sleeper players map is ~5 MiB.

/** True for content types whose bytes are text (stored utf8); others store as base64. */
function isTextLike(contentType: string | undefined): boolean {
  if (!contentType) return true; // assume text/JSON when unspecified
  const ct = contentType.toLowerCase();
  return (
    ct.includes('json') ||
    ct.startsWith('text/') ||
    ct.includes('csv') ||
    ct.includes('xml') ||
    ct.includes('x-www-form-urlencoded')
  );
}

export class HttpClient {
  private readonly fetchFn: FetchFn;
  private readonly clock: Clock;
  private readonly random: Random;
  private readonly sleep: Sleep;
  private readonly retryPolicy: RetryPolicy;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxBytes: number;

  constructor(opts: HttpClientOptions = {}) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.clock = opts.clock ?? systemClock;
    this.random = opts.random ?? systemRandom;
    this.sleep = opts.sleep ?? realSleep;
    this.retryPolicy = opts.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultMaxBytes = opts.defaultMaxBytes ?? DEFAULT_MAX_BYTES;
  }

  /**
   * Execute a request under the retry policy. Returns a raw FetchOutcome (2xx) or a
   * NotModifiedOutcome (304). All failures are typed TransportErrors; secrets never
   * appear in their messages. `externalSignal` lets a caller cancel the whole operation.
   */
  async execute(
    request: TransportRequest,
    conditional?: ConditionalValidators,
    externalSignal?: AbortSignal,
  ): Promise<TransportOutcome> {
    return withRetry(this.retryPolicy, this.random, this.sleep, () =>
      this.attempt(request, conditional, externalSignal),
    );
  }

  private async attempt(
    request: TransportRequest,
    conditional: ConditionalValidators | undefined,
    externalSignal: AbortSignal | undefined,
  ): Promise<TransportOutcome> {
    if (externalSignal?.aborted) {
      throw new TransportError('ABORTED', 'request aborted before dispatch', {
        retryable: false,
        stage: 'fetch',
        detail: redactUrl(request.url),
      });
    }

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const started = this.clock.monotonicMs();
    try {
      const headers = this.buildHeaders(request, conditional);
      let res: Response;
      try {
        res = await this.fetchFn(request.url, { method: request.method, headers, signal: controller.signal });
      } catch (err) {
        if (isAbortError(err)) {
          if (timedOut) {
            throw new TransportError('TIMEOUT', `request timed out after ${timeoutMs}ms`, {
              retryable: true,
              stage: 'fetch',
              detail: redactUrl(request.url),
            });
          }
          throw new TransportError('ABORTED', 'request aborted', {
            retryable: false,
            stage: 'fetch',
            detail: redactUrl(request.url),
          });
        }
        // A generic fetch throw is a transport/network failure — retryable.
        throw new TransportError('NETWORK', `network failure: ${(err as Error).message}`, {
          retryable: true,
          stage: 'fetch',
          detail: redactUrl(request.url),
        });
      }

      const elapsedMs = this.clock.monotonicMs() - started;

      if (res.status === 304) {
        const notModified: NotModifiedOutcome = { kind: 'notModified', httpStatus: 304, url: request.url, elapsedMs };
        return notModified;
      }

      if (!res.ok) {
        throw new TransportError('UNEXPECTED_STATUS', `unexpected HTTP status ${res.status}`, {
          retryable: isRetryableStatus(res.status),
          stage: 'fetch',
          detail: `${res.status} ${redactUrl(request.url)}`,
        });
      }

      const contentType = res.headers.get('content-type') ?? undefined;
      if (request.expectContentType && !contentTypeMatches(contentType, request.expectContentType)) {
        throw new TransportError('INVALID_CONTENT_TYPE', `expected content-type ${request.expectContentType}, got ${contentType ?? '<none>'}`, {
          retryable: false,
          stage: 'fetch',
          detail: redactUrl(request.url),
        });
      }

      const maxBytes = request.maxBytes ?? this.defaultMaxBytes;
      const bytes = await this.readBounded(res, maxBytes, request);
      const encoding: PayloadEncoding = isTextLike(contentType) ? 'utf8' : 'base64';
      const payload = encoding === 'utf8' ? new TextDecoder('utf-8').decode(bytes) : base64(bytes);

      const outcome: FetchOutcome = {
        kind: 'ok',
        httpStatus: res.status,
        ...(contentType !== undefined ? { contentType } : {}),
        ...(res.headers.get('etag') ? { etag: res.headers.get('etag')! } : {}),
        ...(res.headers.get('last-modified') ? { lastModified: res.headers.get('last-modified')! } : {}),
        payloadEncoding: encoding,
        payload,
        url: request.url,
        elapsedMs,
      };
      return outcome;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private buildHeaders(request: TransportRequest, conditional?: ConditionalValidators): Record<string, string> {
    const headers: Record<string, string> = { ...request.headers };
    if (conditional?.etag) headers['if-none-match'] = conditional.etag;
    if (conditional?.lastModified) headers['if-modified-since'] = conditional.lastModified;
    return headers;
  }

  /** Read the body enforcing a hard byte cap. Streams when possible so an oversized body
   *  is rejected without buffering it entirely. */
  private async readBounded(res: Response, maxBytes: number, request: TransportRequest): Promise<Uint8Array> {
    const declared = res.headers.get('content-length');
    if (declared && Number(declared) > maxBytes) {
      throw new TransportError('RESPONSE_TOO_LARGE', `declared content-length ${declared} exceeds limit ${maxBytes}`, {
        retryable: false,
        stage: 'fetch',
        detail: redactUrl(request.url),
      });
    }

    const body = res.body;
    if (body && typeof body.getReader === 'function') {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            throw new TransportError('RESPONSE_TOO_LARGE', `response body exceeded limit ${maxBytes} bytes`, {
              retryable: false,
              stage: 'fetch',
              detail: redactUrl(request.url),
            });
          }
          chunks.push(value);
        }
      }
      return concat(chunks, total);
    }

    // No stream available (some fake responses) — fall back to a buffered read + check.
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new TransportError('RESPONSE_TOO_LARGE', `response body exceeded limit ${maxBytes} bytes`, {
        retryable: false,
        stage: 'fetch',
        detail: redactUrl(request.url),
      });
    }
    return buf;
  }
}

function contentTypeMatches(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  return actual.toLowerCase().includes(expected.toLowerCase());
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function base64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  // eslint-disable-next-line no-undef
  return btoa(binary);
}
