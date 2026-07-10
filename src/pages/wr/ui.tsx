import type { ReactNode } from 'react';
import { cn } from '@/lib/ui';
import { Tooltip } from '@/components/ui/Tooltip';

type Tone = 'up' | 'warning' | 'down' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  up: 'text-up border-up/40 bg-up/10',
  warning: 'text-warning border-warning/40 bg-warning/10',
  down: 'text-down border-down/40 bg-down/10',
  neutral: 'text-text-secondary border-border-subtle bg-elevated',
};

// A labeled pill. Confidence and volatility each get their own — never merged.
export function WrBadge({
  tone,
  label,
  title,
  tip,
}: {
  tone: Tone;
  label: string;
  title?: string;
  tip?: string;
}) {
  const pill = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TONE_CLASS[tone],
      )}
    >
      {title && <span className="font-normal text-text-muted">{title}</span>}
      {label}
    </span>
  );
  return tip ? <Tooltip label={tip}>{pill}</Tooltip> : pill;
}

// A titled surface used for each page section.
export function SectionCard({
  title,
  aside,
  children,
  id,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-card border border-border-subtle bg-surface p-4">
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-text-primary">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

// A compact stat cell (label + value). Fantasy points get `emphasis`.
export function StatCell({
  label,
  value,
  suffix,
  emphasis = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={cn('rounded-control border border-border-subtle bg-base px-3 py-2', emphasis && 'border-up/30 bg-up/5')}>
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={cn(
          'font-mono tabnum text-text-primary',
          emphasis ? 'text-2xl font-semibold' : 'text-base',
        )}
      >
        {value}
        {suffix && <span className="ml-0.5 text-xs text-text-secondary">{suffix}</span>}
      </div>
    </div>
  );
}

function scoreTone(score: number): Tone {
  if (score >= 60) return 'up';
  if (score >= 45) return 'neutral';
  if (score >= 33) return 'warning';
  return 'down';
}

const BAR_TONE: Record<Tone, string> = {
  up: 'bg-up',
  neutral: 'bg-secondary',
  warning: 'bg-warning',
  down: 'bg-down',
};

// Horizontal 0–100 score bar with a neutral-50 reference marker. Meaning is
// never color-only: the numeric score and an up/neutral/down glyph accompany it.
export function ScoreBar({
  code,
  name,
  score,
  description,
  weightPct,
  emphasized = false,
}: {
  code: string;
  name: string;
  score: number;
  description: string;
  weightPct: number;
  emphasized?: boolean;
}) {
  const tone = scoreTone(score);
  const glyph = tone === 'up' ? '▲' : tone === 'down' || tone === 'warning' ? '▼' : '▬';
  return (
    <div
      className={cn(
        'rounded-control border p-2.5 transition',
        emphasized ? 'border-secondary/40 bg-elevated/40' : 'border-border-subtle bg-base',
      )}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-text-secondary">{code}</span>
          <span className={cn('text-sm', emphasized ? 'font-semibold text-text-primary' : 'text-text-primary')}>
            {name}
          </span>
          {emphasized && (
            <span className="rounded bg-secondary/15 px-1.5 text-[10px] font-medium text-secondary">
              key at this horizon
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 font-mono text-sm tabnum text-text-primary">
          <span aria-hidden className={cn(tone === 'up' ? 'text-up' : tone === 'neutral' ? 'text-text-muted' : tone === 'warning' ? 'text-warning' : 'text-down')}>
            {glyph}
          </span>
          {score.toFixed(1)}
        </span>
      </div>
      <div
        className="relative h-2 w-full rounded-full bg-border-subtle"
        role="img"
        aria-label={`${name} score: ${score.toFixed(1)} out of 100. Weight at this horizon ${Math.round(weightPct * 100)} percent.`}
      >
        <div className={cn('h-full rounded-full', BAR_TONE[tone])} style={{ width: `${score}%` }} />
        {/* neutral-50 reference marker */}
        <span className="absolute top-[-2px] h-3 w-px bg-text-muted/70" style={{ left: '50%' }} aria-hidden />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] leading-snug text-text-secondary">{description}</p>
        <span className="shrink-0 text-[10px] text-text-muted">wt {Math.round(weightPct * 100)}%</span>
      </div>
    </div>
  );
}
