// Published-market state tests (Phase 10): the full lifecycle the UI depends on, driven
// through the real hook over a stubbed `fetch`.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ReactNode } from 'react';
import { ApiClient } from '@/services/api';
import { PublicationProvider, usePublishedMarket } from './PublicationProvider';

const PUBLICATION = {
  publication: {
    publicationId: 'pub-1',
    runId: 'run-1',
    snapshotId: 'snap-1',
    boardChecksum: 'chk',
    entryCount: 1,
    publishedAt: '2026-01-01T00:00:00.000Z',
    supersededPublicationId: null,
  },
  entries: [
    {
      canonicalId: 'pt-wr',
      position: 'WR',
      normalizedInputChecksum: 'ni',
      outputChecksum: 'out',
      name: 'Test Receiver',
      team: 'CIN',
      age: 26,
      playerStatus: 'active',
      asOf: '2025-10-01T00:00:00.000Z',
      outputStatus: 'OK',
      readiness: 'READY',
      readinessMissingCount: 0,
      honestyState: 'COMPLETE',
      engineInvoked: true,
      publicConfidenceLabel: 'HIGH',
      confidenceScore: 80,
      confidenceLabel: 'HIGH',
      volatilityScore: 30,
      volatilityLabel: 'LOW',
      composites: { weekly: 70, ros: 68, oneYear: 66, threeYear: 62, dynasty: 60 },
      limitations: [],
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A probe that renders the hook's state as flat text, so assertions stay unambiguous. */
function Probe() {
  const { status, market, error, isFetching, retry } = usePublishedMarket();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="fetching">{String(isFetching)}</span>
      <span data-testid="errorKind">{error?.kind ?? ''}</span>
      <span data-testid="players">{market ? market.players.map((p) => p.name).join(',') : ''}</span>
      <button onClick={retry}>Try Again</button>
    </div>
  );
}

function renderWithFetch(fetchFn: typeof fetch, ui: ReactNode = <Probe />) {
  const client = new ApiClient({ baseUrl: '/api', fetchFn });
  return render(<PublicationProvider client={client}>{ui}</PublicationProvider>);
}

describe('published market state lifecycle', () => {
  it('starts in loading before the first response lands', () => {
    const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    renderWithFetch(never);
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
  });

  it('reaches success and exposes adapted players', async () => {
    const ok = (async () => jsonResponse(PUBLICATION)) as unknown as typeof fetch;
    renderWithFetch(ok);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));
    expect(screen.getByTestId('players')).toHaveTextContent('Test Receiver');
  });

  it('treats 404 as an EMPTY publication, not an error', async () => {
    const notFound = (async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'no current publication' } }, 404)) as unknown as typeof fetch;
    renderWithFetch(notFound);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('empty'));
    expect(screen.getByTestId('errorKind')).toHaveTextContent('');
  });

  it('treats an HTML 404 from the static board path as an EMPTY publication', async () => {
    const notFound = (async () => new Response('<!doctype html><title>Not Found</title>', { status: 404 })) as unknown as typeof fetch;
    renderWithFetch(notFound);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('empty'));
    expect(screen.getByTestId('errorKind')).toHaveTextContent('');
  });

  it('surfaces a network failure as an error with kind "network"', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    renderWithFetch(down);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('errorKind')).toHaveTextContent('network');
  });

  it('surfaces a 503 as an error with kind "unavailable"', async () => {
    const degraded = (async () =>
      jsonResponse({ error: { code: 'PERSISTENCE_UNAVAILABLE', message: 'db down' } }, 503)) as unknown as typeof fetch;
    renderWithFetch(degraded);
    await waitFor(() => expect(screen.getByTestId('errorKind')).toHaveTextContent('unavailable'));
    expect(screen.getByTestId('status')).toHaveTextContent('error');
  });

  it('surfaces a malformed body as "invalidResponse" and shows no players', async () => {
    const junk = (async () => jsonResponse({ publication: { publicationId: 'p' } })) as unknown as typeof fetch;
    renderWithFetch(junk);
    await waitFor(() => expect(screen.getByTestId('errorKind')).toHaveTextContent('invalidResponse'));
    expect(screen.getByTestId('players')).toHaveTextContent('');
  });

  it('retries without a page reload and recovers', async () => {
    let attempt = 0;
    const flaky = (async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError('Failed to fetch');
      return jsonResponse(PUBLICATION);
    }) as unknown as typeof fetch;

    renderWithFetch(flaky);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));

    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));
    expect(screen.getByTestId('players')).toHaveTextContent('Test Receiver');
    expect(attempt).toBe(2);
  });

  it('NEVER falls back to demo players when the API fails', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    renderWithFetch(down);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    // No players at all — not the Demo Market's, not a cached stand-in, not an empty-but-
    // "successful" board that would read as a healthy, empty market.
    expect(screen.getByTestId('players')).toHaveTextContent('');
    expect(screen.getByTestId('status')).not.toHaveTextContent('success');
    expect(screen.getByTestId('status')).not.toHaveTextContent('empty');
  });
});

describe('remount and failure resilience', () => {
  it('survives a StrictMode double-mount instead of cancelling itself permanently', async () => {
    // React unmounts and immediately remounts under StrictMode. If the provider held a single
    // AbortController, the first cleanup would abort it and every later read would cancel
    // instantly — the page would be stuck on "cancelled" forever in development.
    const client = new ApiClient({
      baseUrl: '/api',
      fetchFn: (async () => jsonResponse(PUBLICATION)) as unknown as typeof fetch,
    });
    render(
      <StrictMode>
        <PublicationProvider client={client}>
          <Probe />
        </PublicationProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));
    expect(screen.getByTestId('players')).toHaveTextContent('Test Receiver');
  });

  it('does not storm an unreachable API — one attempt until the reader retries', async () => {
    const spy = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    renderWithFetch(spy as unknown as typeof fetch);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    await new Promise((r) => setTimeout(r, 150));
    expect(spy).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 150));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('request lifecycle management', () => {
  it('shares ONE request across components asking for the same publication', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(PUBLICATION));
    renderWithFetch(fetchSpy as unknown as typeof fetch, (
      <>
        <Probe />
        <Probe />
        <Probe />
      </>
    ));
    await waitFor(() => expect(screen.getAllByTestId('status')[0]).toHaveTextContent('success'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight request when the provider unmounts', async () => {
    let capturedSignal: AbortSignal | undefined;
    const hanging = ((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    const { unmount } = renderWithFetch(hanging);
    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal!.aborted).toBe(false);
    unmount();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('discards a superseded response so a slow first request cannot overwrite a retry', async () => {
    const resolvers: ((r: Response) => void)[] = [];
    const controlled = (async () =>
      new Promise<Response>((resolve) => {
        resolvers.push(resolve);
      })) as unknown as typeof fetch;

    renderWithFetch(controlled);
    await waitFor(() => expect(resolvers).toHaveLength(1));

    // Force a second request, then settle the FIRST one last with different data.
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[1](jsonResponse(PUBLICATION));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'));

    const stale = {
      ...PUBLICATION,
      entries: [{ ...PUBLICATION.entries[0], name: 'Stale Player' }],
    };
    resolvers[0](jsonResponse(stale));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('players')).toHaveTextContent('Test Receiver');
    expect(screen.getByTestId('players')).not.toHaveTextContent('Stale Player');
  });
});
