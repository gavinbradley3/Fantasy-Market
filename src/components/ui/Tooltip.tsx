import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/ui';

// Accessible hover/focus tooltip. Every metric surface uses this (or the richer
// popover) so an explanation is always one tap/hover away (§20, §22.4).
export function Tooltip({
  label,
  children,
  className,
  side = 'top',
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 w-60 -translate-x-1/2 rounded-control border border-border-subtle bg-elevated px-3 py-2 text-left text-xs font-normal leading-relaxed text-text-secondary shadow-elevated',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

// The small circular "?" affordance that opens an explanation (§20 onExplain).
export function ExplainDot({ label }: { label: ReactNode }) {
  return (
    <Tooltip label={label}>
      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border-subtle text-[10px] text-text-muted transition hover:text-text-secondary">
        ?
      </span>
    </Tooltip>
  );
}
