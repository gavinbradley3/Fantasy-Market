import { useState } from 'react';
import { useWatchlistActions } from '@/hooks/useRosterActions';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/ui';

// Add/remove watch. Adding resolves the current price through the injected
// service BEFORE committing (never records a placeholder price); the button
// disables while resolution is in flight and surfaces failures as a toast.
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
  const { toggle, isPending } = useWatchlistActions();
  const [toast, setToast] = useState<string | null>(null);
  const pending = isPending(playerId);

  const onClick = async () => {
    if (pending) return;
    const result = await toggle(playerId);
    if (!result.ok) {
      setToast(result.message ?? 'Something went wrong.');
    } else {
      setToast(result.active ? `Watching ${ticker}` : `Removed ${ticker}`);
    }
    setTimeout(() => setToast(null), 1800);
  };

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => void onClick()}
        aria-pressed={watched}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-control border font-semibold transition',
          size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
          pending && 'cursor-wait opacity-60',
          watched
            ? 'border-up/40 bg-up/10 text-up'
            : 'border-border-subtle text-text-secondary hover:border-secondary/50 hover:text-text-primary',
        )}
      >
        <span aria-hidden>{watched ? '★' : '☆'}</span>
        {pending ? 'Adding…' : watched ? 'Watching' : 'Watch'}
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
