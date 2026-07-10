// Input validation (§26.2.2; §26.14 step 1). A validation failure THROWS a typed
// RBValidationError — the engine never returns a fabricated projection for invalid
// input. Reject rather than return a partial calculation.

import { isFiniteNumber } from '@/rb-model/math';
import type {
  CoachingContinuity,
  Horizon,
  InjuryStatus,
  PracticeStatus,
  RBMVPInput,
  RoleChange,
} from '@/rb-model/types';

export class RBValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`RB input validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'RBValidationError';
  }
}

const INJURY_VALUES: InjuryStatus[] = [
  'HEALTHY',
  'QUESTIONABLE',
  'DOUBTFUL',
  'OUT',
  'IR',
  'PUP',
  'SUSPENDED',
  'UNKNOWN',
];
const PRACTICE_VALUES: PracticeStatus[] = ['FULL', 'LIMITED', 'DNP', 'UNKNOWN'];
const ROLE_VALUES: RoleChange[] = ['PROMOTED', 'DEMOTED', 'STABLE', 'UNKNOWN'];
const COACHING_VALUES: CoachingContinuity[] = ['CONTINUITY', 'CHANGE', 'UNKNOWN'];
const HORIZON_VALUES: Horizon[] = ['WEEKLY', 'ROS', 'ONE_YEAR', 'THREE_YEAR', 'DYNASTY'];
const DRAFT_ROUNDS = new Set([1, 2, 3, 4, 5, 6, 7]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Fields that must be present and valid — else reject (§26.2.2). */
export function validateInput(input: RBMVPInput, selectedHorizon?: string): void {
  const issues: string[] = [];
  const req = (cond: boolean, msg: string) => {
    if (!cond) issues.push(msg);
  };

  // Identity.
  req(typeof input.player_id === 'string' && input.player_id.length > 0, 'player_id is required');
  req(
    typeof input.player_name === 'string' && input.player_name.length > 0,
    'player_name is required',
  );

  // Age missing / non-finite / < 18.
  req(isFiniteNumber(input.age) && input.age >= 18, 'age is required, finite, and at least 18');

  // expected_games_remaining missing / non-finite / negative.
  req(
    isFiniteNumber(input.expected_games_remaining) && input.expected_games_remaining >= 0,
    'expected_games_remaining is required, finite, and non-negative',
  );

  // Career exposure: missing / non-finite / negative.
  for (const key of ['career_touches', 'career_carries', 'career_routes'] as const) {
    req(
      isFiniteNumber(input[key]) && input[key] >= 0,
      `${key} is required, finite, and non-negative`,
    );
  }

  // Timestamp must be ISO-8601.
  req(
    typeof input.as_of_timestamp === 'string' && ISO.test(input.as_of_timestamp),
    'as_of_timestamp must be a valid ISO-8601 timestamp',
  );

  // Rates/shares expected in [0,1] when present.
  const rate01: (keyof RBMVPInput)[] = [
    'snap_share_last4',
    'snap_share_last8',
    'carry_share_last4',
    'route_participation_last4',
    'targets_per_route_run',
    'target_share',
    'goal_line_carry_share',
    'red_zone_carry_share',
    'rushing_success_rate',
    'explosive_run_rate',
    'catch_rate',
    'qb_rush_pressure',
    'workload_ramp_factor',
    'contract_security',
    'competition_pressure',
    'previous_snap_share',
    'previous_carry_share',
    'previous_route_participation',
    'career_targets_per_route_run',
    'career_catch_rate',
  ];
  for (const key of rate01) {
    const v = input[key] as number | null | undefined;
    if (v !== null && v !== undefined) {
      if (!isFiniteNumber(v)) issues.push(`${key} must be a finite number or null`);
      else if (v < 0 || v > 1) issues.push(`${key} must be within [0,1]`);
    }
  }

  // Remaining nullable numerics: finite-or-null (non-rate, may exceed 1).
  const finiteOrNull: (keyof RBMVPInput)[] = [
    'yards_per_carry',
    'receiving_yards_per_reception',
    'projected_team_non_qb_rush_attempts',
    'projected_team_dropbacks',
    'team_points_per_drive',
    'team_red_zone_trips_per_game',
    'career_yards_per_carry',
    'career_receiving_yards_per_reception',
  ];
  for (const key of finiteOrNull) {
    const v = input[key] as number | null | undefined;
    if (v !== null && v !== undefined && !isFiniteNumber(v)) {
      issues.push(`${key} must be a finite number or null`);
    }
  }
  // Non-rate numerics must be non-negative when present.
  for (const key of finiteOrNull) {
    const v = input[key] as number | null | undefined;
    if (isFiniteNumber(v) && v < 0) issues.push(`${key} must be non-negative`);
  }

  // Required normalized booleans cannot be null/undefined.
  for (const key of [
    'teammate_return_flag',
    'incoming_competition_flag',
    'high_recent_workload_flag',
  ] as const) {
    if (typeof input[key] !== 'boolean') issues.push(`${key} must be a boolean`);
  }

  // Enums.
  req(INJURY_VALUES.includes(input.injury_status), `invalid injury_status: ${input.injury_status}`);
  req(
    PRACTICE_VALUES.includes(input.practice_status),
    `invalid practice_status: ${input.practice_status}`,
  );
  req(ROLE_VALUES.includes(input.role_change), `invalid role_change: ${input.role_change}`);
  req(
    COACHING_VALUES.includes(input.coaching_continuity),
    `invalid coaching_continuity: ${input.coaching_continuity}`,
  );
  req(
    input.draft_round === null || DRAFT_ROUNDS.has(input.draft_round),
    `invalid draft_round: ${input.draft_round}`,
  );

  // nfl_seasons_completed finite + non-negative.
  req(
    isFiniteNumber(input.nfl_seasons_completed) && input.nfl_seasons_completed >= 0,
    'nfl_seasons_completed must be a finite non-negative number',
  );

  // Scoring vector, if supplied, must be non-negative finite.
  if (input.scoring) {
    for (const [k, v] of Object.entries(input.scoring)) {
      if (!isFiniteNumber(v) || v < 0) {
        issues.push(`scoring.${k} must be a non-negative finite number`);
      }
    }
  }

  // selected_horizon outside the declared enum.
  if (selectedHorizon !== undefined && !HORIZON_VALUES.includes(selectedHorizon as Horizon)) {
    issues.push(`invalid selected_horizon: ${selectedHorizon}`);
  }

  if (issues.length > 0) throw new RBValidationError(issues);
}
