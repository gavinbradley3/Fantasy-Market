// TE presentation adapter: display copy + formatting only. No formula logic. Maps
// the public TEMVPOutput into the shared view model. The driver→component lookup
// mirrors the engine's explanation templates (Section 26.13) and is guarded by
// adapter.test.ts, which fails if the engine templates ever drift. Confidence
// penalty codes and fallback-log field codes are humanized here for display only.

import { COMPONENT_ORDER as TE_COMPONENT_ORDER, HORIZON_WEIGHTS } from '@/te-model/constants';
import type { TEHorizon, TEMVPOutput } from '@/te-model';

export type ComponentKey = keyof TEMVPOutput['components'];

// Canonical component order (Section 26.9): RR, TE, TQ, RE, TC, RD, AD, AV.
export const COMPONENT_ORDER: ComponentKey[] = [...TE_COMPONENT_ORDER];

export interface ComponentMeta {
  code: ComponentKey;
  name: string;
  description: string;
}

// TE-specific component names + descriptions. Deliberately distinct from WR/RB
// terminology: the TE profile rewards routes (not snaps), tight-end target
// earning, and tight-end receiving efficiency against the TE reference group.
export const COMPONENT_META: Record<ComponentKey, ComponentMeta> = {
  RR: {
    code: 'RR',
    name: 'Route Role',
    description: 'How consistently the tight end runs routes on team dropbacks — blocking snaps are not counted as routes.',
  },
  TE: {
    code: 'TE',
    name: 'Target Earning',
    description: 'How often the tight end earns targets while running a route, relative to the TE reference group.',
  },
  TQ: {
    code: 'TQ',
    name: 'Target Quality',
    description: 'The scoring value of the targets earned — depth of target plus red-zone and end-zone usage.',
  },
  RE: {
    code: 'RE',
    name: 'Receiving Efficiency',
    description: 'Depth-adjusted catching and yardage efficiency, heavily regressed against the TE reference group.',
  },
  TC: {
    code: 'TC',
    name: 'Team Context',
    description: 'Strength of the passing environment, quarterback play, and team red-zone / scoring opportunity.',
  },
  RD: {
    code: 'RD',
    name: 'Role Durability',
    description: 'How likely the current receiving role is to continue, accounting for competition and role changes.',
  },
  AD: {
    code: 'AD',
    name: 'Age & Development',
    description: 'Age-related development or decline for the selected horizon on the tight-end aging curve.',
  },
  AV: {
    code: 'AV',
    name: 'Availability',
    description: 'Current probability of the tight end being available to play.',
  },
};

export interface HorizonMeta {
  key: TEHorizon;
  label: string;
  short: string;
  /** Weekly/ROS have real projections; the rest defer long-term points. */
  hasProjection: boolean;
  blurb: string;
}

export const HORIZONS: HorizonMeta[] = [
  { key: 'WEEKLY', label: 'Weekly', short: 'Wk', hasProjection: true, blurb: 'Next-game outlook — availability, route role, and target earning dominate.' },
  { key: 'ROS', label: 'Rest of Season', short: 'ROS', hasProjection: true, blurb: 'Remaining-season outlook across expected active games.' },
  { key: 'ONE_YEAR', label: 'One Year', short: '1Y', hasProjection: false, blurb: 'Next-season component profile — route role, target earning, and durability weigh more.' },
  { key: 'THREE_YEAR', label: 'Three Years', short: '3Y', hasProjection: false, blurb: 'Multi-year profile — role durability and age & development rise.' },
  { key: 'DYNASTY', label: 'Dynasty', short: 'Dyn', hasProjection: false, blurb: 'Long-term profile — age & development and role durability dominate.' },
];

export const DEFERRED_HORIZON_NOTICE =
  'Long-term fantasy-point projections are not included in TE MVP v1.0. This horizon currently summarizes the position-specific component profile only.';

// Engine explanation templates (Section 26.13) mirrored as a driver-sentence →
// component lookup. Display copy, not formula. Guarded by adapter.test.ts.
export const DRIVER_TO_COMPONENT: Record<string, ComponentKey> = {
  // Direct EFO explanations (Section 26.13.1).
  'Runs routes on most team dropbacks.': 'RR',
  'Earns targets at a strong rate when in a route.': 'TE',
  'Red-zone usage supports touchdown opportunity.': 'TQ',
  'A blocking-heavy role limits receiving volume.': 'RR',
  'Another receiving option creates meaningful route and target competition.': 'RD',
  'Recent receiving usage may be temporary while a teammate is unavailable.': 'RD',
  'Current availability materially lowers the weekly outlook.': 'AV',
  'The current role is productive, but long-term age risk is increasing.': 'AD',
  'A new-team role adds uncertainty to the projection.': 'RD',
  // Component drivers (Section 26.13.2).
  'Current route usage supports the outlook.': 'RR',
  'Limited route usage constrains the outlook.': 'RR',
  'Target-earning ability strengthens the profile.': 'TE',
  'Target earning is below the TE reference group.': 'TE',
  'Target quality supports efficient fantasy opportunity.': 'TQ',
  'Target quality limits the value of expected volume.': 'TQ',
  'Receiving efficiency is above the TE reference group.': 'RE',
  'Receiving efficiency is below the TE reference group.': 'RE',
  'The team passing environment supports opportunity.': 'TC',
  'The team environment limits receiving opportunity.': 'TC',
  'The receiving role has strong durability support.': 'RD',
  'Role durability is a material concern.': 'RD',
  'Age and development support the long-term profile.': 'AD',
  'Age reduces the long-term profile.': 'AD',
  'Current availability supports the weekly outlook.': 'AV',
  'Current availability lowers the weekly outlook.': 'AV',
};

// Direct driver that maps to volatility (TD dependence) rather than any single
// component — it correctly carries no component chip. Kept explicit so the
// adapter test can distinguish "intentionally uncoded" from "drifted / unmapped".
export const UNCODED_DRIVERS: ReadonlySet<string> = new Set([
  'The projection depends heavily on touchdowns.',
]);

export function driverComponent(sentence: string): ComponentKey | undefined {
  return DRIVER_TO_COMPONENT[sentence];
}

// Components emphasized per horizon (top weights) — drives visual emphasis only.
export function emphasizedComponents(horizon: TEHorizon, topN = 3): Set<ComponentKey> {
  const w = HORIZON_WEIGHTS[horizon];
  const ranked = [...COMPONENT_ORDER].sort((a, b) => w[b] - w[a]).slice(0, topN);
  return new Set(ranked);
}

export function componentWeight(horizon: TEHorizon, key: ComponentKey): number {
  return HORIZON_WEIGHTS[horizon][key];
}

// ---------- formatting ----------
export function fmt1(n: number): string {
  return n.toFixed(1);
}

export function fmtPct0(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// ---------- definitions ----------
export const CONFIDENCE_DEFINITION =
  'Confidence reflects how complete and reliable the tight end’s evidence is. It does not raise or lower the projection.';
export const VOLATILITY_DEFINITION =
  'Volatility reflects instability in the tight end’s role and how much the projection leans on touchdowns and explosive plays. It is not an injury-risk prediction.';

export const CONFIDENCE_TONE: Record<TEMVPOutput['confidence']['label'], 'up' | 'warning' | 'down'> = {
  HIGH: 'up',
  MEDIUM: 'warning',
  LOW: 'down',
};
// Higher volatility is more cautionary, so the tone scale is inverted vs confidence.
export const VOLATILITY_TONE: Record<TEMVPOutput['volatility']['label'], 'up' | 'warning' | 'down'> = {
  LOW: 'up',
  MEDIUM: 'warning',
  HIGH: 'down',
};

// Human-readable fallback sentence from a Section 26.5 log entry. The engine
// records UPPERCASE field codes plus REFERENCE_DISTRIBUTION:<name> entries; this
// map turns them into plain English without ever changing the model.
const FALLBACK_FIELD_LABEL: Record<string, string> = {
  RP4: 'Route participation (last 4 games)',
  RP8: 'Route participation (last 8 games)',
  SNAP4: 'Snap share (last 4 games)',
  TPRR: 'Targets per route run',
  TARGET_SHARE: 'Target share',
  AVERAGE_DEPTH_OF_TARGET: 'Average depth of target',
  RED_ZONE_TARGET_RATE: 'Red-zone target rate',
  END_ZONE_TARGET_RATE: 'End-zone target rate',
  CATCHABLE_TARGET_RATE: 'Catchable-target rate',
  CATCH_RATE: 'Catch rate',
  YARDS_PER_TARGET: 'Yards per target',
  YARDS_PER_RECEPTION: 'Yards per reception',
  YAC_PER_RECEPTION: 'Yards after catch per reception',
  PROJECTED_TEAM_DROPBACKS: 'Projected team dropbacks',
  TEAM_POINTS_PER_DRIVE: 'Team points per drive',
  TEAM_RED_ZONE_TRIPS_PER_GAME: 'Team red-zone trips per game',
  QB_ENVIRONMENT_SCORE: 'Quarterback environment score',
  COMPETITION_PRESSURE: 'Competition pressure',
  CONTRACT_SECURITY: 'Contract security',
  WORKLOAD_RAMP_FACTOR: 'Workload ramp factor',
};

export function fallbackSentence(field: string, fallbackUsed: string): string {
  if (field.startsWith('REFERENCE_DISTRIBUTION:')) {
    const name = field.slice('REFERENCE_DISTRIBUTION:'.length).replace(/_/g, ' ');
    return `The reference distribution for ${name} was unavailable, so the 50th-percentile value was used.`;
  }
  const label = FALLBACK_FIELD_LABEL[field] ?? field;
  return `${label} was unavailable, so ${fallbackUsed} was used instead.`;
}

// Human-readable confidence-penalty label. The engine emits canonical penalty
// codes (Section 26.11); this humanizes them for display only.
const NON_FALLBACK_PENALTY_LABEL: Record<string, string> = {
  LOW_CAREER_ROUTES_LT_75: 'Very limited career routes (under 75)',
  LOW_CAREER_ROUTES_75_TO_199: 'Limited career routes (75–199)',
  LOW_CAREER_ROUTES_200_TO_399: 'Below-threshold career routes (200–399)',
  UNKNOWN_INJURY_STATUS: 'Injury status is unknown',
  UNKNOWN_ROLE_CHANGE: 'Role change is unknown',
  UNKNOWN_DEPTH_CHART_ROLE: 'Depth-chart role is unknown',
  UNKNOWN_COACHING_CONTINUITY: 'Coaching continuity is unknown',
  NEW_TEAM: 'New team this season',
  ANOTHER_RECEIVING_TE: 'Another receiving tight end competes for targets',
  MISSING_TEAM: 'Team is unavailable',
};

export function penaltyLabel(code: string): string {
  if (code.startsWith('FALLBACK:')) {
    const field = code.slice('FALLBACK:'.length);
    const label = FALLBACK_FIELD_LABEL[field] ?? field;
    return `Fallback applied for ${label}`;
  }
  if (code.startsWith('MISSING_REFERENCE:')) {
    const name = code.slice('MISSING_REFERENCE:'.length).replace(/_/g, ' ');
    return `Missing reference distribution: ${name}`;
  }
  return NON_FALLBACK_PENALTY_LABEL[code] ?? code;
}
