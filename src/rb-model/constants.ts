// Every numeric model constant, each tagged to its Section 26 rule. No magic
// numbers appear inside the formula modules — they all reference this file.

import type { ComponentScores, DraftRound, Horizon, ScoringVector } from '@/rb-model/types';

export const SCHEMA_VERSION = 'rb-mvp-1.0' as const;
export const DEFAULT_MODEL_VERSION = 'rb-mvp-1.0';
export const DEFAULT_HORIZON: Horizon = 'WEEKLY';

// §26.2.3 — default scoring vector (full PPR).
export const DEFAULT_SCORING: ScoringVector = {
  points_per_reception: 1.0,
  points_per_rushing_yard: 0.1,
  points_per_receiving_yard: 0.1,
  points_per_rushing_td: 6.0,
  points_per_receiving_td: 6.0,
};

// §26.4 — neutral percentile + penalty when a reference distribution is absent.
export const NEUTRAL_PERCENTILE = 50;
export const MISSING_REFERENCE_PENALTY = 5;

// §26.5.2 — fallback penalties by canonical field.
export const FALLBACK_PENALTY = {
  snap4: 8,
  snap8: 8,
  carry_share: 8,
  route_participation: 15,
  tprr: 10,
  target_share: 6,
  goal_line_share: 8,
  red_zone_share: 6,
  ypc: 5,
  success_rate: 5,
  explosive_rate: 5,
  catch_rate: 5,
  rec_yards_per_reception: 5,
  team_non_qb_rushes: 5,
  team_dropbacks: 5,
  points_per_drive: 5,
  red_zone_trips: 5,
  qb_rush_pressure: 4,
  workload_ramp: 4,
  contract_security: 4,
  competition_pressure: 4,
} as const;

// §26.5.2 — final fallback constants and derivation coefficients.
export const FALLBACK_FINAL = {
  snap: 0.45,
  carry_share: 0.35,
  route_participation: 0.25,
  target_share: 0.06,
  red_zone_share: 0.35,
  ypc: 4.2,
  success_rate: 0.42,
  explosive_rate: 0.1,
  catch_rate: 0.78,
  rec_yards_per_reception: 7.5,
  team_non_qb_rushes: 24.0,
  team_dropbacks: 34.0,
  points_per_drive: 1.9,
  red_zone_trips: 3.2,
  qb_rush_pressure: 0.35,
  contract_security: 0.35,
  competition_pressure: 0.5,
} as const;

// §26.5.2 — first-fallback derivation coefficients and caps.
export const CARRY_SHARE_FROM_SNAP = { factor: 0.9, cap: 0.8 } as const;
export const ROUTE_PART_FROM_SNAP = 0.6;
export const TARGET_SHARE_DERIVED = { factor: 0.85, cap: 0.2 } as const;

// §26.5.3 — workload-ramp status/practice lookup.
export const WORKLOAD_RAMP_LOOKUP = {
  HEALTHY: 1.0,
  QUESTIONABLE_FULL: 0.9,
  QUESTIONABLE_LIMITED: 0.8,
  QUESTIONABLE_DNP_UNKNOWN: 0.7,
  DOUBTFUL: 0.6,
  UNAVAILABLE: 0.0, // OUT / IR / PUP / SUSPENDED
  UNKNOWN: 0.8, // UNKNOWN injury status
} as const;

// §26.5.4 — draft-round contract-security mapping.
export const DRAFT_ROUND_SECURITY: Record<Exclude<DraftRound, null> | 'UDFA', number> = {
  1: 1.0,
  2: 0.82,
  3: 0.65,
  4: 0.42,
  5: 0.42,
  6: 0.24,
  7: 0.24,
  UDFA: 0.18,
};

// §26.5.4 / §26.6.1 — draft-round TPRR prior.
export const TPRR_PRIOR: Record<Exclude<DraftRound, null> | 'UDFA', number> = {
  1: 0.19,
  2: 0.18,
  3: 0.17,
  4: 0.16,
  5: 0.16,
  6: 0.15,
  7: 0.15,
  UDFA: 0.15,
};

// §26.6 — shrinkage constants and neutral priors.
export const SHRINK = {
  tprr_k: 120,
  ypc_k: 250,
  ypc_prior: 4.2,
  success_k: 160,
  success_prior: 0.42,
  explosive_k: 280,
  explosive_prior: 0.1,
  catch_k: 100,
  catch_prior: 0.78,
  rypr_k: 150,
  rypr_prior: 7.5,
} as const;

// §26.7 — trend score slopes, neutral default, and workload-trend blend.
export const TREND_NEUTRAL = 50;
export const TREND_SLOPE = 200;
export const WORKLOAD_TREND_WEIGHTS = { snap: 0.45, carry: 0.35, route: 0.2 } as const;

// §26.8.2 — Workload Role sub-weights.
export const WRK_WEIGHTS = { snap4: 0.4, carry: 0.3, route: 0.15, snap8: 0.1, trend: 0.05 } as const;

// §26.8.3 — Opportunity Quality sub-weights and low-touch gate.
export const OQ_WEIGHTS = { goal_line: 0.4, red_zone: 0.25, targets: 0.2, ppd: 0.15 } as const;
export const OQ_TOUCH_GATE = { threshold: 6, cap: 70 } as const;

// §26.8.4 — Rushing Efficiency weights, explosive band, and sample clamps.
export const RE_WEIGHTS = { ypc: 0.55, success: 0.3, explosive: 0.15 } as const;
export const RE_WITHOUT_EXPLOSIVE_BONUS = 7.5;
export const RE_EXPLOSIVE_BAND = 8;
export const RE_SAMPLE_CLAMP = {
  veryLow: { maxCarries: 75, range: [25, 75] as const },
  low: { maxCarries: 150, range: [15, 85] as const },
  full: [0, 100] as const,
} as const;

// §26.8.5 — Receiving Utility sub-weights.
export const RU_WEIGHTS = { route: 0.35, tprr: 0.3, target_share: 0.2, catch: 0.1, rypr: 0.05 } as const;

// §26.8.6 — Team Context sub-weights and QB-pressure coefficient.
export const TC_WEIGHTS = { non_qb_rush: 0.35, dropbacks: 0.2, ppd: 0.25, rz_trips: 0.1, qb: 0.1 } as const;

// §26.8.7 — Role Durability adjustments.
export const RD_BASE = 50;
export const RD_CONTRACT_COEF = 18;
export const RD_COMPETITION_COEF = 20;
export const RD_ROLE_CHANGE = { PROMOTED: 12, DEMOTED: -12, STABLE: 0, UNKNOWN: 0 } as const;
export const RD_COACHING = { CONTINUITY: 5, CHANGE: -5, UNKNOWN: 0 } as const;
export const RD_TEAMMATE_RETURN = 8;
export const RD_INCOMING_COMPETITION = 8;
export const RD_WORKLOAD_WEAR = 8;

// §26.8.8 — Age & Development base by age, year-2/3 bonus, workload wear.
export interface AgeBand {
  minAge: number;
  maxAge: number;
  base: number;
}
export const AD_AGE_BANDS: AgeBand[] = [
  { minAge: 0, maxAge: 21, base: 84 }, // "20–21" band; extends down to any younger valid age (Decision 1)
  { minAge: 22, maxAge: 22, base: 80 },
  { minAge: 23, maxAge: 23, base: 75 },
  { minAge: 24, maxAge: 24, base: 69 },
  { minAge: 25, maxAge: 25, base: 62 },
  { minAge: 26, maxAge: 26, base: 53 },
  { minAge: 27, maxAge: 27, base: 43 },
  { minAge: 28, maxAge: 28, base: 32 },
  { minAge: 29, maxAge: 29, base: 23 },
  { minAge: 30, maxAge: Infinity, base: 14 },
];
export const AD_YEAR2_3_BONUS = 5;
export const AD_WORKLOAD_WEAR = { penalty: 6, minAge: 26 } as const;

// §26.8.9 — Availability lookup.
export const AV_VALUES = {
  HEALTHY: 98,
  QUESTIONABLE_FULL: 85,
  QUESTIONABLE_LIMITED: 68,
  QUESTIONABLE_DNP_UNKNOWN: 42,
  DOUBTFUL: 12,
  UNAVAILABLE: 0, // OUT / IR / PUP / SUSPENDED
  UNKNOWN: 72,
} as const;

// §26.9 — horizon weights. Component order WRK,OQ,RE,RU,TC,RD,AD,AV. Each sums to 1.00.
export const HORIZON_WEIGHTS: Record<Horizon, ComponentScores> = {
  WEEKLY: { WRK: 0.27, OQ: 0.15, RE: 0.05, RU: 0.14, TC: 0.12, RD: 0.05, AD: 0.02, AV: 0.2 },
  ROS: { WRK: 0.24, OQ: 0.15, RE: 0.06, RU: 0.15, TC: 0.1, RD: 0.13, AD: 0.04, AV: 0.13 },
  ONE_YEAR: { WRK: 0.18, OQ: 0.13, RE: 0.07, RU: 0.15, TC: 0.08, RD: 0.2, AD: 0.14, AV: 0.05 },
  THREE_YEAR: { WRK: 0.13, OQ: 0.1, RE: 0.07, RU: 0.14, TC: 0.05, RD: 0.24, AD: 0.23, AV: 0.04 },
  DYNASTY: { WRK: 0.1, OQ: 0.08, RE: 0.06, RU: 0.13, TC: 0.03, RD: 0.25, AD: 0.31, AV: 0.04 },
};

// §26.10 — active-game EFO constants.
export const QB_CARRY_PRESSURE_COEF = 0.2;
export const QB_GOAL_LINE_PRESSURE_COEF = 0.3;
export const EFFECTIVE_YPC_CLAMP: readonly [number, number] = [3.2, 5.5];
export const SCORING_FACTOR = { divisor: 1.9, min: 0.65, max: 1.35 } as const;
export const RUSH_TD_RATE = { base: 0.025, goalLineCoef: 0.045, redZoneCoef: 0.02 } as const;
export const REC_TD_RATE = 0.025;

// §26.11 — confidence deductions beyond fallback / missing-reference penalties.
export const CONF_START = 100;
export const CONF_TOUCHES = {
  veryLow: { max: 49, penalty: 15 }, // < 50
  low: { min: 50, max: 149, penalty: 10 },
  mid: { min: 150, max: 299, penalty: 6 },
} as const;
export const CONF_INJURY_UNKNOWN = 10;
export const CONF_ROLE_UNKNOWN = 10;
export const CONF_TEAMMATE_RETURN = 8;
export const CONF_TEAM_NULL = 5;
export const CONF_COACHING_UNKNOWN = 5;
export const CONF_LABELS = { high: 80, medium: 60 } as const;

// §26.12 — volatility term coefficients + label boundaries.
export const VOL = {
  snap: 18,
  competition: 16,
  td: 16,
  receiving: 10,
  prior: 15,
  injury: 10, // QUESTIONABLE or UNKNOWN
  role: 10, // PROMOTED, DEMOTED, or UNKNOWN
  teammate: 8,
  explosive: 7, // shrunk_explosive_rate >= 0.15
  explosiveThreshold: 0.15,
  priorConstant: 120,
} as const;
export const VOL_LABELS = { high: 66, medium: 33 } as const;

// §26.13 — explanation thresholds.
export const EXPLANATION_MIN_ABS = 1.0;
export const EXPLANATION_MAX_DRIVERS = 3;

// §26.13.1 — direct-explanation thresholds.
export const DIRECT = {
  carryShareDominant: 0.6,
  goalLineDominant: 0.65,
  receivingTargets: 4.0,
  committeePressure: 0.65,
  tdDependence: 0.35,
  lowAvailability: 60,
  lowAgeDevelopment: 35,
} as const;
