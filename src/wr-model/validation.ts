// Input validation (§5 of the implementation prompt; §26.14 step 1). A
// validation failure THROWS a typed WRValidationError — the engine never returns
// a fabricated projection for invalid input (§5.5).

import { isFiniteNumber } from '@/wr-model/math';
import type {
  InjuryStatus,
  PracticeStatus,
  RouteRoleChange,
  WRMVPInput,
} from '@/wr-model/types';

export class WRValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`WR input validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'WRValidationError';
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
const ROLE_VALUES: RouteRoleChange[] = ['PROMOTED', 'DEMOTED', 'STABLE', 'UNKNOWN'];
const DRAFT_ROUNDS = new Set([1, 2, 3, 4, 5, 6, 7]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Fields that must be present and valid — else reject (§5.4). */
export function validateInput(input: WRMVPInput): void {
  const issues: string[] = [];
  const req = (cond: boolean, msg: string) => {
    if (!cond) issues.push(msg);
  };

  // Hard-required identity/availability fields (§5.4, §26.5 continuation rule).
  req(typeof input.player_id === 'string' && input.player_id.length > 0, 'player_id is required');
  req(
    typeof input.player_name === 'string' && input.player_name.length > 0,
    'player_name is required',
  );
  req(isFiniteNumber(input.age), 'age is required and must be finite');
  req(
    isFiniteNumber(input.expected_games_remaining),
    'expected_games_remaining is required and must be finite',
  );
  req(
    typeof input.as_of_timestamp === 'string' && ISO.test(input.as_of_timestamp),
    'as_of_timestamp is required and must be an ISO timestamp',
  );

  // Range / sign rules (§5.4).
  req(!isFiniteNumber(input.career_routes) || input.career_routes >= 0, 'career_routes must be ≥ 0');
  req(
    !isFiniteNumber(input.expected_games_remaining) || input.expected_games_remaining >= 0,
    'expected_games_remaining must be ≥ 0',
  );

  // Rates must be within 0–1 when present (CROE is exempt — it is a signed
  // decimal deviation, §26.3).
  const rate01: [keyof WRMVPInput, string][] = [
    ['route_participation_last4', 'route_participation_last4'],
    ['route_participation_last8', 'route_participation_last8'],
    ['targets_per_route_run', 'targets_per_route_run'],
    ['target_share', 'target_share'],
    ['expected_td_rate_per_target', 'expected_td_rate_per_target'],
    ['contract_security', 'contract_security'],
    ['competition_pressure', 'competition_pressure'],
    ['previous_route_participation', 'previous_route_participation'],
    ['previous_targets_per_route_run', 'previous_targets_per_route_run'],
    ['career_targets_per_route_run', 'career_targets_per_route_run'],
  ];
  for (const [key, label] of rate01) {
    const v = input[key];
    if (v !== null && v !== undefined) {
      if (!isFiniteNumber(v)) issues.push(`${label} must be a finite number or null`);
      else if (v < 0 || v > 1) issues.push(`${label} must be within [0,1]`);
    }
  }

  // Non-finite guards for the remaining nullable numerics.
  const finiteOrNull: [keyof WRMVPInput, string][] = [
    ['projected_team_dropbacks', 'projected_team_dropbacks'],
    ['expected_fantasy_points_per_target', 'expected_fantasy_points_per_target'],
    ['catch_rate_over_expected', 'catch_rate_over_expected'],
    ['depth_adjusted_yards_per_target', 'depth_adjusted_yards_per_target'],
    ['average_depth_of_target', 'average_depth_of_target'],
    ['qb_environment_score', 'qb_environment_score'],
    ['team_points_per_drive', 'team_points_per_drive'],
    ['career_expected_fantasy_points_per_target', 'career_expected_fantasy_points_per_target'],
  ];
  for (const [key, label] of finiteOrNull) {
    const v = input[key];
    if (v !== null && v !== undefined && !isFiniteNumber(v)) {
      issues.push(`${label} must be a finite number or null`);
    }
  }

  // Enums.
  req(INJURY_VALUES.includes(input.injury_status), `invalid injury_status: ${input.injury_status}`);
  req(
    PRACTICE_VALUES.includes(input.practice_status),
    `invalid practice_status: ${input.practice_status}`,
  );
  req(ROLE_VALUES.includes(input.route_role_change), `invalid route_role_change`);
  req(
    input.draft_round === null || DRAFT_ROUNDS.has(input.draft_round),
    `invalid draft_round: ${input.draft_round}`,
  );

  // Scoring vector, if supplied, must be non-negative finite (§5.4).
  if (input.scoring) {
    const s = input.scoring;
    for (const [k, v] of Object.entries(s)) {
      if (!isFiniteNumber(v) || v < 0) issues.push(`scoring.${k} must be a non-negative finite number`);
    }
  }

  if (issues.length > 0) throw new WRValidationError(issues);
}
