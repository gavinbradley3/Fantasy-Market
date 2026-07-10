// Presentation adapter: display copy + formatting only. No formula logic. Maps
// the public WRMVPOutput into a view model the WR page renders. The one place
// that mirrors engine strings — the driver→component lookup — is guarded by a
// test that fails if the engine's templates ever drift.

import { HORIZON_WEIGHTS } from '@/wr-model/constants';
import type { ComponentScores, Horizon, WRMVPOutput } from '@/wr-model/types';

export type ComponentKey = keyof ComponentScores;

export const COMPONENT_ORDER: ComponentKey[] = ['RR', 'TE', 'TQ', 'EF', 'TC', 'RD', 'AD', 'AV'];

export interface ComponentMeta {
  code: ComponentKey;
  name: string;
  description: string;
}

// §8 concise descriptions.
export const COMPONENT_META: Record<ComponentKey, ComponentMeta> = {
  RR: { code: 'RR', name: 'Route Role', description: 'How consistently the receiver is running routes.' },
  TE: { code: 'TE', name: 'Target Earning', description: 'How often the receiver earns targets while on a route.' },
  TQ: { code: 'TQ', name: 'Target Quality', description: 'The expected fantasy value of the targets being earned.' },
  EF: { code: 'EF', name: 'Efficiency', description: 'Depth-adjusted catching and yardage efficiency.' },
  TC: { code: 'TC', name: 'Team Context', description: 'Strength of the offense, quarterback environment, and passing volume.' },
  RD: { code: 'RD', name: 'Role Durability', description: 'How likely the receiver is to keep or expand the current role.' },
  AD: { code: 'AD', name: 'Age & Development', description: 'Age-related development or decline for the selected horizon.' },
  AV: { code: 'AV', name: 'Availability', description: 'Current probability of being available to play.' },
};

export interface HorizonMeta {
  key: Horizon;
  label: string;
  short: string;
  /** Weekly/ROS have real projections; the rest defer long-term points. */
  hasProjection: boolean;
  blurb: string;
}

export const HORIZONS: HorizonMeta[] = [
  { key: 'WEEKLY', label: 'Weekly', short: 'Wk', hasProjection: true, blurb: 'Next-game outlook — availability and current role dominate.' },
  { key: 'ROS', label: 'Rest of Season', short: 'ROS', hasProjection: true, blurb: 'Remaining-season outlook across expected active games.' },
  { key: 'ONE_YEAR', label: 'One Year', short: '1Y', hasProjection: false, blurb: 'Next-season component profile — role and earning weigh more.' },
  { key: 'THREE_YEAR', label: 'Three Years', short: '3Y', hasProjection: false, blurb: 'Multi-year profile — durability and age & development rise.' },
  { key: 'DYNASTY', label: 'Dynasty', short: 'Dyn', hasProjection: false, blurb: 'Long-term profile — age & development and durability dominate.' },
];

export const DEFERRED_HORIZON_NOTICE =
  'Long-term fantasy-point projections are not included in WR MVP v1.0. This horizon currently summarizes the player’s component profile only.';

// Engine explanation templates mirrored as a driver-sentence → component
// lookup (display copy, not formula). Guarded by adapter.test.ts.
export const DRIVER_TO_COMPONENT: Record<string, ComponentKey> = {
  'Strong route participation supports the projection.': 'RR',
  'Limited route participation caps the opportunity.': 'RR',
  'Target earning is strong relative to the WR reference group.': 'TE',
  'Target earning is below the WR reference group.': 'TE',
  'A high-value target profile lifts the outlook.': 'TQ',
  'A low-value target profile weighs on the outlook.': 'TQ',
  'Efficient conversion adds to the projection.': 'EF',
  'Below-average conversion efficiency weighs on the projection.': 'EF',
  'A strong team and quarterback environment helps the projection.': 'TC',
  'A weak team and quarterback environment limits the projection.': 'TC',
  'Role durability supports the longer-term outlook.': 'RD',
  'Role durability concerns reduce the longer-term outlook.': 'RD',
  'Age and development profile support the long-term outlook.': 'AD',
  'Age and role durability reduce the long-term outlook.': 'AD',
  'Current availability supports the weekly outlook.': 'AV',
  'Current availability materially lowers the weekly outlook.': 'AV',
};

export function driverComponent(sentence: string): ComponentKey | undefined {
  return DRIVER_TO_COMPONENT[sentence];
}

// Components emphasized per horizon (top weights) — drives visual emphasis only.
export function emphasizedComponents(horizon: Horizon, topN = 3): Set<ComponentKey> {
  const w = HORIZON_WEIGHTS[horizon];
  const ranked = [...COMPONENT_ORDER].sort((a, b) => w[b] - w[a]).slice(0, topN);
  return new Set(ranked);
}

export function componentWeight(horizon: Horizon, key: ComponentKey): number {
  return HORIZON_WEIGHTS[horizon][key];
}

// ---------- formatting ----------
export function fmt1(n: number): string {
  return n.toFixed(1);
}

export function fmtPct0(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export const CONFIDENCE_DEFINITION =
  'Confidence reflects how complete and reliable the evidence is. It does not raise or lower the player’s projection.';
export const VOLATILITY_DEFINITION =
  'Volatility reflects how unstable the player’s role or output profile may be. It is not a precise injury-risk prediction.';

export const CONFIDENCE_TONE: Record<WRMVPOutput['confidence']['label'], 'up' | 'warning' | 'down'> = {
  HIGH: 'up',
  MEDIUM: 'warning',
  LOW: 'down',
};
// Higher volatility is more cautionary, so the tone scale is inverted vs confidence.
export const VOLATILITY_TONE: Record<WRMVPOutput['volatility']['label'], 'up' | 'warning' | 'down'> = {
  LOW: 'up',
  MEDIUM: 'warning',
  HIGH: 'down',
};

// Human-readable fallback sentence from a log entry.
export function fallbackSentence(field: string, fallbackUsed: string): string {
  const map: Record<string, string> = {
    RP4: `Route participation (last 4 games) was unavailable, so ${fallbackUsed} was used instead.`,
    RP8: `Route participation (last 8 games) was unavailable, so ${fallbackUsed} was used instead.`,
    TPRR: `Targets per route run was unavailable, so ${fallbackUsed} was used instead.`,
    'Target share': `Target share was unavailable, so a derived estimate (${fallbackUsed}) was used.`,
    'xFP/target': `Expected fantasy points per target was unavailable, so ${fallbackUsed} was used.`,
    CROE: `Catch rate over expected was unavailable, so a neutral value (${fallbackUsed}) was used.`,
    'Depth-adjusted Y/T': `Depth-adjusted yards per target was unavailable, so ${fallbackUsed} was used.`,
    aDOT: `Average depth of target was unavailable, so ${fallbackUsed} yards was used.`,
    'xTD/target': `Expected touchdown rate per target was unavailable, so ${fallbackUsed} was used.`,
    'Team dropbacks': `Projected team dropbacks were unavailable, so ${fallbackUsed} was used.`,
    'QB environment': `Quarterback environment was unavailable, so a neutral value (${fallbackUsed}) was used.`,
    'Points/drive': `Team points per drive was unavailable, so ${fallbackUsed} was used.`,
    'Contract security': `Contract security was unavailable, so a ${fallbackUsed} was used.`,
    'Competition pressure': `Competition pressure was unavailable, so a neutral value (${fallbackUsed}) was used.`,
  };
  return map[field] ?? `${field} was unavailable, so ${fallbackUsed} was used instead.`;
}
