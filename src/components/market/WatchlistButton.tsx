import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/ui';

// Add/remove watch with optimistic toggle + toast (§22). Captures price-at-add
// via the store.
export function WatchlistButton({
  playerId,
  ticker,
  size = 'md',
}: {
  playerId: string;
  ticker: string;
  size?: 'sm' | 'md';
}) {
  const watched = useAppStore((s) => s.isWatched(playerId));
  const toggle = useAppStore((s) => s.toggleWatch);
  const [toast, setToast] = useState<string | null>(null);

  const onClick = () => {
    const nowWatched = !watched;
    toggle(playerId);
    setToast(nowWatched ? `Watching ${ticker}` : `Removed ${ticker}`);
    setTimeout(() => setToast(null), 1800);
  };

  return (
    <div className="relative inline-flex">
      <button
        onClick={onClick}
        aria-pressed={watched}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-control border font-semibold transition',
          size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
          watched
            ? 'border-up/40 bg-up/10 text-up'
            : 'border-border-subtle text-text-secondary hover:border-secondary/50 hover:text-text-primary',
        )}
      >
        <span aria-hidden>{watched ? '★' : '☆'}</span>
        {watched ? 'Watching' : 'Watch'}
      </button>
      {toast && (
        <span
          role="status"
          className="absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-control border border-border-subtle bg-elevated px-2 py-1 text-[11px] text-text-secondary shadow-elevated"
        >
          {toast}
        </span>
      )}
    </div>
  );
}
