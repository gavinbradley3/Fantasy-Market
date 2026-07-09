import { Link } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { buildWatchlistEntries } from '@/lib/watchlist';
import { ARROW, directionOf, fmtDelta } from '@/lib/format';
import { cn, movementColor } from '@/lib/ui';

// The dashboard watchlist strip (§18.2). Horizontal scroll of watched players
// with since-added Δ, or a one-line teaching prompt when empty.
export function WatchlistStrip() {
  const { watchlist, format } = useAppStore();
  const entries = buildWatchlistEntries(watchlist, format);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-dashed border-border-subtle bg-surface px-4 py-3 text-sm">
        <span className="text-text-secondary">
          Watch a player to track value from the day you add them.
        </span>
        <Link to="/board?sort=d1" className="shrink-0 text-secondary hover:underline">
          Watch today's top riser →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-subtle bg-surface p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-text-secondary">My Watchlist · since added</span>
        <Link to="/watchlist" className="text-[11px] text-secondary hover:underline">
          Open watchlist →
        </Link>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {entries.map((e) => {
          const dir = directionOf(e.delta);
          return (
            <Link
              key={e.item.playerId}
              to={`/player/${e.row.player.ticker}`}
              className="flex shrink-0 items-center gap-2 rounded-control border border-border-subtle bg-base px-3 py-2 transition hover:border-secondary/40"
            >
              <span className="ticker text-xs font-semibold text-text-secondary">{e.row.player.ticker}</span>
              <span className="font-mono text-sm tabnum text-text-primary">{e.row.snapshot.marketPrice.toFixed(1)}</span>
              <span className={cn('flex items-center gap-0.5 font-mono text-[11px] tabnum', movementColor(e.delta))}>
                <span aria-hidden>{ARROW[dir]}</span>
                {fmtDelta(e.delta)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
