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
import './styles/globals.css';

// P1 Wave 1: live Sleeper player metadata over the deterministic demo market.
// If Sleeper is unreachable this degrades to full demo mode automatically —
// swap back to `new MockMarketDataService()` to force pure demo.
const marketDataService = new LiveMarketDataService();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <MarketDataProvider service={marketDataService}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MarketDataProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
