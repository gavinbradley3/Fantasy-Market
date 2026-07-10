// The MarketDataService interface — "the only door" (§29.3, §40.3). The UI
// consumes this contract via MarketDataProvider/useMarketDataService; it never
// imports a concrete implementation. Swapping MockMarketDataService for a
// LiveMarketDataService is a composition-root change, not a UI change.
//
// EVERY data-retrieval method is asynchronous. A live implementation will hit
// the network or a KV/D1 store; a contract that mixed sync and async methods
// would leak the mock's in-memory nature into every consumer. The mock resolves
// in a microtask but flows through the exact same Promise-based path.

import type {
  DataMode,
  DataSourceStatus,
  FormatKey,
  PlayerDetail,
  PlayerMarketHistoryPoint,
  PlayerRow,
  Position,
} from '@/types/market';

export type HistoryRange = '7d' | '30d' | 'season' | 'all';

export interface MoverGroups {
  risers: PlayerRow[];
  fallers: PlayerRow[];
  buyLow: PlayerRow[];
  sellHigh: PlayerRow[];
  overheated: PlayerRow[];
  blueChips: PlayerRow[];
  rookieIpos: PlayerRow[];
  mostVolatile: PlayerRow[];
  mostStable: PlayerRow[];
}

export interface SearchResult {
  ticker: string;
  name: string;
  position: Position;
  team: string;
}

export interface FormatPrice {
  format: FormatKey;
  label: string;
  marketPrice: number;
  fundamentalValue: number;
  mispricing: number;
}

// Service-reported market status — drives the structural honesty layer (§32,
// §40.6). The DataModeBanner renders from THIS, never from a hardcoded prop,
// so flipping a source to live (or losing a source) reflows the banner
// automatically. 'unavailable' is a client-side synthesis for when the status
// call itself fails.
export interface MarketStatus {
  mode: DataMode | 'unavailable';
  /** ISO date of the current market close ("today" in market terms). */
  marketDate: string;
  /** ISO timestamp of the last successful market update. */
  lastUpdated: string;
  /** Human-readable banner notice for non-live modes. */
  notice: string;
  /** Per-source provenance, rendered on the Methodology page. */
  sources: DataSourceStatus[];
}

export interface MarketDataService {
  /** Market mode, close date, freshness, and per-source provenance. */
  getMarketStatus(): Promise<MarketStatus>;
  /** Full board for a format (already row-shaped with sparklines). */
  getBoard(format: FormatKey): Promise<PlayerRow[]>;
  /** One player's full detail for the Stock Card; undefined if unknown. */
  getPlayer(ticker: string, format: FormatKey): Promise<PlayerDetail | undefined>;
  /** Dashboard mover groups. */
  getMovers(format: FormatKey): Promise<MoverGroups>;
  /** History points for a range. */
  getHistory(
    ticker: string,
    format: FormatKey,
    range: HistoryRange,
  ): Promise<PlayerMarketHistoryPoint[]>;
  /** The same player's price across all shipped formats (format notes table). */
  getFormatComparison(ticker: string): Promise<FormatPrice[]>;
  /** Lightweight rows by canonical player id (watchlist / portfolio). */
  getRowsByIds(ids: string[], format: FormatKey): Promise<PlayerRow[]>;
  /** Current market price for a player id in a format; undefined if unknown. */
  getPriceById(id: string, format: FormatKey): Promise<number | undefined>;
  /** Fuzzy search by name or ticker. */
  search(query: string, limit?: number): Promise<SearchResult[]>;
}
