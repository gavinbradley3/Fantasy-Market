import { useState } from 'react';
import { useWatchlistActions } from '@/hooks/useRosterActions';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/ui';
import { StarIcon } from '@/components/ui/icons';

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
          'inline-flex items-center gap-1.5 rounded-control border font-medium transition-colors duration-standard',
          size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
          pending && 'cursor-wait opacity-60',
          // Watching is a state the reader chose, so it takes the brand accent
          // rather than the market's green, which would read as "value is up".
          watched
            ? 'border-brand-blue/40 bg-brand-blue/10 text-text-primary'
            : 'border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary',
        )}
      >
        <StarIcon size={size === 'sm' ? 13 : 15} filled={watched} className={watched ? 'text-brand-blue' : undefined} />
        {pending ? 'Adding…' : watched ? 'Watching' : 'Watch'}
      </button>
      {toast && (
        <span
          role="status"
          className="absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-control border border-border-default bg-elevated px-2 py-1 text-[11px] text-text-secondary shadow-elevated"
        >
          {toast}
        </span>
      )}
    </div>
  );
}
