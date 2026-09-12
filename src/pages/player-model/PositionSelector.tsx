import { cn } from '@/lib/ui';
import type { SupportedPosition } from '@/pages/player-model/types';

const OPTIONS: { position: SupportedPosition; short: string; full: string }[] = [
  { position: 'WR', short: 'WR', full: 'Wide Receiver' },
  { position: 'RB', short: 'RB', full: 'Running Back' },
  { position: 'TE', short: 'TE', full: 'Tight End' },
  { position: 'QB', short: 'QB', full: 'Quarterback' },
];

// Compact segmented control for position. Keyboard-operable (roving arrow keys +
// Enter/Space), visible selected state, full accessible names. WR, RB, TE, and QB
// scores are position-specific and not directly comparable across positions.
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
      {/* Underlined tabs rather than a segmented capsule: the capsule form reads as
          a large decorative control, and this sits at the top of a page that is
          otherwise flat panels and rows. */}
      <div
        role="radiogroup"
        aria-label="Select a position"
        className="inline-flex items-stretch gap-1 border-b border-border-default"
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
                'relative min-h-[40px] px-3 py-2 text-sm font-medium transition-colors duration-standard',
                'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full',
                isSel
                  ? 'text-text-primary after:bg-brand-blue'
                  : 'text-text-muted after:bg-transparent hover:text-text-secondary',
              )}
            >
              {o.full}
            </button>
          );
        })}
      </div>
      <p className="max-w-md text-[11px] leading-snug text-text-muted">
        Component scores are position-specific and should not be compared directly across WR, RB, TE, and QB.
      </p>
    </div>
  );
}
