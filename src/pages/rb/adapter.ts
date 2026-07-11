// RB presentation adapter: display copy + formatting only. No formula logic. The
// driver→component lookup mirrors the engine's explanation templates and is guarded
// by adapter.test.ts, which fails if the engine templates ever drift.

import { HORIZON_WEIGHTS } from '@/rb-model/constants';
import type { ComponentScores, Horizon, RBMVPOutput } from '@/rb-model/types';

export type ComponentKey = keyof ComponentScores;

export const COMPONENT_ORDER: ComponentKey[] = ['WRK', 'OQ', 'RE', 'RU', 'TC', 'RD', 'AD', 'AV'];

export interface ComponentMeta {
  code: ComponentKey;
  name: string;
  description: string;
}

// §14 names + descriptions (verbatim).
export const COMPONENT_META: Record<ComponentKey, ComponentMeta> = {
  WRK: { code: 'WRK', name: 'Workload Role', description: 'Measures current snap, carry, and route involvement.' },
  OQ: { code: 'OQ', name: 'Opportunity Quality', description: 'Measures access to targets, red-zone work, goal-line work, and scoring opportunities.' },
  RE: { code: 'RE', name: 'Rushing Efficiency', description: 'Measures heavily regressed rushing efficiency without allowing one long run to dominate.' },
  RU: { code: 'RU', name: 'Receiving Utility', description: 'Measures route involvement, target earning, catching, and receiving production.' },
  TC: { code: 'TC', name: 'Team Context', description: 'Measures the team rushing pool, passing environment, scoring environment, and quarterback rushing pressure.' },
  RD: { code: 'RD', name: 'Role Durability', description: 'Measures how likely the current role is to continue.' },
  AD: { code: 'AD', name: 'Age & Development', description: 'Measures the player’s age and career-stage outlook for the selected horizon.' },
  AV: { code: 'AV', name: 'Availability', description: 'Measures current availability to play.' },
};

export interface HorizonMeta {
  key: Horizon;
  label: string;
  short: string;
  hasProjection: boolean;
  blurb: string;
}

export const HORIZONS: HorizonMeta[] = [
  { key: 'WEEKLY', label: 'Weekly', short: 'Wk', hasProjection: true, blurb: 'Next-game outlook — availability, current workload, and opportunity dominate.' },
  { key: 'ROS', label: 'Rest of Season', short: 'ROS', hasProjection: true, blurb: 'Remaining-season outlook across expected active games.' },
  { key: 'ONE_YEAR', label: 'One Year', short: '1Y', hasProjection: false, blurb: 'Next-season component profile — workload role and opportunity weigh more.' },
  { key: 'THREE_YEAR', label: 'Three Years', short: '3Y', hasProjection: false, blurb: 'Multi-year profile — role durability and age & development rise.' },
  { key: 'DYNASTY', label: 'Dynasty', short: 'Dyn', hasProjection: false, blurb: 'Long-term profile — age & development and durability dominate.' },
];

export const DEFERRED_HORIZON_NOTICE =
  'Long-term fantasy-point projections are not included in RB MVP v1.0. This horizon currently summarizes the position-specific component profile only.';

// Engine explanation templates (§26.13) mirrored as a driver-sentence → component
// lookup. Display copy, not formula. Guarded by adapter.test.ts.
export const DRIVER_TO_COMPONENT: Record<string, ComponentKey> = {
  // Direct EFO explanations (§26.13.1).
  'Projected to control most backfield carries.': 'WRK',
  'Projected to dominate goal-line work.': 'OQ',
  'Receiving usage provides weekly stability.': 'RU',
  'Committee usage limits expected workload.': 'WRK',
  'The projection depends heavily on touchdown opportunities.': 'OQ',
  'Current workload may shrink when a teammate returns.': 'RD',
  'Current availability materially lowers the weekly outlook.': 'AV',
  'Age and workload reduce the long-term outlook.': 'AD',
  // Component drivers (§26.13.2).
  'Current workload supports the outlook.': 'WRK',
  'Limited workload lowers the outlook.': 'WRK',
  'High-value opportunities strengthen the projection.': 'OQ',
  'Limited high-value opportunities constrain the projection.': 'OQ',
  'Rushing efficiency is above the RB reference group.': 'RE',
  'Rushing efficiency is below the RB reference group.': 'RE',
  'Receiving utility strengthens the profile.': 'RU',
  'Limited receiving utility reduces weekly stability.': 'RU',
  'The team environment supports RB opportunity.': 'TC',
  'The team environment limits RB opportunity.': 'TC',
  'The current role has strong durability support.': 'RD',
  'Role durability is a material concern.': 'RD',
  'Age and development support the long-term profile.': 'AD',
  'Age and workload reduce the long-term profile.': 'AD',
  'Current availability supports the weekly outlook.': 'AV',
  'Current availability lowers the weekly outlook.': 'AV',
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

// ---------- definitions (§17) ----------
export const CONFIDENCE_DEFINITION =
  'Confidence reflects the completeness and reliability of the available evidence. It does not raise or lower the player’s projection.';
export const VOLATILITY_DEFINITION =
  'Volatility reflects instability in role, workload, scoring dependence, injury status, and available evidence. It is not a medical diagnosis.';

export const CONFIDENCE_TONE: Record<RBMVPOutput['confidence']['label'], 'up' | 'warning' | 'down'> = {
  HIGH: 'up',
  MEDIUM: 'warning',
  LOW: 'down',
};
// Higher volatility is more cautionary, so the tone scale is inverted vs confidence.
export const VOLATILITY_TONE: Record<RBMVPOutput['volatility']['label'], 'up' | 'warning' | 'down'> = {
  LOW: 'up',
  MEDIUM: 'warning',
  HIGH: 'down',
};

// Human-readable fallback sentence from a §26.5 log entry. Never shows a raw
// internal key when a readable label exists.
export function fallbackSentence(field: string, fallbackUsed: string): string {
  const map: Record<string, string> = {
    Snap4: `Four-game snap share was unavailable, so ${fallbackUsed} was used instead.`,
    Snap8: 'Eight-game snap share was unavailable, so the four-game value was used.',
    'Carry share': `Carry share was unavailable, so a snap-based estimate (${fallbackUsed}) was used.`,
    'Route participation': 'Route participation was unavailable, so the snap-based route estimate was used.',
    TPRR: `Targets per route run was unavailable, so ${fallbackUsed} was used.`,
    'Target share': `Target share was unavailable, so a derived estimate (${fallbackUsed}) was used.`,
    'Red-zone share': `Red-zone carry share was unavailable, so ${fallbackUsed} was used.`,
    'Goal-line share': `Goal-line carry share was unavailable, so ${fallbackUsed} was used.`,
    YPC: `Yards per carry was unavailable, so ${fallbackUsed} was used.`,
    'Success rate': `Rushing success rate was unavailable, so a neutral value (${fallbackUsed}) was used.`,
    'Explosive rate': `Explosive-run rate was unavailable, so a neutral value (${fallbackUsed}) was used.`,
    'Catch rate': `Catch rate was unavailable, so ${fallbackUsed} was used.`,
    'Rec yards/reception': `Receiving yards per reception was unavailable, so ${fallbackUsed} was used.`,
    'Team non-QB rushes': `Projected team non-QB rush attempts were unavailable, so the ${fallbackUsed} was used.`,
    'Team dropbacks': `Projected team dropbacks were unavailable, so the ${fallbackUsed} was used.`,
    'Points/drive': `Team points per drive was unavailable, so the ${fallbackUsed} was used.`,
    'Red-zone trips': `Team red-zone trips per game were unavailable, so the ${fallbackUsed} was used.`,
    'QB rush pressure': `Quarterback rush pressure was unavailable, so a neutral value (${fallbackUsed}) was used.`,
    'Workload ramp': `Workload ramp was unavailable, so the ${fallbackUsed} was used.`,
    'Contract security': 'Contract security was unavailable, so the draft-round mapping was used.',
    'Competition pressure': `Competition pressure was unavailable, so a neutral value (${fallbackUsed}) was used.`,
  };
  return map[field] ?? `${field} was unavailable, so ${fallbackUsed} was used instead.`;
}
