import { cn } from '@/lib/ui';
import type { SupportedPosition } from '@/pages/player-model/types';

const OPTIONS: { position: SupportedPosition; short: string; full: string }[] = [
  { position: 'WR', short: 'WR', full: 'Wide Receiver' },
  { position: 'RB', short: 'RB', full: 'Running Back' },
  { position: 'TE', short: 'TE', full: 'Tight End' },
];

// Compact segmented control for position. Keyboard-operable (roving arrow keys +
// Enter/Space), visible selected state, full accessible names. No QB controls;
// no implication that WR, RB, and TE scores are comparable across positions.
export function PositionSelector({
  selected,
  onSelect,
}: {
  selected: SupportedPosition;
  onSelect: (p: SupportedPosition) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next =
        e.key === 'ArrowRight'
          ? (index + 1) % OPTIONS.length
          : (index - 1 + OPTIONS.length) % OPTIONS.length;
      onSelect(OPTIONS[next].position);
      document.getElementById(`pm-position-${OPTIONS[next].position}`)?.focus();
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="radiogroup"
        aria-label="Select a position"
        className="inline-flex rounded-full border border-border-subtle bg-base p-1"
      >
        {OPTIONS.map((o, i) => {
          const isSel = o.position === selected;
          return (
            <button
              key={o.position}
              id={`pm-position-${o.position}`}
              role="radio"
              aria-checked={isSel}
              aria-label={o.full}
              tabIndex={isSel ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onSelect(o.position)}
              className={cn(
                'min-h-[40px] rounded-full px-4 py-1.5 text-sm font-semibold transition',
                isSel
                  ? 'bg-secondary/20 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {o.full}
            </button>
          );
        })}
      </div>
      <p className="max-w-md text-[11px] leading-snug text-text-muted">
        Component scores are position-specific and should not be compared directly across WR, RB, and TE.
      </p>
    </div>
  );
}
