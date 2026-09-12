import { useMemo } from 'react';
import { SIGNAL_META } from '@/config/market';
import { CLASS_BY_ID, POSITION_META, TAG_BY_ID } from '@/config/taxonomy';
import {
  ARROW,
  directionOf,
  fmtDelta,
  fmtPrice,
  fmtSigned,
  mispricingBandLabel,
  priceBandLabel,
  volatilityBand,
  volatilitySegments,
} from '@/lib/format';
import { avatarGradient, cn, movementColor } from '@/lib/ui';
import { Tooltip } from '@/components/ui/Tooltip';
import type {
  AssetClass,
  MarketTagId,
  Position,
  RiskKey,
  SignalId,
} from '@/types/market';

// ---------- Ticker & identity ----------
export function TickerChip({ ticker, className }: { ticker: string; className?: string }) {
  return (
    <span
      className={cn(
        'ticker rounded border border-border-default bg-surface-subtle px-1.5 py-0.5 text-[11px] font-semibold text-text-muted',
        className,
      )}
    >
      {ticker}
    </span>
  );
}

export function PositionGlyph({ position }: { position: Position | string }) {
  // Published positions come from the backend, so an unrecognised one renders
  // neutrally rather than throwing.
  const m = POSITION_META[position] ?? {
    label: String(position),
    className: 'text-text-secondary border-border-default bg-surface-subtle',
  };
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[28px] items-center justify-center rounded border px-1 text-[10px] font-semibold tracking-wide',
        m.className,
      )}
    >
      {m.label}
    </span>
  );
}

export function PlayerAvatar({
  seed,
  name,
  size = 40,
}: {
  seed: string;
  name: string;
  size?: number;
}) {
  const g = useMemo(() => avatarGradient(seed), [seed]);
  const inits = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-border-default font-ui font-semibold text-text-secondary"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `linear-gradient(135deg, ${g.from}, ${g.to})`,
      }}
      aria-hidden
    >
      {inits}
    </span>
  );
}

// ---------- Price & movement ----------
export function MarketPriceBadge({
  price,
  size = 'md',
}: {
  price: number;
  size?: 'md' | 'lg' | 'xl';
}) {
  const cls =
    size === 'xl'
      ? 'text-[40px] leading-none tracking-[-0.02em]'
      : size === 'lg'
        ? 'text-[28px] leading-none tracking-[-0.02em]'
        : 'text-lg leading-none';
  return (
    <Tooltip label={`Value Index ${fmtPrice(price)} — ${priceBandLabel(price)}. A fictional 0–100 fantasy value index, not a dollar price.`}>
      <span className={cn('data font-semibold text-text-primary', cls)}>{fmtPrice(price)}</span>
    </Tooltip>
  );
}

/**
 * Value movement.
 *
 * `chip` is the brand's delta-chip treatment: coloured text on a subtle tinted
 * ground, never a solid pill. `plain` drops the ground for dense table cells where
 * a chip on every row would be louder than the data. Direction is always carried by
 * the arrow and sign as well as the colour, so the meaning survives without it.
 */
export function MovementBadge({
  value,
  window,
  showWindow = false,
  variant = 'chip',
  className,
}: {
  value: number;
  window?: '24H' | '7D' | '30D' | 'Season';
  showWindow?: boolean;
  variant?: 'chip' | 'plain';
  className?: string;
}) {
  const dir = directionOf(value);
  const ground =
    dir === 'up' ? 'bg-positive/10' : dir === 'down' ? 'bg-negative/10' : 'bg-elevated';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 data text-[13px] font-semibold',
        movementColor(value),
        variant === 'chip' && cn('rounded-control px-1.5 py-0.5', ground),
        className,
      )}
    >
      <span aria-hidden className="text-[9px] leading-none">
        {ARROW[dir]}
      </span>
      <span>{fmtDelta(value)}</span>
      {showWindow && window && <span className="font-ui text-[11px] text-text-muted">{window}</span>}
      <span className="sr-only">
        {dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat'} {Math.abs(value).toFixed(1)}
        {window ? ` over ${window}` : ''}
      </span>
    </span>
  );
}

// ---------- Signal ----------
const SIGNAL_STYLE: Record<'up' | 'down' | 'neutral', string> = {
  up: 'text-positive border-positive/30 bg-positive/10',
  down: 'text-negative border-negative/30 bg-negative/10',
  neutral: 'text-text-secondary border-border-default bg-elevated',
};

export function SignalBadge({
  signal,
  confidenceLow,
  explanation,
  className,
}: {
  signal: SignalId;
  confidenceLow?: boolean;
  explanation?: string;
  className?: string;
}) {
  const meta = SIGNAL_META[signal];
  return (
    <Tooltip label={explanation ?? `${meta.label} — see the stock card for the full reasoning.`}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-[11px] font-semibold',
          SIGNAL_STYLE[meta.tone],
          confidenceLow && 'opacity-70',
          className,
        )}
      >
        {meta.label}
      </span>
    </Tooltip>
  );
}

// ---------- Tags & classes ----------
export function AssetClassTag({ id }: { id: AssetClass }) {
  const def = CLASS_BY_ID[id];
  return (
    <Tooltip label={def.definition}>
      {/* Asset class is taxonomy, not performance, so it stays neutral. Reserving
          colour for movement is what keeps movement legible. */}
      <span className="inline-flex items-center rounded-control border border-border-default bg-surface-subtle px-2 py-0.5 text-[11px] font-medium text-text-secondary">
        {def.label}
      </span>
    </Tooltip>
  );
}

const TAG_TONE: Record<'up' | 'down' | 'neutral', string> = {
  up: 'border-positive/25 bg-positive/10 text-positive',
  down: 'border-negative/25 bg-negative/10 text-negative',
  neutral: 'border-border-default bg-elevated text-text-secondary',
};

export function MarketTag({ id }: { id: MarketTagId }) {
  const def = TAG_BY_ID[id];
  return (
    <Tooltip label={def.definition}>
      <span
        className={cn(
          'inline-flex items-center rounded-control border px-2 py-0.5 text-[11px] font-medium',
          TAG_TONE[def.tone],
        )}
      >
        {def.label}
      </span>
    </Tooltip>
  );
}

// ---------- Meters ----------
export function VolatilityMeter({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const filled = volatilitySegments(value);
  const band = volatilityBand(value);
  // Volatility is instability, not value direction, so it never borrows the
  // positive/negative ramp — it runs neutral → caution → alarm.
  const tone =
    filled >= 4
      ? 'bg-negative'
      : filled === 3
        ? 'bg-warning'
        : filled === 2
          ? 'bg-text-secondary'
          : 'bg-text-faint';
  return (
    <Tooltip label={`Volatility ${value}/100 (${band}). Higher means less stable week-to-week value — a start/sit trust signal.`}>
      <span className="inline-flex items-center gap-1.5">
        <span className="flex gap-0.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn('h-2 w-2.5 rounded-[2px]', i < filled ? tone : 'bg-border-default')}
            />
          ))}
        </span>
        {showLabel && <span className="text-xs text-text-secondary">{band}</span>}
        <span className="sr-only">Volatility {band}, {value} of 100</span>
      </span>
    </Tooltip>
  );
}

export function MispricingMeter({
  value,
  size = 'md',
}: {
  value: number;
  size?: 'sm' | 'md';
}) {
  const pct = Math.max(-100, Math.min(100, value));
  const half = pct / 2; // −50%..+50% around the center
  const positive = pct >= 0;
  const band = mispricingBandLabel(value);
  return (
    <Tooltip label={`Mispricing ${fmtSigned(value)} — ${band}. The gap between model value and market price; positive means the market may be undervaluing this asset.`}>
      <span className={cn('inline-flex flex-col gap-1', size === 'sm' ? 'w-24' : 'w-44')}>
        <span className="flex items-center justify-between gap-2 text-[11px]">
          <span
            className={cn(
              'data font-semibold',
              positive ? 'text-positive' : value < 0 ? 'text-negative' : 'text-text-secondary',
            )}
          >
            {fmtSigned(value)}
          </span>
          <span className="truncate text-text-muted">{band}</span>
        </span>
        <span className="relative h-1 w-full rounded-full bg-border-default" aria-hidden>
          <span className="absolute left-1/2 top-0 h-full w-px bg-text-faint" />
          <span
            className={cn('absolute top-0 h-full rounded-full', positive ? 'bg-positive' : 'bg-negative')}
            style={{
              left: positive ? '50%' : `${50 + half}%`,
              width: `${Math.abs(half)}%`,
            }}
          />
        </span>
      </span>
    </Tooltip>
  );
}

const RISK_LABEL: Record<RiskKey, string> = {
  injury: 'Injury',
  age: 'Age',
  role: 'Role',
  offense: 'Offense',
  efficiency: 'Efficiency',
  hype: 'Hype',
};

export function RiskBreakdown({
  composite,
  breakdown,
}: {
  composite: number;
  breakdown: Record<RiskKey, number>;
}) {
  const entries = Object.entries(breakdown) as [RiskKey, number][];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-text-secondary">Risk score</span>
        <span className="data text-data-lg font-semibold text-text-primary">{composite}</span>
      </div>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-20 text-xs text-text-secondary">{RISK_LABEL[k]}</span>
            <span className="h-1 flex-1 rounded-full bg-border-default" aria-hidden>
              <span
                className={cn(
                  'block h-full rounded-full',
                  // Risk runs neutral → caution → alarm; low risk is unremarkable,
                  // not a positive value signal.
                  v >= 65 ? 'bg-negative' : v >= 40 ? 'bg-warning' : 'bg-text-faint',
                )}
                style={{ width: `${v}%` }}
              />
            </span>
            <span className="data w-7 text-right text-xs text-text-secondary">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Sparkline (dependency-free SVG, §21.5) ----------
/**
 * Trend shape only.
 *
 * Neutral by default and unfilled: a wall of filled red/green areas is what makes a
 * product read as a trading terminal, and on rows that already carry a coloured
 * delta the colour is redundant anyway. Pass `tone="direction"` only where the
 * sparkline itself is the thing carrying the up/down meaning.
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  tone = 'neutral',
  ariaLabel,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: 'neutral' | 'direction';
  ariaLabel?: string;
}) {
  if (data.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  const color =
    tone === 'direction'
      ? up
        ? 'var(--pt-positive)'
        : 'var(--pt-negative)'
      : 'var(--pt-text-muted)';
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `Trend ${up ? 'up' : 'down'}`}
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={1.75} fill={color} />
    </svg>
  );
}
