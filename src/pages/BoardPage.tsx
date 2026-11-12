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
import { boardFreshness, publishedFormat, usePublishedMarket } from '@/services/publication';
import type { PublishedMarket, PublishedPlayer } from '@/services/publication';
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

type SortKey = 'rank' | 'name';

// Confidence, volatility and the position-internal composite are deliberately not sortable:
// the first two are uncalibrated and suppressed, and sorting by the composite would present a
// second ranking that contradicts the published one.
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: 'Published rank' },
  { key: 'name', label: 'Name (A–Z)' },
];

function sortPlayers(players: readonly PublishedPlayer[], sort: SortKey): PublishedPlayer[] {
  if (sort === 'name') return [...players].sort((a, b) => (a.name ?? a.playerId).localeCompare(b.name ?? b.playerId));
  // The adapter already ordered the board by its canonical published rank, unranked last.
  return [...players];
}

function matchesQuery(player: PublishedPlayer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (player.name ?? '').toLowerCase().includes(q) || player.playerId.toLowerCase().includes(q);
}

export default function BoardPage() {
  const [params, setParams] = useSearchParams();
  const market = usePublishedMarket();
  // Read at render. A board's age only needs day resolution, and the page re-renders on every
  // reload or interaction; no timer is scheduled.
  const now = Date.now();

  const pos = params.getAll('pos').filter((p): p is Position => (POSITIONS as string[]).includes(p));
  const sort = (SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'rank') as SortKey;
  const query = params.get('q') ?? '';

  const players = useMemo(() => market.market?.players ?? [], [market.market]);
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
        subtitle="PlayerTicker dynasty rankings · beta"
        actions={
          <Button onClick={market.retry} disabled={market.isFetching}>
            {market.isFetching ? 'Reloading…' : 'Reload'}
          </Button>
        }
      />

      {market.status === 'success' && market.market && <BoardStatus market={market.market} now={now} />}

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
          <PublicationProvenance market={market.market} shown={filtered.length} />

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
                <table className="w-full min-w-[640px] text-left">
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
                      <PublishedPlayerRow key={p.playerId} player={p} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacks into player rows rather than forcing a sideways scroll. */}
              <div className="rounded-card border border-border-default bg-surface px-3 md:hidden">
                {filtered.map((p) => (
                  <PublishedPlayerCard key={p.playerId} player={p} />
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
 * When the board was published, how old it is, and the format it was valued for — computed
 * from the board itself and the reader's clock, never from a frozen status file.
 */
function BoardStatus({ market, now }: { market: PublishedMarket; now: number }) {
  const freshness = boardFreshness(market.publishedAt, now);
  const format = publishedFormat(market);
  const asOf = market.players.find((p) => p.asOf !== null)?.asOf ?? null;
  return (
    <div className="mb-3 space-y-1.5">
      <p className="text-xs text-text-secondary">
        <span>{freshness.label}</span>
        {asOf && (
          <>
            {' · valued as of '}
            <span className="data">{asOf.slice(0, 10)}</span>
          </>
        )}
        {' · '}
        <span>{format.label ?? 'League format not published'}</span>
      </p>
      {freshness.warning && (
        <p
          role="alert"
          data-freshness={freshness.state}
          className={cn(
            'max-w-4xl rounded-control border px-3 py-2 text-xs leading-relaxed',
            freshness.state === 'stale' || freshness.state === 'unknown'
              ? 'border-warning/40 bg-warning/10 text-text-primary'
              : 'border-border-default bg-surface text-text-secondary',
          )}
        >
          {freshness.warning}
        </p>
      )}
    </div>
  );
}

/** What the board is, what it is not, and how many players it could not value. */
function PublicationProvenance({ market, shown }: { market: PublishedMarket; shown: number }) {
  const unvalued = market.players.length - market.valuedCount;
  const qbEngine = market.players.filter((p) => p.modelTier === 'FULL').length;
  const boxScore = market.players.filter((p) => p.modelTier === 'ACCESSIBLE').length;
  return (
    <div className="mb-3 space-y-1.5 text-xs leading-relaxed text-text-muted">
      <p role="status" className="text-text-secondary">
        <span className="data font-semibold text-text-primary">{shown}</span> of{' '}
        <span className="data">{market.players.length}</span> published players
      </p>
      <p className="max-w-4xl">
        <strong>Value</strong> is PlayerTicker’s cross-position dynasty value on a 0–100 scale, and the rank is the
        order of that value. It has not yet been validated against future results: in back-tests it performed about
        as well as ranking players by last season’s fantasy points. Treat it as a production-based ranking, not a
        forecast.
      </p>
      {(boxScore > 0 || qbEngine > 0) && (
        <p className="max-w-4xl">
          {boxScore > 0 && (
            <>
              <span className="data">{boxScore}</span> running backs, receivers and tight ends are valued by a{' '}
              <strong>box-score model</strong> (production, team shares, age, draft round; no route, snap or red-zone
              data).{' '}
            </>
          )}
          {qbEngine > 0 && (
            <>
              <span className="data">{qbEngine}</span> quarterbacks are valued by the <strong>QB engine</strong>, with
              several of its inputs replaced by fallback values because our data sources do not supply them.
            </>
          )}{' '}
          Confidence ratings are not shown: they have not been calibrated.
        </p>
      )}
      {unvalued > 0 && (
        <p>
          <span className="data">{unvalued}</span> of these players{' '}
          {unvalued === 1 ? 'has' : 'have'} no published value because there is not enough information to value
          them; they show “—” rather than an estimate.
        </p>
      )}
      {market.rejected.length > 0 && (
        <p>
          <span className="data">{market.rejected.length}</span> published record
          {market.rejected.length === 1 ? ' was' : 's were'} not displayable and{' '}
          {market.rejected.length === 1 ? 'was' : 'were'} left out rather than guessed.
        </p>
      )}
    </div>
  );
}
