// Domain query hooks — the stable boundary between pages and the data door.
// Pages never call the service directly for reads; they use these hooks and
// get caching, dedup, loading/error states, and stale-response protection
// from the query layer for free.

import { useMarketQuery, type UseQueryResult } from '@/services/marketData/MarketDataProvider';
import type {
  FormatPrice,
  HistoryRange,
  MarketStatus,
  MoverGroups,
  SearchResult,
} from '@/services/marketData/types';
import type {
  FormatKey,
  PlayerDetail,
  PlayerMarketHistoryPoint,
  PlayerRow,
} from '@/types/market';

// Mock data only changes at the daily tick, but a live service updates more
// often — a modest stale window keeps long-lived sessions honest without
// hammering recomputation (ensure() dedups and the dataset builder memoizes).
const STALE_MS = 5 * 60_000;

export function useMarketStatus(): UseQueryResult<MarketStatus> & { data: MarketStatus | undefined } {
  const q = useMarketQuery(['market-status'], (svc) => svc.getMarketStatus(), {
    staleTimeMs: STALE_MS,
  });
  if (q.status === 'error') {
    // Synthesize an honest "unavailable" status so the banner and freshness
    // surfaces degrade loudly instead of silently vanishing (§32).
    const unavailable: MarketStatus = {
      mode: 'unavailable',
      marketDate: '',
      lastUpdated: '',
      notice: 'Market data is currently unavailable. Values may be missing or out of date.',
      sources: [],
    };
    return { ...q, data: unavailable };
  }
  return q;
}

export function useBoard(format: FormatKey): UseQueryResult<PlayerRow[]> {
  return useMarketQuery(['board', format], (svc) => svc.getBoard(format), {
    staleTimeMs: STALE_MS,
  });
}

export function useMovers(format: FormatKey): UseQueryResult<MoverGroups> {
  return useMarketQuery(['movers', format], (svc) => svc.getMovers(format), {
    staleTimeMs: STALE_MS,
  });
}

export function usePlayer(
  ticker: string | undefined,
  format: FormatKey,
): UseQueryResult<PlayerDetail | undefined> {
  return useMarketQuery(
    ticker ? ['player', ticker.toUpperCase(), format] : null,
    (svc) => svc.getPlayer(ticker!, format),
    { staleTimeMs: STALE_MS },
  );
}

export function usePlayerHistory(
  ticker: string | undefined,
  format: FormatKey,
  range: HistoryRange,
): UseQueryResult<PlayerMarketHistoryPoint[]> {
  return useMarketQuery(
    ticker ? ['history', ticker.toUpperCase(), format, range] : null,
    (svc) => svc.getHistory(ticker!, format, range),
    { staleTimeMs: STALE_MS },
  );
}

export function useFormatComparison(
  ticker: string | undefined,
): UseQueryResult<FormatPrice[]> {
  return useMarketQuery(
    ticker ? ['format-comparison', ticker.toUpperCase()] : null,
    (svc) => svc.getFormatComparison(ticker!),
    { staleTimeMs: STALE_MS },
  );
}

export function useRowsByIds(ids: string[], format: FormatKey): UseQueryResult<PlayerRow[]> {
  // ids participate in the key so watchlist/portfolio edits refetch naturally.
  return useMarketQuery(
    ['rows', format, ids.join(',')],
    (svc) => svc.getRowsByIds(ids, format),
    { staleTimeMs: STALE_MS },
  );
}

export function useMarketSearch(query: string, limit = 8): UseQueryResult<SearchResult[]> {
  const q = query.trim();
  return useMarketQuery(q ? ['search', q.toLowerCase(), limit] : null, (svc) =>
    svc.search(q, limit),
  );
}
