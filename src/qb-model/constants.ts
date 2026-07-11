/**
 * Versioned QB constants from QB_VALUATION_MODEL_v1.2_FINAL.md Section 26.
 * Every value is stated in the binding contract; nothing here is tuned or inferred.
 */

import type {
  QBDepthChartStatus,
  QBHorizon,
  QBInjuryStatus,
  QBReferenceDistributionName,
  QBRoleStatus,
  QBScoring,
} from "./types.js";

export const SCHEMA_VERSION = "qb-mvp-output-1.0" as const;
export const INPUT_SCHEMA_VERSION = "qb-mvp-input-1.0" as const;
export const DEFAULT_MODEL_VERSION = "qb-mvp-1.2";
export const REFERENCE_VERSION = "QB_REFERENCE_V1" as const;
export const CUSTOM_REFERENCE_VERSION = "CUSTOM" as const;
export const DEFAULT_SELECTED_HORIZON: QBHorizon = "WEEKLY";

export const DEFAULT_SCORING: Readonly<QBScoring> = Object.freeze({
  points_per_completion: 0,
  points_per_passing_yard: 0.04,
  points_per_passing_td: 4,
  points_per_interception: -2,
  points_per_rushing_yard: 0.1,
  points_per_rushing_td: 6,
});

/** Scoring override numeric ranges (Section 26.2.4). */
export const SCORING_RANGES: Readonly<Record<keyof QBScoring, readonly [number, number]>> =
  Object.freeze({
    points_per_completion: [0, 1],
    points_per_passing_yard: [0, 0.2],
    points_per_passing_td: [0, 10],
    points_per_interception: [-10, 0],
    points_per_rushing_yard: [0, 0.5],
    points_per_rushing_td: [0, 10],
  });

export const SCORING_KEYS: readonly (keyof QBScoring)[] = Object.freeze([
  "points_per_completion",
  "points_per_passing_yard",
  "points_per_passing_td",
  "points_per_interception",
  "points_per_rushing_yard",
  "points_per_rushing_td",
]);

export const HORIZONS: readonly QBHorizon[] = Object.freeze([
  "WEEKLY",
  "ROS",
  "ONE_YEAR",
  "THREE_YEAR",
  "DYNASTY",
]);

export const DEPTH_CHART_STATUSES: readonly QBDepthChartStatus[] = Object.freeze([
  "STARTER",
  "CO_STARTER",
  "BACKUP",
  "PRACTICE_SQUAD",
  "FREE_AGENT",
]);

export const ROLE_STATUSES: readonly QBRoleStatus[] = Object.freeze([
  "ESTABLISHED_STARTER",
  "YOUNG_COMMITTED_STARTER",
  "ROOKIE_EXPECTED_STARTER",
  "BRIDGE_STARTER",
  "TEMPORARY_INJURY_REPLACEMENT",
  "COMPETITION",
  "RECENTLY_BENCHED",
  "BACKUP",
]);

export const INJURY_STATUSES: readonly QBInjuryStatus[] = Object.freeze([
  "HEALTHY",
  "QUESTIONABLE",
  "DOUBTFUL",
  "OUT",
  "IR",
  "PUP",
]);

/** Injury statuses that force probability_active = 0 and Weekly EFO = 0. */
export const INACTIVE_INJURY_STATUSES: readonly QBInjuryStatus[] = Object.freeze([
  "OUT",
  "IR",
  "PUP",
]);

/** Reference distribution property names in interface order (Section 26.4.2). */
export const REFERENCE_DISTRIBUTION_NAMES: readonly QBReferenceDistributionName[] =
  Object.freeze([
    "active_game_pass_attempts",
    "team_dropback_share",
    "adjusted_yards_per_attempt",
    "cpoe",
    "completion_rate",
    "explosive_pass_rate",
    "designed_rush_attempts_per_start",
    "scrambles_per_start",
    "rushing_yards_per_start",
    "goal_line_rush_attempts_per_start",
    "offensive_environment_score",
    "protection_context_score",
    "interception_rate",
    "sack_rate",
    "passing_td_rate",
    "recent_start_rate",
  ]);

/** Depth-chart dropback-share fallback mapping (Section 26.5.4). */
export const DROPBACK_SHARE_BY_DEPTH: Readonly<Record<QBDepthChartStatus, number>> =
  Object.freeze({
    STARTER: 0.96,
    CO_STARTER: 0.7,
    BACKUP: 0.15,
    PRACTICE_SQUAD: 0.03,
    FREE_AGENT: 0.0,
  });

/** Role-based expected pass-attempt fallback mapping (Section 26.5.5). */
export const EXPECTED_PASS_ATTEMPTS_BY_ROLE: Readonly<Record<QBRoleStatus, number>> =
  Object.freeze({
    ESTABLISHED_STARTER: 34,
    YOUNG_COMMITTED_STARTER: 33,
    ROOKIE_EXPECTED_STARTER: 31,
    BRIDGE_STARTER: 31,
    TEMPORARY_INJURY_REPLACEMENT: 30,
    COMPETITION: 27,
    RECENTLY_BENCHED: 18,
    BACKUP: 8,
  });

/** Competition-pressure fallback mapping (Section 26.5.6). */
export const COMPETITION_PRESSURE_BY_ROLE: Readonly<Record<QBRoleStatus, number>> =
  Object.freeze({
    ESTABLISHED_STARTER: 0.05,
    YOUNG_COMMITTED_STARTER: 0.1,
    ROOKIE_EXPECTED_STARTER: 0.15,
    BRIDGE_STARTER: 0.45,
    TEMPORARY_INJURY_REPLACEMENT: 0.7,
    COMPETITION: 0.75,
    RECENTLY_BENCHED: 0.9,
    BACKUP: 0.85,
  });

/** Draft-commitment mapping for organizational commitment (Section 26.5.7). */
export const DRAFT_COMMITMENT_BY_ROUND: Readonly<Record<number, number>> = Object.freeze({
  1: 0.9,
  2: 0.72,
  3: 0.58,
  4: 0.45,
  5: 0.35,
  6: 0.28,
  7: 0.22,
});
export const DRAFT_COMMITMENT_UNDRAFTED = 0.18;

/** Role-commitment mapping for organizational commitment (Section 26.5.7). */
export const ROLE_COMMITMENT_BY_ROLE: Readonly<Record<QBRoleStatus, number>> = Object.freeze({
  ESTABLISHED_STARTER: 0.92,
  YOUNG_COMMITTED_STARTER: 0.95,
  ROOKIE_EXPECTED_STARTER: 0.88,
  BRIDGE_STARTER: 0.45,
  TEMPORARY_INJURY_REPLACEMENT: 0.25,
  COMPETITION: 0.48,
  RECENTLY_BENCHED: 0.25,
  BACKUP: 0.2,
});

/** Active-probability fallback mapping (Section 26.5.8). */
export const ACTIVE_PROBABILITY_BY_INJURY: Readonly<Record<QBInjuryStatus, number>> =
  Object.freeze({
    HEALTHY: 0.99,
    QUESTIONABLE: 0.75,
    DOUBTFUL: 0.2,
    OUT: 0.0,
    IR: 0.0,
    PUP: 0.0,
  });

/** Expected-limited-games caps by injury status (Section 26.5.9). */
export const LIMITED_GAMES_CAP_BY_INJURY: Readonly<Record<QBInjuryStatus, number>> =
  Object.freeze({
    HEALTHY: 0,
    QUESTIONABLE: 2,
    DOUBTFUL: 3,
    OUT: 2,
    IR: 4,
    PUP: 4,
  });

/** QB prior strength by draft round (Section 26.6.2). */
export const QB_PRIOR_STRENGTH_BY_ROUND: Readonly<Record<number, number>> = Object.freeze({
  1: 0.7,
  2: 0.6,
  3: 0.54,
  4: 0.49,
  5: 0.46,
  6: 0.44,
  7: 0.42,
});
export const QB_PRIOR_STRENGTH_UNDRAFTED = 0.4;

/** Role Security depth-chart score mapping (Section 26.8.6). */
export const RS_DEPTH_CHART_SCORE: Readonly<Record<QBDepthChartStatus, number>> = Object.freeze({
  STARTER: 95,
  CO_STARTER: 62,
  BACKUP: 22,
  PRACTICE_SQUAD: 5,
  FREE_AGENT: 0,
});

/** Role Security role-status score mapping (Section 26.8.6). */
export const RS_ROLE_STATUS_SCORE: Readonly<Record<QBRoleStatus, number>> = Object.freeze({
  ESTABLISHED_STARTER: 95,
  YOUNG_COMMITTED_STARTER: 92,
  ROOKIE_EXPECTED_STARTER: 82,
  BRIDGE_STARTER: 55,
  TEMPORARY_INJURY_REPLACEMENT: 38,
  COMPETITION: 42,
  RECENTLY_BENCHED: 18,
  BACKUP: 12,
});

/** Availability injury-status score mapping (Section 26.8.7). */
export const AV_INJURY_STATUS_SCORE: Readonly<Record<QBInjuryStatus, number>> = Object.freeze({
  HEALTHY: 100,
  QUESTIONABLE: 70,
  DOUBTFUL: 25,
  OUT: 0,
  IR: 0,
  PUP: 0,
});

/**
 * Age score anchor table (Section 26.8.8). Keyed by integer age from 21..43; ages <=21
 * use 82 and ages >=43 use 22. Non-integer ages linearly interpolate between neighbours.
 */
export const AGE_SCORE_TABLE: Readonly<Record<number, number>> = Object.freeze({
  21: 82,
  22: 88,
  23: 94,
  24: 98,
  25: 100,
  26: 100,
  27: 100,
  28: 100,
  29: 99,
  30: 98,
  31: 97,
  32: 95,
  33: 92,
  34: 88,
  35: 83,
  36: 77,
  37: 70,
  38: 62,
  39: 54,
  40: 46,
  41: 38,
  42: 30,
  43: 22,
});
export const AGE_SCORE_MIN_AGE = 21;
export const AGE_SCORE_MAX_AGE = 43;

/** Experience-development score by seasons completed (Section 26.8.8). 10+ -> 88. */
export const EXPERIENCE_DEVELOPMENT_SCORE: Readonly<Record<number, number>> = Object.freeze({
  0: 78,
  1: 88,
  2: 96,
  3: 100,
  4: 100,
  5: 98,
  6: 96,
  7: 94,
  8: 92,
  9: 90,
  10: 88,
});

/** Draft-investment score for AD (Section 26.8.8). */
export const DRAFT_INVESTMENT_SCORE_BY_ROUND: Readonly<Record<number, number>> = Object.freeze({
  1: 100,
  2: 82,
  3: 68,
  4: 55,
  5: 45,
  6: 38,
  7: 32,
});
export const DRAFT_INVESTMENT_SCORE_UNDRAFTED = 28;

/** Developmental role score for AD (Section 26.8.8). */
export const DEVELOPMENTAL_ROLE_SCORE: Readonly<Record<QBRoleStatus, number>> = Object.freeze({
  YOUNG_COMMITTED_STARTER: 100,
  ROOKIE_EXPECTED_STARTER: 98,
  ESTABLISHED_STARTER: 88,
  COMPETITION: 62,
  BRIDGE_STARTER: 45,
  TEMPORARY_INJURY_REPLACEMENT: 38,
  RECENTLY_BENCHED: 32,
  BACKUP: 35,
});

/** Component order (Section 26.9). */
export const COMPONENT_ORDER = Object.freeze([
  "PO",
  "PQ",
  "RV",
  "SE",
  "RS",
  "AV",
  "AD",
  "SU",
] as const);

export type QBComponentName = (typeof COMPONENT_ORDER)[number];

/** Five horizon weight rows (Section 26.9). Component order PO,PQ,RV,SE,RS,AV,AD,SU. */
export const HORIZON_WEIGHTS: Readonly<
  Record<QBHorizon, Readonly<Record<QBComponentName, number>>>
> = Object.freeze({
  WEEKLY: Object.freeze({ PO: 0.22, PQ: 0.18, RV: 0.2, SE: 0.13, RS: 0.07, AV: 0.12, AD: 0.02, SU: 0.06 }),
  ROS: Object.freeze({ PO: 0.18, PQ: 0.17, RV: 0.17, SE: 0.11, RS: 0.15, AV: 0.1, AD: 0.03, SU: 0.09 }),
  ONE_YEAR: Object.freeze({ PO: 0.13, PQ: 0.18, RV: 0.15, SE: 0.08, RS: 0.2, AV: 0.07, AD: 0.09, SU: 0.1 }),
  THREE_YEAR: Object.freeze({ PO: 0.08, PQ: 0.2, RV: 0.14, SE: 0.05, RS: 0.22, AV: 0.04, AD: 0.17, SU: 0.1 }),
  DYNASTY: Object.freeze({ PO: 0.07, PQ: 0.2, RV: 0.15, SE: 0.04, RS: 0.21, AV: 0.03, AD: 0.21, SU: 0.09 }),
});

/** ROS limited-game workload factor by injury status (Section 26.10.6). */
export const LIMITED_WORKLOAD_FACTOR_BY_INJURY: Readonly<Record<QBInjuryStatus, number>> =
  Object.freeze({
    HEALTHY: 1.0,
    QUESTIONABLE: 0.85,
    DOUBTFUL: 0.7,
    OUT: 0.75,
    IR: 0.75,
    PUP: 0.75,
  });

/** ROS future healthy active probability by role status (Section 26.10.6). */
export const FUTURE_HEALTHY_ACTIVE_PROBABILITY_BY_ROLE: Readonly<Record<QBRoleStatus, number>> =
  Object.freeze({
    ESTABLISHED_STARTER: 0.97,
    YOUNG_COMMITTED_STARTER: 0.97,
    ROOKIE_EXPECTED_STARTER: 0.97,
    BRIDGE_STARTER: 0.97,
    TEMPORARY_INJURY_REPLACEMENT: 0.55,
    COMPETITION: 0.75,
    RECENTLY_BENCHED: 0.35,
    BACKUP: 0.2,
  });

/** Volatility injury-uncertainty mapping (Section 26.12.6). */
export const INJURY_UNCERTAINTY_BY_INJURY: Readonly<Record<QBInjuryStatus, number>> =
  Object.freeze({
    HEALTHY: 5,
    QUESTIONABLE: 45,
    DOUBTFUL: 75,
    OUT: 70,
    IR: 65,
    PUP: 60,
  });

/** Explanation component priority tie-break order (Section 26.13.1). */
export const EXPLANATION_PRIORITY: readonly QBComponentName[] = Object.freeze([
  "RS",
  "PQ",
  "RV",
  "PO",
  "SU",
  "AV",
  "AD",
  "SE",
]);

/** Component explanation templates (Section 26.13.2). */
export const COMPONENT_EXPLANATIONS: Readonly<
  Record<QBComponentName, { positive: string; negative: string }>
> = Object.freeze({
  PO: {
    positive: "Strong passing opportunity supports the current fantasy workload.",
    negative: "Limited passing opportunity constrains the current fantasy ceiling.",
  },
  PQ: {
    positive: "Strong passing efficiency and quality support sustainable quarterback value.",
    negative: "Weak passing efficiency limits the sustainability of current production.",
  },
  RV: {
    positive:
      "Designed rushing, scrambling, and rushing production add a meaningful fantasy floor and ceiling.",
    negative:
      "Limited rushing contribution leaves the profile more dependent on passing production.",
  },
  SE: {
    positive: "The offensive and scoring environment supports touchdown and passing opportunity.",
    negative: "A weak offensive environment limits scoring support.",
  },
  RS: {
    positive: "Strong starting-role security supports value beyond the immediate week.",
    negative: "Unstable starting-role security materially weakens longer-horizon value.",
  },
  AV: {
    positive: "Current availability supports near-term value.",
    negative: "Availability risk reduces near-term reliability.",
  },
  AD: {
    positive: "Age, career stage, and organizational investment support long-term value.",
    negative: "Age or limited developmental runway reduces long-horizon value.",
  },
  SU: {
    positive: "Turnover, sack, sample, and trend indicators support production sustainability.",
    negative: "Current production carries meaningful sustainability risk.",
  },
});

/** Direct EFO explanation texts (Section 26.13.3). */
export const DIRECT_EXPLANATIONS = Object.freeze({
  AVAILABILITY: "Current availability materially reduces Weekly expected fantasy output.",
  TEMPORARY_STARTER:
    "Temporary starting status sharply limits value beyond the immediate opportunity.",
  RECENTLY_BENCHED: "Recent benching creates severe starting-role uncertainty.",
  RUSHING_DEPENDENCE: "Rushing supplies a large share of expected fantasy production.",
  FALLBACK_HEAVY:
    "The evaluation relies on multiple fallback inputs, reducing evidence quality.",
});
