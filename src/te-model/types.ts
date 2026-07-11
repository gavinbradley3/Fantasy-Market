/**
 * TE MVP engine types.
 *
 * Interfaces are copied field-for-field from TE_VALUATION_MODEL_REFERENCE_V1_FROZEN.md
 * Section 26.3 (input), 26.4 (references), and 26.15 (output).
 */

export type TEHorizon = "WEEKLY" | "ROS" | "ONE_YEAR" | "THREE_YEAR" | "DYNASTY";

export type TEProspectType = "RECEIVING" | "BALANCED" | "BLOCKING_FIRST" | "UNKNOWN";
export type TEDepthChartRole = "TE1" | "TE2" | "TE3_OR_DEPTH" | "UNKNOWN";
export type TERoleChange = "PROMOTED" | "DEMOTED" | "STABLE" | "UNKNOWN";
export type TECoachingContinuity = "CONTINUITY" | "CHANGE" | "UNKNOWN";
export type TEInjuryStatus =
  | "HEALTHY"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "IR"
  | "PUP"
  | "SUSPENDED"
  | "UNKNOWN";
export type TEPracticeStatus = "FULL" | "LIMITED" | "DNP" | "UNKNOWN";

export interface TEScoring {
  points_per_reception: number;
  points_per_receiving_yard: number;
  points_per_receiving_td: number;
}

export interface TEMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  prospect_type: TEProspectType;

  // Career exposure
  career_routes: number;
  career_targets: number;

  // Current role and opportunity
  route_participation_last4: number | null;
  route_participation_last8: number | null;
  snap_share_last4: number | null;
  targets_per_route_run: number | null;
  target_share: number | null;

  // Target quality
  average_depth_of_target: number | null;
  red_zone_target_rate: number | null;
  end_zone_target_rate: number | null;
  catchable_target_rate: number | null;

  // Current-season receiving efficiency through cutoff
  catch_rate: number | null;
  yards_per_target: number | null;
  yards_per_reception: number | null;
  yac_per_reception: number | null;

  // Team environment
  projected_team_dropbacks: number | null;
  team_points_per_drive: number | null;
  team_red_zone_trips_per_game: number | null;
  qb_environment_score: number | null;
  competition_pressure: number | null;

  // Durability and role context
  contract_security: number | null;
  depth_chart_role: TEDepthChartRole;
  role_change: TERoleChange;
  coaching_continuity: TECoachingContinuity;
  teammate_return_flag: boolean;
  another_receiving_te_flag: boolean;
  temporary_opportunity_flag: boolean;
  new_team_flag: boolean;

  // Availability
  injury_status: TEInjuryStatus;
  practice_status: TEPracticeStatus;
  expected_games_remaining: number;
  workload_ramp_factor: number | null;

  // Optional non-overlapping history
  previous_route_participation: number | null;
  previous_targets_per_route_run: number | null;
  career_targets_per_route_run: number | null;
  career_catch_rate: number | null;
  career_yards_per_target: number | null;
  career_yards_per_reception: number | null;
  career_yac_per_reception: number | null;
  career_red_zone_target_rate: number | null;
  career_end_zone_target_rate: number | null;

  scoring?: TEScoring;

  as_of_timestamp: string;
}

export interface TEReferenceDistributions {
  reference_version: string;
  route_participation: readonly number[];
  snap_share: readonly number[];
  targets_per_route_run: readonly number[];
  target_share: readonly number[];
  average_depth_of_target: readonly number[];
  red_zone_target_rate: readonly number[];
  end_zone_target_rate: readonly number[];
  catchable_target_rate: readonly number[];
  catch_rate: readonly number[];
  yards_per_target: readonly number[];
  yards_per_reception: readonly number[];
  yac_per_reception: readonly number[];
  projected_team_dropbacks: readonly number[];
  team_points_per_drive: readonly number[];
  team_red_zone_trips_per_game: readonly number[];
  expected_targets_per_game: readonly number[];
}

/** Names of the 16 distribution arrays in TEReferenceDistributions interface order. */
export type TEReferenceDistributionName = Exclude<
  keyof TEReferenceDistributions,
  "reference_version"
>;

export interface TEEvaluateOptions {
  selected_horizon?: TEHorizon;
  reference_distributions?: TEReferenceDistributions;
  model_version?: string;
}

export interface TEFallbackLogEntry {
  field: string;
  fallback_used: string;
  confidence_penalty: number;
}

export interface TEMVPOutput {
  schema_version: "te-mvp-1.0";
  model_version: string;
  reference_version: string;
  selected_horizon: TEHorizon;
  scoring: TEScoring;
  player_id: string;
  player_name: string;
  team: string | null;
  as_of_timestamp: string;

  components: {
    RR: number;
    TE: number;
    TQ: number;
    RE: number;
    TC: number;
    RD: number;
    AD: number;
    AV: number;
  };

  composites: {
    WEEKLY: number;
    ROS: number;
    ONE_YEAR: number;
    THREE_YEAR: number;
    DYNASTY: number;
  };

  weekly: {
    probability_active: number;
    workload_ramp_factor: number;
    expected_routes: number;
    expected_targets: number;
    expected_receptions: number;
    expected_receiving_yards: number;
    expected_receiving_touchdowns: number;
    expected_fantasy_points: number;
  };

  ros: {
    expected_active_games: number;
    expected_fantasy_points: number;
  };

  confidence: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH";
    penalties: string[];
  };

  volatility: {
    score: number;
    label: "LOW" | "MEDIUM" | "HIGH";
    td_dependence: number;
    explosive_dependence: number;
  };

  explanations: {
    positive_drivers: string[];
    negative_drivers: string[];
  };

  fallback_log: TEFallbackLogEntry[];

  status: "OK" | "PARTIAL";
}

/** Canonical (post-fallback) values used by every downstream formula. */
export interface TECanonicalValues {
  rp4: number;
  rp8: number;
  snap4: number;
  tprr: number;
  target_share: number;
  average_depth_of_target: number;
  red_zone_target_rate: number;
  end_zone_target_rate: number;
  catchable_target_rate: number;
  catch_rate: number;
  yards_per_target: number;
  yards_per_reception: number;
  yac_per_reception: number;
  projected_team_dropbacks: number;
  team_points_per_drive: number;
  team_red_zone_trips_per_game: number;
  qb_environment_score: number;
  competition_pressure: number;
  contract_security: number;
  workload_ramp_factor: number;
}

/** Shrunk signal values (Section 26.6). */
export interface TEShrunkValues {
  shrunk_tprr: number;
  shrunk_catch_rate: number;
  shrunk_yards_per_target: number;
  shrunk_yards_per_reception: number;
  shrunk_yac_per_reception: number;
  shrunk_red_zone_target_rate: number;
  shrunk_end_zone_target_rate: number;
}

/** Trend scores (Section 26.7). */
export interface TETrendValues {
  route_trend_score: number;
  tprr_trend_score: number;
  route_consistency_score: number;
}

/** Shared pre-component values (Section 26.8.1). */
export interface TEDerivedValues {
  blocking_gap: number;
  blocking_heavy_role: boolean;
  base_expected_routes: number;
  base_expected_targets: number;
}

export interface TEComponentScores {
  RR: number;
  TE: number;
  TQ: number;
  RE: number;
  TC: number;
  RD: number;
  AD: number;
  AV: number;
}

/** One conditional active-game projection (Section 26.10.2). */
export interface TEActiveGameProjection {
  expected_routes: number;
  expected_targets: number;
  expected_catch_rate: number;
  expected_receptions: number;
  expected_yards_per_reception: number;
  expected_receiving_yards: number;
  expected_td_rate_per_target: number;
  expected_receiving_touchdowns: number;
  active_game_fantasy_points: number;
}
