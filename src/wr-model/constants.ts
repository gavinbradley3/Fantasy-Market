// Every numeric model constant, each tagged to its Section 26 rule. No magic
// numbers appear inside the formula modules — they all reference this file.

import type { ComponentScores, DraftRound, Horizon, ScoringVector } from '@/wr-model/types';

export const SCHEMA_VERSION = 'wr-mvp-1.0' as const;
export const DEFAULT_MODEL_VERSION = 'wr-mvp-1.0';
export const DEFAULT_HORIZON: Horizon = 'WEEKLY';

// §26.2 — full-PPR default scoring vector.
export const DEFAULT_SCORING: ScoringVector = {
  points_per_reception: 1,
  points_per_receiving_yard: 0.1,
  points_per_receiving_td: 6,
};

// §26.4 — neutral percentile + penalty when a reference distribution is absent.
export const NEUTRAL_PERCENTILE = 50;
export const MISSING_REFERENCE_PENALTY = 5;

// §26.5 — fallback penalties by field.
export const FALLBACK_PENALTY = {
  RP4: 8,
  RP8: 8,
  TPRR: 10,
  target_share: 6,
  xFP_per_target: 8,
  CROE: 5,
  depth_adjusted_yards_per_target: 5,
  aDOT: 3,
  xTD_per_target: 5,
  team_dropbacks: 5,
  qb_environment: 8,
  points_per_drive: 5,
  contract_security: 4,
  competition_pressure: 4,
} as const;

// §26.5 — final fallback constants.
export const FALLBACK_FINAL = {
  RP: 0.5,
  TPRR: 0.18,
  target_share: 0.12,
  CROE: 0.0,
  aDOT: 10.0,
  xTD_per_target: 0.05,
  team_dropbacks: 34.0,
  qb_environment: 50,
  points_per_drive: 1.9,
  contract_security: 0.4,
  competition_pressure: 0.5,
} as const;

// §26.5 — target-share first-fallback cap on RP4 × TPRR.
export const TARGET_SHARE_DERIVED_CAP = 0.35;

// §26.5 / §26.6 — draft-round security mapping (contract-security fallback).
export const DRAFT_ROUND_SECURITY: Record<Exclude<DraftRound, null> | 'UDFA', number> = {
  1: 1.0,
  2: 0.8,
  3: 0.65,
  4: 0.45,
  5: 0.45,
  6: 0.25,
  7: 0.25,
  UDFA: 0.2,
};

// §26.6 — TPRR shrinkage constant and draft-round priors.
export const TPRR_SHRINK_K = 150;
export const TPRR_PRIOR: Record<Exclude<DraftRound, null> | 'UDFA', number> = {
  1: 0.21,
  2: 0.2,
  3: 0.19,
  4: 0.18,
  5: 0.18,
  6: 0.17,
  7: 0.17,
  UDFA: 0.17,
};

// §26.6 — efficiency (CROE, depth-adj Y/T) shrinkage constant + CROE neutral prior.
export const EFFICIENCY_SHRINK_K = 250;
export const CROE_NEUTRAL_PRIOR = 0.0;

// §26.7 — trend score slopes and neutral default.
export const TREND_NEUTRAL = 50;
export const ROUTE_TREND_SLOPE = 200;
export const TPRR_TREND_SLOPE = 300;

// §26.8 — component sub-weights.
export const RR_WEIGHTS = { rp4: 0.6, rp8: 0.25, trend: 0.15 } as const;
export const TE_WEIGHTS = { tprr: 0.75, target_share: 0.15, trend: 0.1 } as const;
export const EF_WEIGHTS = { croe: 0.55, dypt: 0.45 } as const;
export const TC_WEIGHTS = { dropbacks: 0.45, qbenv: 0.35, ppd: 0.2 } as const;

// §26.8 TQ — deep-target reliability cap.
export const TQ_GATE = { aDOT: 15, shrunkTPRR: 0.18, croe: 0 } as const;
export const TQ_CAP = 65;

// §26.8 EF — low-sample clamp.
export const EF_LOW_SAMPLE_ROUTES = 200;
export const EF_LOW_SAMPLE_CLAMP: readonly [number, number] = [20, 80];

// §26.8 RD — point adjustments.
export const RD_BASE = 50;
export const RD_CONTRACT_COEF = 20;
export const RD_COMPETITION_COEF = 20;
export const RD_ROLE_CHANGE = { PROMOTED: 12, DEMOTED: -12, STABLE: 0, UNKNOWN: 0 } as const;
// age_security_adjustment: +5 (≤25) / 0 (26–28) / −5 (29–30) / −10 (≥31).
export const RD_AGE_SECURITY = { young: 5, prime: 0, older: -5, oldest: -10 } as const;

// §26.8 AD — base score by age band + the year-2/3 bonus.
export interface AgeBand {
  minAge: number;
  maxAge: number;
  base: number;
}
export const AD_AGE_BANDS: AgeBand[] = [
  { minAge: 0, maxAge: 22, base: 78 }, // 21–22 (and any younger)
  { minAge: 23, maxAge: 23, base: 74 },
  { minAge: 24, maxAge: 26, base: 68 },
  { minAge: 27, maxAge: 28, base: 58 },
  { minAge: 29, maxAge: 30, base: 45 },
  { minAge: 31, maxAge: 32, base: 30 },
  { minAge: 33, maxAge: Infinity, base: 18 },
];
export const AD_YEAR2_3_BONUS = 5;

// §26.8 AV — availability lookup.
export const AV_VALUES = {
  HEALTHY: 98,
  QUESTIONABLE_FULL: 85,
  QUESTIONABLE_LIMITED: 70,
  QUESTIONABLE_DNP_UNKNOWN: 45,
  DOUBTFUL: 15,
  UNAVAILABLE: 0, // OUT / IR / PUP / SUSPENDED
  UNKNOWN: 75,
} as const;

// §26.9 — horizon weights. Component order RR,TE,TQ,EF,TC,RD,AD,AV. Each sums to 1.00.
export const HORIZON_WEIGHTS: Record<Horizon, ComponentScores> = {
  WEEKLY: { RR: 0.22, TE: 0.22, TQ: 0.1, EF: 0.06, TC: 0.15, RD: 0.05, AD: 0.02, AV: 0.18 },
  ROS: { RR: 0.2, TE: 0.22, TQ: 0.1, EF: 0.08, TC: 0.12, RD: 0.13, AD: 0.05, AV: 0.1 },
  ONE_YEAR: { RR: 0.17, TE: 0.22, TQ: 0.1, EF: 0.09, TC: 0.1, RD: 0.18, AD: 0.1, AV: 0.04 },
  THREE_YEAR: { RR: 0.13, TE: 0.2, TQ: 0.09, EF: 0.09, TC: 0.06, RD: 0.21, AD: 0.18, AV: 0.04 },
  DYNASTY: { RR: 0.1, TE: 0.18, TQ: 0.08, EF: 0.08, TC: 0.04, RD: 0.23, AD: 0.25, AV: 0.04 },
};

// §26.10 — expected-value projection constants.
export const CATCH_BASE = 0.68;
export const CATCH_DEPTH_COEF = 0.012;
export const CATCH_DEPTH_PIVOT = 8;
export const CATCH_CLAMP: readonly [number, number] = [0.35, 0.85];
export const YPR_INTERCEPT = 7.0;
export const YPR_ADOT_COEF = 0.55;
export const YPR_CLAMP: readonly [number, number] = [6.0, 22.0];

// §26.11 — confidence deductions beyond fallback penalties.
export const CONF_START = 100;
export const CONF_CAREER_ROUTES_LOW = { threshold: 100, penalty: 15 } as const; // < 100
export const CONF_CAREER_ROUTES_MID = { min: 100, max: 299, penalty: 8 } as const; // 100–299
export const CONF_INJURY_UNKNOWN = 10;
export const CONF_ROLE_UNKNOWN = 10;
export const CONF_TEAM_NULL = 5;
export const CONF_LABELS = { high: 80, medium: 60 } as const;

// §26.12 — volatility term coefficients + label boundaries.
export const VOL_RP_COEF = 20;
export const VOL_ADOT_COEF = 20;
export const VOL_ADOT_DIVISOR = 20;
export const VOL_PRIOR_COEF = 20;
export const VOL_INJURY_ADD = 15; // QUESTIONABLE or UNKNOWN
export const VOL_ROLE_ADD = 15; // PROMOTED, DEMOTED, or UNKNOWN
export const VOL_LOW_SAMPLE_ADD = 10; // career_routes < 200
export const VOL_LOW_SAMPLE_ROUTES = 200;
export const VOL_LABELS = { high: 66, medium: 33 } as const;

// §26.13 — explanation thresholds.
export const EXPLANATION_MIN_ABS = 1.0;
export const EXPLANATION_MAX_DRIVERS = 3;
