// Integration tests for The Board (Phase 10):
//
//     mocked HTTP response → ApiClient → publication adapter → market view
//
// Nothing is stubbed between the fetch and the DOM: the real client parses, the real adapter
// converts, and the real page renders. A regression anywhere along that path fails here.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiClient } from '@/services/api';
import { PublicationProvider } from '@/services/publication';
import BoardPage from './BoardPage';

interface EntryOverrides {
  canonicalId: string;
  position: string;
  name: string | null;
  weekly: number | null;
  confidenceScore?: number | null;
  confidenceLabel?: string | null;
  volatilityScore?: number | null;
  volatilityLabel?: string | null;
  team?: string | null;
  readiness?: string;
  honestyState?: string;
  modelTier?: 'FULL' | 'ACCESSIBLE' | 'INSUFFICIENT';
  positionValue?: number | null;
  role?: string | null;
  explanation?: string | null;
  materialMissingInputs?: string[];
}

function apiEntry(o: EntryOverrides) {
  const valued = o.weekly !== null;
  return {
    canonicalId: o.canonicalId,
    position: o.position,
    normalizedInputChecksum: `ni-${o.canonicalId}`,
    outputChecksum: `out-${o.canonicalId}`,
    name: o.name,
    team: o.team ?? 'CIN',
    age: 26,
    playerStatus: 'active',
    asOf: '2025-10-01T00:00:00.000Z',
    outputStatus: valued ? 'OK' : 'UNAVAILABLE',
    readiness: o.readiness ?? (valued ? 'READY' : 'NOT_READY'),
    readinessMissingCount: valued ? 0 : 19,
    honestyState: o.honestyState ?? (valued ? 'COMPLETE' : 'UNAVAILABLE'),
    engineInvoked: valued,
    publicConfidenceLabel: valued ? 'HIGH' : null,
    confidenceScore: o.confidenceScore ?? (valued ? 80 : null),
    confidenceLabel: o.confidenceLabel ?? (valued ? 'HIGH' : null),
    volatilityScore: o.volatilityScore ?? (valued ? 30 : null),
    volatilityLabel: o.volatilityLabel ?? (valued ? 'LOW' : null),
    composites: valued
      ? { weekly: o.weekly, ros: o.weekly, oneYear: o.weekly, threeYear: o.weekly, dynasty: o.weekly }
      : null,
    limitations: [],
    modelTier: o.modelTier ?? (valued ? 'FULL' : 'INSUFFICIENT'),
    modelVersion: valued ? 'wr-mvp-1.0' : null,
    positionValue: o.positionValue ?? null,
    positionalRank: null,
    role: o.role ?? null,
    explanation: o.explanation ?? null,
    positiveFactors: [],
    negativeFactors: [],
    materialMissingInputs: o.materialMissingInputs ?? [],
    insufficientReason: valued ? null : 'Not enough information to value this player.',
    provenance: null,
  };
}

/** A board with all four supported positions. */
const FOUR_POSITIONS = [
  apiEntry({ canonicalId: 'pt-qb', position: 'QB', name: 'Test Passer', weekly: 90 }),
  apiEntry({ canonicalId: 'pt-rb', position: 'RB', name: 'Test Runner', weekly: 80 }),
  apiEntry({ canonicalId: 'pt-wr', position: 'WR', name: 'Test Receiver', weekly: 70 }),
  apiEntry({ canonicalId: 'pt-te', position: 'TE', name: 'Test End', weekly: 60 }),
];

function publication(entries: ReturnType<typeof apiEntry>[]) {
  return {
    publication: {
      publicationId: 'pub-1',
      runId: 'run-1',
      snapshotId: 'snap-1',
      boardChecksum: 'chk',
      entryCount: entries.length,
      publishedAt: '2026-01-01T00:00:00.000Z',
      supersededPublicationId: null,
    },
    entries,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderBoard(fetchFn: typeof fetch, route = '/board') {
  const client = new ApiClient({ baseUrl: '/api', fetchFn });
  return render(
    <PublicationProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <BoardPage />
      </MemoryRouter>
    </PublicationProvider>,
  );
}

const respondWith = (body: unknown, status = 200) =>
  (async () => jsonResponse(body, status)) as unknown as typeof fetch;

/** The provenance line's text, e.g. "4 of 4 published players · published ...". */
function boardCount(): string {
  return screen.getByRole('status').textContent ?? '';
}

/** The whole provenance block: the count plus the unvalued/rejected disclosures beside it. */
function provenanceText(): string {
  return screen.getByRole('status').parentElement?.textContent ?? '';
}

/** The desktop table and the mobile card list both render in jsdom (no responsive CSS). */
async function rowsFor(name: string) {
  return screen.findAllByText(name);
}

describe('The Board renders the real publication end to end', () => {
  it('shows a loading state while the publication request is pending', () => {
    const never = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    renderBoard(never);
    expect(screen.getByLabelText('Loading published market')).toBeInTheDocument();
  });

  it('renders QB, RB, WR and TE from one published board', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)));
    for (const name of ['Test Passer', 'Test Runner', 'Test Receiver', 'Test End']) {
      expect((await rowsFor(name)).length).toBeGreaterThan(0);
    }
    await waitFor(() => expect(boardCount()).toMatch(/4 of 4 published players/));
  });

  it('requests GET /publication against the configured base URL', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(publication(FOUR_POSITIONS)),
    );
    renderBoard(spy as unknown as typeof fetch);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(String(spy.mock.calls[0][0])).toBe('/api/publication');
  });

  it('displays published values and does not invent the ones the API omitted', async () => {
    const mixed = [
      apiEntry({ canonicalId: 'pt-valued', position: 'WR', name: 'Valued Player', weekly: 70 }),
      apiEntry({ canonicalId: 'pt-unvalued', position: 'TE', name: 'Unvalued Player', weekly: null }),
    ];
    renderBoard(respondWith(publication(mixed)));

    const valuedRows = await screen.findAllByText('Valued Player');
    const valuedRow = valuedRows[0].closest('tr')!;
    expect(within(valuedRow).getByText('70.0')).toBeInTheDocument();

    const unvaluedRow = (await screen.findAllByText('Unvalued Player'))[0].closest('tr')!;
    // Absence is rendered as an em-dash, never as 0.0.
    expect(within(unvaluedRow).queryByText('0.0')).not.toBeInTheDocument();
    expect(within(unvaluedRow).getAllByText('—').length).toBeGreaterThan(0);
    // The tier badge names the state in product language rather than an internal status code.
    expect(within(unvaluedRow).getByText('No value')).toBeInTheDocument();
    expect(within(valuedRow).getByText('Full model')).toBeInTheDocument();
    // And the page says so in words, next to the count.
    await waitFor(() =>
      expect(provenanceText()).toMatch(/1 of these players has no published value/i),
    );
  });

  it('shows the canonical id honestly when no name was published', async () => {
    const anonymous = [apiEntry({ canonicalId: 'pt-anon', position: 'RB', name: null, weekly: 50 })];
    renderBoard(respondWith(publication(anonymous)));
    expect((await screen.findAllByText('pt-anon')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/no name published/i)).length).toBeGreaterThan(0);
  });
});

describe('The Board — search, filters and sorting over published data', () => {
  it('filters by position', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)));
    await screen.findAllByText('Test Passer');

    await userEvent.click(screen.getByRole('button', { name: 'WR' }));
    await waitFor(() => expect(boardCount()).toMatch(/1 of 4 published players/));
    expect(screen.getAllByText('Test Receiver').length).toBeGreaterThan(0);
    expect(screen.queryByText('Test Passer')).not.toBeInTheDocument();
  });

  it('supports selecting more than one position at once', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)));
    await screen.findAllByText('Test Passer');
    await userEvent.click(screen.getByRole('button', { name: 'QB' }));
    await userEvent.click(screen.getByRole('button', { name: 'TE' }));
    await waitFor(() => expect(boardCount()).toMatch(/2 of 4 published players/));
  });

  it('shows an honest "no matches" state for an empty position result', async () => {
    const wrOnly = [apiEntry({ canonicalId: 'pt-wr', position: 'WR', name: 'Test Receiver', weekly: 70 })];
    renderBoard(respondWith(publication(wrOnly)));
    await screen.findAllByText('Test Receiver');
    await userEvent.click(screen.getByRole('button', { name: 'QB' }));
    expect(await screen.findByText(/no published players match these filters/i)).toBeInTheDocument();
    // Distinct from "nothing is published" — the board itself is still there.
    expect(screen.queryByText(/No market publication is available yet/i)).not.toBeInTheDocument();
  });

  it('searches by name and by canonical id', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)));
    await screen.findAllByText('Test Passer');
    const box = screen.getByLabelText('Search published players');

    await userEvent.type(box, 'Runner');
    await waitFor(() => expect(boardCount()).toMatch(/1 of 4 published players/));
    expect(screen.getAllByText('Test Runner').length).toBeGreaterThan(0);

    await userEvent.clear(box);
    await userEvent.type(box, 'pt-te');
    await waitFor(() => expect(boardCount()).toMatch(/1 of 4 published players/));
    expect(screen.getAllByText('Test End').length).toBeGreaterThan(0);
  });

  it('sorts by published value, keeping unvalued players last', async () => {
    const mixed = [
      apiEntry({ canonicalId: 'a', position: 'WR', name: 'Low Value', weekly: 10 }),
      apiEntry({ canonicalId: 'b', position: 'WR', name: 'No Value', weekly: null }),
      apiEntry({ canonicalId: 'c', position: 'WR', name: 'High Value', weekly: 99 }),
    ];
    renderBoard(respondWith(publication(mixed)));
    await screen.findAllByText('High Value');

    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'value');
    await waitFor(() => {
      const names = screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent ?? '');
      expect(names[0]).toContain('High Value');
      expect(names[1]).toContain('Low Value');
      expect(names[2]).toContain('No Value');
    });
  });

  it('sorts by name', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)));
    await screen.findAllByText('Test Passer');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'name');
    await waitFor(() => {
      const first = screen.getAllByRole('row')[1].textContent ?? '';
      expect(first).toContain('Test End'); // alphabetically first
    });
  });

  it('honors position and sort from the URL', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)), '/board?pos=RB&sort=value');
    await waitFor(() => expect(boardCount()).toMatch(/1 of 4 published players/));
    expect(screen.getAllByText('Test Runner').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('value');
  });
});

describe('The Board — empty, error and retry states', () => {
  it('shows an honest empty state when nothing is published (404)', async () => {
    renderBoard(respondWith({ error: { code: 'NOT_FOUND', message: 'no current publication' } }, 404));
    expect(await screen.findByText(/No market publication is available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/reachable/i)).toBeInTheDocument();
    // An empty market is NOT an error, and it is NOT demo players.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Josh Allen/)).not.toBeInTheDocument();
  });

  it('shows an error state with Try Again when the API is unreachable', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    renderBoard(down);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn't reach the market service/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('shows a distinct message for a 503', async () => {
    renderBoard(respondWith({ error: { code: 'PERSISTENCE_UNAVAILABLE', message: 'db down' } }, 503));
    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
  });

  it('offers no retry for a failure retrying cannot fix', async () => {
    renderBoard(respondWith({ publication: { publicationId: 'p' } }));
    expect(await screen.findByText(/couldn't read/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });

  it('retries in place, without reloading the page', async () => {
    let attempt = 0;
    const flaky = (async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError('Failed to fetch');
      return jsonResponse(publication(FOUR_POSITIONS));
    }) as unknown as typeof fetch;

    renderBoard(flaky);
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect((await rowsFor('Test Passer')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('re-reads the market from the "Refresh Market" button and never posts a rebuild', async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(publication(FOUR_POSITIONS)),
    );
    renderBoard(spy as unknown as typeof fetch);
    await screen.findAllByText('Test Passer');

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Market' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    // Refreshing the browser's data is a READ. Triggering a backend rebuild is a different
    // action and this page must never conflate the two.
    for (const call of spy.mock.calls) {
      expect(call[1]?.method ?? 'GET').toBe('GET');
      expect(String(call[0])).not.toContain('/refresh');
    }
  });

  it('shows NO demo players at any point during a failure', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    renderBoard(down);
    await screen.findByRole('alert');
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.queryByText(/players match/i)).not.toBeInTheDocument();
  });
});

describe('The Board — model tier is visible to the user', () => {
  it('distinguishes a full-model value from an accessible-data value from no value', async () => {
    const tiers = [
      apiEntry({ canonicalId: 'pt-full', position: 'WR', name: 'Full Model Player', weekly: 70 }),
      apiEntry({
        canonicalId: 'pt-acc',
        position: 'RB',
        name: 'Limited Data Player',
        weekly: 64,
        modelTier: 'ACCESSIBLE',
        role: 'Three-down lead back',
        materialMissingInputs: ['Route participation (no free per-player route data since 2023)'],
      }),
      apiEntry({ canonicalId: 'pt-none', position: 'TE', name: 'No Value Player', weekly: null }),
    ];
    renderBoard(respondWith(publication(tiers)));

    const fullRow = (await screen.findAllByText('Full Model Player'))[0].closest('tr')!;
    const accRow = (await screen.findAllByText('Limited Data Player'))[0].closest('tr')!;
    const noneRow = (await screen.findAllByText('No Value Player'))[0].closest('tr')!;

    expect(within(fullRow).getByText('Full model')).toBeInTheDocument();
    expect(within(accRow).getByText('Limited data')).toBeInTheDocument();
    expect(within(noneRow).getByText('No value')).toBeInTheDocument();

    // The accessible-tier player still carries a real value — the tier is a label, not a gap.
    expect(within(accRow).getByText('64.0')).toBeInTheDocument();

    // The badge explains itself in words, naming the missing input rather than a registry key.
    expect(within(accRow).getByTitle(/Route participation/)).toBeInTheDocument();
    expect(within(accRow).queryByTitle(/career_routes/)).not.toBeInTheDocument();

    // And the page explains the reduced tier next to the count.
    await waitFor(() =>
      expect(provenanceText()).toMatch(/1 of these players is valued by the accessible-data model/i),
    );
  });
});
