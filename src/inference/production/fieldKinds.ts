// Per-position supplement field metadata used by the production emitter and
// serializer: emission field-kind (REGISTRY §20.F3), authorized neutral member
// (§20.F3.1), and the engine-input-interface declaration order (§15.1). These
// mirror the frozen engine input types (WR/RB/TE/QB `types.ts`); they never change
// engine behaviour.

import type { SupportedPosition } from '@/inference/types';
import type { FieldKind } from '@/inference/readiness/integration';

export interface SupplementFieldSpec {
  readonly kind: FieldKind;
  /** authorized neutral member/default for kinds enumNeutral/boolDefault (§20.F3.1). */
  readonly neutral?: string | boolean;
}

const NUM = { kind: 'nonNullableNumeric' as const };
const NULLABLE = { kind: 'nullable' as const };
const ENUM_UNKNOWN = { kind: 'enumNeutral' as const, neutral: 'UNKNOWN' };
const ENUM_STABLE = { kind: 'enumNeutral' as const, neutral: 'STABLE' };
const ENUM_BACKUP = { kind: 'enumNeutral' as const, neutral: 'BACKUP' };
const BOOL_FALSE = { kind: 'boolDefault' as const, neutral: false };

/** The 8 metadata keys per position (produced by the canonical pipeline, not the AIL). */
export const METADATA_KEYS: Readonly<Record<SupportedPosition, readonly string[]>> = {
  WR: ['player_id', 'player_name', 'team', 'age', 'nfl_seasons_completed', 'draft_round', 'injury_status', 'as_of_timestamp'],
  RB: ['player_id', 'player_name', 'team', 'age', 'nfl_seasons_completed', 'draft_round', 'injury_status', 'as_of_timestamp'],
  TE: ['player_id', 'player_name', 'team', 'age', 'nfl_seasons_completed', 'draft_round', 'injury_status', 'as_of_timestamp'],
  QB: ['player_id', 'player_name', 'team', 'age', 'nfl_seasons_completed', 'draft_round', 'injury_status', 'as_of'],
};

const WR_SPEC: Record<string, SupplementFieldSpec> = {
  career_routes: NUM,
  route_participation_last4: NULLABLE,
  route_participation_last8: NULLABLE,
  targets_per_route_run: NULLABLE,
  target_share: NULLABLE,
  projected_team_dropbacks: NULLABLE,
  expected_fantasy_points_per_target: NULLABLE,
  catch_rate_over_expected: NULLABLE,
  depth_adjusted_yards_per_target: NULLABLE,
  average_depth_of_target: NULLABLE,
  expected_td_rate_per_target: NULLABLE,
  qb_environment_score: NULLABLE,
  team_points_per_drive: NULLABLE,
  practice_status: ENUM_UNKNOWN,
  expected_games_remaining: NUM,
  contract_security: NULLABLE,
  competition_pressure: NULLABLE,
  route_role_change: ENUM_UNKNOWN,
  previous_route_participation: NULLABLE,
  previous_targets_per_route_run: NULLABLE,
  career_targets_per_route_run: NULLABLE,
  career_expected_fantasy_points_per_target: NULLABLE,
};

const RB_SPEC: Record<string, SupplementFieldSpec> = {
  career_touches: NUM,
  career_carries: NUM,
  career_routes: NUM,
  snap_share_last4: NULLABLE,
  snap_share_last8: NULLABLE,
  carry_share_last4: NULLABLE,
  route_participation_last4: NULLABLE,
  targets_per_route_run: NULLABLE,
  target_share: NULLABLE,
  goal_line_carry_share: NULLABLE,
  red_zone_carry_share: NULLABLE,
  yards_per_carry: NULLABLE,
  rushing_success_rate: NULLABLE,
  explosive_run_rate: NULLABLE,
  catch_rate: NULLABLE,
  receiving_yards_per_reception: NULLABLE,
  projected_team_non_qb_rush_attempts: NULLABLE,
  projected_team_dropbacks: NULLABLE,
  team_points_per_drive: NULLABLE,
  team_red_zone_trips_per_game: NULLABLE,
  qb_rush_pressure: NULLABLE,
  practice_status: ENUM_UNKNOWN,
  expected_games_remaining: NUM,
  workload_ramp_factor: NULLABLE,
  contract_security: NULLABLE,
  competition_pressure: NULLABLE,
  role_change: ENUM_UNKNOWN,
  teammate_return_flag: BOOL_FALSE,
  incoming_competition_flag: BOOL_FALSE,
  coaching_continuity: ENUM_UNKNOWN,
  high_recent_workload_flag: BOOL_FALSE,
  previous_snap_share: NULLABLE,
  previous_carry_share: NULLABLE,
  previous_route_participation: NULLABLE,
  career_yards_per_carry: NULLABLE,
  career_targets_per_route_run: NULLABLE,
  career_catch_rate: NULLABLE,
  career_receiving_yards_per_reception: NULLABLE,
};

const TE_SPEC: Record<string, SupplementFieldSpec> = {
  prospect_type: ENUM_UNKNOWN,
  career_routes: NUM,
  career_targets: NUM,
  route_participation_last4: NULLABLE,
  route_participation_last8: NULLABLE,
  snap_share_last4: NULLABLE,
  targets_per_route_run: NULLABLE,
  target_share: NULLABLE,
  average_depth_of_target: NULLABLE,
  red_zone_target_rate: NULLABLE,
  end_zone_target_rate: NULLABLE,
  catchable_target_rate: NULLABLE,
  catch_rate: NULLABLE,
  yards_per_target: NULLABLE,
  yards_per_reception: NULLABLE,
  yac_per_reception: NULLABLE,
  projected_team_dropbacks: NULLABLE,
  team_points_per_drive: NULLABLE,
  team_red_zone_trips_per_game: NULLABLE,
  qb_environment_score: NULLABLE,
  competition_pressure: NULLABLE,
  contract_security: NULLABLE,
  depth_chart_role: ENUM_UNKNOWN,
  role_change: ENUM_UNKNOWN,
  coaching_continuity: ENUM_UNKNOWN,
  teammate_return_flag: BOOL_FALSE,
  another_receiving_te_flag: BOOL_FALSE,
  temporary_opportunity_flag: BOOL_FALSE,
  new_team_flag: BOOL_FALSE,
  practice_status: ENUM_UNKNOWN,
  expected_games_remaining: NUM,
  workload_ramp_factor: NULLABLE,
  previous_route_participation: NULLABLE,
  previous_targets_per_route_run: NULLABLE,
  career_targets_per_route_run: NULLABLE,
  career_catch_rate: NULLABLE,
  career_yards_per_target: NULLABLE,
  career_yards_per_reception: NULLABLE,
  career_yac_per_reception: NULLABLE,
  career_red_zone_target_rate: NULLABLE,
  career_end_zone_target_rate: NULLABLE,
};

const QB_SPEC: Record<string, SupplementFieldSpec> = {
  career_games_played: NUM,
  career_starts: NUM,
  career_pass_attempts: NUM,
  career_rush_attempts: NUM,
  recent_games: NUM,
  recent_starts: NUM,
  recent_pass_attempts: NUM,
  recent_completions: NUM,
  recent_passing_yards: NUM,
  recent_passing_tds: NUM,
  recent_interceptions: NUM,
  recent_sacks: NUM,
  recent_rush_attempts: NUM,
  recent_rushing_yards: NUM,
  recent_rushing_tds: NUM,
  designed_rush_attempts: NULLABLE,
  scrambles: NULLABLE,
  goal_line_rush_attempts: NULLABLE,
  adjusted_yards_per_attempt: NULLABLE,
  completion_percentage_over_expected: NULLABLE,
  explosive_pass_rate: NULLABLE,
  team_dropback_share: NULLABLE,
  expected_active_game_pass_attempts: NULLABLE,
  expected_active_game_designed_rush_attempts: NULLABLE,
  expected_active_game_scrambles: NULLABLE,
  expected_active_game_goal_line_rush_attempts: NULLABLE,
  offensive_environment_score: NULLABLE,
  protection_context_score: NULLABLE,
  depth_chart_status: ENUM_BACKUP,
  role_status: ENUM_BACKUP,
  competition_pressure: NULLABLE,
  organizational_commitment: NULLABLE,
  probability_active: NULLABLE,
  expected_games_remaining: NUM,
  expected_games_limited: NULLABLE,
  team_change: BOOL_FALSE,
  major_system_change: BOOL_FALSE,
  recent_role_change: BOOL_FALSE,
  prior_recent_pass_attempts: NULLABLE,
  prior_adjusted_yards_per_attempt: NULLABLE,
  prior_interception_rate: NULLABLE,
  prior_rush_attempts_per_start: NULLABLE,
};

void ENUM_STABLE; // route_role_change/role_change use UNKNOWN; STABLE reserved by contract

export const SUPPLEMENT_SPEC: Readonly<Record<SupportedPosition, Readonly<Record<string, SupplementFieldSpec>>>> = {
  WR: WR_SPEC,
  RB: RB_SPEC,
  TE: TE_SPEC,
  QB: QB_SPEC,
};

/** Engine-interface declaration order (§15.1): metadata keys, then supplement keys. */
export function declarationOrder(position: SupportedPosition): readonly string[] {
  return [...METADATA_KEYS[position], ...Object.keys(SUPPLEMENT_SPEC[position])];
}
