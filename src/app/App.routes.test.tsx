// The public site serves only published data. Every former Demo Market route lands on The
// Board, and nothing simulated (prices, movers, injury notes, buy/sell signals, the demo
// banner, the format control that changed nothing) renders anywhere in the shell.

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ApiClient } from '@/services/api';
import { PublicationProvider } from '@/services/publication';
import App, { RETIRED_DEMO_ROUTES } from './App';

function LocationProbe() {
  const { pathname } = useLocation();
  return <output data-testid="pathname">{pathname}</output>;
}

function renderAt(route: string) {
  const fetchFn = (async () =>
    new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'none' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  return render(
    <PublicationProvider client={new ApiClient({ baseUrl: '/api', fetchFn })}>
      <MemoryRouter initialEntries={[route]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </PublicationProvider>,
  );
}

const SIMULATED = /Demo Market|simulated player values|Biggest Risers|Biggest Fallers|Buy-Low|Sell-High|Overheated|Watchlist|Portfolio|DYN · SF/i;

describe('public routes', () => {
  it.each(['/', ...RETIRED_DEMO_ROUTES.map((r) => r.replace(':ticker', 'JMC'))])(
    '%s lands on The Board',
    async (route) => {
      renderAt(route);
      await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/board'));
      expect(screen.getByRole('heading', { name: 'The Board' })).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(SIMULATED);
    },
  );

  it.each(['/board', '/methodology', '/legal'])('%s renders no simulated content or demo controls', async (route) => {
    renderAt(route);
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe(route));
    expect(document.body.textContent).not.toMatch(SIMULATED);
    expect(screen.queryByRole('button', { name: /search players/i })).not.toBeInTheDocument();
  });

  it('navigation links only to published-data surfaces and their documentation', () => {
    renderAt('/board');
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const href of hrefs) expect(['/board', '/methodology', '/legal']).toContain(href);
  });
});
