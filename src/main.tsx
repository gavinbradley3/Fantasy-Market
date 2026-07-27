// Composition root — the ONLY application file allowed to import a concrete
// MarketDataService implementation. Swapping the Demo Market for a live
// service happens here and nowhere else.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { AppErrorBoundary } from './components/states/ErrorBoundary';
import { MarketDataProvider } from './services/marketData/MarketDataProvider';
import { LiveMarketDataService } from './services/marketData/live/LiveMarketDataService';
import { PublicationProvider } from './services/publication';
import './styles/globals.css';

// P1 Wave 1: live Sleeper player metadata over the deterministic demo market. This service
// still backs the Demo Market surfaces (movers, stock card, watchlist, portfolio), which
// depend on fields the published API does not carry — see docs/FRONTEND_API_CONTRACT.md.
const marketDataService = new LiveMarketDataService();

// Phase 10: the published market. `PublicationProvider` builds its API client from
// VITE_PLAYERTICKER_API_URL; The Board reads the real publication through it and has NO demo
// fallback — an unreachable API surfaces as an error, never as simulated players.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <PublicationProvider>
        <MarketDataProvider service={marketDataService}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </MarketDataProvider>
      </PublicationProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
