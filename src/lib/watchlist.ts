// Since-added computations for the watchlist (§25.1). Price-at-add is captured
// in the format active at add time; if the user has since switched formats, we
// surface a notice rather than silently recomputing the baseline.

import { marketData } from '@/services/marketData/mock/MockMarketDataService';
import type { FormatKey, PlayerRow, WatchlistItem } from '@/types/market';

export interface WatchlistEntry {
  item: WatchlistItem;
  row: PlayerRow;
  delta: number;
  deltaPct: number;
  formatMismatch: boolean;
}

export function buildWatchlistEntries(
  items: WatchlistItem[],
  format: FormatKey,
): WatchlistEntry[] {
  const rows = marketData.getRowsByIds(
    items.map((i) => i.playerId),
    format,
  );
  const byId = new Map(rows.map((r) => [r.player.identity.internal_id, r]));
  const entries: WatchlistEntry[] = [];
  for (const item of items) {
    const row = byId.get(item.playerId);
    if (!row) continue;
    const current = row.snapshot.marketPrice;
    const delta = Math.round((current - item.priceAtAdd) * 10) / 10;
    const deltaPct = item.priceAtAdd ? Math.round((delta / item.priceAtAdd) * 1000) / 10 : 0;
    entries.push({
      item,
      row,
      delta,
      deltaPct,
      formatMismatch: item.formatAtAdd !== format,
    });
  }
  return entries;
}
