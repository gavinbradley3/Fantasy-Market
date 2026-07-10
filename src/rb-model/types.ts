// RB MVP types — binding input/output schemas from §26.3, §26.4, and §26.15,
// printed verbatim. No field is added beyond the contract.

export type DraftRound = 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;

export type InjuryStatus =
  | 'HEALTHY'
  | 'QUESTIONABLE'
  | 'DOUBTFUL'
  | 'OUT'
  | 'IR'
  | 'PUP'
  | 'SUSPENDED'
  | 'UNKNOWN';

export type PracticeStatus = 'FULL' | 'LIMITED' | 'DNP' | 'UNKNOWN';

export type RoleChange = 'PROMOTED' | 'DEMOTED' | 'STABLE' | 'UNKNOWN';

export type CoachingContinuity = 'CONTINUITY' | 'CHANGE' | 'UNKNOWN';

export type Horizon = 'WEEKLY' | 'ROS' | 'ONE_YEAR' | 'THREE_YEAR' | 'DYNASTY';

export interface ScoringVector {
  points_per_reception: number;
  points_per_rushing_yard: number;
  points_per_receiving_yard: number;
  points_per_rushing_td: number;
  points_per_receiving_td: number;
}

// §26.3 — Required normalized input.
export interface RBMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: DraftRound;

  // Career exposure
  career_touches: number; // career rushing attempts + career receptions
  career_carries: number;
  career_routes: number;

  // Current role
  snap_share_last4: number | null;
  snap_share_last8: number | null;
  carry_share_last4: number | null;
  route_participation_last4: number | null;
  targets_per_route_run: number | null;
  target_share: number | null;

  // Opportunity quality
  goal_line_carry_share: number | null;
  red_zone_carry_share: number | null;

  // Current-season efficiency through information cutoff
  yards_per_carry: number | null;
  rushing_success_rate: number | null;
  explosive_run_rate: number | null;
  catch_rate: number | null;
  receiving_yards_per_reception: number | null;

  // Team environment
  projected_team_non_qb_rush_attempts: number | null;
  projected_team_dropbacks: number | null;
  team_points_per_drive: number | null;
  team_red_zone_trips_per_game: number | null;
  qb_rush_pressure: number | null; // 0–1; higher reduces RB rush and goal-line opportunity

  // Availability and durability
  injury_status: InjuryStatus;
  practice_status: PracticeStatus;
  expected_games_remaining: number;
  workload_ramp_factor: number | null;
  contract_security: number | null;
  competition_pressure: number | null;
  role_change: RoleChange;
  teammate_return_flag: boolean;
  incoming_competition_flag: boolean;
  coaching_continuity: CoachingContinuity;
  high_recent_workload_flag: boolean;

  // Optional non-overlapping history
  previous_snap_share: number | null;
  previous_carry_share: number | null;
  previous_route_participation: number | null;
  career_yards_per_carry: number | null;
  career_targets_per_route_run: number | null;
  career_catch_rate: number | null;
  career_receiving_yards_per_reception: number | null;

  scoring?: ScoringVector;

  as_of_timestamp: string;
}

// §26.4 — reference distributions. One numeric array per percentile signal.
export interface RBReferenceDistributions {
  reference_version: string;
  snap_share: number[];
  carry_share: number[];
  route_participation: number[];
  targets_per_route_run: number[];
  target_share: number[];
  goal_line_carry_share: number[];
  red_zone_carry_share: number[];
  yards_per_carry: number[];
  rushing_success_rate: number[];
  explosive_run_rate: number[];
  catch_rate: number[];
  receiving_yards_per_reception: number[];
  projected_team_non_qb_rush_attempts: number[];
  projected_team_dropbacks: number[];
  team_points_per_drive: number[];
  team_red_zone_trips_per_game: number[];
  expected_targets_per_game: number[];
}

export type ReferenceKey = Exclude<keyof RBReferenceDistributions, 'reference_version'>;

export interface ComponentScores {
  WRK: number;
  OQ: number;
  RE: number;
  RU: number;
  TC: number;
  RD: number;
  AD: number;
  AV: number;
}

export interface HorizonComposites {
  WEEKLY: number;
  ROS: number;
  ONE_YEAR: number;
  THREE_YEAR: number;
  DYNASTY: number;
}

export interface FallbackLogEntry {
  field: string;
  fallback_used: string;
  confidence_penalty: number;
}

export type ConfidenceLabel = 'LOW' | 'MEDIUM' | 'HIGH';
export type VolatilityLabel = 'LOW' | 'MEDIUM' | 'HIGH';

// §26.15 — Output schema.
export interface RBMVPOutput {
  schema_version: 'rb-mvp-1.0';
  model_version: string;
  reference_version: string;
  player_id: string;
  player_name: string;
  as_of_timestamp: string;

  components: ComponentScores;
  composites: HorizonComposites;

  weekly: {
    probability_active: number; // 3 decimals allowed
    workload_ramp_factor: number; // 3 decimals allowed
    expected_carries: number;
    expected_rushing_yards: number;
    expected_rushing_touchdowns: number;
    expected_routes: number;
    expected_targets: number;
    expected_receptions: number;
    expected_receiving_yards: number;
    expected_receiving_touchdowns: number;
    expected_fantasy_points: number; // unconditional: Pactive × active-game fantasy points
  };

  ros: {
    expected_active_games: number;
    expected_fantasy_points: number;
  };

  confidence: {
    score: number;
    label: ConfidenceLabel;
    penalties: string[];
  };

  volatility: {
    score: number;
    label: VolatilityLabel;
    td_dependence: number;
    receiving_dependence: number;
  };

  explanations: {
    positive_drivers: string[];
    negative_drivers: string[];
  };

  fallback_log: FallbackLogEntry[];

  status: 'OK' | 'PARTIAL';
}

export interface EvaluateOptions {
  selected_horizon?: Horizon;
  reference_distributions?: RBReferenceDistributions;
  model_version?: string;
}
