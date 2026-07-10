// Minimal HTTP client for the Sleeper public API.
//
// ENDPOINTS USED (documented at https://docs.sleeper.com — read-only, no auth):
//   GET /v1/players/nfl
//       The full NFL player map, keyed by Sleeper player id. Sleeper's docs
//       instruct callers to fetch this AT MOST once per day — the provider's
//       24h cache enforces that.
//   GET /v1/players/nfl/trending/add?lookback_hours=24&limit=N
//   GET /v1/players/nfl/trending/drop?lookback_hours=24&limit=N
//       Trending adds/drops: [{ player_id, count }].
// No other endpoints are called and none are invented.
//
// Behaviour:
// - AbortController timeout per request.
// - Retries with exponential backoff on NETWORK errors and 5xx only — a 4xx
//   is a real answer and retrying it would just spam the API.
// - `navigator.onLine === false` short-circuits to an OfflineError without
//   touching the network (callers then serve cache).
// - All dependencies (fetch, delay, onLine) are injectable for tests.

export const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

export class SleeperHttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`Sleeper request failed with ${status}: ${url}`);
    this.name = 'SleeperHttpError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Browser is offline');
    this.name = 'OfflineError';
  }
}

export interface SleeperClientOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  /** Per-request timeout. The players payload is ~5MB — give it room. */
  timeoutMs?: number;
  /** Extra attempts after the first failure (network/5xx only). */
  retries?: number;
  /** Backoff schedule base; attempt n waits base * 3^n ms. */
  backoffBaseMs?: number;
  isOnline?: () => boolean;
  delay?: (ms: number) => Promise<void>;
}

const defaultDelay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const defaultIsOnline = () =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

export class SleeperClient {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly backoffBaseMs: number;
  private readonly isOnline: () => boolean;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(opts: SleeperClientOptions = {}) {
    this.fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
    this.baseUrl = opts.baseUrl ?? SLEEPER_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.retries = opts.retries ?? 2;
    this.backoffBaseMs = opts.backoffBaseMs ?? 500;
    this.isOnline = opts.isOnline ?? defaultIsOnline;
    this.delay = opts.delay ?? defaultDelay;
  }

  /** GET a JSON resource. Resolves `unknown` — callers MUST schema-validate. */
  async getJson(path: string): Promise<unknown> {
    if (!this.isOnline()) throw new OfflineError();
    const url = `${this.baseUrl}${path}`;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.delay(this.backoffBaseMs * 3 ** (attempt - 1));
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          const res = await this.fetchFn(url, {
            signal: controller.signal,
            headers: { accept: 'application/json' },
          });
          if (!res.ok) {
            const err = new SleeperHttpError(res.status, url);
            if (res.status >= 500) {
              lastError = err;
              continue; // retryable
            }
            throw err; // 4xx: a real answer, do not retry
          }
          return (await res.json()) as unknown;
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (err instanceof SleeperHttpError) throw err; // non-retryable 4xx
        // AbortError (timeout) and TypeError (network failure) are retryable.
        lastError = err;
      }
    }
    throw lastError;
  }

  getAllPlayers(): Promise<unknown> {
    return this.getJson('/players/nfl');
  }

  getTrending(kind: 'add' | 'drop', lookbackHours = 24, limit = 200): Promise<unknown> {
    return this.getJson(
      `/players/nfl/trending/${kind}?lookback_hours=${lookbackHours}&limit=${limit}`,
    );
  }
}
