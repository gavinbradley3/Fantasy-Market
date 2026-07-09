import { useState } from 'react';
import { FORMATS } from '@/config/market';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/ui';
import type { FormatKey } from '@/types/market';

// The Format Ribbon (§13). One control, three switches. Because all six combos
// are precomputed, toggling re-renders instantly. Selection persists in storage.
// Format is always visible on value-bearing pages — no universal value ever.

const LEAGUE: { v: 'dynasty' | 'redraft'; label: string }[] = [
  { v: 'dynasty', label: 'Dynasty' },
  { v: 'redraft', label: 'Redraft' },
];
const QB: { v: 'sf' | '1qb'; label: string }[] = [
  { v: 'sf', label: 'Superflex' },
  { v: '1qb', label: '1QB' },
];
const SCORING: { v: 'half' | 'ppr'; label: string }[] = [
  { v: 'half', label: 'Half-PPR' },
  { v: 'ppr', label: 'PPR' },
];

// Resolve the closest shipped format from three toggle values. Not every combo
// ships (we ship 6 of 8); we snap to the nearest available key.
function resolveFormat(
  league: 'dynasty' | 'redraft',
  qb: 'sf' | '1qb',
  scoring: 'half' | 'ppr',
): FormatKey {
  const exact = (Object.keys(FORMATS) as FormatKey[]).find((k) => {
    const p = FORMATS[k].parts;
    return p.league === league && p.qb === qb && p.scoring === scoring;
  });
  if (exact) return exact;
  // Fallback: match league + qb, any scoring; else league default.
  const near = (Object.keys(FORMATS) as FormatKey[]).find((k) => {
    const p = FORMATS[k].parts;
    return p.league === league && p.qb === qb;
  });
  return near ?? (league === 'redraft' ? 'rd_1qb_half' : 'dyn_sf_half');
}

export function FormatRibbon({ compact = false }: { compact?: boolean }) {
  const { format, setFormat } = useAppStore();
  const [open, setOpen] = useState(false);
  const parts = FORMATS[format].parts;

  const Toggle = <T extends string>({
    options,
    value,
    onChange,
    legend,
  }: {
    options: { v: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    legend: string;
  }) => (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">{legend}</legend>
      <div className="flex gap-1 rounded-control bg-base p-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={cn(
              'flex-1 rounded px-3 py-1.5 text-sm transition',
              value === o.v ? 'bg-secondary/20 text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'flex items-center gap-1.5 rounded-full border border-border-subtle bg-elevated px-3 py-1.5 font-mono text-xs text-text-secondary transition hover:text-text-primary',
        )}
        title={FORMATS[format].label}
      >
        <span className="text-up" aria-hidden>
          ◆
        </span>
        {compact ? FORMATS[format].short : FORMATS[format].label}
        <span aria-hidden className="text-text-muted">
          ▾
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Choose fantasy format"
            className="absolute right-0 z-50 mt-2 w-72 space-y-3 rounded-card border border-border-subtle bg-surface p-4 shadow-elevated"
          >
            <p className="text-xs text-text-secondary">
              Values are format-specific. Switching re-computes prices, ranks, and signals instantly.
            </p>
            <Toggle
              legend="League"
              options={LEAGUE}
              value={parts.league}
              onChange={(v) => setFormat(resolveFormat(v, parts.qb, parts.scoring))}
            />
            <Toggle
              legend="Quarterback"
              options={QB}
              value={parts.qb}
              onChange={(v) => setFormat(resolveFormat(parts.league, v, parts.scoring))}
            />
            <Toggle
              legend="Scoring"
              options={SCORING}
              value={parts.scoring}
              onChange={(v) => setFormat(resolveFormat(parts.league, parts.qb, v))}
            />
          </div>
        </>
      )}
    </div>
  );
}
