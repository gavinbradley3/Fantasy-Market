/**
 * QB MVP engine types.
 *
 * Interfaces are copied field-for-field from QB_VALUATION_MODEL_v1.2_FINAL.md
 * Section 26.1 (options), 26.2.4 (scoring), 26.3 (input), 26.4.2 (references),
 * and 26.15 (output). Nothing here is redesigned or inferred.
 */

export type QBHorizon = "WEEKLY" | "ROS" | "ONE_YEAR" | "THREE_YEAR" | "DYNASTY";

export type QBDepthChartStatus =
  | "STARTER"
  | "CO_STARTER"
  | "BACKUP"
  | "PRACTICE_SQUAD"
  | "FREE_AGENT";

export type QBRoleStatus =
  | "ESTABLISHED_STARTER"
  | "YOUNG_COMMITTED_STARTER"
  | "ROOKIE_EXPECTED_STARTER"
  | "BRIDGE_STARTER"
  | "TEMPORARY_INJURY_REPLACEMENT"
  | "COMPETITION"
  | "RECENTLY_BENCHED"
  | "BACKUP";

export type QBInjuryStatus =
  | "HEALTHY"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "IR"
  | "PUP";

export interface QBScoring {
  points_per_completion: number;
  points_per_passing_yard: number;
  points_per_passing_td: number;
  points_per_interception: number;
  points_per_rushing_yard: number;
  points_per_rushing_td: number;
}

export interface QBReferenceDistributions {
  active_game_pass_attempts: readonly number[];
  team_dropback_share: readonly number[];
  adjusted_yards_per_attempt: readonly number[];
  cpoe: readonly number[];
  completion_rate: readonly number[];
  explosive_pass_rate: readonly number[];
  designed_rush_attempts_per_start: readonly number[];
  scrambles_per_start: readonly number[];
  rushing_yards_per_start: readonly number[];
  goal_line_rush_attempts_per_start: readonly number[];
  offensive_environment_score: readonly number[];
  protection_context_score: readonly number[];
  interception_rate: readonly number[];
  sack_rate: readonly number[];
  passing_td_rate: readonly number[];
  recent_start_rate: readonly number[];
}

/** Names of the 16 distribution arrays in QBReferenceDistributions interface order. */
export type QBReferenceDistributionName = keyof QBReferenceDistributions;

export interface QBEvaluatorOptions {
  selected_horizon?: QBHorizon;
  scoring?: Partial<QBScoring>;
  reference_distributions?: QBReferenceDistributions;
  model_version?: string;
  generated_at?: string;
}

export interface QBMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  as_of: string;

  age: number;
  nfl_seasons_completed: number;
  draft_round: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;

  career_games_played: number;
  career_starts: number;
  career_pass_attempts: number;
  career_rush_attempts: number;

  recent_games: number;
  recent_starts: number;
  recent_pass_attempts: number;
  recent_completions: number;
  recent_passing_yards: number;
  recent_passing_tds: number;
  recent_interceptions: number;
  recent_sacks: number;

  recent_rush_attempts: number;
  recent_rushing_yards: number;
  recent_rushing_tds: number;

  designed_rush_attempts: number | null;
  scrambles: number | null;
  goal_line_rush_attempts: number | null;

  adjusted_yards_per_attempt: number | null;
  completion_percentage_over_expected: number | null;
  explosive_pass_rate: number | null;

  team_dropback_share: number | null;
  expected_active_game_pass_attempts: number | null;
  expected_active_game_designed_rush_attempts: number | null;
  expected_active_game_scrambles: number | null;
  expected_active_game_goal_line_rush_attempts: number | null;

  offensive_environment_score: number | null;
  protection_context_score: number | null;

  depth_chart_status: QBDepthChartStatus;
  role_status: QBRoleStatus;
  competition_pressure: number | null;
  organizational_commitment: number | null;

  probability_active: number | null;
  injury_status: QBInjuryStatus;
  expected_games_remaining: number;
  expected_games_limited: number | null;

  team_change: boolean;
  major_system_change: boolean;
  recent_role_change: boolean;

  prior_recent_pass_attempts: number | null;
  prior_adjusted_yards_per_attempt: number | null;
  prior_interception_rate: number | null;
  prior_rush_attempts_per_start: number | null;
}

export interface QBMVPOutput {
  schema_version: "qb-mvp-output-1.0";
  model_version: string;
  reference_version: "QB_REFERENCE_V1" | "CUSTOM";
  generated_at: string;

  player: {
    player_id: string;
    player_name: string;
    team: string | null;
    as_of: string;
  };

  scoring: QBScoring;

  status: "COMPLETE" | "PARTIAL" | "FALLBACK_HEAVY";
  fallback_log: string[];

  components: {
    passing_opportunity: number;
    passing_quality: number;
    rushing_value: number;
    scoring_environment: number;
    role_security: number;
    availability: number;
    age_development: number;
    sustainability: number;
  };

  composites: {
    weekly: number;
    ros: number;
    one_year: number;
    three_year: number;
    dynasty: number;
  };

  expected_fantasy_output: {
    conditional_on_active: {
      pass_attempts: number;
      completions: number;
      completion_rate: number;
      passing_yards: number;
      passing_tds: number;
      interceptions: number;
      designed_rush_attempts: number;
      scrambles: number;
      total_rush_attempts: number;
      rushing_yards: number;
      rushing_tds: number;
      fantasy_points: number;
    };
    probability_active: number;
    weekly_fantasy_points: number;
    ros_fantasy_points: number;
    expected_games_remaining: number;
    expected_games_limited: number;
  };

  confidence: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH";
    penalty_codes: string[];
  };

  volatility: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH";
    rushing_dependence: number;
    turnover_risk: number;
    role_instability: number;
  };

  explanations: {
    positive: string[];
    negative: string[];
  };
}

/** Eight component scores in the binding component order (Section 26.9). */
export interface QBComponentScores {
  PO: number;
  PQ: number;
  RV: number;
  SE: number;
  RS: number;
  AV: number;
  AD: number;
  SU: number;
}

/** Canonical (post-fallback) nullable values used by downstream formulas (Section 26.5). */
export interface QBResolvedValues {
  scrambles: number;
  designed_rush_attempts: number;
  goal_line_rush_attempts: number;
  adjusted_yards_per_attempt: number;
  /** true when CPOE was supplied (CPOE pathway); false uses completion-rate pathway. */
  cpoe_supplied: boolean;
  explosive_pass_rate: number;
  team_dropback_share: number;
  expected_active_game_pass_attempts: number;
  expected_active_game_designed_rush_attempts: number;
  expected_active_game_scrambles: number;
  expected_active_game_goal_line_rush_attempts: number;
  offensive_environment_score: number;
  protection_context_score: number;
  competition_pressure: number;
  organizational_commitment: number;
  probability_active: number;
  expected_games_limited: number;
}

/** Shrunk signal values (Section 26.6). */
export interface QBShrunkValues {
  aypa_shrunk: number;
  passing_yards_per_attempt_shrunk: number;
  completion_quality_percentile: number;
  /** Defined only when CPOE supplied; used by EFO expected completion rate. */
  completion_quality_value: number | null;
  /** Defined only when CPOE missing; used by EFO expected completion rate. */
  completion_rate_shrunk: number | null;
  explosive_pass_rate_shrunk: number;
  interception_rate_shrunk: number;
  observed_interception_rate: number;
  sack_rate_shrunk: number;
  passing_td_rate_shrunk: number;
  designed_rushes_per_start: number;
  scrambles_per_start: number;
  rushing_yards_per_start: number;
  goal_line_rushes_per_start: number;
  recent_start_rate: number;
}

/** Trend scores (Section 26.7). */
export interface QBTrendValues {
  passing_efficiency_trend: number;
  turnover_trend: number;
  rushing_role_trend: number;
  /** true when no prior efficiency window exists (used by volatility 26.12.4). */
  no_prior_efficiency_window: boolean;
}

/** QB priors (Section 26.6.2). */
export interface QBPriors {
  qb_prior_strength: number;
  aypa_prior: number;
  passing_ypa_prior: number;
  cpoe_prior: number;
  completion_rate_prior: number;
  explosive_prior: number;
  interception_prior: number;
  passing_td_prior: number;
}

/** Conditional-on-active expected statistics (Section 26.10.2 / 26.10.3). */
export interface QBActiveGameProjection {
  pass_attempts: number;
  completions: number;
  completion_rate: number;
  passing_yards: number;
  passing_tds: number;
  interceptions: number;
  designed_rush_attempts: number;
  scrambles: number;
  total_rush_attempts: number;
  rushing_yards: number;
  rushing_tds: number;
  fantasy_points: number;
}
