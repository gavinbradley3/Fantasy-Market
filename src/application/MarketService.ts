// MarketService (production market integration). Read-only access to EXTERNAL dynasty market
// snapshots held by persistence.
//
// It delegates entirely — it does not fetch, does not rank, does not compare, and above all
// does not blend a market value into a PlayerTicker valuation. Its whole job is to hand back
// what an external source published, with the attribution still attached.
//
// FORMAT IS NEVER INFERRED. A Superflex value and a 1QB value are different numbers for the
// same player, so the format is an explicit argument with an explicit default (Superflex, the
// primary lens) rather than something derived from context.

import { ApplicationError, underlyingCode } from './errors';
import type { MarketReadPort } from './types';
import type { MarketFormat, MarketSnapshot } from '@/market/types';

/** The primary comparison lens. Stated once, here, so no caller has to assume it. */
export const DEFAULT_MARKET_FORMAT: MarketFormat = 'dynasty_superflex';
/** The only external source wired today; the port is source-keyed so adding one is data. */
export const DEFAULT_MARKET_SOURCE = 'dynastyprocess';

const FORMATS: readonly MarketFormat[] = ['dynasty_superflex', 'dynasty_1qb'];

export function isMarketFormat(value: string): value is MarketFormat {
  return (FORMATS as readonly string[]).includes(value);
}

export class MarketService {
  constructor(private readonly store: MarketReadPort) {}

  private guard<T>(op: string, fn: () => T): T {
    try {
      return fn();
    } catch (err) {
      throw new ApplicationError('PERSISTENCE_UNAVAILABLE', `market read failed: ${op}`, {
        cause: err,
        detail: underlyingCode(err),
      });
    }
  }

  /**
   * The latest quote per player for one source/format, best rank first.
   *
   * An EMPTY result is a legitimate answer — no ingest has run yet — and is returned as an
   * empty list rather than an error, so a caller can say "no market data" instead of
   * "market broken".
   */
  latest(source: string = DEFAULT_MARKET_SOURCE, format: MarketFormat = DEFAULT_MARKET_FORMAT): MarketSnapshot[] {
    return this.guard('latest', () => this.store.getLatestMarketSnapshots(source, format));
  }

  /** One player's full series, oldest first — the basis for any movement window. */
  history(
    canonicalPlayerId: string,
    source: string = DEFAULT_MARKET_SOURCE,
    format: MarketFormat = DEFAULT_MARKET_FORMAT,
  ): MarketSnapshot[] {
    if (!canonicalPlayerId) throw new ApplicationError('INVALID_ARGUMENT', 'canonicalPlayerId is required');
    return this.guard('history', () => this.store.getMarketSnapshotHistory(canonicalPlayerId, source, format));
  }

  /**
   * How many distinct captures are held, and when.
   *
   * Consumers need this before offering any movement window: with one capture stored there is
   * nothing to compare against, and a "7-day change" computed from a single snapshot would be
   * a fabrication rather than a measurement.
   */
  captureInstants(source: string = DEFAULT_MARKET_SOURCE, format: MarketFormat = DEFAULT_MARKET_FORMAT): string[] {
    return this.guard('captureInstants', () => this.store.getMarketCaptureInstants(source, format));
  }

  /** Which (source, format) pairs hold data at all. */
  sources(): { source: string; format: MarketFormat }[] {
    return this.guard('sources', () => this.store.getMarketSources());
  }
}
