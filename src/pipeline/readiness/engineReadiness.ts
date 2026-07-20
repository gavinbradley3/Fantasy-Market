// Engine-input boundary. Converts a canonical player (plus, when available, a
// future-stage metrics supplement) into the EXACT public input type each frozen
// engine expects — or, when inputs are legitimately incomplete, a typed
// readiness assessment that names every present and missing field and the stage
// that will supply it.
//
// Hard rules (mirrors the frozen-engine constraints):
//   • No engine formula, threshold, or type is touched or weakened.
//   • No value is manufactured to make an engine run. A player is READY only
//     when its required metadata is present AND a complete supplement is given.
//     Metadata-only players are reported NOT_READY, not force-fed.
//   • QB has no engine in this repo yet, so QB is ENGINE_UNAVAILABLE — reported,
//     never faked.

import type { CanonicalPlayer, FieldState, SupportedPosition } from '@/pipeline/types';
import { valueOf } from '@/pipeline/provenance';
import {
  rbFieldStage,
  teFieldStage,
  wrFieldStage,
  type PipelineStage,
  type RBMetricsSupplement,
  type TEMetricsSupplement,
  type WRMetricsSupplement,
} from '@/pipeline/readiness/metrics';
import type { DraftRound, InjuryStatus, WRMVPInput } from '@/wr-model/types';
import type { RBMVPInput } from '@/rb-model/types';
import type { TEMVPInput } from '@/te-model/types';

export type RequirementSource = 'metadata' | PipelineStage;

export interface MissingRequirement {
  readonly field: string;
  readonly suppliedBy: RequirementSource;
  readonly reason: string;
}

export type EngineReadiness<I> =
  | {
      readonly status: 'READY';
      readonly position: SupportedPosition;
      readonly presentMetadata: readonly string[];
      readonly input: I;
    }
  | {
      readonly status: 'NOT_READY';
      readonly position: SupportedPosition;
      readonly presentMetadata: readonly string[];
      readonly missing: readonly MissingRequirement[];
    }
  | {
      readonly status: 'ENGINE_UNAVAILABLE';
      readonly position: SupportedPosition;
      readonly reason: string;
    };

// ---- metadata → engine mappers (shared across positions) ----

function toDraftRound(field: FieldState<number>): DraftRound {
  // null is the engine's DEFINED "unknown draft round" — a legitimate value,
  // not a manufactured one.
  if (!field.present) return null;
  const r = field.value;
  return r >= 1 && r <= 7 ? (r as DraftRound) : null;
}

function toInjuryStatus(
  status: CanonicalPlayer['status'],
  injuryDesignation: CanonicalPlayer['injury_designation'],
): InjuryStatus {
  if (!status.present) return 'UNKNOWN';
  switch (status.value) {
    case 'active':
      return 'HEALTHY';
    case 'suspended':
      return 'SUSPENDED';
    case 'inactive':
      return 'OUT';
    case 'injured': {
      const d = (valueOf(injuryDesignation) ?? '').toLowerCase();
      if (d.includes('out')) return 'OUT';
      if (d.includes('doubt')) return 'DOUBTFUL';
      if (d.includes('quest')) return 'QUESTIONABLE';
      if (d.includes('ir')) return 'IR';
      if (d.includes('pup')) return 'PUP';
      return 'QUESTIONABLE';
    }
  }
}

// The metadata fields every engine shares. Extracts them or reports which are
// missing (name/team/age/experience are hard-required; draft round & injury
// have engine-defined unknowns and never block).
interface SharedMetadata {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: DraftRound;
  injury_status: InjuryStatus;
  as_of_timestamp: string;
}

function extractMetadata(
  player: CanonicalPlayer,
  asOf: string,
): { ok: true; meta: SharedMetadata; present: string[] } | { ok: false; missing: MissingRequirement[]; present: string[] } {
  const name = valueOf(player.full_name);
  const team = valueOf(player.team);
  const age = valueOf(player.age);
  const seasons = valueOf(player.nfl_seasons_completed);

  const present: string[] = [];
  if (name !== undefined) present.push('full_name');
  if (team !== undefined) present.push('team');
  if (age !== undefined) present.push('age');
  if (seasons !== undefined) present.push('nfl_seasons_completed');
  if (player.draft_round.present) present.push('draft_round');
  if (player.status.present) present.push('injury_status');

  const missing: MissingRequirement[] = [];
  if (name === undefined) missing.push({ field: 'full_name', suppliedBy: 'metadata', reason: 'no source supplied a name' });
  if (team === undefined) missing.push({ field: 'team', suppliedBy: 'metadata', reason: 'no source supplied a team' });
  if (age === undefined) missing.push({ field: 'age', suppliedBy: 'metadata', reason: 'no age or birth_date available' });
  if (seasons === undefined) missing.push({ field: 'nfl_seasons_completed', suppliedBy: 'metadata', reason: 'no experience value available' });

  if (missing.length > 0) return { ok: false, missing, present };
  return {
    ok: true,
    present,
    meta: {
      player_id: player.identity.canonical_id,
      player_name: name!,
      team: team ?? null,
      age: age!,
      nfl_seasons_completed: seasons!,
      draft_round: toDraftRound(player.draft_round),
      injury_status: toInjuryStatus(player.status, player.injury_designation),
      as_of_timestamp: asOf,
    },
  };
}

// The non-metadata fields each engine requires (excludes optional `scoring`).
// `satisfies` guards against naming a key the supplement type doesn't have; the
// stage classifier fills in ownership. These drive the NOT_READY report only —
// when a supplement is provided, the input is assembled type-safely by spread.
const WR_REQUIRED_SUPPLEMENT = [
  'career_routes', 'route_participation_last4', 'route_participation_last8', 'targets_per_route_run',
  'target_share', 'projected_team_dropbacks', 'expected_fantasy_points_per_target', 'catch_rate_over_expected',
  'depth_adjusted_yards_per_target', 'average_depth_of_target', 'expected_td_rate_per_target', 'qb_environment_score',
  'team_points_per_drive', 'practice_status', 'expected_games_remaining', 'contract_security', 'competition_pressure',
  'route_role_change', 'previous_route_participation', 'previous_targets_per_route_run', 'career_targets_per_route_run',
  'career_expected_fantasy_points_per_target',
] as const satisfies readonly (keyof WRMetricsSupplement)[];

const RB_REQUIRED_SUPPLEMENT = [
  'career_touches', 'career_carries', 'career_routes', 'snap_share_last4', 'snap_share_last8', 'carry_share_last4',
  'route_participation_last4', 'targets_per_route_run', 'target_share', 'goal_line_carry_share', 'red_zone_carry_share',
  'yards_per_carry', 'rushing_success_rate', 'explosive_run_rate', 'catch_rate', 'receiving_yards_per_reception',
  'projected_team_non_qb_rush_attempts', 'projected_team_dropbacks', 'team_points_per_drive', 'team_red_zone_trips_per_game',
  'qb_rush_pressure', 'practice_status', 'expected_games_remaining', 'workload_ramp_factor', 'contract_security',
  'competition_pressure', 'role_change', 'teammate_return_flag', 'incoming_competition_flag', 'coaching_continuity',
  'high_recent_workload_flag', 'previous_snap_share', 'previous_carry_share', 'previous_route_participation',
  'career_yards_per_carry', 'career_targets_per_route_run', 'career_catch_rate', 'career_receiving_yards_per_reception',
] as const satisfies readonly (keyof RBMetricsSupplement)[];

const TE_REQUIRED_SUPPLEMENT = [
  'prospect_type', 'career_routes', 'career_targets', 'route_participation_last4', 'route_participation_last8',
  'snap_share_last4', 'targets_per_route_run', 'target_share', 'average_depth_of_target', 'red_zone_target_rate',
  'end_zone_target_rate', 'catchable_target_rate', 'catch_rate', 'yards_per_target', 'yards_per_reception',
  'yac_per_reception', 'projected_team_dropbacks', 'team_points_per_drive', 'team_red_zone_trips_per_game',
  'qb_environment_score', 'competition_pressure', 'contract_security', 'depth_chart_role', 'role_change',
  'coaching_continuity', 'teammate_return_flag', 'another_receiving_te_flag', 'temporary_opportunity_flag',
  'new_team_flag', 'practice_status', 'expected_games_remaining', 'workload_ramp_factor', 'previous_route_participation',
  'previous_targets_per_route_run', 'career_targets_per_route_run', 'career_catch_rate', 'career_yards_per_target',
  'career_yards_per_reception', 'career_yac_per_reception', 'career_red_zone_target_rate', 'career_end_zone_target_rate',
] as const satisfies readonly (keyof TEMetricsSupplement)[];

function supplementMissing(
  fields: readonly string[],
  stageOf: (field: string) => PipelineStage,
): MissingRequirement[] {
  return fields.map((field) => ({
    field,
    suppliedBy: stageOf(field),
    reason: `not available from metadata; awaiting the ${stageOf(field)} stage`,
  }));
}

// ---- per-position assessors ----

export function assessWRReadiness(
  player: CanonicalPlayer,
  supplement: WRMetricsSupplement | null,
  asOf: string,
): EngineReadiness<WRMVPInput> {
  const md = extractMetadata(player, asOf);
  if (!supplement) {
    const missing = [
      ...(md.ok ? [] : md.missing),
      ...supplementMissing(WR_REQUIRED_SUPPLEMENT, wrFieldStage),
    ];
    return { status: 'NOT_READY', position: 'WR', presentMetadata: md.present, missing };
  }
  if (!md.ok) return { status: 'NOT_READY', position: 'WR', presentMetadata: md.present, missing: md.missing };
  const input: WRMVPInput = { ...supplement, ...md.meta };
  return { status: 'READY', position: 'WR', presentMetadata: md.present, input };
}

export function assessRBReadiness(
  player: CanonicalPlayer,
  supplement: RBMetricsSupplement | null,
  asOf: string,
): EngineReadiness<RBMVPInput> {
  const md = extractMetadata(player, asOf);
  if (!supplement) {
    const missing = [
      ...(md.ok ? [] : md.missing),
      ...supplementMissing(RB_REQUIRED_SUPPLEMENT, rbFieldStage),
    ];
    return { status: 'NOT_READY', position: 'RB', presentMetadata: md.present, missing };
  }
  if (!md.ok) return { status: 'NOT_READY', position: 'RB', presentMetadata: md.present, missing: md.missing };
  const input: RBMVPInput = { ...supplement, ...md.meta };
  return { status: 'READY', position: 'RB', presentMetadata: md.present, input };
}

export function assessTEReadiness(
  player: CanonicalPlayer,
  supplement: TEMetricsSupplement | null,
  asOf: string,
): EngineReadiness<TEMVPInput> {
  const md = extractMetadata(player, asOf);
  if (!supplement) {
    const missing = [
      ...(md.ok ? [] : md.missing),
      ...supplementMissing(TE_REQUIRED_SUPPLEMENT, teFieldStage),
    ];
    return { status: 'NOT_READY', position: 'TE', presentMetadata: md.present, missing };
  }
  if (!md.ok) return { status: 'NOT_READY', position: 'TE', presentMetadata: md.present, missing: md.missing };
  const input: TEMVPInput = { ...supplement, ...md.meta };
  return { status: 'READY', position: 'TE', presentMetadata: md.present, input };
}

// A supplement bundle keyed by position, used by the pipeline/tests to feed the
// (optional) future-stage inputs. All entries default to null (metadata-only).
export interface MetricsSupplements {
  readonly wr?: Readonly<Record<string, WRMetricsSupplement>>;
  readonly rb?: Readonly<Record<string, RBMetricsSupplement>>;
  readonly te?: Readonly<Record<string, TEMetricsSupplement>>;
}

export interface ReadinessSummary {
  readonly position: SupportedPosition;
  readonly canonicalId: string;
  readonly status: EngineReadiness<unknown>['status'];
  readonly presentMetadata: readonly string[];
  readonly missing: readonly MissingRequirement[];
}

// Position-dispatching assessment for a canonical player. QB → ENGINE_UNAVAILABLE.
export function assessReadiness(
  player: CanonicalPlayer,
  supplements: MetricsSupplements,
  asOf: string,
): ReadinessSummary {
  const id = player.identity.canonical_id;
  switch (player.position) {
    case 'WR': {
      const r = assessWRReadiness(player, supplements.wr?.[id] ?? null, asOf);
      return {
        position: 'WR',
        canonicalId: id,
        status: r.status,
        presentMetadata: r.status === 'ENGINE_UNAVAILABLE' ? [] : r.presentMetadata,
        missing: r.status === 'NOT_READY' ? r.missing : [],
      };
    }
    case 'RB': {
      const r = assessRBReadiness(player, supplements.rb?.[id] ?? null, asOf);
      return {
        position: 'RB',
        canonicalId: id,
        status: r.status,
        presentMetadata: r.status === 'ENGINE_UNAVAILABLE' ? [] : r.presentMetadata,
        missing: r.status === 'NOT_READY' ? r.missing : [],
      };
    }
    case 'TE': {
      const r = assessTEReadiness(player, supplements.te?.[id] ?? null, asOf);
      return {
        position: 'TE',
        canonicalId: id,
        status: r.status,
        presentMetadata: r.status === 'ENGINE_UNAVAILABLE' ? [] : r.presentMetadata,
        missing: r.status === 'NOT_READY' ? r.missing : [],
      };
    }
    case 'QB':
      return {
        position: 'QB',
        canonicalId: id,
        status: 'ENGINE_UNAVAILABLE',
        presentMetadata: [],
        missing: [],
      };
  }
}
