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
//   • All four positions (WR/RB/TE/QB) have a real engine and a typed readiness
//     assessment. A live QB record with no stats is NOT_READY (missing inputs) —
//     never ENGINE_UNAVAILABLE.

import type { CanonicalPlayer, FieldState, SupportedPosition } from '@/pipeline/types';
import { valueOf } from '@/pipeline/provenance';
import {
  qbFieldStage,
  rbFieldStage,
  teFieldStage,
  wrFieldStage,
  type PipelineStage,
  type QBMetricsSupplement,
  type RBMetricsSupplement,
  type TEMetricsSupplement,
  type WRMetricsSupplement,
} from '@/pipeline/readiness/metrics';
import type { DraftRound, InjuryStatus, WRMVPInput } from '@/wr-model/types';
import type { RBMVPInput } from '@/rb-model/types';
import type { TEMVPInput } from '@/te-model/types';
import type { QBInjuryStatus, QBMVPInput } from '@/qb-model/types';

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

// QB's injury enum has no UNKNOWN/SUSPENDED. Map the four canonical states to
// the nearest defined QB status; a suspended/inactive QB is unavailable (OUT).
// Returns null when status is absent — QB has no "unknown" to fall back to, so
// the caller treats a missing status as a missing required metadata field
// rather than inventing HEALTHY.
function toQBInjuryStatus(
  status: CanonicalPlayer['status'],
  injuryDesignation: CanonicalPlayer['injury_designation'],
): QBInjuryStatus | null {
  if (!status.present) return null;
  switch (status.value) {
    case 'active':
      return 'HEALTHY';
    case 'suspended':
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

// The four hard-required metadata fields shared by every position (name, team,
// age, experience). draft_round & injury_status derive with engine-defined
// unknowns for WR/RB/TE and never block there. Returns the extracted values plus
// present/missing lists.
interface RequiredMetadata {
  name: string | undefined;
  team: string | undefined;
  age: number | undefined;
  seasons: number | undefined;
}

function checkRequiredMetadata(player: CanonicalPlayer): {
  values: RequiredMetadata;
  present: string[];
  missing: MissingRequirement[];
} {
  const values: RequiredMetadata = {
    name: valueOf(player.full_name),
    team: valueOf(player.team),
    age: valueOf(player.age),
    seasons: valueOf(player.nfl_seasons_completed),
  };

  const present: string[] = [];
  if (values.name !== undefined) present.push('full_name');
  if (values.team !== undefined) present.push('team');
  if (values.age !== undefined) present.push('age');
  if (values.seasons !== undefined) present.push('nfl_seasons_completed');
  if (player.draft_round.present) present.push('draft_round');
  if (player.status.present) present.push('injury_status');

  const missing: MissingRequirement[] = [];
  if (values.name === undefined) missing.push({ field: 'full_name', suppliedBy: 'metadata', reason: 'no source supplied a name' });
  if (values.team === undefined) missing.push({ field: 'team', suppliedBy: 'metadata', reason: 'no source supplied a team' });
  if (values.age === undefined) missing.push({ field: 'age', suppliedBy: 'metadata', reason: 'no age or birth_date available' });
  if (values.seasons === undefined) missing.push({ field: 'nfl_seasons_completed', suppliedBy: 'metadata', reason: 'no experience value available' });

  return { values, present, missing };
}

// Shared metadata for WR/RB/TE (uses `as_of_timestamp`; injury has a UNKNOWN
// fallback so it never blocks).
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
  const { values, present, missing } = checkRequiredMetadata(player);
  if (missing.length > 0) return { ok: false, missing, present };
  return {
    ok: true,
    present,
    meta: {
      player_id: player.identity.canonical_id,
      player_name: values.name!,
      team: values.team ?? null,
      age: values.age!,
      nfl_seasons_completed: values.seasons!,
      draft_round: toDraftRound(player.draft_round),
      injury_status: toInjuryStatus(player.status, player.injury_designation),
      as_of_timestamp: asOf,
    },
  };
}

// QB metadata (uses `as_of`; injury_status is required because QB has no
// UNKNOWN state — a QB with no known status is reported not-ready, not faked).
interface QBSharedMetadata {
  player_id: string;
  player_name: string;
  team: string | null;
  age: number;
  nfl_seasons_completed: number;
  draft_round: QBMVPInput['draft_round'];
  injury_status: QBInjuryStatus;
  as_of: string;
}

function extractQBMetadata(
  player: CanonicalPlayer,
  asOf: string,
): { ok: true; meta: QBSharedMetadata; present: string[] } | { ok: false; missing: MissingRequirement[]; present: string[] } {
  const { values, present, missing: baseMissing } = checkRequiredMetadata(player);
  const missing = [...baseMissing];
  const injury = toQBInjuryStatus(player.status, player.injury_designation);
  if (injury === null) {
    missing.push({
      field: 'injury_status',
      suppliedBy: 'metadata',
      reason: 'no availability status available and QB has no UNKNOWN state',
    });
  }
  if (missing.length > 0) return { ok: false, missing, present };
  return {
    ok: true,
    present,
    meta: {
      player_id: player.identity.canonical_id,
      player_name: values.name!,
      team: values.team ?? null,
      age: values.age!,
      nfl_seasons_completed: values.seasons!,
      draft_round: toDraftRound(player.draft_round),
      injury_status: injury!,
      as_of: asOf,
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

const QB_REQUIRED_SUPPLEMENT = [
  'career_games_played', 'career_starts', 'career_pass_attempts', 'career_rush_attempts',
  'recent_games', 'recent_starts', 'recent_pass_attempts', 'recent_completions', 'recent_passing_yards',
  'recent_passing_tds', 'recent_interceptions', 'recent_sacks', 'recent_rush_attempts', 'recent_rushing_yards',
  'recent_rushing_tds', 'designed_rush_attempts', 'scrambles', 'goal_line_rush_attempts',
  'adjusted_yards_per_attempt', 'completion_percentage_over_expected', 'explosive_pass_rate',
  'team_dropback_share', 'expected_active_game_pass_attempts', 'expected_active_game_designed_rush_attempts',
  'expected_active_game_scrambles', 'expected_active_game_goal_line_rush_attempts', 'offensive_environment_score',
  'protection_context_score', 'depth_chart_status', 'role_status', 'competition_pressure', 'organizational_commitment',
  'probability_active', 'expected_games_remaining', 'expected_games_limited', 'team_change', 'major_system_change',
  'recent_role_change', 'prior_recent_pass_attempts', 'prior_adjusted_yards_per_attempt', 'prior_interception_rate',
  'prior_rush_attempts_per_start',
] as const satisfies readonly (keyof QBMetricsSupplement)[];

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

type MetaResult<M> =
  | { ok: true; meta: M; present: string[] }
  | { ok: false; missing: MissingRequirement[]; present: string[] };

// Generic partial-aware assessment core. The supplement may be a FULL supplement
// (every required key present → READY when metadata is complete) or a PARTIAL
// one contributed by a stage such as stats (some keys present → the rest are
// reported missing, by owning stage). A key counts as "present" when it exists
// on the object, even if its value is null — null is the engines' defined
// unknown for nullable fields, not a missing value.
function assessFromSupplement<M, Full, Input>(
  position: SupportedPosition,
  md: MetaResult<M>,
  supplement: Partial<Full> | null,
  requiredKeys: readonly string[],
  stageOf: (field: string) => PipelineStage,
  buildInput: (supplement: Full, meta: M) => Input,
): EngineReadiness<Input> {
  const present = (supplement ?? {}) as Record<string, unknown>;
  const missingKeys = requiredKeys.filter((k) => !(k in present));
  const missing = [
    ...(md.ok ? [] : md.missing),
    ...supplementMissing(missingKeys, stageOf),
  ];
  if (!md.ok || missingKeys.length > 0) {
    return { status: 'NOT_READY', position, presentMetadata: md.present, missing };
  }
  // Runtime-checked: every required key is present above, so the partial is a
  // complete supplement. This is the single guarded cast site.
  const complete = present as Full;
  return { status: 'READY', position, presentMetadata: md.present, input: buildInput(complete, md.meta) };
}

// ---- per-position assessors ----

export function assessWRReadiness(
  player: CanonicalPlayer,
  supplement: Partial<WRMetricsSupplement> | null,
  asOf: string,
): EngineReadiness<WRMVPInput> {
  return assessFromSupplement(
    'WR',
    extractMetadata(player, asOf),
    supplement,
    WR_REQUIRED_SUPPLEMENT,
    wrFieldStage,
    (s, meta): WRMVPInput => ({ ...s, ...meta }),
  );
}

export function assessRBReadiness(
  player: CanonicalPlayer,
  supplement: Partial<RBMetricsSupplement> | null,
  asOf: string,
): EngineReadiness<RBMVPInput> {
  return assessFromSupplement(
    'RB',
    extractMetadata(player, asOf),
    supplement,
    RB_REQUIRED_SUPPLEMENT,
    rbFieldStage,
    (s, meta): RBMVPInput => ({ ...s, ...meta }),
  );
}

export function assessTEReadiness(
  player: CanonicalPlayer,
  supplement: Partial<TEMetricsSupplement> | null,
  asOf: string,
): EngineReadiness<TEMVPInput> {
  return assessFromSupplement(
    'TE',
    extractMetadata(player, asOf),
    supplement,
    TE_REQUIRED_SUPPLEMENT,
    teFieldStage,
    (s, meta): TEMVPInput => ({ ...s, ...meta }),
  );
}

export function assessQBReadiness(
  player: CanonicalPlayer,
  supplement: Partial<QBMetricsSupplement> | null,
  asOf: string,
): EngineReadiness<QBMVPInput> {
  return assessFromSupplement(
    'QB',
    extractQBMetadata(player, asOf),
    supplement,
    QB_REQUIRED_SUPPLEMENT,
    qbFieldStage,
    (s, meta): QBMVPInput => ({ ...s, ...meta }),
  );
}

// A supplement bundle keyed by position, used by the pipeline/tests to feed the
// stage-supplied inputs. Entries may be PARTIAL — the stats stage contributes a
// subset of fields, which the readiness core merges and completeness-checks.
export interface MetricsSupplements {
  readonly wr?: Readonly<Record<string, Partial<WRMetricsSupplement>>>;
  readonly rb?: Readonly<Record<string, Partial<RBMetricsSupplement>>>;
  readonly te?: Readonly<Record<string, Partial<TEMetricsSupplement>>>;
  readonly qb?: Readonly<Record<string, Partial<QBMetricsSupplement>>>;
}

// Merge two supplement bundles (e.g. authored projection/context + stats). For
// each position/id the entries are shallow-merged with `overlay` winning, so the
// stats stage supersedes any authored placeholder for a stats-owned field while
// leaving projection/context fields intact.
export function mergeSupplements(
  base: MetricsSupplements,
  overlay: MetricsSupplements,
): MetricsSupplements {
  const positions = ['wr', 'rb', 'te', 'qb'] as const;
  const out: {
    wr: Record<string, Partial<WRMetricsSupplement>>;
    rb: Record<string, Partial<RBMetricsSupplement>>;
    te: Record<string, Partial<TEMetricsSupplement>>;
    qb: Record<string, Partial<QBMetricsSupplement>>;
  } = { wr: {}, rb: {}, te: {}, qb: {} };
  for (const pos of positions) {
    const b = base[pos] ?? {};
    const o = overlay[pos] ?? {};
    const ids = new Set([...Object.keys(b), ...Object.keys(o)]);
    for (const id of ids) {
      out[pos][id] = { ...(b[id] ?? {}), ...(o[id] ?? {}) } as never;
    }
  }
  return out;
}

export interface ReadinessSummary {
  readonly position: SupportedPosition;
  readonly canonicalId: string;
  readonly status: EngineReadiness<unknown>['status'];
  readonly presentMetadata: readonly string[];
  readonly missing: readonly MissingRequirement[];
}

function summarize(position: SupportedPosition, id: string, r: EngineReadiness<unknown>): ReadinessSummary {
  return {
    position,
    canonicalId: id,
    status: r.status,
    presentMetadata: r.status === 'ENGINE_UNAVAILABLE' ? [] : r.presentMetadata,
    missing: r.status === 'NOT_READY' ? r.missing : [],
  };
}

// Position-dispatching assessment for a canonical player. All four positions now
// have a real engine; a metadata-only record is NOT_READY (missing stats),
// never ENGINE_UNAVAILABLE.
export function assessReadiness(
  player: CanonicalPlayer,
  supplements: MetricsSupplements,
  asOf: string,
): ReadinessSummary {
  const id = player.identity.canonical_id;
  switch (player.position) {
    case 'WR':
      return summarize('WR', id, assessWRReadiness(player, supplements.wr?.[id] ?? null, asOf));
    case 'RB':
      return summarize('RB', id, assessRBReadiness(player, supplements.rb?.[id] ?? null, asOf));
    case 'TE':
      return summarize('TE', id, assessTEReadiness(player, supplements.te?.[id] ?? null, asOf));
    case 'QB':
      return summarize('QB', id, assessQBReadiness(player, supplements.qb?.[id] ?? null, asOf));
  }
}
