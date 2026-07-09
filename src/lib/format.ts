// Display formatting helpers. Kept pure and dependency-free.

import {
  CONFIDENCE,
  FRESHNESS,
  MISPRICING_BANDS,
  PRICE_BANDS,
  VOLATILITY,
} from '@/config/market';
import type { Confidence } from '@/types/market';

export function fmtPrice(n: number): string {
  return n.toFixed(1);
}

// Signed delta with fixed decimals — pairs with an arrow + color at the call site
// so movement is never conveyed by color alone (§31).
export function fmtDelta(n: number, decimals = 1): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(decimals)}`;
}

export function fmtPct(n: number, decimals = 1): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(decimals)}%`;
}

export function fmtSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(Math.round(n))}`;
}

export type Direction = 'up' | 'down' | 'flat';

export function directionOf(n: number, epsilon = 0.05): Direction {
  if (n > epsilon) return 'up';
  if (n < -epsilon) return 'down';
  return 'flat';
}

export const ARROW: Record<Direction, string> = { up: '▲', down: '▼', flat: '▬' };

export function priceBandLabel(price: number): string {
  return PRICE_BANDS.find((b) => price >= b.min)?.label ?? '';
}

export function mispricingBandLabel(mispricing: number): string {
  return MISPRICING_BANDS.find((b) => mispricing >= b.min)?.label ?? 'Fairly priced';
}

export function volatilityBand(volatility: number): string {
  return VOLATILITY.bands.find((b) => volatility <= b.max)?.label ?? 'Extreme';
}

export function volatilitySegments(volatility: number): number {
  // 0–3 filled segments mapping to Low/Medium/High/Extreme.
  const idx = VOLATILITY.bands.findIndex((b) => volatility <= b.max);
  return (idx === -1 ? 3 : idx) + 1;
}

export function confidenceBand(confidence: number): Confidence {
  if (confidence < CONFIDENCE.lowMax) return 'low';
  if (confidence > CONFIDENCE.highMin) return 'high';
  return 'medium';
}

export function confidenceLabel(c: Confidence): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

// ---------- Dates & freshness ----------

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export type Freshness = 'fresh' | 'recent' | 'stale' | 'outdated';

export function freshnessOf(lastUpdatedIso: string, now = new Date()): Freshness {
  const ageHours = (now.getTime() - new Date(lastUpdatedIso).getTime()) / 36e5;
  if (ageHours < FRESHNESS.freshHours) return 'fresh';
  if (ageHours < FRESHNESS.recentDays * 24) return 'recent';
  if (ageHours < FRESHNESS.staleDays * 24) return 'stale';
  return 'outdated';
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'Fresh',
  recent: 'Recent',
  stale: 'Stale',
  outdated: 'Outdated',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
