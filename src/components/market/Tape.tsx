import { Link } from 'react-router-dom';
import { ARROW, directionOf, fmtDelta } from '@/lib/format';
import { cn, movementColor } from '@/lib/ui';
import type { PlayerRow } from '@/types/market';

// The Tape (§21.8): a slowly scrolling strip of ticker chips + movement badges,
// driven by the demo tick. Pauses on hover, respects reduced motion (the CSS
// disables the animation), and every chip is a deep link.
export function Tape({ rows }: { rows: PlayerRow[] }) {
  const items = rows.slice(0, 24);
  const doubled = [...items, ...items]; // seamless loop
  return (
    <div
      className="relative overflow-hidden rounded-card border border-border-subtle bg-surface"
      aria-label="Live demo market tape"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-surface to-transparent" />
      <div className="tape-track flex w-max gap-4 py-2.5">
        {doubled.map((r, i) => {
          const d = r.snapshot.movement.d1;
          const dir = directionOf(d);
          return (
            <Link
              key={`${r.player.ticker}-${i}`}
              to={`/player/${r.player.ticker}`}
              className="flex shrink-0 items-center gap-1.5 px-1"
            >
              <span className="ticker text-xs font-semibold text-text-secondary">{r.player.ticker}</span>
              <span className="font-mono text-xs tabnum text-text-primary">{r.snapshot.marketPrice.toFixed(1)}</span>
              <span className={cn('flex items-center gap-0.5 font-mono text-[11px] tabnum', movementColor(d))}>
                <span aria-hidden>{ARROW[dir]}</span>
                {fmtDelta(d)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
