// UI behaviour tests (Phase 10): dependency injection, loading / error /
// success lifecycles, async watchlist add, and the root error boundary.
// Everything renders against an INJECTED service — nothing here (or in any
// component under test) imports the mock singleton, because none exists.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MarketDataProvider } from '@/services/marketData/MarketDataProvider';
import { MockMarketDataService } from '@/services/marketData/mock/MockMarketDataService';
import type { MarketDataService } from '@/services/marketData/types';
import { AppErrorBoundary } from '@/components/states/ErrorBoundary';
import { WatchlistButton } from '@/components/market/WatchlistButton';
import BoardPage from '@/pages/BoardPage';
import { useAppStore } from '@/store/useAppStore';

// Explicit delegation wrapper: build a service from the deterministic mock
// with selected methods overridden (failing, hanging, etc.).
function svcWith(overrides: Partial<MarketDataService> = {}): MarketDataService {
  const base = new MockMarketDataService();
  return {
    getMarketStatus: () => base.getMarketStatus(),
    getBoard: (f) => base.getBoard(f),
    getPlayer: (t, f) => base.getPlayer(t, f),
    getMovers: (f) => base.getMovers(f),
    getHistory: (t, f, r) => base.getHistory(t, f, r),
    getFormatComparison: (t) => base.getFormatComparison(t),
    getRowsByIds: (ids, f) => base.getRowsByIds(ids, f),
    getPriceById: (id, f) => base.getPriceById(id, f),
    search: (q, l) => base.search(q, l),
    ...overrides,
  };
}

function renderWith(service: MarketDataService, ui: ReactNode) {
  return render(
    <MarketDataProvider service={service}>
      <MemoryRouter initialEntries={['/board']}>{ui}</MemoryRouter>
    </MarketDataProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ watchlist: [], portfolio: [], format: 'dyn_sf_half' });
});

describe('BoardPage lifecycle through an injected service', () => {
  it('renders a loading state while the board fetch is pending', () => {
    const hanging = svcWith({ getBoard: () => new Promise(() => {}) });
    renderWith(hanging, <BoardPage />);
    expect(screen.getByLabelText('Loading market data')).toBeInTheDocument();
  });

  it('renders an error state with retry when the injected service fails', async () => {
    const failing = svcWith({
      getBoard: () => Promise.reject(new Error('network down')),
      getMarketStatus: () => Promise.reject(new Error('network down')),
    });
    renderWith(failing, <BoardPage />);
    expect(await screen.findByText(/board couldn't load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders real rows on success (data flows only through the injected service)', async () => {
    renderWith(svcWith(), <BoardPage />);
    // Appears in both the desktop table and the mobile card list (jsdom
    // applies no responsive CSS, so both render).
    const allens = await screen.findAllByText('Josh Allen');
    expect(allens.length).toBeGreaterThan(0);
    expect(await screen.findByText(/players match/i)).toBeInTheDocument();
  });

  it('a stubbed service fully controls what the UI shows', async () => {
    // Two-player stub proves the page renders injected data, not a singleton.
    const base = new MockMarketDataService();
    const twoRows = (await base.getBoard('dyn_sf_half')).slice(0, 2);
    const stub = svcWith({ getBoard: async () => twoRows });
    renderWith(stub, <BoardPage />);
    expect(await screen.findByText(/^2$/)).toBeInTheDocument(); // "2 players match"
  });
});

describe('async watchlist add (price resolved through the service)', () => {
  it('adds with the service-resolved priceAtAdd — never a placeholder', async () => {
    const service = svcWith();
    const expected = await service.getPriceById('pt_0001', 'dyn_sf_half');
    renderWith(service, <WatchlistButton playerId="pt_0001" ticker="JMC" />);

    await userEvent.click(screen.getByRole('button', { name: /watch/i }));

    await waitFor(() => {
      const items = useAppStore.getState().watchlist;
      expect(items).toHaveLength(1);
      expect(items[0].priceAtAdd).toBe(expected);
      expect(items[0].formatAtAdd).toBe('dyn_sf_half');
    });
    expect(screen.getByRole('button', { name: /watching/i })).toBeInTheDocument();
  });

  it('rapid double-clicks cannot double-add', async () => {
    renderWith(svcWith(), <WatchlistButton playerId="pt_0001" ticker="JMC" />);
    const button = screen.getByRole('button', { name: /watch/i });
    fireEvent.click(button);
    fireEvent.click(button); // fires before the first resolution lands
    await waitFor(() => {
      expect(useAppStore.getState().watchlist).toHaveLength(1);
    });
    // Give any straggling microtasks a chance to double-add (they must not).
    await new Promise((r) => setTimeout(r, 20));
    expect(useAppStore.getState().watchlist).toHaveLength(1);
  });

  it('a failing price lookup adds NOTHING and surfaces the failure', async () => {
    const failing = svcWith({
      getPriceById: () => Promise.reject(new Error('boom')),
    });
    renderWith(failing, <WatchlistButton playerId="pt_0001" ticker="JMC" />);
    await userEvent.click(screen.getByRole('button', { name: /watch/i }));
    expect(await screen.findByText(/couldn't fetch the current price/i)).toBeInTheDocument();
    expect(useAppStore.getState().watchlist).toHaveLength(0);
  });

  it('an undefined price (unknown player) adds nothing', async () => {
    const noPrice = svcWith({ getPriceById: async () => undefined });
    renderWith(noPrice, <WatchlistButton playerId="pt_0001" ticker="JMC" />);
    await userEvent.click(screen.getByRole('button', { name: /watch/i }));
    expect(await screen.findByText(/couldn't fetch the current price/i)).toBeInTheDocument();
    expect(useAppStore.getState().watchlist).toHaveLength(0);
  });
});

describe('root error boundary', () => {
  it('catches render errors and shows the recovery fallback instead of a blank screen', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bomb(): ReactNode {
      throw new Error('render exploded');
    }
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload playerticker/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>all good</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });
});
