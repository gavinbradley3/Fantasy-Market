// Metrics supplements: the non-metadata portion of each engine's input.
//
// This milestone produces player METADATA. The engines additionally require
// usage stats, efficiency, projections, and role context that later pipeline
// stages (a stats stage, a projections stage, a context stage) will supply.
// Rather than duplicate — or weaken — the engines' input types, each supplement
// is derived with Omit<EngineInput, metadataKeys>. That keeps the engines as the
// single source of truth for their own shapes: if an engine adds a field, the
// supplement type updates automatically and this boundary fails to compile until
// it is handled.

import type { WRMVPInput } from '@/wr-model/types';
import type { RBMVPInput } from '@/rb-model/types';
import type { TEMVPInput } from '@/te-model/types';
import type { QBMVPInput } from '@/qb-model/types';

// Keys this pipeline's canonical metadata can fill for every position. The rest
// of each engine input is the supplement.
export const WR_METADATA_KEYS = [
  'player_id',
  'player_name',
  'team',
  'age',
  'nfl_seasons_completed',
  'draft_round',
  'injury_status',
  'as_of_timestamp',
] as const satisfies readonly (keyof WRMVPInput)[];

export const RB_METADATA_KEYS = [
  'player_id',
  'player_name',
  'team',
  'age',
  'nfl_seasons_completed',
  'draft_round',
  'injury_status',
  'as_of_timestamp',
] as const satisfies readonly (keyof RBMVPInput)[];

export const TE_METADATA_KEYS = [
  'player_id',
  'player_name',
  'team',
  'age',
  'nfl_seasons_completed',
  'draft_round',
  'injury_status',
  'as_of_timestamp',
] as const satisfies readonly (keyof TEMVPInput)[];

// QB uses `as_of` (not `as_of_timestamp`); everything else parallels the other
// positions. injury_status maps from canonical status just like the rest.
export const QB_METADATA_KEYS = [
  'player_id',
  'player_name',
  'team',
  'age',
  'nfl_seasons_completed',
  'draft_round',
  'injury_status',
  'as_of',
] as const satisfies readonly (keyof QBMVPInput)[];

export type WRMetadataKey = (typeof WR_METADATA_KEYS)[number];
export type RBMetadataKey = (typeof RB_METADATA_KEYS)[number];
export type TEMetadataKey = (typeof TE_METADATA_KEYS)[number];
export type QBMetadataKey = (typeof QB_METADATA_KEYS)[number];

// The future-stage supplement for each engine.
export type WRMetricsSupplement = Omit<WRMVPInput, WRMetadataKey>;
export type RBMetricsSupplement = Omit<RBMVPInput, RBMetadataKey>;
export type TEMetricsSupplement = Omit<TEMVPInput, TEMetadataKey>;
export type QBMetricsSupplement = Omit<QBMVPInput, QBMetadataKey>;

// Which future pipeline stage owns each supplement field. Used to tell a caller
// exactly where a missing value will eventually come from. Any field not listed
// defaults to the stats stage.
export type PipelineStage = 'stats' | 'projections' | 'context';

const WR_STAGE: Partial<Record<keyof WRMetricsSupplement, PipelineStage>> = {
  projected_team_dropbacks: 'projections',
  team_points_per_drive: 'projections',
  expected_games_remaining: 'projections',
  qb_environment_score: 'context',
  practice_status: 'context',
  contract_security: 'context',
  competition_pressure: 'context',
  route_role_change: 'context',
};

const RB_STAGE: Partial<Record<keyof RBMetricsSupplement, PipelineStage>> = {
  projected_team_non_qb_rush_attempts: 'projections',
  projected_team_dropbacks: 'projections',
  team_points_per_drive: 'projections',
  team_red_zone_trips_per_game: 'projections',
  expected_games_remaining: 'projections',
  qb_rush_pressure: 'context',
  practice_status: 'context',
  workload_ramp_factor: 'context',
  contract_security: 'context',
  competition_pressure: 'context',
  role_change: 'context',
  teammate_return_flag: 'context',
  incoming_competition_flag: 'context',
  coaching_continuity: 'context',
  high_recent_workload_flag: 'context',
};

const TE_STAGE: Partial<Record<keyof TEMetricsSupplement, PipelineStage>> = {
  projected_team_dropbacks: 'projections',
  team_points_per_drive: 'projections',
  team_red_zone_trips_per_game: 'projections',
  expected_games_remaining: 'projections',
  qb_environment_score: 'context',
  prospect_type: 'context',
  practice_status: 'context',
  workload_ramp_factor: 'context',
  contract_security: 'context',
  competition_pressure: 'context',
  depth_chart_role: 'context',
  role_change: 'context',
  coaching_continuity: 'context',
  teammate_return_flag: 'context',
  another_receiving_te_flag: 'context',
  temporary_opportunity_flag: 'context',
  new_team_flag: 'context',
};

const QB_STAGE: Partial<Record<keyof QBMetricsSupplement, PipelineStage>> = {
  // Projections / expected active-game workload.
  expected_active_game_pass_attempts: 'projections',
  expected_active_game_designed_rush_attempts: 'projections',
  expected_active_game_scrambles: 'projections',
  expected_active_game_goal_line_rush_attempts: 'projections',
  team_dropback_share: 'projections',
  expected_games_remaining: 'projections',
  expected_games_limited: 'projections',
  probability_active: 'projections',
  // Team / organizational context and role.
  offensive_environment_score: 'context',
  protection_context_score: 'context',
  depth_chart_status: 'context',
  role_status: 'context',
  competition_pressure: 'context',
  organizational_commitment: 'context',
  team_change: 'context',
  major_system_change: 'context',
  recent_role_change: 'context',
};

export function wrFieldStage(field: string): PipelineStage {
  return WR_STAGE[field as keyof WRMetricsSupplement] ?? 'stats';
}
export function rbFieldStage(field: string): PipelineStage {
  return RB_STAGE[field as keyof RBMetricsSupplement] ?? 'stats';
}
export function teFieldStage(field: string): PipelineStage {
  return TE_STAGE[field as keyof TEMetricsSupplement] ?? 'stats';
}
export function qbFieldStage(field: string): PipelineStage {
  return QB_STAGE[field as keyof QBMetricsSupplement] ?? 'stats';
}
