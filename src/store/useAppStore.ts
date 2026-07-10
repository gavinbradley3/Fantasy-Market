// Thin global store (Zustand) for the only cross-cutting client state in the
// MVP: active format, watchlist, and portfolio.
//
// DESIGN DECISION: this store has NO dependency on MarketDataService. Actions
// take fully-RESOLVED data (`addWatch` receives the already-fetched
// priceAtAdd); the async price lookup lives in useRosterActions, which owns
// the injected service, pending-guards, and failure handling. This keeps the
// store synchronous, deterministic, and trivially testable — and means a
// service swap can never leak into persistence logic.
//
// Persisted state is loaded through the schema-validating migration layer;
// POOL_PLAYER_IDS is the canonical identity registry used to refuse entries
// that can't be positively mapped to a real player.

import { create } from 'zustand';
import { DEFAULT_FORMAT, FORMAT_KEYS } from '@/config/market';
import { POOL_PLAYER_IDS } from '@/data/poolIds';
import {
  STORAGE_KEYS,
  loadPersistedState,
  savePortfolio,
  saveWatchlist,
} from '@/services/storage/migrations';
import { browserStorage } from '@/services/storage/storage';
import type { FormatKey, PortfolioHolding, WatchlistItem } from '@/types/market';

function initialFormat(): FormatKey {
  const stored = browserStorage.get(STORAGE_KEYS.format) as FormatKey | null;
  return stored && FORMAT_KEYS.includes(stored) ? stored : DEFAULT_FORMAT;
}

const persisted = loadPersistedState(browserStorage, POOL_PLAYER_IDS);

interface AppState {
  format: FormatKey;
  watchlist: WatchlistItem[];
  portfolio: PortfolioHolding[];

  setFormat: (f: FormatKey) => void;

  isWatched: (playerId: string) => boolean;
  /** Add a fully-resolved item. Idempotent: no-op if already watched. */
  addWatch: (item: WatchlistItem) => void;
  removeWatch: (playerId: string) => void;

  inPortfolio: (playerId: string) => boolean;
  /** Add a fully-resolved holding. Idempotent: no-op if already held. */
  addHolding: (holding: PortfolioHolding) => void;
  removeHolding: (playerId: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  format: initialFormat(),
  watchlist: persisted.watchlist,
  portfolio: persisted.portfolio,

  setFormat: (f) => {
    browserStorage.set(STORAGE_KEYS.format, f);
    set({ format: f });
  },

  isWatched: (playerId) => get().watchlist.some((w) => w.playerId === playerId),

  addWatch: (item) => {
    const { watchlist } = get();
    if (watchlist.some((w) => w.playerId === item.playerId)) return; // idempotent
    const next = [...watchlist, item];
    saveWatchlist(browserStorage, next);
    set({ watchlist: next });
  },

  removeWatch: (playerId) => {
    const next = get().watchlist.filter((w) => w.playerId !== playerId);
    saveWatchlist(browserStorage, next);
    set({ watchlist: next });
  },

  inPortfolio: (playerId) => get().portfolio.some((h) => h.playerId === playerId),

  addHolding: (holding) => {
    const { portfolio } = get();
    if (portfolio.some((h) => h.playerId === holding.playerId)) return; // idempotent
    const next = [...portfolio, holding];
    savePortfolio(browserStorage, next);
    set({ portfolio: next });
  },

  removeHolding: (playerId) => {
    const next = get().portfolio.filter((h) => h.playerId !== playerId);
    savePortfolio(browserStorage, next);
    set({ portfolio: next });
  },
}));
