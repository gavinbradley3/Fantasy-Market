import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBoard, useMarketStatus } from '@/hooks/useMarketData';
import { useAppStore } from '@/store/useAppStore';
import { FORMATS } from '@/config/market';
import { ASSET_CLASSES, MARKET_TAGS } from '@/config/taxonomy';
import { SIGNAL_META } from '@/config/market';
import { PlayerMarketCard, PlayerMarketRow } from '@/components/market/rows';
import { FormatRibbon } from '@/components/chrome/FormatRibbon';
import { DataFreshnessBadge } from '@/components/chrome/Honesty';
import { Footer } from '@/components/chrome/Footer';
import { ErrorState, LoadingSkeleton } from '@/components/states';
import { cn } from '@/lib/ui';
import type { AssetClass, MarketTagId, Position, SignalId } from '@/types/market';
import type { PlayerRow } from '@/types/market';

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

type SortKey = 'price' | 'd1' | 'd7' | 'd30' | 'mis' | 'misAsc' | 'vol' | 'rank';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rank', label: 'Overall Rank' },
  { key: 'price', label: 'Market Price' },
  { key: 'd1', label: '24H Movement' },
  { key: 'd7', label: '7D Movement' },
  { key: 'd30', label: '30D Movement' },
  { key: 'mis', label: 'Mispricing ↑ (undervalued)' },
  { key: 'misAsc', label: 'Mispricing ↓ (overheated)' },
  { key: 'vol', label: 'Volatility' },
];

function sortRows(rows: PlayerRow[], sort: SortKey): PlayerRow[] {
  const s = [...rows];
  switch (sort) {
    case 'price': return s.sort((a, b) => b.snapshot.marketPrice - a.snapshot.marketPrice);
    case 'd1': return s.sort((a, b) => b.snapshot.movement.d1 - a.snapshot.movement.d1);
    case 'd7': return s.sort((a, b) => b.snapshot.movement.d7 - a.snapshot.movement.d7);
    case 'd30': return s.sort((a, b) => b.snapshot.movement.d30 - a.snapshot.movement.d30);
    case 'mis': return s.sort((a, b) => b.snapshot.mispricing - a.snapshot.mispricing);
    case 'misAsc': return s.sort((a, b) => a.snapshot.mispricing - b.snapshot.mispricing);
    case 'vol': return s.sort((a, b) => b.snapshot.volatility - a.snapshot.volatility);
    case 'rank':
    default: return s.sort((a, b) => a.snapshot.overallRank - b.snapshot.overallRank);
  }
}

export default function BoardPage() {
  const format = useAppStore((s) => s.format);
  const [params, setParams] = useSearchParams();

  const pos = params.getAll('pos') as Position[];
  const tag = params.get('tag') as MarketTagId | null;
  const cls = params.get('class') as AssetClass | null;
  const sig = params.get('signal') as SignalId | null;
  const sort = (params.get('sort') as SortKey) || 'rank';
  const query = params.get('q') || '';

  const board = useBoard(format);
  const allRows = useMemo(() => board.data ?? [], [board.data]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (pos.length) rows = rows.filter((r) => pos.includes(r.player.position));
    if (tag) rows = rows.filter((r) => r.snapshot.tags.includes(tag));
    if (cls) rows = rows.filter((r) => r.snapshot.assetClass === cls);
    if (sig) rows = rows.filter((r) => r.signal.signal === sig);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (r) => r.player.displayName.toLowerCase().includes(q) || r.player.ticker.toLowerCase().includes(q),
      );
    }
    return sortRows(rows, sort);
  }, [allRows, pos, tag, cls, sig, query, sort]);

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

  const activeFilters =
    pos.length + (tag ? 1 : 0) + (cls ? 1 : 0) + (sig ? 1 : 0) + (query ? 1 : 0);
  const reset = () => setParams(new URLSearchParams(), { replace: true });
  const { data: marketStatus } = useMarketStatus();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">The Board</h1>
          <p className="text-sm text-text-secondary">
            The full market · {FORMATS[format].label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {marketStatus && marketStatus.lastUpdated && (
            <DataFreshnessBadge lastUpdated={marketStatus.lastUpdated} />
          )}
          <FormatRibbon compact />
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 space-y-3 rounded-card border border-border-subtle bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setParam('q', e.target.value || null)}
            placeholder="Search name or ticker…"
            className="min-w-[180px] flex-1 rounded-control border border-border-subtle bg-base px-3 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-secondary/50"
          />
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            className="rounded-control border border-border-subtle bg-base px-3 py-1.5 text-sm text-text-primary outline-none"
            aria-label="Sort by"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
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
          <FilterSelect label="Asset class" value={cls} onChange={(v) => setParam('class', v)} options={ASSET_CLASSES.map((c) => ({ v: c.id, label: c.label }))} />
          <FilterSelect label="Tag" value={tag} onChange={(v) => setParam('tag', v)} options={MARKET_TAGS.map((t) => ({ v: t.id, label: t.label }))} />
          <FilterSelect label="Signal" value={sig} onChange={(v) => setParam('signal', v)} options={(Object.keys(SIGNAL_META) as SignalId[]).map((s) => ({ v: s, label: SIGNAL_META[s].label }))} />
          {activeFilters > 0 && (
            <button onClick={reset} className="ml-auto text-xs text-secondary hover:underline">
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Query lifecycle: loading and failure are explicit states (§20). */}
      {board.status === 'loading' && (
        <div className="grid gap-2" aria-label="Loading market data">
          {Array.from({ length: 8 }, (_, i) => (
            <LoadingSkeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {board.status === 'error' && (
        <ErrorState
          message="The market board couldn't load. Your connection or the data source may be down."
          onRetry={board.refetch}
        />
      )}

      {board.status === 'success' && (
        <>
      <p className="mb-2 px-1 text-xs text-text-secondary" aria-live="polite">
        <span className="font-mono tabnum text-text-primary">{filtered.length}</span> players match
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-border-subtle bg-surface px-4 py-12 text-center text-sm text-text-secondary">
          No players match these filters. Try removing the most restrictive one.
          <div>
            <button onClick={reset} className="mt-3 rounded-control border border-border-subtle px-3 py-1.5 text-text-primary hover:bg-elevated">
              Clear all filters
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-card border border-border-subtle bg-surface md:block">
            <table className="w-full min-w-[900px] text-left">
              <thead className="sticky top-0 z-10 bg-elevated text-[11px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="py-2 pl-3 font-medium">Player</th>
                  <th className="px-2 font-medium">Pos</th>
                  <th className="px-2 text-center font-medium">Age</th>
                  <th className="px-2 text-right font-medium">Price</th>
                  <th className="px-2 text-right font-medium">24H</th>
                  <th className="px-2 text-right font-medium">7D</th>
                  <th className="px-2 text-right font-medium">30D</th>
                  <th className="px-2 font-medium">Trend</th>
                  <th className="px-2 font-medium">Signal</th>
                  <th className="px-2 font-medium">Mispricing</th>
                  <th className="px-2 font-medium">Vol</th>
                  <th className="px-2 font-medium">Class</th>
                  <th className="px-2 pr-3 text-right font-medium">Watch</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <PlayerMarketRow key={r.player.identity.internal_id} row={r} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {filtered.map((r) => (
              <PlayerMarketCard key={r.player.identity.internal_id} row={r} />
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

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | null;
  onChange: (v: T | null) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs outline-none transition',
        value ? 'border-secondary/50 bg-secondary/15 text-text-primary' : 'border-border-subtle bg-base text-text-secondary',
      )}
      aria-label={label}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>{o.label}</option>
      ))}
    </select>
  );
}
