import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { buildWatchlistEntries, type WatchlistEntry } from '@/lib/watchlist';
import { FORMATS } from '@/config/market';
import {
  MispricingMeter,
  MovementBadge,
  PlayerAvatar,
  SignalBadge,
  Sparkline,
  TickerChip,
} from '@/components/market/primitives';
import { SoonButton } from '@/components/market/stockcard';
import { DataFreshnessBadge } from '@/components/chrome/Honesty';
import { EmptyState } from '@/components/states';
import { Footer } from '@/components/chrome/Footer';
import { ARROW, directionOf, fmtDelta, fmtPct, fmtPrice } from '@/lib/format';
import { cn, movementColor } from '@/lib/ui';

type SortKey = 'delta' | 'price' | 'added';

export default function WatchlistPage() {
  const { watchlist, format, toggleWatch } = useAppStore();
  const [sort, setSort] = useState<SortKey>('delta');
  const entries = useMemo(() => buildWatchlistEntries(watchlist, format), [watchlist, format]);

  const sorted = useMemo(() => {
    const e = [...entries];
    if (sort === 'delta') e.sort((a, b) => b.delta - a.delta);
    if (sort === 'price') e.sort((a, b) => b.row.snapshot.marketPrice - a.row.snapshot.marketPrice);
    if (sort === 'added') e.sort((a, b) => b.item.addedAt.localeCompare(a.item.addedAt));
    return e;
  }, [entries, sort]);

  const biggestRiser = entries.reduce<WatchlistEntry | null>((m, e) => (!m || e.delta > m.delta ? e : m), null);
  const biggestFaller = entries.reduce<WatchlistEntry | null>((m, e) => (!m || e.delta < m.delta ? e : m), null);
  const anyMismatch = entries.some((e) => e.formatMismatch);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Watchlist</h1>
          <p className="text-sm text-text-secondary">
            Value since the day you started watching · {FORMATS[format].label}
          </p>
        </div>
        <SoonButton label="Price alerts" />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing on your watchlist yet"
          body="Watch a player and we'll track value from the day you added them. Try today's top riser."
          ctaLabel="Watch today's top riser →"
          ctaTo="/board?sort=d1"
        />
      ) : (
        <>
          {/* Header stats */}
          <div className="grid gap-3 sm:grid-cols-2">
            {biggestRiser && <SinceCard label="Biggest riser since added" entry={biggestRiser} />}
            {biggestFaller && <SinceCard label="Biggest faller since added" entry={biggestFaller} />}
          </div>

          {anyMismatch && (
            <p className="rounded-control border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
              Some entries were added in a different format. Their since-added baseline is preserved
              from that format and isn't recomputed for the current one.
            </p>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-muted">Sort:</span>
            {(['delta', 'price', 'added'] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                aria-pressed={sort === k}
                className={cn(
                  'rounded-full border px-2.5 py-1 transition',
                  sort === k ? 'border-secondary/50 bg-secondary/15 text-text-primary' : 'border-border-subtle text-text-secondary',
                )}
              >
                {k === 'delta' ? 'Since added' : k === 'price' ? 'Price' : 'Date added'}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            {sorted.map((e) => (
              <div
                key={e.item.playerId}
                className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface p-3"
              >
                <Link to={`/player/${e.row.player.ticker}`} className="flex flex-1 items-center gap-3">
                  <PlayerAvatar seed={e.row.player.avatarSeed} name={e.row.player.displayName} size={40} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-text-primary">{e.row.player.displayName}</span>
                      <TickerChip ticker={e.row.player.ticker} />
                    </div>
                    <div className="text-[11px] text-text-muted">
                      Added {new Date(e.item.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {fmtPrice(e.item.priceAtAdd)}
                    </div>
                  </div>
                </Link>
                <Sparkline data={e.row.spark} width={72} height={24} ariaLabel={`trend ${e.row.player.ticker}`} />
                <div className="hidden sm:block"><SignalBadge signal={e.row.signal.signal} explanation={e.row.signal.explanation} /></div>
                <div className="hidden md:block"><MispricingMeter value={e.row.snapshot.mispricing} size="sm" /></div>
                <div className="w-24 text-right">
                  <div className="font-mono text-sm font-semibold tabnum text-text-primary">{fmtPrice(e.row.snapshot.marketPrice)}</div>
                  <div className={cn('flex items-center justify-end gap-1 font-mono text-[11px] tabnum', movementColor(e.delta))}>
                    <span aria-hidden>{ARROW[directionOf(e.delta)]}</span>
                    {fmtDelta(e.delta)} ({fmtPct(e.deltaPct)})
                  </div>
                </div>
                <button
                  onClick={() => toggleWatch(e.item.playerId)}
                  className="text-text-muted transition hover:text-down"
                  aria-label={`Remove ${e.row.player.ticker} from watchlist`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-text-muted">
            Watchlist is stored locally in your browser. Accounts and cross-device sync arrive in P1.
          </p>
        </>
      )}

      <Footer />
    </div>
  );
}

function SinceCard({ label, entry }: { label: string; entry: WatchlistEntry }) {
  return (
    <Link
      to={`/player/${entry.row.player.ticker}`}
      className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface p-3 transition hover:border-secondary/40"
    >
      <PlayerAvatar seed={entry.row.player.avatarSeed} name={entry.row.player.displayName} size={40} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text-primary">{entry.row.player.displayName}</span>
          <TickerChip ticker={entry.row.player.ticker} />
        </div>
      </div>
      <MovementBadge value={entry.delta} />
      <DataFreshnessBadge lastUpdated={entry.row.snapshot.lastUpdated} showMode={false} />
    </Link>
  );
}
