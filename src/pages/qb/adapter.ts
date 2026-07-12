// QB presentation adapter: display copy + formatting only. No formula logic. Maps
// the public QBMVPOutput into the shared view model. The driver→component lookup
// mirrors the engine's explanation templates (Section 26.13) and is guarded by
// adapter.test.ts, which fails if the engine templates ever drift. Confidence
// penalty codes and fallback-log codes are humanized here for display only.

import { COMPONENT_ORDER as QB_COMPONENT_ORDER, HORIZON_WEIGHTS } from '@/qb-model/constants';
import type { QBHorizon, QBMVPOutput } from '@/qb-model';

// Short component codes used internally by the engine (Section 26.9): the shared
// UI renders them as chips. They differ from the output object's long keys, so the
// adapter keeps an explicit code → output-key mapping.
export type ComponentCode = 'PO' | 'PQ' | 'RV' | 'SE' | 'RS' | 'AV' | 'AD' | 'SU';
export type ComponentOutputKey = keyof QBMVPOutput['components'];

// Canonical component order (Section 26.9): PO, PQ, RV, SE, RS, AV, AD, SU.
export const COMPONENT_ORDER: ComponentCode[] = [...QB_COMPONENT_ORDER];

export interface ComponentMeta {
  code: ComponentCode;
  outputKey: ComponentOutputKey;
  name: string;
  description: string;
}

// QB-specific component names + descriptions. Deliberately distinct from WR/RB/TE
// terminology: the QB profile separates passing volume from passing quality,
// decomposes rushing, and treats role security as a first-class long-horizon driver.
export const COMPONENT_META: Record<ComponentCode, ComponentMeta> = {
  PO: {
    code: 'PO',
    outputKey: 'passing_opportunity',
    name: 'Passing Opportunity',
    description:
      'How much legitimate passing workload the quarterback controls — expected attempts, team dropback share, and recent start rate.',
  },
  PQ: {
    code: 'PQ',
    outputKey: 'passing_quality',
    name: 'Passing Quality',
    description:
      'How efficiently the quarterback converts passing opportunities — adjusted yards per attempt, completion quality, and explosive-pass rate.',
  },
  RV: {
    code: 'RV',
    outputKey: 'rushing_value',
    name: 'Rushing Value',
    description:
      "The quarterback's rushing floor and ceiling — designed runs, scrambles, rushing yards, and goal-line usage.",
  },
  SE: {
    code: 'SE',
    outputKey: 'scoring_environment',
    name: 'Scoring Environment',
    description:
      'Strength of the offensive and scoring environment supporting passing and touchdown production.',
  },
  RS: {
    code: 'RS',
    outputKey: 'role_security',
    name: 'Role Security',
    description:
      'Probability and durability of retaining the starting job — weighted more heavily on longer horizons.',
  },
  AV: {
    code: 'AV',
    outputKey: 'availability',
    name: 'Availability',
    description: 'Current probability of being active, blended with broader availability history.',
  },
  AD: {
    code: 'AD',
    outputKey: 'age_development',
    name: 'Age & Development',
    description:
      'Career-stage value, developmental runway, and draft investment on the quarterback aging curve.',
  },
  SU: {
    code: 'SU',
    outputKey: 'sustainability',
    name: 'Sustainability',
    description:
      'How well current production is supported by stable turnover, sack, sample, and trend evidence rather than fragile rates.',
  },
};

export interface HorizonMeta {
  key: QBHorizon;
  label: string;
  short: string;
  /** Weekly/ROS have real fantasy-point projections; the rest defer long-term points. */
  hasProjection: boolean;
  blurb: string;
}

export const HORIZONS: HorizonMeta[] = [
  { key: 'WEEKLY', label: 'Weekly', short: 'Wk', hasProjection: true, blurb: 'Next-game outlook — passing opportunity, rushing, availability, and immediate scoring environment dominate.' },
  { key: 'ROS', label: 'Rest of Season', short: 'ROS', hasProjection: true, blurb: 'Remaining-season outlook across expected active games, with more weight on role security and sustainability.' },
  { key: 'ONE_YEAR', label: 'One Year', short: '1Y', hasProjection: false, blurb: 'Next-season component profile — role security, passing quality, and sustainability weigh more.' },
  { key: 'THREE_YEAR', label: 'Three Years', short: '3Y', hasProjection: false, blurb: 'Multi-year profile — role security, passing quality, and age & development rise.' },
  { key: 'DYNASTY', label: 'Dynasty', short: 'Dyn', hasProjection: false, blurb: 'Long-term profile — age & development, role security, and sustainable passing quality dominate.' },
];

export const DEFERRED_HORIZON_NOTICE =
  'Long-term fantasy-point projections are not included in QB MVP v1.2. This horizon currently summarizes the position-specific component profile only.';

// Engine explanation templates (Section 26.13) mirrored as a driver-sentence →
// component-code lookup. Display copy, not formula. Guarded by adapter.test.ts.
export const DRIVER_TO_COMPONENT: Record<string, ComponentCode> = {
  // Direct EFO explanations (Section 26.13.3).
  'Current availability materially reduces Weekly expected fantasy output.': 'AV',
  'Temporary starting status sharply limits value beyond the immediate opportunity.': 'RS',
  'Recent benching creates severe starting-role uncertainty.': 'RS',
  'Rushing supplies a large share of expected fantasy production.': 'RV',
  // Component drivers (Section 26.13.2).
  'Strong passing opportunity supports the current fantasy workload.': 'PO',
  'Limited passing opportunity constrains the current fantasy ceiling.': 'PO',
  'Strong passing efficiency and quality support sustainable quarterback value.': 'PQ',
  'Weak passing efficiency limits the sustainability of current production.': 'PQ',
  'Designed rushing, scrambling, and rushing production add a meaningful fantasy floor and ceiling.': 'RV',
  'Limited rushing contribution leaves the profile more dependent on passing production.': 'RV',
  'The offensive and scoring environment supports touchdown and passing opportunity.': 'SE',
  'A weak offensive environment limits scoring support.': 'SE',
  'Strong starting-role security supports value beyond the immediate week.': 'RS',
  'Unstable starting-role security materially weakens longer-horizon value.': 'RS',
  'Current availability supports near-term value.': 'AV',
  'Availability risk reduces near-term reliability.': 'AV',
  'Age, career stage, and organizational investment support long-term value.': 'AD',
  'Age or limited developmental runway reduces long-horizon value.': 'AD',
  'Turnover, sack, sample, and trend indicators support production sustainability.': 'SU',
  'Current production carries meaningful sustainability risk.': 'SU',
};

// Direct driver that maps to evidence quality rather than any single component —
// it correctly carries no component chip. Kept explicit so the adapter test can
// distinguish "intentionally uncoded" from "drifted / unmapped".
export const UNCODED_DRIVERS: ReadonlySet<string> = new Set([
  'The evaluation relies on multiple fallback inputs, reducing evidence quality.',
]);

export function driverComponent(sentence: string): ComponentCode | undefined {
  return DRIVER_TO_COMPONENT[sentence];
}

// Components emphasized per horizon (top weights) — drives visual emphasis only.
export function emphasizedComponents(horizon: QBHorizon, topN = 3): Set<ComponentCode> {
  const w = HORIZON_WEIGHTS[horizon];
  const ranked = [...COMPONENT_ORDER].sort((a, b) => w[b] - w[a]).slice(0, topN);
  return new Set(ranked);
}

export function componentWeight(horizon: QBHorizon, code: ComponentCode): number {
  return HORIZON_WEIGHTS[horizon][code];
}

// Map a selected horizon to its lowercase composite key in QBMVPOutput.composites.
export function compositeKey(horizon: QBHorizon): keyof QBMVPOutput['composites'] {
  return horizon.toLowerCase() as keyof QBMVPOutput['composites'];
}

// ---------- formatting ----------
export function fmt1(n: number): string {
  return n.toFixed(1);
}

export function fmt0(n: number): string {
  return `${Math.round(n)}`;
}

export function fmtPct0(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// ---------- definitions ----------
export const CONFIDENCE_DEFINITION =
  'Confidence reflects how complete and reliable the quarterback’s evidence is — career and recent sample, role certainty, and fallbacks. It does not raise or lower the projection.';
export const VOLATILITY_DEFINITION =
  'Volatility reflects instability in the quarterback’s expected value — role security, rushing dependence, turnover risk, efficiency swings, and sample size. It is not the inverse of confidence.';

export const CONFIDENCE_TONE: Record<QBMVPOutput['confidence']['label'], 'up' | 'warning' | 'down'> = {
  HIGH: 'up',
  MEDIUM: 'warning',
  LOW: 'down',
};
// Higher volatility is more cautionary, so the tone scale is inverted vs confidence.
export const VOLATILITY_TONE: Record<QBMVPOutput['volatility']['label'], 'up' | 'warning' | 'down'> = {
  LOW: 'up',
  MEDIUM: 'warning',
  HIGH: 'down',
};

// Human-readable fallback sentence from a Section 26.5 fallback code. The QB
// engine's fallback_log is a de-duplicated, lexically-sorted list of codes; this
// map turns each into plain English without ever changing the model.
const FALLBACK_CODE_SENTENCE: Record<string, string> = {
  SCRAMBLES_FROM_RUSH_SHARE: 'Scrambles were unavailable, so a share of rush attempts was used.',
  DESIGNED_RUSH_FROM_TOTAL_MINUS_SCRAMBLES:
    'Designed rush attempts were unavailable, so total rushes minus scrambles was used.',
  GOAL_LINE_RUSH_FROM_TOTAL:
    'Goal-line rush attempts were unavailable, so a share of rush attempts was used.',
  AYPA_DERIVED:
    'Adjusted yards per attempt was unavailable, so it was derived from recent passing totals.',
  AYPA_PRIOR: 'Adjusted yards per attempt was unavailable, so the position prior was used.',
  CPOE_TO_COMPLETION_RATE:
    'Completion percentage over expected was unavailable, so the completion-rate pathway was used.',
  EXPLOSIVE_PASS_RATE_PRIOR: 'Explosive pass rate was unavailable, so the position prior was used.',
  DROPBACK_SHARE_FROM_DEPTH_CHART:
    'Team dropback share was unavailable, so the depth-chart mapping was used.',
  PASS_ATTEMPTS_FROM_RECENT_STARTS:
    'Expected pass attempts were unavailable, so recent attempts per start were used.',
  PASS_ATTEMPTS_FROM_ROLE: 'Expected pass attempts were unavailable, so the role mapping was used.',
  EXPECTED_DESIGNED_RUSH_FALLBACK:
    'Expected designed rushes were unavailable, so a per-start estimate was used.',
  EXPECTED_SCRAMBLES_FALLBACK: 'Expected scrambles were unavailable, so a per-start estimate was used.',
  EXPECTED_GOAL_LINE_RUSH_FALLBACK:
    'Expected goal-line rushes were unavailable, so a per-start estimate was used.',
  OFFENSIVE_ENVIRONMENT_NEUTRAL: 'Offensive environment score was unavailable, so a neutral 50 was used.',
  PROTECTION_CONTEXT_NEUTRAL: 'Protection context score was unavailable, so a neutral 50 was used.',
  COMPETITION_FROM_ROLE: 'Competition pressure was unavailable, so the role mapping was used.',
  COMMITMENT_FROM_ROLE_DRAFT:
    'Organizational commitment was unavailable, so the role / draft mapping was used.',
  ACTIVE_PROBABILITY_FROM_INJURY:
    'Probability active was unavailable, so the injury-status mapping was used.',
  LIMITED_GAMES_FROM_INJURY:
    'Expected limited games was unavailable, so the injury-status mapping was used.',
};

export function fallbackSentence(code: string): string {
  return FALLBACK_CODE_SENTENCE[code] ?? `A fallback (${code}) was applied for a missing input.`;
}

// Human-readable confidence-penalty label. The engine emits canonical penalty
// codes (Section 26.11.2); this humanizes them for display only.
const PENALTY_LABEL: Record<string, string> = {
  FALLBACK_1_2: '1–2 fallback inputs were used',
  FALLBACK_3_4: '3–4 fallback inputs were used',
  FALLBACK_5_7: '5–7 fallback inputs were used',
  FALLBACK_8_PLUS: '8 or more fallback inputs were used',
  ROOKIE_UNCERTAINTY: 'Rookie with no NFL sample',
  ROLE_COMPETITION: 'Active competition for the starting job',
  TEMPORARY_STARTER: 'Temporary injury-replacement starter',
  RECENT_BENCHING: 'Recently benched',
  TEAM_CHANGE: 'Changed teams',
  SYSTEM_CHANGE: 'Major system change',
  RECENT_ROLE_CHANGE: 'Recent role change',
  INJURY_QUESTIONABLE: 'Questionable injury status',
  INJURY_MAJOR: 'Doubtful or worse injury status',
};

export function penaltyLabel(code: string): string {
  return PENALTY_LABEL[code] ?? code;
}
