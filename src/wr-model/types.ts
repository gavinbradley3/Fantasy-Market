// WR MVP types — binding input/output schemas from §26.3 and §26.15, printed
// verbatim. No field is added beyond the contract (§26.3: "No additional field
// is required for the first MVP").

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

export type RouteRoleChange = 'PROMOTED' | 'DEMOTED' | 'STABLE' | 'UNKNOWN';

export type Horizon = 'WEEKLY' | 'ROS' | 'ONE_YEAR' | 'THREE_YEAR' | 'DYNASTY';

export interface ScoringVector {
  points_per_reception: number;
  points_per_receiving_yard: number;
  points_per_receiving_td: number;
}

// §26.3 — Required normalized input.
export interface WRMVPInput {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: DraftRound;
  career_routes: number;

  // Current role and opportunity
  route_participation_last4: number | null; // 0–1
  route_participation_last8: number | null; // 0–1
  targets_per_route_run: number | null; // 0–1
  target_share: number | null; // 0–1
  projected_team_dropbacks: number | null; // per game

  // Target quality and efficiency
  expected_fantasy_points_per_target: number | null;
  catch_rate_over_expected: number | null; // decimal; 0.04 = four percentage points
  depth_adjusted_yards_per_target: number | null;
  average_depth_of_target: number | null; // yards
  expected_td_rate_per_target: number | null; // 0–1

  // Team environment
  qb_environment_score: number | null; // 0–100
  team_points_per_drive: number | null;

  // Availability and role durability
  injury_status: InjuryStatus;
  practice_status: PracticeStatus;
  expected_games_remaining: number;
  contract_security: number | null; // 0–1
  competition_pressure: number | null; // 0–1; higher is worse
  route_role_change: RouteRoleChange;

  // Optional history used for trend and fallbacks
  previous_route_participation: number | null;
  previous_targets_per_route_run: number | null;
  career_targets_per_route_run: number | null;
  career_expected_fantasy_points_per_target: number | null;

  scoring?: ScoringVector;

  as_of_timestamp: string;
}

// §26.4 — reference distributions. One numeric array per percentile signal.
export interface WRReferenceDistributions {
  version: string;
  route_participation: number[];
  targets_per_route_run: number[];
  target_share: number[];
  expected_fantasy_points_per_target: number[];
  catch_rate_over_expected: number[];
  depth_adjusted_yards_per_target: number[];
  projected_team_dropbacks: number[];
  team_points_per_drive: number[];
}

export type ReferenceKey = Exclude<keyof WRReferenceDistributions, 'version'>;

export interface ComponentScores {
  RR: number;
  TE: number;
  TQ: number;
  EF: number;
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
export interface WRMVPOutput {
  schema_version: 'wr-mvp-1.0';
  model_version: string;
  player_id: string;
  player_name: string;
  as_of_timestamp: string;

  components: ComponentScores;
  composites: HorizonComposites;

  weekly: {
    probability_active: number;
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
    label: ConfidenceLabel;
    penalties: string[];
  };

  volatility: {
    score: number;
    label: VolatilityLabel;
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
  reference_distributions?: WRReferenceDistributions;
  model_version?: string;
}
