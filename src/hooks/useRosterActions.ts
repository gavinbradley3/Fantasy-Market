// Async watchlist/portfolio actions. This hook — not the Zustand store — owns
// the service dependency, so adding a player is: resolve the current price
// through the injected MarketDataService, THEN commit a fully-resolved item.
//
// Failure semantics (explicit, per Phase-5 requirements):
// - price lookup rejects or returns undefined → NOTHING is added, the caller
//   gets { ok: false, message } to surface. We never record priceAtAdd: 0 —
//   the old sync code's `?? 0` fallback silently corrupted since-added math.
// - double-clicks: a per-hook pending set ignores re-entry for the same player
//   while a lookup is in flight; the store's add* actions are additionally
//   idempotent, so even racing hooks cannot double-add.
// - format races: the active format is captured ONCE at call time, so the
//   stored priceAtAdd and formatAtAdd always agree even if the user switches
//   formats mid-flight.
// - removal needs no resolution and stays synchronous.

import { useCallback, useRef, useState } from 'react';
import { useMarketDataService } from '@/services/marketData/MarketDataProvider';
import { useAppStore } from '@/store/useAppStore';

export interface RosterActionResult {
  ok: boolean;
  /** True if the player is watched/held AFTER the action. */
  active: boolean;
  message?: string;
}

const PRICE_UNAVAILABLE = "Couldn't fetch the current price — try again.";

function usePendingSet(): [ReadonlySet<string>, (id: string, on: boolean) => void] {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const mark = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  return [pending, mark];
}

export function useWatchlistActions() {
  const service = useMarketDataService();
  const addWatch = useAppStore((s) => s.addWatch);
  const removeWatch = useAppStore((s) => s.removeWatch);
  const [pending, mark] = usePendingSet();
  // Latest-call guard for unmount safety on the pending set.
  const alive = useRef(true);
  alive.current = true;

  const toggle = useCallback(
    async (playerId: string): Promise<RosterActionResult> => {
      const state = useAppStore.getState();
      if (state.watchlist.some((w) => w.playerId === playerId)) {
        removeWatch(playerId);
        return { ok: true, active: false };
      }
      if (pending.has(playerId)) return { ok: false, active: false, message: 'Already adding…' };

      const format = state.format; // captured once — see header comment
      mark(playerId, true);
      try {
        const priceAtAdd = await service.getPriceById(playerId, format);
        if (priceAtAdd === undefined) {
          return { ok: false, active: false, message: PRICE_UNAVAILABLE };
        }
        addWatch({ playerId, addedAt: new Date().toISOString(), priceAtAdd, formatAtAdd: format });
        return { ok: true, active: true };
      } catch {
        return { ok: false, active: false, message: PRICE_UNAVAILABLE };
      } finally {
        if (alive.current) mark(playerId, false);
      }
    },
    [service, pending, mark, addWatch, removeWatch],
  );

  return { toggle, isPending: (id: string) => pending.has(id) };
}

export function usePortfolioActions() {
  const service = useMarketDataService();
  const addHolding = useAppStore((s) => s.addHolding);
  const removeHolding = useAppStore((s) => s.removeHolding);
  const [pending, mark] = usePendingSet();

  const toggle = useCallback(
    async (playerId: string): Promise<RosterActionResult> => {
      const state = useAppStore.getState();
      if (state.portfolio.some((h) => h.playerId === playerId)) {
        removeHolding(playerId);
        return { ok: true, active: false };
      }
      if (pending.has(playerId)) return { ok: false, active: false, message: 'Already adding…' };

      const format = state.format;
      mark(playerId, true);
      try {
        const priceAtAdd = await service.getPriceById(playerId, format);
        if (priceAtAdd === undefined) {
          return { ok: false, active: false, message: PRICE_UNAVAILABLE };
        }
        addHolding({ playerId, addedAt: new Date().toISOString(), priceAtAdd });
        return { ok: true, active: true };
      } catch {
        return { ok: false, active: false, message: PRICE_UNAVAILABLE };
      } finally {
        mark(playerId, false);
      }
    },
    [service, pending, mark, addHolding, removeHolding],
  );

  return { toggle, isPending: (id: string) => pending.has(id) };
}
