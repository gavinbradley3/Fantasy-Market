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
        'ticker rounded bg-elevated px-1.5 py-0.5 text-xs font-semibold text-text-secondary',
        className,
      )}
    >
      {ticker}
    </span>
  );
}

export function PositionGlyph({ position }: { position: Position }) {
  const m = POSITION_META[position];
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded border px-1 text-[10px] font-semibold',
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
      className="flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-text-primary"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
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
  const cls = size === 'xl' ? 'text-5xl' : size === 'lg' ? 'text-3xl' : 'text-xl';
  return (
    <Tooltip label={`Value Index ${fmtPrice(price)} — ${priceBandLabel(price)}. A fictional 0–100 fantasy value index, not a dollar price.`}>
      <span className={cn('font-mono font-semibold tabnum text-text-primary', cls)}>
        {fmtPrice(price)}
      </span>
    </Tooltip>
  );
}

export function MovementBadge({
  value,
  window,
  showWindow = false,
  className,
}: {
  value: number;
  window?: '24H' | '7D' | '30D' | 'Season';
  showWindow?: boolean;
  className?: string;
}) {
  const dir = directionOf(value);
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-mono text-sm tabnum', movementColor(value), className)}
    >
      <span aria-hidden>{ARROW[dir]}</span>
      <span>{fmtDelta(value)}</span>
      {showWindow && window && <span className="text-text-muted">{window}</span>}
      <span className="sr-only">
        {dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat'} {Math.abs(value).toFixed(1)}
        {window ? ` over ${window}` : ''}
      </span>
    </span>
  );
}

// ---------- Signal ----------
const SIGNAL_STYLE: Record<'up' | 'down' | 'neutral', string> = {
  up: 'text-up border-up/40 bg-up/10',
  down: 'text-down border-down/40 bg-down/10',
  neutral: 'text-text-secondary border-border-subtle bg-elevated',
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
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
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
      <span className="inline-flex items-center rounded-full border border-secondary/30 bg-secondary/5 px-2 py-0.5 text-[11px] font-medium text-secondary">
        {def.label}
      </span>
    </Tooltip>
  );
}

const TAG_TONE: Record<'up' | 'down' | 'neutral', string> = {
  up: 'border-up/30 bg-up/5 text-up',
  down: 'border-down/30 bg-down/5 text-down',
  neutral: 'border-warning/30 bg-warning/5 text-warning',
};

export function MarketTag({ id }: { id: MarketTagId }) {
  const def = TAG_BY_ID[id];
  return (
    <Tooltip label={def.definition}>
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
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
  const tone =
    filled >= 4 ? 'bg-down' : filled === 3 ? 'bg-warning' : filled === 2 ? 'bg-secondary' : 'bg-up';
  return (
    <Tooltip label={`Volatility ${value}/100 (${band}). Higher means less stable week-to-week value — a start/sit trust signal.`}>
      <span className="inline-flex items-center gap-1.5">
        <span className="flex gap-0.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn('h-2.5 w-3 rounded-sm', i < filled ? tone : 'bg-border-subtle')}
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
      <span className={cn('inline-flex flex-col gap-1', size === 'sm' ? 'w-24' : 'w-32')}>
        <span className="flex items-center justify-between text-[11px]">
          <span className={cn('font-mono font-semibold tabnum', positive ? 'text-up' : value < 0 ? 'text-down' : 'text-text-secondary')}>
            {fmtSigned(value)}
          </span>
          <span className="text-text-muted">{band}</span>
        </span>
        <span className="relative h-1.5 w-full rounded-full bg-border-subtle" aria-hidden>
          <span className="absolute left-1/2 top-0 h-full w-px bg-text-muted/60" />
          <span
            className={cn('absolute top-0 h-full rounded-full', positive ? 'bg-up' : 'bg-down')}
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
        <span className="font-mono text-lg font-semibold tabnum text-text-primary">{composite}</span>
      </div>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-20 text-xs text-text-secondary">{RISK_LABEL[k]}</span>
            <span className="h-1.5 flex-1 rounded-full bg-border-subtle" aria-hidden>
              <span
                className={cn('block h-full rounded-full', v >= 65 ? 'bg-down' : v >= 40 ? 'bg-warning' : 'bg-up')}
                style={{ width: `${v}%` }}
              />
            </span>
            <span className="w-7 text-right font-mono text-xs tabnum text-text-secondary">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Sparkline (dependency-free SVG, §21.5) ----------
export function Sparkline({
  data,
  width = 96,
  height = 28,
  ariaLabel,
}: {
  data: number[];
  width?: number;
  height?: number;
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
  const color = up ? '#2DD4A7' : '#F0526A';
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `Trend ${up ? 'up' : 'down'}`}
      className="overflow-visible"
    >
      <path d={areaPath} fill={color} fillOpacity={0.08} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={color} />
    </svg>
  );
}
