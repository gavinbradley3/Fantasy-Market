/**
 * Versioned constants from TE_VALUATION_MODEL_REFERENCE_V1_FROZEN.md Section 26.
 * Every value is stated in the frozen contract; nothing here is tuned or inferred.
 */

import type {
  TECoachingContinuity,
  TEDepthChartRole,
  TEHorizon,
  TEInjuryStatus,
  TEPracticeStatus,
  TEProspectType,
  TEReferenceDistributionName,
  TERoleChange,
  TEScoring,
} from "./types.js";

export const SCHEMA_VERSION = "te-mvp-1.0" as const;
export const DEFAULT_MODEL_VERSION = "te-mvp-1.0";
export const DEFAULT_SELECTED_HORIZON: TEHorizon = "WEEKLY";

export const DEFAULT_SCORING: Readonly<TEScoring> = Object.freeze({
  points_per_reception: 1.0,
  points_per_receiving_yard: 0.1,
  points_per_receiving_td: 6.0,
});

export const HORIZONS: readonly TEHorizon[] = Object.freeze([
  "WEEKLY",
  "ROS",
  "ONE_YEAR",
  "THREE_YEAR",
  "DYNASTY",
]);

export const PROSPECT_TYPES: readonly TEProspectType[] = Object.freeze([
  "RECEIVING",
  "BALANCED",
  "BLOCKING_FIRST",
  "UNKNOWN",
]);
export const DEPTH_CHART_ROLES: readonly TEDepthChartRole[] = Object.freeze([
  "TE1",
  "TE2",
  "TE3_OR_DEPTH",
  "UNKNOWN",
]);
export const ROLE_CHANGES: readonly TERoleChange[] = Object.freeze([
  "PROMOTED",
  "DEMOTED",
  "STABLE",
  "UNKNOWN",
]);
export const COACHING_CONTINUITIES: readonly TECoachingContinuity[] = Object.freeze([
  "CONTINUITY",
  "CHANGE",
  "UNKNOWN",
]);
export const INJURY_STATUSES: readonly TEInjuryStatus[] = Object.freeze([
  "HEALTHY",
  "QUESTIONABLE",
  "DOUBTFUL",
  "OUT",
  "IR",
  "PUP",
  "SUSPENDED",
  "UNKNOWN",
]);
export const PRACTICE_STATUSES: readonly TEPracticeStatus[] = Object.freeze([
  "FULL",
  "LIMITED",
  "DNP",
  "UNKNOWN",
]);

export const INACTIVE_LIST_STATUSES: readonly TEInjuryStatus[] = Object.freeze([
  "OUT",
  "IR",
  "PUP",
  "SUSPENDED",
]);

/** Canonical fallback fields in binding fallback-table order (Section 26.5.2 / 26.5.8). */
export const FALLBACK_FIELD_ORDER = Object.freeze([
  "RP4",
  "RP8",
  "SNAP4",
  "TPRR",
  "TARGET_SHARE",
  "AVERAGE_DEPTH_OF_TARGET",
  "RED_ZONE_TARGET_RATE",
  "END_ZONE_TARGET_RATE",
  "CATCHABLE_TARGET_RATE",
  "CATCH_RATE",
  "YARDS_PER_TARGET",
  "YARDS_PER_RECEPTION",
  "YAC_PER_RECEPTION",
  "PROJECTED_TEAM_DROPBACKS",
  "TEAM_POINTS_PER_DRIVE",
  "TEAM_RED_ZONE_TRIPS_PER_GAME",
  "QB_ENVIRONMENT_SCORE",
  "COMPETITION_PRESSURE",
  "CONTRACT_SECURITY",
  "WORKLOAD_RAMP_FACTOR",
] as const);

export type TEFallbackField = (typeof FALLBACK_FIELD_ORDER)[number];

/** One-time confidence penalty per canonical fallback field (Section 26.5.2). */
export const FALLBACK_PENALTIES: Readonly<Record<TEFallbackField, number>> = Object.freeze({
  RP4: 15,
  RP8: 12,
  SNAP4: 6,
  TPRR: 10,
  TARGET_SHARE: 6,
  AVERAGE_DEPTH_OF_TARGET: 3,
  RED_ZONE_TARGET_RATE: 6,
  END_ZONE_TARGET_RATE: 6,
  CATCHABLE_TARGET_RATE: 6,
  CATCH_RATE: 5,
  YARDS_PER_TARGET: 5,
  YARDS_PER_RECEPTION: 5,
  YAC_PER_RECEPTION: 5,
  PROJECTED_TEAM_DROPBACKS: 5,
  TEAM_POINTS_PER_DRIVE: 5,
  TEAM_RED_ZONE_TRIPS_PER_GAME: 5,
  QB_ENVIRONMENT_SCORE: 6,
  COMPETITION_PRESSURE: 4,
  CONTRACT_SECURITY: 4,
  WORKLOAD_RAMP_FACTOR: 4,
});

export const MISSING_REFERENCE_PENALTY = 5;

/** Reference distribution property names in TEReferenceDistributions interface order. */
export const REFERENCE_DISTRIBUTION_NAMES: readonly TEReferenceDistributionName[] =
  Object.freeze([
    "route_participation",
    "snap_share",
    "targets_per_route_run",
    "target_share",
    "average_depth_of_target",
    "red_zone_target_rate",
    "end_zone_target_rate",
    "catchable_target_rate",
    "catch_rate",
    "yards_per_target",
    "yards_per_reception",
    "yac_per_reception",
    "projected_team_dropbacks",
    "team_points_per_drive",
    "team_red_zone_trips_per_game",
    "expected_targets_per_game",
  ] as const);

/** Route proxy from snap share (Section 26.5.2.2). */
export const SNAP_ROUTE_PROXY_FACTOR = 0.72;
export const SNAP_ROUTE_PROXY_CAP = 0.85;
export const ROUTE_PARTICIPATION_FIXED_FALLBACK = 0.5;

/** Snap4 first fallback divisor (Section 26.5.2). */
export const SNAP_FROM_ROUTE_DIVISOR = 0.8;
export const SNAP_SHARE_FIXED_FALLBACK = 0.65;

/** Target-share fallback (Section 26.5.3). */
export const TARGET_SHARE_PROXY_FACTOR = 0.92;
export const TARGET_SHARE_PROXY_CAP = 0.3;
export const TARGET_SHARE_FIXED_FALLBACK = 0.12;

/** Fixed final fallbacks (Section 26.5.2). */
export const ADOT_FIXED_FALLBACK = 7.5;
export const RED_ZONE_RATE_FIXED_FALLBACK = 0.18;
export const END_ZONE_RATE_FIXED_FALLBACK = 0.08;
export const CATCHABLE_RATE_FIXED_FALLBACK = 0.76;
export const CATCH_RATE_FIXED_FALLBACK = 0.68;
export const YPT_FIXED_FALLBACK = 7.2;
export const YPR_FIXED_FALLBACK = 10.6;
export const YAC_FIXED_FALLBACK = 4.6;
export const DROPBACKS_FIXED_FALLBACK = 34.0;
export const POINTS_PER_DRIVE_FIXED_FALLBACK = 1.9;
export const RED_ZONE_TRIPS_FIXED_FALLBACK = 3.2;
export const QB_ENVIRONMENT_FIXED_FALLBACK = 50;
export const COMPETITION_PRESSURE_FIXED_FALLBACK = 0.5;
export const CONTRACT_SECURITY_FIXED_FALLBACK = 0.35;

/** QB mapping for missing catchable-target rate (Section 26.5.4). */
export const QB_CATCHABLE_BASE = 0.66;
export const QB_CATCHABLE_SLOPE = 0.002;
export const QB_CATCHABLE_MIN = 0.66;
export const QB_CATCHABLE_MAX = 0.86;

/** Workload-ramp fallback lookup (Section 26.5.5). */
export const RAMP_HEALTHY = 1.0;
export const RAMP_QUESTIONABLE_FULL = 0.9;
export const RAMP_QUESTIONABLE_LIMITED = 0.8;
export const RAMP_QUESTIONABLE_DNP_UNKNOWN = 0.7;
export const RAMP_DOUBTFUL = 0.6;
export const RAMP_INACTIVE_LIST = 0.0;
export const RAMP_UNKNOWN_STATUS = 0.8;

/** Contract-security draft-round mapping (Section 26.5.6). */
export const CONTRACT_SECURITY_BY_ROUND: Readonly<Record<number, number>> = Object.freeze({
  1: 1.0,
  2: 0.82,
  3: 0.65,
  4: 0.45,
  5: 0.45,
  6: 0.26,
  7: 0.26,
});
export const CONTRACT_SECURITY_UNDRAFTED = 0.2;

/** TPRR prior mapping (Section 26.5.7). */
export const TPRR_PRIOR_BY_ROUND: Readonly<Record<number, number>> = Object.freeze({
  1: 0.205,
  2: 0.195,
  3: 0.185,
  4: 0.175,
  5: 0.175,
  6: 0.165,
  7: 0.165,
});
export const TPRR_PRIOR_UNDRAFTED = 0.16;
export const TPRR_PRIOR_PROSPECT_ADJUSTMENT: Readonly<Record<TEProspectType, number>> =
  Object.freeze({
    RECEIVING: 0.015,
    BALANCED: 0.0,
    BLOCKING_FIRST: -0.015,
    UNKNOWN: 0.0,
  });
export const TPRR_PRIOR_MIN = 0.145;
export const TPRR_PRIOR_MAX = 0.225;

/** Shrinkage k constants and neutral priors (Section 26.6). */
export const TPRR_SHRINK_K = 140;
export const CATCH_RATE_SHRINK_K = 120;
export const CATCH_RATE_NEUTRAL_PRIOR = 0.68;
export const YPT_SHRINK_K = 180;
export const YPT_NEUTRAL_PRIOR = 7.2;
export const YPR_SHRINK_K = 160;
export const YPR_NEUTRAL_PRIOR = 10.6;
export const YAC_SHRINK_K = 180;
export const YAC_NEUTRAL_PRIOR = 4.6;
export const RZ_SHRINK_K = 120;
export const RZ_NEUTRAL_PRIOR = 0.18;
export const EZ_SHRINK_K = 160;
export const EZ_NEUTRAL_PRIOR = 0.08;

/** Age & Development base scores (Section 26.8.8). Discrete lookup, no interpolation. */
export const AD_AGE_BASE: Readonly<Record<number, number>> = Object.freeze({
  18: 88,
  19: 88,
  20: 88,
  21: 88,
  22: 86,
  23: 84,
  24: 82,
  25: 78,
  26: 73,
  27: 68,
  28: 63,
  29: 57,
  30: 49,
  31: 40,
  32: 31,
  33: 23,
  // 34-45 handled as late-career decline = 16 in components.ts
});
export const AD_LATE_CAREER_BASE = 16;

/** Availability lookup (Section 26.8.9). */
export const AV_HEALTHY = 98;
export const AV_QUESTIONABLE_FULL = 85;
export const AV_QUESTIONABLE_LIMITED = 68;
export const AV_QUESTIONABLE_DNP_UNKNOWN = 42;
export const AV_DOUBTFUL = 12;
export const AV_INACTIVE_LIST = 0;
export const AV_UNKNOWN = 72;

/** Horizon weight rows (Section 26.9). Component order: RR, TE, TQ, RE, TC, RD, AD, AV. */
export const HORIZON_WEIGHTS: Readonly<
  Record<TEHorizon, Readonly<Record<keyof typeof COMPONENT_ORDER_INDEX, number>>>
> = Object.freeze({
  WEEKLY: Object.freeze({ RR: 0.25, TE: 0.22, TQ: 0.1, RE: 0.05, TC: 0.14, RD: 0.05, AD: 0.02, AV: 0.17 }),
  ROS: Object.freeze({ RR: 0.22, TE: 0.22, TQ: 0.1, RE: 0.06, TC: 0.11, RD: 0.14, AD: 0.05, AV: 0.1 }),
  ONE_YEAR: Object.freeze({ RR: 0.17, TE: 0.2, TQ: 0.09, RE: 0.08, TC: 0.08, RD: 0.21, AD: 0.13, AV: 0.04 }),
  THREE_YEAR: Object.freeze({ RR: 0.12, TE: 0.18, TQ: 0.08, RE: 0.09, TC: 0.05, RD: 0.24, AD: 0.2, AV: 0.04 }),
  DYNASTY: Object.freeze({ RR: 0.09, TE: 0.17, TQ: 0.07, RE: 0.08, TC: 0.03, RD: 0.25, AD: 0.27, AV: 0.04 }),
});

export const COMPONENT_ORDER_INDEX = Object.freeze({
  RR: 0,
  TE: 1,
  TQ: 2,
  RE: 3,
  TC: 4,
  RD: 5,
  AD: 6,
  AV: 7,
});

export type TEComponentName = keyof typeof COMPONENT_ORDER_INDEX;

export const COMPONENT_ORDER: readonly TEComponentName[] = Object.freeze([
  "RR",
  "TE",
  "TQ",
  "RE",
  "TC",
  "RD",
  "AD",
  "AV",
]);

/** Active-game projection constants (Section 26.10.2). */
export const BASE_RECEIVING_TD_RATE_PER_TARGET = 0.04;
export const TD_RATE_MIN = 0.015;
export const TD_RATE_MAX = 0.095;
export const EXPECTED_CATCH_RATE_MIN = 0.42;
export const EXPECTED_CATCH_RATE_MAX = 0.88;
export const EXPECTED_YPR_MIN = 6.0;
export const EXPECTED_YPR_MAX = 18.0;
export const TEAM_SCORING_BASELINE_PPD = 1.9;

/** Non-fallback confidence penalties and codes, in binding serialization order (26.11). */
export const NON_FALLBACK_CONFIDENCE_RULES = Object.freeze([
  { code: "LOW_CAREER_ROUTES_LT_75", penalty: 15 },
  { code: "LOW_CAREER_ROUTES_75_TO_199", penalty: 10 },
  { code: "LOW_CAREER_ROUTES_200_TO_399", penalty: 6 },
  { code: "UNKNOWN_INJURY_STATUS", penalty: 10 },
  { code: "UNKNOWN_ROLE_CHANGE", penalty: 10 },
  { code: "UNKNOWN_DEPTH_CHART_ROLE", penalty: 8 },
  { code: "UNKNOWN_COACHING_CONTINUITY", penalty: 6 },
  { code: "NEW_TEAM", penalty: 8 },
  { code: "ANOTHER_RECEIVING_TE", penalty: 6 },
  { code: "MISSING_TEAM", penalty: 5 },
] as const);
