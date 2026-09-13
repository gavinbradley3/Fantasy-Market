// The Board — the CURRENT PUBLISHED MARKET (Phase 10).
//
// This page reads the real backend: `GET /publication`, through the API client and the
// publication adapter. It renders exactly what the publication contains and nothing else.
//
// There is no demo fallback on this page, by design. If the API is unreachable, this shows an
// error; if nothing has been published, it shows an empty state. Quietly substituting the Demo
// Market here would make an unreachable backend look like a healthy one, which is the specific
// failure this page must never have.

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePublishedMarket } from '@/services/publication';
import { FreshnessNote } from '@/components/data/FreshnessNote';
import type { PublishedPlayer } from '@/services/publication';
import {
  buildBoardComparisons,
  countCovered,
  formatLabel,
  marketUpdatedLabel,
  useExternalMarket,
  type ExternalMarket,
} from '@/services/market';
import {
  PUBLISHED_COLUMNS,
  PublishedPlayerCard,
  PublishedPlayerRow,
} from '@/components/market/publishedRows';
import { Footer } from '@/components/chrome/Footer';
import { PageHeader } from '@/components/chrome/PageHeader';
import { Button } from '@/components/ui/Button';
import { ChevronDownIcon, SearchIcon } from '@/components/ui/icons';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/states';
import { apiErrorCopy } from '@/components/states/apiErrorCopy';
import { cn } from '@/lib/ui';
import type { Position } from '@/types/market';

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

type SortKey = 'rank' | 'confidence' | 'volatility' | 'name';

// There is no separate "Model value" sort any more. It ordered the board by the position
// engine's internal composite for the displayed horizon, which is a DIFFERENT ordering from the
// rank in the first column — two sort options that claimed to be the same thing and were not.
// PlayerTicker Rank is the ordering over PlayerTicker Value, so sorting by one IS sorting by
// the other.
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: 'PlayerTicker Rank' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'volatility', label: 'Volatility' },
  { key: 'name', label: 'Name (A–Z)' },
];

/** Sort helper that keeps unpublished values last instead of treating them as zero. */
function byNumberDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function sortPlayers(players: readonly PublishedPlayer[], sort: SortKey): PublishedPlayer[] {
  const s = [...players];
  switch (sort) {
    case 'confidence':
      return s.sort(
        (a, b) => byNumberDesc(a.confidenceScore, b.confidenceScore) || a.playerId.localeCompare(b.playerId),
      );
    case 'volatility':
      return s.sort(
        (a, b) => byNumberDesc(a.volatilityScore, b.volatilityScore) || a.playerId.localeCompare(b.playerId),
      );
    case 'name':
      return s.sort((a, b) => (a.name ?? a.playerId).localeCompare(b.name ?? b.playerId));
    case 'rank':
    default:
      // The adapter already ordered the board by PlayerTicker Value — the shared
      // cross-position dynasty value over replacement — with unvalued players last.
      return s;
  }
}

/**
 * What the board is ranked by, said on the page rather than left to be inferred.
 *
 * The league format is not asserted as a constant — it is read from the schema the backend
 * actually valued this board under, so the subtitle cannot outlive a format change. An older
 * board that published no schema id says only what it ranks on.
 */
const SCHEMA_LABELS: Readonly<Record<string, string>> = {
  'dynasty-superflex-12': '12-team Superflex',
};

export function boardSubtitle(players: readonly PublishedPlayer[]): string {
  if (players.some((player) => player.dynastyContract === 'legacy')) {
    return 'Legacy composite board · canonical dynasty values unavailable';
  }
  const base = 'Ranked by projected dynasty value over replacement';
  const ids = new Set(players.map((p) => p.leagueSchemaId).filter((id): id is string => id !== null));
  // More than one schema on one board would mean two formats were mixed, which is a backend
  // fault; naming neither is the honest reading rather than picking one arbitrarily.
  if (ids.size !== 1) return base;
  const id = [...ids][0];
  return `${base} · ${SCHEMA_LABELS[id] ?? id}`;
}

function matchesQuery(player: PublishedPlayer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (player.name ?? '').toLowerCase().includes(q) || player.playerId.toLowerCase().includes(q);
}

export default function BoardPage() {
  const [params, setParams] = useSearchParams();
  const market = usePublishedMarket();
  // Supplementary, and read independently: if the external market is unavailable the board
  // still renders PlayerTicker's own valuations, with the market columns showing absence.
  const external = useExternalMarket();

  const pos = params.getAll('pos').filter((p): p is Position => (POSITIONS as string[]).includes(p));
  const sort = (SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'rank') as SortKey;
  const query = params.get('q') ?? '';

  const players = useMemo(() => market.market?.players ?? [], [market.market]);
  // Built from the WHOLE board rather than the filtered rows: percentile denominators depend
  // on how many players each side ranks, and a player's standing must not shift because the
  // reader typed in the search box.
  const comparisons = useMemo(
    () => buildBoardComparisons(players, external.market),
    [players, external.market],
  );
  const filtered = useMemo(() => {
    let rows = players;
    if (pos.length) rows = rows.filter((p) => pos.includes(p.position));
    if (query.trim()) rows = rows.filter((p) => matchesQuery(p, query));
    return sortPlayers(rows, sort);
    // `pos` is rebuilt each render from the URL; its contents, not its identity, matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, pos.join(','), query, sort]);

  const update = (mut: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mut(next);
    setParams(next, { replace: true });
  };
  const togglePos = (p: Position) =>
    update((n) => {
      const cur = n.getAll('pos');
      n.delete('pos');
      (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]).forEach((x) => n.append('pos', x));
    });
  const setParam = (k: string, v: string | null) => update((n) => (v ? n.set(k, v) : n.delete(k)));
  const reset = () => setParams(new URLSearchParams(), { replace: true });
  const activeFilters = pos.length + (query ? 1 : 0);

  const errorCopy = apiErrorCopy(market.error);

  return (
    <div>
      <PageHeader
        title="The Board"
        subtitle={boardSubtitle(players)}
        actions={
          <Button onClick={market.retry} disabled={market.isFetching}>
            {market.isFetching ? 'Refreshing…' : 'Refresh Market'}
          </Button>
        }
      />

      {/* Controls stay mounted across states so the layout does not jump on load. */}
      {/* When the board was last refreshed. Renders nothing when no status document exists. */}
      <FreshnessNote dataset="board" className="mb-3" />

      <div className="mb-5 flex flex-wrap items-center gap-2 border-y border-border-default py-3">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => setParam('q', e.target.value || null)}
            placeholder="Search player name or id…"
            // Distinct from the app shell's global "Search players" button, so the two are
            // never ambiguous to a screen reader or a keyboard user on this page.
            aria-label="Search published players"
            className="w-full rounded-control border border-border-default bg-surface py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-colors duration-standard placeholder:text-text-faint hover:border-border-strong focus:border-border-focus"
          />
        </div>

        <div className="flex gap-1" role="group" aria-label="Filter by position">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => togglePos(p)}
              aria-pressed={pos.includes(p)}
              className={cn(
                'min-w-[40px] rounded-control border px-2.5 py-1.5 text-xs font-semibold transition-colors duration-standard',
                pos.includes(p)
                  ? 'border-brand-blue/50 bg-brand-blue/10 text-text-primary'
                  : 'border-border-default text-text-muted hover:border-border-strong hover:text-text-secondary',
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            className="appearance-none rounded-control border border-border-default bg-surface py-2 pl-3 pr-8 text-sm text-text-secondary outline-none transition-colors duration-standard hover:border-border-strong focus:border-border-focus"
            aria-label="Sort by"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={15}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint"
          />
        </div>

        {activeFilters > 0 && (
          <button
            onClick={reset}
            className="rounded-control px-2 py-1.5 text-xs font-medium text-text-muted transition-colors duration-standard hover:text-text-primary"
          >
            Reset
          </button>
        )}
      </div>

      {market.status === 'loading' && (
        <div className="grid gap-2" aria-label="Loading published market">
          {Array.from({ length: 8 }, (_, i) => (
            <LoadingSkeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {market.status === 'error' && (
        <ErrorState
          message={errorCopy.message}
          detail={errorCopy.detail}
          onRetry={errorCopy.retryable ? market.retry : undefined}
          retryLabel="Try Again"
        />
      )}

      {market.status === 'empty' && (
        <EmptyState
          title="No market publication is available yet."
          body="The market service is reachable — it just hasn't published a board yet. Once a refresh run publishes one, it appears here."
        />
      )}

      {market.status === 'success' && market.market && (
        <>
          <PublicationProvenance
            market={market.market}
            shown={filtered.length}
            external={external.market}
            externalUnavailable={external.unavailable}
            covered={countCovered(comparisons)}
          />

          {filtered.length === 0 ? (
            <div className="rounded-card border border-border-default bg-surface px-4 py-14 text-center">
              <p className="text-sm text-text-secondary">No published players match these filters.</p>
              <Button onClick={reset} className="mt-4">
                Clear all filters
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-card border border-border-default bg-surface md:block">
                <table className="w-full min-w-[880px] text-left">
                  <thead className="eyebrow sticky top-0 z-10 bg-surface-subtle">
                    <tr>
                      {PUBLISHED_COLUMNS.map((c) => (
                        <th
                          key={c.label}
                          scope="col"
                          className={cn(
                            'whitespace-nowrap border-b border-border-default px-3 py-2.5 font-semibold first:pl-4 last:pr-4',
                            c.align === 'right' && 'text-right',
                            'grow' in c && c.grow ? 'w-full' : 'w-px',
                          )}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <PublishedPlayerRow
                        key={p.playerId}
                        player={p}
                        comparison={comparisons.get(p.playerId)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacks into player rows rather than forcing a sideways scroll. */}
              <div className="rounded-card border border-border-default bg-surface px-3 md:hidden">
                {filtered.map((p) => (
                  <PublishedPlayerCard
                    key={p.playerId}
                    player={p}
                    comparison={comparisons.get(p.playerId)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Footer />
    </div>
  );
}

/**
 * Provenance for the board on screen, including the two counts that matter for honesty: how
 * many players carry a published value, and how many records the adapter refused.
 */
function PublicationProvenance({
  market,
  shown,
  external,
  externalUnavailable,
  covered,
}: {
  market: NonNullable<ReturnType<typeof usePublishedMarket>['market']>;
  shown: number;
  external: ExternalMarket | undefined;
  externalUnavailable: boolean;
  covered: number;
}) {
  const unvalued = market.players.length - market.valuedCount;
  const limited = market.players.filter((p) => p.modelTier === 'ACCESSIBLE').length;
  return (
    <div className="mb-3 space-y-1.5 text-xs leading-relaxed text-text-muted">
      {/* role="status" carries an implicit polite live region and gives the count a queryable
          landmark, so filter results are announced as they change. */}
      <p role="status" className="text-text-secondary">
        <span className="data font-semibold text-text-primary">{shown}</span> of{' '}
        <span className="data">{market.players.length}</span> published players
        {' · published '}
        <span className="data">{market.publishedAt}</span>
      </p>
      {limited > 0 && (
        <p className="max-w-4xl">
          <span className="data">{limited}</span> of these players{' '}
          {limited === 1 ? 'is' : 'are'} valued by the <strong>accessible-data model</strong> and
          marked <strong>Coverage: Standard</strong>. That is a deliberately reduced model built
          only on the data we can obtain for them — box-score production, team shares and age —
          without route, snap or red-zone data. <strong>Coverage is not confidence.</strong> It
          describes which inputs existed, and it is the same for all {limited} of them;
          confidence describes how well evidenced each player is for what the model asks, and is
          scored per player. A player can legitimately read Standard coverage and high
          confidence.
        </p>
      )}
      {unvalued > 0 && (
        <p>
          <span className="data">{unvalued}</span> of these players{' '}
          {unvalued === 1 ? 'has' : 'have'} no published value, because there is not enough
          information about them to value honestly — value, confidence and volatility are shown
          as “—” rather than estimated.
        </p>
      )}
      {/* PlayerTicker's own movement. The board publishes a single current snapshot, so there is
          no prior PlayerTicker value to difference against and no movement column exists. Saying
          so beats leaving the reader to wonder whether movement is zero or simply absent — and
          it is the one honest thing to say, because the alternative is a 0.0 that would read as
          "unchanged" when nothing has been measured. */}
      <p>
        Movement in PlayerTicker Value appears once multiple PlayerTicker snapshots have been
        collected; this board shows the current one, so no PlayerTicker movement is displayed.
      </p>
      {market.rejected.length > 0 && (
        <p>
          <span className="data">{market.rejected.length}</span> published record
          {market.rejected.length === 1 ? ' was' : 's were'} not displayable and{' '}
          {market.rejected.length === 1 ? 'was' : 'were'} left out rather than guessed.
        </p>
      )}
      <MarketProvenance
        external={external}
        unavailable={externalUnavailable}
        covered={covered}
        boardSize={market.players.length}
      />
    </div>
  );
}

/**
 * Where the market columns come from, and what they do not cover.
 *
 * Four things have to be said here and none of them are decoration: whose numbers these are,
 * how current they actually are, how many board players the source has never heard of, and
 * which PlayerTicker ranking the comparison is against. That last line used to say the delta
 * was NOT against the rank column beside it, because the comparison re-ranked the board on the
 * position engines' internal composites. It is the same ranking now, and saying so is what
 * makes the Edge column checkable by eye.
 *
 * The wording stays restrained — "market updated Sep 11", not "live" — because the source
 * publishes weekly and any stronger word would outrun the data.
 */
function MarketProvenance({
  external,
  unavailable,
  covered,
  boardSize,
}: {
  external: ExternalMarket | undefined;
  unavailable: boolean;
  covered: number;
  boardSize: number;
}) {
  if (unavailable) {
    return (
      <p>
        External market context is unavailable right now, so the market columns show “—”. The
        PlayerTicker valuations above are unaffected.
      </p>
    );
  }
  if (!external) return null;
  if (external.quoteCount === 0) {
    return <p>No external market data has been ingested yet, so the market columns show “—”.</p>;
  }

  const updated = marketUpdatedLabel(external.sourceTimestamp);
  const uncovered = boardSize - covered;
  return (
    <p className="max-w-4xl">
      Market columns show <strong>{external.attribution.publisher}</strong> dynasty{' '}
      {formatLabel(external.format)} ranks, compared against the{' '}
      <strong>PlayerTicker Rank</strong> in the first column — the same ranking, so subtracting
      the two ranks on a row reproduces its “vs Mkt” figure
      {updated ? <> · market updated <span className="data">{updated}</span></> : null} ·{' '}
      {external.attribution.refreshCadence} · external comparison source, not a PlayerTicker
      valuation.
      {uncovered > 0 && (
        <>
          {' '}
          <span className="data">{uncovered}</span> of these players{' '}
          {uncovered === 1 ? 'is' : 'are'} not covered by it and show “—” rather than a zero.
        </>
      )}
      {!external.movementAvailable && (
        <>
          {' '}
          Only {external.captureCount === 1 ? 'one capture is' : `${external.captureCount} captures are`} stored, so
          no market movement is shown.
        </>
      )}
    </p>
  );
}
