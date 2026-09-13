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
  dynastyValue?: number | null;
  dynastyOverallRank?: number | null;
  dynastyPositionRank?: number | null;
  leagueSchemaId?: string | null;
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
    // The shared cross-position value the board ranks on AND displays. Defaulted to the
    // composite so the existing fixtures keep their numbers; the trust-pass tests below set it
    // apart from the composite deliberately, which is the only way to catch a display or a
    // ranking that has quietly re-pointed at the position-internal number.
    dynastyValue: o.dynastyValue !== undefined ? o.dynastyValue : o.weekly,
    dynastyOverallRank: o.dynastyOverallRank,
    dynastyPositionRank: o.dynastyPositionRank,
    leagueSchemaId: o.leagueSchemaId !== undefined ? o.leagueSchemaId : 'dynasty-superflex-12',
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
  const ranked = [...entries]
    .filter((entry) => entry.dynastyValue !== null)
    .sort((a, b) => (b.dynastyValue ?? 0) - (a.dynastyValue ?? 0) || a.canonicalId.localeCompare(b.canonicalId));
  const overall = new Map(ranked.map((entry, index) => [entry.canonicalId, index + 1]));
  const positions = new Map<string, number>();
  const positionRanks = new Map<string, number>();
  for (const entry of ranked) {
    const rank = (positions.get(entry.position) ?? 0) + 1;
    positions.set(entry.position, rank);
    positionRanks.set(entry.canonicalId, rank);
  }
  const canonicalEntries = entries.map((entry) => ({
    ...entry,
    dynastyOverallRank: entry.dynastyOverallRank ?? overall.get(entry.canonicalId) ?? null,
    dynastyPositionRank: entry.dynastyPositionRank ?? positionRanks.get(entry.canonicalId) ?? null,
  }));
  return {
    publication: {
      publicationId: 'pub-1',
      runId: 'run-1',
      snapshotId: 'snap-1',
      boardChecksum: 'chk',
      entryCount: canonicalEntries.length,
      publishedAt: '2026-01-01T00:00:00.000Z',
      supersededPublicationId: null,
    },
    entries: canonicalEntries,
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

/** An external market response, in the shape `GET /market` actually serves. */
function marketResponse(
  quotes: { canonicalPlayerId: string; value: number | null; overallRank: number | null; positionRank?: number | null }[],
  over: Record<string, unknown> = {},
) {
  return {
    source: 'dynastyprocess',
    format: 'dynasty_superflex',
    attribution: {
      publisher: 'DynastyProcess',
      url: 'https://github.com/dynastyprocess/data',
      licence: 'GPL-3.0',
      derivedFrom: 'FantasyPros expert consensus',
      refreshCadence: 'weekly',
      usage: 'External comparison source, not PlayerTicker-owned market data.',
    },
    sourceTimestamp: '2026-09-11T00:00:00.000Z',
    sourceVersion: '2026-09-11',
    capturedAt: '2026-09-11T18:00:00.000Z',
    captureCount: 1,
    quoteCount: quotes.length,
    quotes: quotes.map((q) => ({
      canonicalPlayerId: q.canonicalPlayerId,
      source: 'dynastyprocess',
      format: 'dynasty_superflex',
      value: q.value,
      overallRank: q.overallRank,
      positionRank: q.positionRank ?? q.overallRank,
      sourceTimestamp: '2026-09-11T00:00:00.000Z',
      ingestedAt: '2026-09-11T18:00:00.000Z',
      freshness: 'fresh',
      provenance: 'external',
    })),
    ...over,
  };
}

/** Route by path so the board's two independent reads can be answered differently. */
function routed(publicationBody: unknown, marketBody: unknown, marketStatus = 200): typeof fetch {
  return (async (input: RequestInfo | URL) =>
    String(input).includes('/market')
      ? jsonResponse(marketBody, marketStatus)
      : jsonResponse(publicationBody)) as unknown as typeof fetch;
}

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
    expect(screen.getByText('Loading published market…')).toBeInTheDocument();
    expect(screen.queryByText(/12-team Dynasty|Full PPR/)).not.toBeInTheDocument();
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
    expect(within(unvaluedRow).getByText('Limited')).toBeInTheDocument();
    expect(within(valuedRow).getByText('Full')).toBeInTheDocument();
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
    expect(screen.getByText(/12-team Dynasty · Superflex · Full PPR/)).toBeInTheDocument();
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

  it('offers ONE PlayerTicker ordering, and it keeps unvalued players last', async () => {
    // There is no separate "Model value" sort. It ordered on the position engines' internal
    // composite for the displayed horizon — a different ordering from the rank in the first
    // column, offered beside it as though the two were the same thing.
    const mixed = [
      apiEntry({ canonicalId: 'a', position: 'WR', name: 'Low Value', weekly: 10 }),
      apiEntry({ canonicalId: 'b', position: 'WR', name: 'No Value', weekly: null }),
      apiEntry({ canonicalId: 'c', position: 'WR', name: 'High Value', weekly: 99 }),
    ];
    renderBoard(respondWith(publication(mixed)));
    await screen.findAllByText('High Value');

    const sort = screen.getByLabelText('Sort by') as HTMLSelectElement;
    expect([...sort.options].map((o) => o.value)).not.toContain('value');
    expect([...sort.options].map((o) => o.textContent)).toContain('PlayerTicker Rank');

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
    renderBoard(respondWith(publication(FOUR_POSITIONS)), '/board?pos=RB&sort=name');
    await waitFor(() => expect(boardCount()).toMatch(/1 of 4 published players/));
    expect(screen.getAllByText('Test Runner').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('name');
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
    // Counted per endpoint: the page also reads the external market on mount, and this test
    // is about the publication read the button re-runs.
    const publicationCalls = () => spy.mock.calls.filter((c) => String(c[0]).includes('/publication')).length;
    await waitFor(() => expect(publicationCalls()).toBe(2));
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

    // COVERAGE, in three words that describe the INPUT SET rather than the answer's quality.
    expect(within(fullRow).getByText('Full')).toBeInTheDocument();
    expect(within(accRow).getByText('Standard')).toBeInTheDocument();
    expect(within(noneRow).getByText('Limited')).toBeInTheDocument();

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

describe('external market context on the board', () => {
  // The market's numbers belong to somebody else and cover fewer players than the board. Both
  // facts have to survive all the way to the DOM: an uncovered player must read as uncovered,
  // and the source must be named. These tests fail if either quietly stops being true.

  const boardWithMarket = (
    quotes: Parameters<typeof marketResponse>[0],
    over: Record<string, unknown> = {},
  ) => routed(publication(FOUR_POSITIONS), marketResponse(quotes, over));

  it('shows the market rank beside the model rank', async () => {
    renderBoard(
      boardWithMarket([
        { canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 3 },
        { canonicalPlayerId: 'pt-rb', value: 7000, overallRank: 1 },
      ]),
    );
    await screen.findAllByText('Test Passer');
    await waitFor(() => expect(screen.getAllByTitle(/Dynasty Superflex market value 10,256/).length).toBeGreaterThan(0));
  });

  it('states the disagreement in places, with PlayerTicker-higher as a positive number', async () => {
    // The board ranks the QB 1st (weekly 90 is the best value); the market has them 3rd.
    renderBoard(
      boardWithMarket([
        { canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 3 },
        { canonicalPlayerId: 'pt-rb', value: 9000, overallRank: 1 },
        { canonicalPlayerId: 'pt-wr', value: 8000, overallRank: 2 },
      ]),
    );
    await screen.findAllByText('Test Passer');
    // The tooltip names BOTH ranks, and the model rank it names is the one in the row's first
    // column — so a reader can subtract the two numbers on screen and get the same answer.
    await waitFor(() =>
      expect(
        screen.getAllByTitle(/PlayerTicker #1, market #3 — 2 places higher/).length,
      ).toBeGreaterThan(0),
    );
    const row = (await screen.findAllByText('Test Passer'))[0].closest('tr')!;
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(within(row).getByText('+2')).toBeInTheDocument();
  });

  it('renders an UNCOVERED player as absent — never as zero or last place', async () => {
    renderBoard(boardWithMarket([{ canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 1 }]));
    await screen.findAllByText('Test Passer');
    await waitFor(() =>
      expect(screen.getAllByLabelText('not covered by this market source').length).toBeGreaterThan(0),
    );
    // Nothing on the page claims a zero-valued market quote for the uncovered players.
    expect(provenanceText()).toContain('rather than a zero');
  });

  it('names the publisher and says these are not PlayerTicker valuations', async () => {
    renderBoard(boardWithMarket([{ canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 1 }]));
    await screen.findAllByText('Test Passer');
    await waitFor(() => expect(provenanceText()).toContain('DynastyProcess'));
    expect(provenanceText()).toContain('not a PlayerTicker');
    expect(provenanceText()).toContain('Superflex');
  });

  it('describes weekly data in weekly language — never "live" or "real-time"', async () => {
    renderBoard(boardWithMarket([{ canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 1 }]));
    await screen.findAllByText('Test Passer');
    await waitFor(() => expect(provenanceText()).toContain('market updated Sep 11'));
    expect(provenanceText()).toContain('weekly');
    expect(provenanceText()).not.toMatch(/live|real[- ]?time|24H|1H/i);
  });

  it('says no movement is shown while only one capture is stored', async () => {
    renderBoard(boardWithMarket([{ canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 1 }]));
    await screen.findAllByText('Test Passer');
    await waitFor(() => expect(provenanceText()).toContain('no market movement is shown'));
  });

  it('an unavailable market degrades to "—" and leaves the board standing', async () => {
    renderBoard(routed(publication(FOUR_POSITIONS), { error: { code: 'X', message: 'down' } }, 503));
    // The valuations are all still there — a third party's outage is not a board outage.
    for (const name of ['Test Passer', 'Test Runner', 'Test Receiver', 'Test End']) {
      expect((await rowsFor(name)).length).toBeGreaterThan(0);
    }
    await waitFor(() => expect(provenanceText()).toContain('External market context is unavailable'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('an empty market says so instead of showing zeroes', async () => {
    renderBoard(boardWithMarket([], { quoteCount: 0, captureCount: 0, sourceTimestamp: null }));
    await screen.findAllByText('Test Passer');
    await waitFor(() =>
      expect(provenanceText()).toContain('No external market data has been ingested yet'),
    );
  });

  it('never lets a market value into the model Value column', async () => {
    renderBoard(boardWithMarket([{ canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 1 }]));
    await screen.findAllByText('Test Passer');
    await waitFor(() => expect(screen.getAllByTitle(/Dynasty Superflex market value 10,256/).length).toBeGreaterThan(0));
    // The model value for the QB is 90.0. The market's 10,256 appears only as a tooltip on the
    // market column — never rendered as the player's value.
    expect(screen.getAllByText('90.0').length).toBeGreaterThan(0);
    expect(screen.queryByText('10256')).not.toBeInTheDocument();
    expect(screen.queryByText('10,256')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The core-product trust pass
//
// One ranking, displayed as the number it is over; coverage and confidence as two independent
// dimensions; and an honest word for a player a reduced model valued. Each test here pins a
// specific defect that shipped, so a reversion fails loudly rather than quietly.
// ---------------------------------------------------------------------------

describe('The Board — one ranking, one number', () => {
  it('renders backend rank/value on desktop and mobile when equal values oppose the old tie-breaker', async () => {
    const opposedTie = [
      apiEntry({ canonicalId: 'pt-second', position: 'WR', name: 'Composite Favorite', weekly: 99,
        dynastyValue: 70, dynastyOverallRank: 2, dynastyPositionRank: 2 }),
      apiEntry({ canonicalId: 'pt-first', position: 'WR', name: 'Canonical First', weekly: 1,
        dynastyValue: 70, dynastyOverallRank: 1, dynastyPositionRank: 1 }),
    ];
    renderBoard(respondWith(publication(opposedTie)));
    const names = await screen.findAllByText('Canonical First');
    expect(names).toHaveLength(2); // desktop row and mobile card

    const desktop = names[0].closest('tr')!;
    expect(within(desktop).getByText('1')).toBeInTheDocument();
    expect(within(desktop).getByText('70.0')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Canonical First');
    expect(rows[1].textContent).toContain('Composite Favorite');
    expect(screen.getAllByText('70.0')).toHaveLength(4); // both values in both layouts
    expect(screen.queryByText('99.0')).not.toBeInTheDocument();
  });

  it('keeps canonical labels and Market Edge fixed under alternative sorting', async () => {
    renderBoard(
      routed(
        publication([
          apiEntry({ canonicalId: 'pt-z', position: 'QB', name: 'Zulu', weekly: 90,
            dynastyOverallRank: 1, dynastyPositionRank: 1 }),
          apiEntry({ canonicalId: 'pt-a', position: 'RB', name: 'Alpha', weekly: 80,
            dynastyOverallRank: 2, dynastyPositionRank: 1 }),
        ]),
        marketResponse([{ canonicalPlayerId: 'pt-z', value: 10000, overallRank: 3 }]),
      ),
    );
    await screen.findAllByText('Zulu');
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'name');
    const zulu = (await screen.findAllByText('Zulu'))[0].closest('tr')!;
    expect(within(zulu).getByText('1')).toBeInTheDocument();
    await waitFor(() => expect(within(zulu).getByText('+2')).toBeInTheDocument());
  });

  it('does not display a diagnostic composite for an explicitly unvalued current entry', async () => {
    const diagnostic = apiEntry({ canonicalId: 'pt-null', position: 'WR', name: 'Diagnostic Only', weekly: 55,
      dynastyValue: null, dynastyOverallRank: null, dynastyPositionRank: null });
    renderBoard(respondWith(publication([diagnostic])));
    expect(await screen.findAllByText('Diagnostic Only')).toHaveLength(2);
    expect(screen.queryByText('55.0')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('no value published for this player')).toHaveLength(2);
  });

  it('displays the value it RANKS on, not the position engine’s weekly composite', async () => {
    // THE DEFECT. The board ordered rows by `dynastyValue` and printed `value` — the position
    // engine's internal composite for the displayed horizon. So rank 1 could carry a smaller
    // printed number than rank 3, because the column and the ordering were different
    // quantities on different scales. Here the two are deliberately opposed: the weekly
    // composites descend 90/80/70 while the dynasty values ascend 40/60/95.
    const opposed = [
      apiEntry({ canonicalId: 'pt-a', position: 'QB', name: 'Weekly Leader', weekly: 90, dynastyValue: 40 }),
      apiEntry({ canonicalId: 'pt-b', position: 'RB', name: 'Middle', weekly: 80, dynastyValue: 60 }),
      apiEntry({ canonicalId: 'pt-c', position: 'WR', name: 'Dynasty Leader', weekly: 70, dynastyValue: 95 }),
    ];
    renderBoard(respondWith(publication(opposed)));
    await screen.findAllByText('Dynasty Leader');

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Dynasty Leader');
    expect(rows[0].textContent).toContain('95.0');
    expect(rows[2].textContent).toContain('Weekly Leader');
    expect(rows[2].textContent).toContain('40.0');
    // The weekly composites are not on the board at all now.
    expect(screen.queryByText('90.0')).not.toBeInTheDocument();
  });

  it('reads down the value column monotonically, because rank IS that ordering', async () => {
    renderBoard(
      respondWith(
        publication([
          apiEntry({ canonicalId: 'pt-a', position: 'QB', name: 'One', weekly: 10, dynastyValue: 88 }),
          apiEntry({ canonicalId: 'pt-b', position: 'TE', name: 'Two', weekly: 99, dynastyValue: 54 }),
          apiEntry({ canonicalId: 'pt-c', position: 'WR', name: 'Three', weekly: 50, dynastyValue: 21 }),
        ]),
      ),
    );
    await screen.findAllByText('One');
    const values = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => Number(/(\d+\.\d)/.exec(r.textContent ?? '')?.[1] ?? NaN));
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it('names what the board is ranked by, and the league it is ranked for', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)));
    await screen.findAllByText('Test Passer');
    expect(
      screen.getByText(/Ranked by projected dynasty value over replacement · 12-team Dynasty · Superflex · Full PPR/),
    ).toBeInTheDocument();
    // Desktop column header and mobile card label both name it.
    expect(screen.getAllByText('PlayerTicker Value').length).toBeGreaterThan(0);
    expect(screen.getByText('Rank')).toBeInTheDocument();
  });

  it('does not guess scoring for missing or unknown schema metadata', async () => {
    const { unmount } = renderBoard(respondWith(publication([
      apiEntry({ canonicalId: 'pt-missing', position: 'WR', name: 'Missing Format', weekly: 70, leagueSchemaId: null }),
    ])));
    await screen.findAllByText('Missing Format');
    expect(screen.getByText(/Published format unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Full PPR|12-team Superflex/)).not.toBeInTheDocument();
    unmount();

    renderBoard(respondWith(publication([
      apiEntry({ canonicalId: 'pt-unknown', position: 'WR', name: 'Unknown Format', weekly: 70, leagueSchemaId: 'future-schema' }),
    ])));
    await screen.findAllByText('Unknown Format');
    expect(screen.getByText(/Published format unrecognized/)).toBeInTheDocument();
    expect(screen.queryByText(/Full PPR|12-team Superflex/)).not.toBeInTheDocument();
  });

  it('warns on conflicting schema metadata and never selects the first entry', async () => {
    renderBoard(respondWith(publication([
      apiEntry({ canonicalId: 'pt-known', position: 'WR', name: 'Known Schema', weekly: 70 }),
      apiEntry({ canonicalId: 'pt-conflict', position: 'QB', name: 'Other Schema', weekly: 60, leagueSchemaId: 'future-schema' }),
    ])));
    await screen.findAllByText('Known Schema');
    expect(screen.getByText(/Published format inconsistent/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/format metadata is inconsistent/i);
    expect(screen.queryByText(/12-team Dynasty · Superflex · Full PPR/)).not.toBeInTheDocument();
  });

  it('preserves the legacy disclosure without inventing a scoring format', async () => {
    const current = apiEntry({ canonicalId: 'pt-legacy', position: 'WR', name: 'Legacy Player', weekly: 70 });
    const { dynastyValue: _value, dynastyOverallRank: _overall, dynastyPositionRank: _position, ...legacy } = current;
    renderBoard(respondWith({
      publication: { publicationId: 'legacy', runId: 'run', snapshotId: 'snap', boardChecksum: 'checksum',
        entryCount: 1, publishedAt: '2026-09-12T00:00:00Z', supersededPublicationId: null },
      entries: [legacy],
    }));
    await screen.findAllByText('Legacy Player');
    expect(screen.getByText(/Legacy composite board · canonical dynasty values unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Full PPR|12-team Superflex/)).not.toBeInTheDocument();
  });

  it('keeps the OVERALL rank visible under a position filter', async () => {
    // A filter narrows what is shown; it does not renumber the board. A tight end who is 4th
    // overall is 4th overall while the TE filter is on — showing "1" there would invent a
    // second ranking out of a view state.
    renderBoard(respondWith(publication(FOUR_POSITIONS)), '/board?pos=TE');
    await waitFor(() => expect(boardCount()).toMatch(/1 of 4 published players/));
    const row = (await screen.findAllByText('Test End'))[0].closest('tr')!;
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).queryByText('1')).not.toBeInTheDocument();
  });
});

describe('The Board — coverage and confidence are independent', () => {
  const mixed = [
    apiEntry({
      canonicalId: 'pt-acc-high',
      position: 'WR',
      name: 'Well Evidenced Receiver',
      weekly: 64,
      dynastyValue: 64,
      modelTier: 'ACCESSIBLE',
      honestyState: 'ESTIMATED',
      readiness: 'NOT_READY',
      confidenceScore: 83,
      confidenceLabel: 'HIGH',
      materialMissingInputs: ['Route participation (no approved RB/TE method for converting it to career routes)'],
    }),
    apiEntry({
      canonicalId: 'pt-full-low',
      position: 'QB',
      name: 'Thin Full Model Passer',
      weekly: 70,
      dynastyValue: 70,
      confidenceScore: 22,
      confidenceLabel: 'LOW',
      // Distinct from the confidence label, so the assertions below cannot pass on the wrong cell.
      volatilityLabel: 'HIGH',
    }),
  ];

  it('shows Standard coverage WITH high confidence — the combination that used to be impossible', async () => {
    // Confidence used to start from a ceiling of 74 and then subtract the same 21 points of
    // tier-wide coverage gaps from every accessible player, so 53 was the highest score any of
    // them could reach and HIGH was unreachable for 82% of the board. Coverage says which
    // inputs existed; confidence says how well evidenced this player is within them.
    renderBoard(respondWith(publication(mixed)));
    const row = (await screen.findAllByText('Well Evidenced Receiver'))[0].closest('tr')!;
    expect(within(row).getByText('Standard')).toBeInTheDocument();
    expect(within(row).getByText('HIGH')).toBeInTheDocument();
    expect(within(row).getByText('83')).toBeInTheDocument();
  });

  it('shows Full coverage WITH low confidence — the same independence in the other direction', async () => {
    renderBoard(respondWith(publication(mixed)));
    const row = (await screen.findAllByText('Thin Full Model Passer'))[0].closest('tr')!;
    expect(within(row).getByText('Full')).toBeInTheDocument();
    expect(within(row).getByText('LOW')).toBeInTheDocument();
    expect(within(row).getByText('22')).toBeInTheDocument();
  });

  it('says in words that coverage is not confidence', async () => {
    renderBoard(respondWith(publication(mixed)));
    await screen.findAllByText('Well Evidenced Receiver');
    await waitFor(() => expect(provenanceText()).toContain('Coverage is not confidence'));
  });

  it('gives Coverage and Confidence their own columns', async () => {
    renderBoard(respondWith(publication(mixed)));
    await screen.findAllByText('Well Evidenced Receiver');
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getAllByText(/^Confidence/).length).toBeGreaterThan(0);
    // The old single "Model" column, which conflated the two, is gone.
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
  });
});

describe('The Board — honest absence', () => {
  it('publishes an accessible valuation as valued, not as unavailable', async () => {
    // The backend used to publish honesty UNAVAILABLE for every accessible player, because
    // `honestyState` read the FULL model's readiness — NOT_READY on this tier by construction.
    // All 272 accessible players on the live board carried it, beside a complete valuation.
    const entries = [
      apiEntry({
        canonicalId: 'pt-acc',
        position: 'RB',
        name: 'Accessible Back',
        weekly: 61,
        dynastyValue: 61,
        modelTier: 'ACCESSIBLE',
        honestyState: 'ESTIMATED',
        readiness: 'NOT_READY',
      }),
    ];
    renderBoard(respondWith(publication(entries)));
    const row = (await screen.findAllByText('Accessible Back'))[0].closest('tr')!;
    expect(within(row).queryByText('UNAVAILABLE')).not.toBeInTheDocument();
    expect(within(row).getByText('61.0')).toBeInTheDocument();
    expect(within(row).getByText('Standard')).toBeInTheDocument();
  });

  it('is honest that PlayerTicker movement needs more than one snapshot', async () => {
    renderBoard(respondWith(publication(FOUR_POSITIONS)));
    await screen.findAllByText('Test Passer');
    await waitFor(() =>
      expect(provenanceText()).toMatch(
        /Movement in PlayerTicker Value appears once multiple PlayerTicker snapshots have been collected/,
      ),
    );
  });

  it('shows no Edge at all for a player the market does not cover', async () => {
    renderBoard(
      routed(
        publication(FOUR_POSITIONS),
        marketResponse([{ canonicalPlayerId: 'pt-qb', value: 10256, overallRank: 1 }]),
      ),
    );
    const row = (await screen.findAllByText('Test Receiver'))[0].closest('tr')!;
    expect(within(row).getByLabelText('not covered by this market source')).toBeInTheDocument();
    expect(within(row).getByLabelText('no comparison available')).toBeInTheDocument();
    // Not a zero, and not "="; "=" would assert the two sides agree, which is a claim.
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
    expect(within(row).queryByText('=')).not.toBeInTheDocument();
  });
});
