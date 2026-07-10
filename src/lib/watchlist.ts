// Since-added computations for the watchlist (§25.1) — a PURE combiner.
// Rows arrive from the useRowsByIds query hook; this module has no service
// dependency, so it works identically for any injected implementation.
// Price-at-add is captured in the format active at add time; a mismatch with
// the current format is surfaced (formatMismatch) rather than silently
// recomputing the baseline.

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
  rows: PlayerRow[],
  format: FormatKey,
): WatchlistEntry[] {
  const byId = new Map(rows.map((r) => [r.player.identity.internal_id, r]));
  const entries: WatchlistEntry[] = [];
  for (const item of items) {
    const row = byId.get(item.playerId);
    if (!row) continue; // row not in this batch (unknown ids never persist)
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
