// The MarketDataService interface — "the only door" (§29.3, §40.3). The UI
// imports this interface, never the mock internals. Swapping MockMarketDataService
// for a future LiveMarketDataService must require zero UI changes (§14.4).

import type {
  DataSourceStatus,
  FormatKey,
  PlayerDetail,
  PlayerMarketHistoryPoint,
  PlayerRow,
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
  position: string;
  team: string;
}

export interface FormatPrice {
  format: FormatKey;
  label: string;
  marketPrice: number;
  fundamentalValue: number;
  mispricing: number;
}

export interface MarketDataService {
  /** ISO date of the current market close ("today"). */
  getMarketDate(): string;
  /** Full board for a format (already row-shaped with sparklines). */
  getBoard(format: FormatKey): PlayerRow[];
  /** One player's full detail for the Stock Card, or undefined if unknown. */
  getPlayer(ticker: string, format: FormatKey): PlayerDetail | undefined;
  /** Dashboard mover groups. */
  getMovers(format: FormatKey): MoverGroups;
  /** History points for a range. */
  getHistory(ticker: string, format: FormatKey, range: HistoryRange): PlayerMarketHistoryPoint[];
  /** The same player's price across all shipped formats (for format notes). */
  getFormatComparison(ticker: string): FormatPrice[];
  /** Lightweight rows by internal id (for watchlist / portfolio). */
  getRowsByIds(ids: string[], format: FormatKey): PlayerRow[];
  /** Current market price for a player id in a format (watchlist deltas). */
  getPriceById(id: string, format: FormatKey): number | undefined;
  /** Fuzzy search by name or ticker. */
  search(query: string, limit?: number): SearchResult[];
  /** Data-source provenance for the Methodology / status panel. */
  getSourceStatus(): DataSourceStatus[];
}
