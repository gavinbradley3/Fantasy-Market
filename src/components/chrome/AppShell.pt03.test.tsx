import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '@/app/App';
import { ApiClient } from '@/services/api';
import { MarketDataProvider } from '@/services/marketData/MarketDataProvider';
import { MockMarketDataService } from '@/services/marketData/mock/MockMarketDataService';
import { PublicationProvider } from '@/services/publication';
import { STORAGE_KEYS } from '@/services/storage/migrations';
import { useAppStore } from '@/store/useAppStore';
import type { FormatKey } from '@/types/market';

function entry(schemaId: string | null = 'dynasty-superflex-12') {
  return {
    canonicalId: 'pt-a', position: 'WR', normalizedInputChecksum: 'in', outputChecksum: 'out',
    name: 'Published Receiver', team: 'CIN', age: 25, playerStatus: 'active',
    asOf: '2026-09-12T00:00:00Z', outputStatus: 'OK', readiness: 'READY',
    readinessMissingCount: 0, honestyState: 'COMPLETE', engineInvoked: true,
    publicConfidenceLabel: 'HIGH', confidenceScore: 80, confidenceLabel: 'HIGH',
    volatilityScore: 20, volatilityLabel: 'LOW',
    composites: { weekly: 50, ros: 50, oneYear: 50, threeYear: 50, dynasty: 50 },
    limitations: [], modelTier: 'FULL', modelVersion: 'test', positionValue: 50,
    positionalRank: 1, role: null, explanation: null, positiveFactors: [], negativeFactors: [],
    materialMissingInputs: [], insufficientReason: null, provenance: null, dynastyValue: 70,
    dynastySurplus: 1, dynastyDepth: 0, dynastyValueSource: 'ABOVE_REPLACEMENT',
    dynastyPositionRank: 1, dynastyOverallRank: 1, leagueSchemaId: schemaId,
    productionCurveVersion: 'test',
  };
}

function publication(schemaId: string | null = 'dynasty-superflex-12') {
  return {
    publication: { publicationId: `pub-${schemaId}`, runId: 'run', snapshotId: 'snap',
      boardChecksum: 'checksum', entryCount: 1, publishedAt: '2026-09-12T00:00:00Z',
      supersededPublicationId: null },
    entries: [entry(schemaId)],
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function boardFetch(body: unknown = publication()): typeof fetch {
  return (async (input: RequestInfo | URL) => String(input).includes('/market')
    ? response({ error: { code: 'NOT_FOUND', message: 'no market' } }, 404)
    : response(body)) as unknown as typeof fetch;
}

function renderApp(fetchFn: typeof fetch = boardFetch(), route = '/board') {
  return render(
    <PublicationProvider client={new ApiClient({ baseUrl: '/api', fetchFn })}>
      <MarketDataProvider service={new MockMarketDataService()}>
        <MemoryRouter initialEntries={[route]}><App /></MemoryRouter>
      </MarketDataProvider>
    </PublicationProvider>,
  );
}

function persistDemoFormat(format: FormatKey) {
  useAppStore.getState().setFormat(format);
  expect(localStorage.getItem(STORAGE_KEYS.format)).toBe(format);
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ format: 'dyn_sf_half', watchlist: [], portfolio: [] });
});

describe('PT-03 published-board chrome through the real app shell and route', () => {
  it('shows the loaded production format and no interactive demo selector or recalculation claim', async () => {
    renderApp();
    expect((await screen.findAllByText('Published Receiver')).length).toBeGreaterThan(0);

    const chrome = screen.getByLabelText('Published board format');
    expect(chrome).toHaveAttribute('title', '12-team Dynasty · Superflex · Full PPR');
    expect(screen.getAllByText(/12-team Dynasty · Superflex · Full PPR/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog', { name: 'Choose fantasy format' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1QB' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Half-PPR' })).not.toBeInTheDocument();
    expect(screen.queryByText(/re-computes prices, ranks, and signals/i)).not.toBeInTheDocument();

    act(() => useAppStore.getState().setFormat('dyn_1qb_half'));
    expect(chrome).toHaveAttribute('title', '12-team Dynasty · Superflex · Full PPR');
  });

  it.each([
    ['persisted Half-PPR', 'dyn_sf_half' as const],
    ['persisted 1QB', 'dyn_1qb_half' as const],
  ])('ignores %s when describing the publication without overwriting it', async (_name, format) => {
    persistDemoFormat(format);
    renderApp();
    expect((await screen.findAllByText('Published Receiver')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Published board format')).toHaveAttribute(
      'title', '12-team Dynasty · Superflex · Full PPR',
    );
    expect(useAppStore.getState().format).toBe(format);
    expect(localStorage.getItem(STORAGE_KEYS.format)).toBe(format);
  });

  it.each(['/board/', '/BOARD'])('keeps published chrome for the router-equivalent route %s', async (route) => {
    renderApp(boardFetch(), route);
    expect((await screen.findAllByText('Published Receiver')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Published board format')).toHaveAttribute(
      'title', '12-team Dynasty · Superflex · Full PPR',
    );
    expect(screen.queryByRole('button', { name: /DYN ·/ })).not.toBeInTheDocument();
  });

  it('preserves demo preference and working selector across demo → board → demo navigation', async () => {
    persistDemoFormat('dyn_1qb_half');
    renderApp(boardFetch(), '/market');
    expect(await screen.findByRole('heading', { name: /Market Update/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'DYN · 1QB · 0.5' }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('link', { name: 'Board' })[0]);
    expect((await screen.findAllByText('Published Receiver')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Published board format')).toHaveAttribute(
      'title', '12-team Dynasty · Superflex · Full PPR',
    );
    expect(useAppStore.getState().format).toBe('dyn_1qb_half');

    await userEvent.click(screen.getAllByRole('link', { name: 'Market' })[0]);
    expect(await screen.findByRole('heading', { name: /Market Update/ })).toBeInTheDocument();
    const selector = screen.getAllByRole('button', { name: 'DYN · 1QB · 0.5' })[0];
    await userEvent.click(selector);
    await userEvent.click(screen.getByRole('button', { name: 'Superflex' }));
    expect(useAppStore.getState().format).toBe('dyn_sf_half');
    expect(localStorage.getItem(STORAGE_KEYS.format)).toBe('dyn_sf_half');
  });

  it('keeps the last-good format while a refresh is pending and after it errors', async () => {
    let publicationCalls = 0;
    let rejectRefresh!: (reason: unknown) => void;
    const refresh = new Promise<Response>((_resolve, reject) => { rejectRefresh = reject; });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/market')) return response({ error: { code: 'NOT_FOUND' } }, 404);
      publicationCalls += 1;
      return publicationCalls === 1 ? response(publication()) : refresh;
    }) as unknown as typeof fetch;
    renderApp(fetchFn);
    await screen.findAllByText('Published Receiver');

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Market' }));
    expect(screen.getByLabelText('Published board format')).toHaveAttribute(
      'title', '12-team Dynasty · Superflex · Full PPR',
    );
    rejectRefresh(new TypeError('refresh failed'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Published board format')).toHaveAttribute(
      'title', '12-team Dynasty · Superflex · Full PPR',
    );
  });

  it('updates the label when a refresh replaces the publication', async () => {
    let publicationCalls = 0;
    const fetchFn = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/market')) return response({ error: { code: 'NOT_FOUND' } }, 404);
      publicationCalls += 1;
      return response(publication(publicationCalls === 1 ? 'dynasty-superflex-12' : 'future-schema'));
    }) as unknown as typeof fetch;
    renderApp(fetchFn);
    await screen.findAllByText('Published Receiver');
    expect(screen.getByLabelText('Published board format')).toHaveAttribute(
      'title', '12-team Dynasty · Superflex · Full PPR',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Market' }));
    await waitFor(() => expect(screen.getByLabelText('Published board format')).toHaveAttribute(
      'title', 'Published format unrecognized',
    ));
  });

  it('makes no unsupported format assertion while loading without a publication', () => {
    renderApp((() => new Promise<Response>(() => {})) as unknown as typeof fetch);
    expect(screen.getByLabelText('Published board format')).toHaveAttribute('title', 'Loading published format…');
    expect(screen.queryByText(/12-team Dynasty|Full PPR/)).not.toBeInTheDocument();
  });
});
