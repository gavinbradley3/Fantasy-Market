// Composition root.
//
// The public site renders only published data: The Board reads the publication through
// `PublicationProvider` and has no demo fallback. The Demo Market service (and its Sleeper
// overlay) is no longer composed here, because no public route renders simulated values; its
// implementation remains in src/services/marketData for reuse.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { AppErrorBoundary } from './components/states/ErrorBoundary';
import { PublicationProvider } from './services/publication';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <PublicationProvider>
        {/* The router must agree with Vite's deployed base, or every in-app link would point
            above the site root on a GitHub Pages project site. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </PublicationProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
