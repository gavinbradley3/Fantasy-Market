// Thin global store (Zustand) for the only cross-cutting client state in the MVP:
// active format, watchlist, and portfolio (§29.1). No server state lives here.

import { create } from 'zustand';
import { DEFAULT_FORMAT, FORMAT_KEYS } from '@/config/market';
import {
  FORMAT_KEY,
  PORTFOLIO_KEY,
  WATCHLIST_KEY,
  loadJSON,
  loadString,
  saveJSON,
  saveString,
} from '@/services/storage/storage';
import { marketData } from '@/services/marketData/mock/MockMarketDataService';
import type { FormatKey, PortfolioHolding, WatchlistItem } from '@/types/market';

function initialFormat(): FormatKey {
  const stored = loadString(FORMAT_KEY) as FormatKey | null;
  return stored && FORMAT_KEYS.includes(stored) ? stored : DEFAULT_FORMAT;
}

interface AppState {
  format: FormatKey;
  watchlist: WatchlistItem[];
  portfolio: PortfolioHolding[];

  setFormat: (f: FormatKey) => void;

  isWatched: (playerId: string) => boolean;
  toggleWatch: (playerId: string) => void;

  inPortfolio: (playerId: string) => boolean;
  togglePortfolio: (playerId: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  format: initialFormat(),
  watchlist: loadJSON<WatchlistItem[]>(WATCHLIST_KEY, []),
  portfolio: loadJSON<PortfolioHolding[]>(PORTFOLIO_KEY, []),

  setFormat: (f) => {
    saveString(FORMAT_KEY, f);
    set({ format: f });
  },

  isWatched: (playerId) => get().watchlist.some((w) => w.playerId === playerId),

  toggleWatch: (playerId) => {
    const { watchlist, format } = get();
    const exists = watchlist.some((w) => w.playerId === playerId);
    let next: WatchlistItem[];
    if (exists) {
      next = watchlist.filter((w) => w.playerId !== playerId);
    } else {
      const priceAtAdd = marketData.getPriceById(playerId, format) ?? 0;
      next = [
        ...watchlist,
        { playerId, addedAt: new Date().toISOString(), priceAtAdd, formatAtAdd: format },
      ];
    }
    saveJSON(WATCHLIST_KEY, next);
    set({ watchlist: next });
  },

  inPortfolio: (playerId) => get().portfolio.some((h) => h.playerId === playerId),

  togglePortfolio: (playerId) => {
    const { portfolio, format } = get();
    const exists = portfolio.some((h) => h.playerId === playerId);
    let next: PortfolioHolding[];
    if (exists) {
      next = portfolio.filter((h) => h.playerId !== playerId);
    } else {
      const priceAtAdd = marketData.getPriceById(playerId, format) ?? 0;
      next = [...portfolio, { playerId, addedAt: new Date().toISOString(), priceAtAdd }];
    }
    saveJSON(PORTFOLIO_KEY, next);
    set({ portfolio: next });
  },
}));
