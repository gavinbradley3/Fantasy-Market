// The frontend's model of the EXTERNAL dynasty market.
//
// Deliberately separate from `PublishedMarket`: that is PlayerTicker's own valuation of a
// player, this is somebody else's. Keeping them in different types is what stops a component
// from rendering one where it means the other, and what makes the attribution below
// impossible to drop — it is a required field on the only object that carries the quotes.

import type { MarketFormat, MarketSnapshot } from '@/market/types';

export interface MarketAttributionView {
  readonly publisher: string;
  readonly url: string;
  readonly licence: string;
  readonly derivedFrom: string | null;
  /** e.g. "weekly" — the ceiling on any movement window the UI may offer. */
  readonly refreshCadence: string;
  readonly usage: string;
}

export interface ExternalMarket {
  readonly source: string;
  readonly format: MarketFormat;
  readonly attribution: MarketAttributionView;
  /** Quotes keyed by canonical player id — the join key the board already uses. */
  readonly quotesByPlayerId: ReadonlyMap<string, MarketSnapshot>;
  /** The source's own stamp for the newest quote, or null when the market is empty. */
  readonly sourceTimestamp: string | null;
  readonly sourceVersion: string | null;
  /** How many captures are stored. Below 2 there is nothing to compute movement from. */
  readonly captureCount: number;
  readonly quoteCount: number;
  /**
   * Whether the market holds enough history to show ANY movement window. Exposed as a flag,
   * not left to each component to infer, so no screen can ship a "7-day change" built from a
   * single capture.
   */
  readonly movementAvailable: boolean;
}
