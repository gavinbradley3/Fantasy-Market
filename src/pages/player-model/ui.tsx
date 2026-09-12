import type { ReactNode } from 'react';
import { cn } from '@/lib/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Tone } from '@/pages/player-model/types';

const TONE_CLASS: Record<Tone, string> = {
  up: 'text-positive border-positive/40 bg-positive/10',
  warning: 'text-warning border-warning/40 bg-warning/10',
  down: 'text-negative border-negative/40 bg-negative/10',
  neutral: 'text-text-secondary border-border-default bg-elevated',
};

// A labeled pill. Confidence and volatility each get their own — never merged.
export function Badge({
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
        'inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-[11px] font-semibold',
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
    <section id={id} className="rounded-card border border-border-default bg-surface p-4">
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
  tip,
}: {
  label: string;
  value: string;
  suffix?: string;
  emphasis?: boolean;
  tip?: string;
}) {
  const labelNode = tip ? (
    <Tooltip label={tip}>
      <span className="cursor-help border-b border-dotted border-text-muted/50">{label}</span>
    </Tooltip>
  ) : (
    label
  );
  return (
    // An emphasised tile is the headline number for the section, not a rising
    // value, so it takes the brand accent rather than the market's green.
    <div
      className={cn(
        'rounded-control border px-3 py-2.5',
        emphasis ? 'border-brand-blue/30 bg-brand-blue/[0.06]' : 'border-border-default bg-canvas',
      )}
    >
      <div className="eyebrow text-[10px]">{labelNode}</div>
      <div
        className={cn(
          'data text-text-primary',
          emphasis ? 'mt-0.5 text-[26px] font-semibold leading-none' : 'mt-0.5 text-[15px]',
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
  up: 'bg-positive',
  neutral: 'bg-text-muted',
  warning: 'bg-warning',
  down: 'bg-negative',
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
  const glyph = tone === 'up' ? '▲' : tone === 'down' || tone === 'warning' ? '▼' : '–';
  return (
    <div
      className={cn(
        'rounded-control border p-2.5 transition',
        emphasized ? 'border-brand-blue/40 bg-brand-blue/[0.06]' : 'border-border-default bg-canvas',
      )}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="data text-xs font-semibold text-text-secondary">{code}</span>
          <span className={cn('text-sm', emphasized ? 'font-semibold text-text-primary' : 'text-text-primary')}>
            {name}
          </span>
          {emphasized && (
            <span className="rounded bg-brand-blue/15 px-1.5 text-[10px] font-medium text-brand-blue">
              key at this horizon
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 data text-sm tabnum text-text-primary">
          <span aria-hidden className={cn(tone === 'up' ? 'text-positive' : tone === 'neutral' ? 'text-text-muted' : tone === 'warning' ? 'text-warning' : 'text-negative')}>
            {glyph}
          </span>
          {score.toFixed(1)}
        </span>
      </div>
      <div
        className="relative h-2 w-full rounded-full bg-border-default"
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
