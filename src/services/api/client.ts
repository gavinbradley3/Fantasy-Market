// The browser-side HTTP client for the PlayerTicker internal API (Phase 10).
//
// Deliberately tiny and dependency-free: `fetch`, a base URL, JSON, and one normalized error
// type. It contains NO React (no hooks, no components) and NO Node imports, so it is usable
// from a component, a store, a worker, or a test with equal ease.
//
// Everything it can do is a READ. There is no method here that triggers a backend market
// rebuild: refreshing what the browser is showing and re-running the pipeline are different
// actions, and only the former belongs to the app's normal users.

import { ApiError, kindForStatus } from './errors';

/** Milliseconds before an in-flight request is aborted as a timeout. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiClientConfig {
  /**
   * Base URL every request is resolved against. Absolute (`https://api.example.com`) for a
   * cross-origin backend, or a path prefix (`/api`) to go through a same-origin proxy.
   * Trailing slashes are normalized away, so `".../api/"` and `".../api"` behave identically.
   */
  readonly baseUrl?: string;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface RequestOptions {
  /** Caller-owned cancellation — pass the signal of the component/effect that owns the read. */
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Strip trailing slashes so `join(base, '/publication')` can never produce a `//`. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** Join a normalized base with a leading-slash path. An empty base means same-origin. */
export function joinUrl(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * Resolve the API base URL from the environment.
 *
 * `VITE_PLAYERTICKER_API_URL` is the single knob, and it is the only one production code
 * consults. When it is unset:
 *   • in development the client targets `/api`, which `vite.config.ts` proxies to the local
 *     API server — same-origin from the browser's point of view, so no CORS is involved;
 *   • in a production build it targets the empty base, i.e. the origin serving the app.
 * No host or port is ever hard-coded here.
 */
export function resolveApiBaseUrl(env: { VITE_PLAYERTICKER_API_URL?: string; DEV?: boolean } = {}): string {
  const configured = env.VITE_PLAYERTICKER_API_URL;
  if (typeof configured === 'string' && configured.trim() !== '') return normalizeBaseUrl(configured.trim());
  return env.DEV ? '/api' : '';
}

/**
 * Bridge a caller's `AbortSignal` and a timeout into one controller.
 * (`AbortSignal.any` is not available everywhere this runs, so the wiring is explicit.)
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

function isAbortLike(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

/**
 * A typed JSON reader over one API. Every failure mode leaves through `ApiError`; nothing
 * else escapes, so callers never have to know what `fetch` rejects with.
 */
export class ApiClient {
  readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
    // Bound so a destructured global `fetch` keeps its `this` in every environment.
    this.fetchFn = config.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  url(path: string): string {
    return joinUrl(this.baseUrl, path);
  }

  /** GET `path` and parse the body as `T`. Rejects with `ApiError` for every failure. */
  async getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.url(path);
    const { signal, done } = withTimeout(options.signal, options.timeoutMs ?? this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal,
      });
    } catch (err) {
      // An abort is the caller's own doing (unmount, replacement, timeout) — never an outage.
      if (isAbortLike(err) || signal.aborted) {
        throw new ApiError('cancelled', `GET ${url} was cancelled`, { cause: err });
      }
      throw new ApiError('network', `GET ${url} could not reach the API`, { cause: err });
    } finally {
      done();
    }

    const raw = await this.readBody(response, url);

    if (!response.ok) {
      const envelope = asErrorEnvelope(raw);
      throw new ApiError(kindForStatus(response.status), envelope?.message ?? `GET ${url} failed with ${response.status}`, {
        status: response.status,
        code: envelope?.code,
      });
    }

    if (raw === undefined) {
      throw new ApiError('invalidResponse', `GET ${url} returned an empty body`, { status: response.status });
    }
    return raw as T;
  }

  /** Read + JSON-parse a body. Returns `undefined` for an empty body. */
  private async readBody(response: Response, url: string): Promise<unknown> {
    let text: string;
    try {
      text = await response.text();
    } catch (err) {
      throw new ApiError('network', `GET ${url} response could not be read`, {
        status: response.status,
        cause: err,
      });
    }
    if (text.trim() === '') return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      // A malformed body is never surfaced as a status problem — the request "succeeded" and
      // the payload is still unusable, which is exactly `invalidResponse`.
      throw new ApiError('invalidResponse', `GET ${url} returned a body that is not valid JSON`, {
        status: response.status,
        cause: err,
      });
    }
  }
}

/** Read the API's uniform `{ error: { code, message } }` envelope, if that is what arrived. */
function asErrorEnvelope(body: unknown): { code: string; message: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string') return null;
  return { code, message: typeof message === 'string' ? message : code };
}
