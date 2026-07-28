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
import type { PublishedPlayer } from '@/services/publication';
import {
  PUBLISHED_COLUMNS,
  PublishedPlayerCard,
  PublishedPlayerRow,
} from '@/components/market/publishedRows';
import { Footer } from '@/components/chrome/Footer';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/states';
import { apiErrorCopy } from '@/components/states/apiErrorCopy';
import { cn } from '@/lib/ui';
import type { Position } from '@/types/market';

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

type SortKey = 'rank' | 'value' | 'confidence' | 'volatility' | 'name';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: 'Published rank' },
  { key: 'value', label: 'Model value' },
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
    case 'value':
      return s.sort((a, b) => byNumberDesc(a.value, b.value) || a.playerId.localeCompare(b.playerId));
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
      // The adapter already ordered the board by published value with unvalued players last.
      return s;
  }
}

function matchesQuery(player: PublishedPlayer, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (player.name ?? '').toLowerCase().includes(q) || player.playerId.toLowerCase().includes(q);
}

export default function BoardPage() {
  const [params, setParams] = useSearchParams();
  const market = usePublishedMarket();

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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">The Board</h1>
          <p className="text-sm text-text-secondary">The current published market</p>
        </div>
        <button
          onClick={market.retry}
          disabled={market.isFetching}
          className="rounded-control border border-border-subtle px-3 py-1.5 text-sm text-text-primary transition hover:bg-elevated disabled:opacity-50"
        >
          {market.isFetching ? 'Refreshing…' : 'Refresh Market'}
        </button>
      </div>

      {/* Controls stay mounted across states so the layout does not jump on load. */}
      <div className="mb-4 space-y-3 rounded-card border border-border-subtle bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setParam('q', e.target.value || null)}
            placeholder="Search player name or id…"
            // Distinct from the app shell's global "Search players" button, so the two are
            // never ambiguous to a screen reader or a keyboard user on this page.
            aria-label="Search published players"
            className="min-w-[180px] flex-1 rounded-control border border-border-subtle bg-base px-3 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-secondary/50"
          />
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            className="rounded-control border border-border-subtle bg-base px-3 py-1.5 text-sm text-text-primary outline-none"
            aria-label="Sort by"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Filter by position">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => togglePos(p)}
                aria-pressed={pos.includes(p)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  pos.includes(p)
                    ? 'border-secondary/50 bg-secondary/15 text-text-primary'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {activeFilters > 0 && (
            <button onClick={reset} className="ml-auto text-xs text-secondary hover:underline">
              Reset filters
            </button>
          )}
        </div>
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
            <div className="rounded-card border border-border-subtle bg-surface px-4 py-12 text-center text-sm text-text-secondary">
              No published players match these filters.
              <div>
                <button
                  onClick={reset}
                  className="mt-3 rounded-control border border-border-subtle px-3 py-1.5 text-text-primary hover:bg-elevated"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-card border border-border-subtle bg-surface md:block">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="sticky top-0 z-10 bg-elevated text-[11px] uppercase tracking-wide text-text-muted">
                    <tr>
                      {PUBLISHED_COLUMNS.map((c) => (
                        <th key={c} className="px-2 py-2 font-medium first:pl-3 last:pr-3">
                          {c}
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

              {/* Mobile cards */}
              <div className="grid gap-2 md:hidden">
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
 * Provenance for the board on screen, including the two counts that matter for honesty: how
 * many players carry a published value, and how many records the adapter refused.
 */
function PublicationProvenance({
  market,
  shown,
}: {
  market: NonNullable<ReturnType<typeof usePublishedMarket>['market']>;
  shown: number;
}) {
  const unvalued = market.players.length - market.valuedCount;
  const limited = market.players.filter((p) => p.modelTier === 'ACCESSIBLE').length;
  return (
    <div className="mb-2 space-y-1 px-1 text-xs text-text-secondary">
      {/* role="status" carries an implicit polite live region and gives the count a queryable
          landmark, so filter results are announced as they change. */}
      <p role="status">
        <span className="font-mono tabnum text-text-primary">{shown}</span> of{' '}
        <span className="font-mono tabnum">{market.players.length}</span> published players
        {' · published '}
        <span className="font-mono">{market.publishedAt}</span>
      </p>
      {limited > 0 && (
        <p>
          <span className="font-mono tabnum">{limited}</span> of these players{' '}
          {limited === 1 ? 'is' : 'are'} valued by the <strong>accessible-data model</strong> and
          marked “Limited data”. That is a deliberately reduced model built only on the data we
          can obtain for them — box-score production, team shares and age — without route,
          snap or red-zone data. Those valuations are never shown as high confidence.
        </p>
      )}
      {unvalued > 0 && (
        <p>
          <span className="font-mono tabnum">{unvalued}</span> of these players{' '}
          {unvalued === 1 ? 'has' : 'have'} no published value, because there is not enough
          information about them to value honestly — value, confidence and volatility are shown
          as “—” rather than estimated.
        </p>
      )}
      {market.rejected.length > 0 && (
        <p>
          <span className="font-mono tabnum">{market.rejected.length}</span> published record
          {market.rejected.length === 1 ? ' was' : 's were'} not displayable and{' '}
          {market.rejected.length === 1 ? 'was' : 'were'} left out rather than guessed.
        </p>
      )}
    </div>
  );
}
