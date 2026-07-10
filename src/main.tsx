// Composition root — the ONLY application file allowed to import a concrete
// MarketDataService implementation. Swapping the Demo Market for a live
// service happens here and nowhere else.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { AppErrorBoundary } from './components/states/ErrorBoundary';
import { MarketDataProvider } from './services/marketData/MarketDataProvider';
import { MockMarketDataService } from './services/marketData/mock/MockMarketDataService';
import './styles/globals.css';

const marketDataService = new MockMarketDataService();

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
