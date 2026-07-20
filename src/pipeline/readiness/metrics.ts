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

export type WRMetadataKey = (typeof WR_METADATA_KEYS)[number];
export type RBMetadataKey = (typeof RB_METADATA_KEYS)[number];
export type TEMetadataKey = (typeof TE_METADATA_KEYS)[number];

// The future-stage supplement for each engine.
export type WRMetricsSupplement = Omit<WRMVPInput, WRMetadataKey>;
export type RBMetricsSupplement = Omit<RBMVPInput, RBMetadataKey>;
export type TEMetricsSupplement = Omit<TEMVPInput, TEMetadataKey>;

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

export function wrFieldStage(field: string): PipelineStage {
  return WR_STAGE[field as keyof WRMetricsSupplement] ?? 'stats';
}
export function rbFieldStage(field: string): PipelineStage {
  return RB_STAGE[field as keyof RBMetricsSupplement] ?? 'stats';
}
export function teFieldStage(field: string): PipelineStage {
  return TE_STAGE[field as keyof TEMetricsSupplement] ?? 'stats';
}
