/**
 * Input, options, scoring, and runtime-reference validation (Section 26.2.2).
 * Validation rejects by throwing TEValidationError; it never returns a partial result.
 */

import {
  COACHING_CONTINUITIES,
  DEPTH_CHART_ROLES,
  HORIZONS,
  INJURY_STATUSES,
  PRACTICE_STATUSES,
  PROSPECT_TYPES,
  ROLE_CHANGES,
} from "./constants.js";
import { TEValidationError } from "./errors.js";
import type { TEEvaluateOptions, TEHorizon, TEMVPInput } from "./types.js";

/** Rate/share fields validated to [0,1]; workload_ramp_factor is excluded (clamped instead). */
const RATE_FIELDS: readonly (keyof TEMVPInput)[] = [
  "route_participation_last4",
  "route_participation_last8",
  "snap_share_last4",
  "targets_per_route_run",
  "target_share",
  "red_zone_target_rate",
  "end_zone_target_rate",
  "catchable_target_rate",
  "catch_rate",
  "competition_pressure",
  "contract_security",
  "previous_route_participation",
  "previous_targets_per_route_run",
  "career_targets_per_route_run",
  "career_catch_rate",
  "career_red_zone_target_rate",
  "career_end_zone_target_rate",
];

/** Nullable numeric fields checked for finiteness when provided. */
const NULLABLE_NUMERIC_FIELDS: readonly (keyof TEMVPInput)[] = [
  ...RATE_FIELDS,
  "average_depth_of_target",
  "yards_per_target",
  "yards_per_reception",
  "yac_per_reception",
  "projected_team_dropbacks",
  "team_points_per_drive",
  "team_red_zone_trips_per_game",
  "qb_environment_score",
  "workload_ramp_factor",
  "career_yards_per_target",
  "career_yards_per_reception",
  "career_yac_per_reception",
];

/** Provided values that must not be negative (Section 26.2.2). */
const NON_NEGATIVE_NULLABLE_FIELDS: readonly (keyof TEMVPInput)[] = [
  "projected_team_dropbacks",
  "team_points_per_drive",
  "team_red_zone_trips_per_game",
  "yards_per_target",
  "yards_per_reception",
  "yac_per_reception",
];

const REQUIRED_BOOLEAN_FIELDS: readonly (keyof TEMVPInput)[] = [
  "teammate_return_flag",
  "another_receiving_te_flag",
  "temporary_opportunity_flag",
  "new_team_flag",
];

const DRAFT_ROUNDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Strict ISO-8601 date-time with an explicit UTC "Z" or ±HH:MM offset.
 * See TE_MVP_IMPLEMENTATION_DECISIONS.md for the chosen profile.
 */
const ISO_8601_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function fail(message: string): never {
  throw new TEValidationError(message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateOptions(options: TEEvaluateOptions | undefined): void {
  if (options === undefined) return;
  if (
    options.selected_horizon !== undefined &&
    !HORIZONS.includes(options.selected_horizon as TEHorizon)
  ) {
    fail(`selected_horizon is invalid: ${String(options.selected_horizon)}`);
  }
  if (options.model_version !== undefined) {
    if (typeof options.model_version !== "string" || options.model_version.trim().length === 0) {
      fail("model_version is empty after trimming");
    }
  }
  if (options.reference_distributions !== undefined) {
    const ref = options.reference_distributions;
    if (typeof ref !== "object" || ref === null) {
      fail("reference_distributions must be an object when provided");
    }
    const version: unknown = (ref as { reference_version?: unknown }).reference_version;
    if (typeof version !== "string" || version.trim().length === 0) {
      fail("reference_version is empty after trimming");
    }
  }
}

export function validateInput(input: TEMVPInput): void {
  if (typeof input !== "object" || input === null) {
    fail("input must be an object");
  }

  // Identity strings
  if (typeof input.player_id !== "string" || input.player_id.trim().length === 0) {
    fail("player_id is empty after trimming");
  }
  if (typeof input.player_name !== "string" || input.player_name.trim().length === 0) {
    fail("player_name is empty after trimming");
  }
  if (input.team !== null && typeof input.team !== "string") {
    fail("team must be a string or null");
  }

  // Age
  if (!isFiniteNumber(input.age) || !Number.isInteger(input.age)) {
    fail("age must be a finite integer");
  }
  if (input.age < 18 || input.age > 45) {
    fail(`age is outside [18,45]: ${input.age}`);
  }

  // Seasons / career exposure
  if (
    !isFiniteNumber(input.nfl_seasons_completed) ||
    !Number.isInteger(input.nfl_seasons_completed) ||
    input.nfl_seasons_completed < 0
  ) {
    fail("nfl_seasons_completed must be a non-negative integer");
  }
  for (const field of ["career_routes", "career_targets"] as const) {
    const value = input[field];
    if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 0) {
      fail(`${field} must be a non-negative integer`);
    }
  }

  // Expected games remaining (fractional allowed)
  if (!isFiniteNumber(input.expected_games_remaining) || input.expected_games_remaining < 0) {
    fail("expected_games_remaining must be a finite non-negative number");
  }

  // Draft round
  if (input.draft_round !== null && !DRAFT_ROUNDS.includes(input.draft_round)) {
    fail(`draft_round is invalid: ${String(input.draft_round)}`);
  }

  // Enums
  if (!PROSPECT_TYPES.includes(input.prospect_type)) {
    fail(`prospect_type is invalid: ${String(input.prospect_type)}`);
  }
  if (!DEPTH_CHART_ROLES.includes(input.depth_chart_role)) {
    fail(`depth_chart_role is invalid: ${String(input.depth_chart_role)}`);
  }
  if (!ROLE_CHANGES.includes(input.role_change)) {
    fail(`role_change is invalid: ${String(input.role_change)}`);
  }
  if (!COACHING_CONTINUITIES.includes(input.coaching_continuity)) {
    fail(`coaching_continuity is invalid: ${String(input.coaching_continuity)}`);
  }
  if (!INJURY_STATUSES.includes(input.injury_status)) {
    fail(`injury_status is invalid: ${String(input.injury_status)}`);
  }
  if (!PRACTICE_STATUSES.includes(input.practice_status)) {
    fail(`practice_status is invalid: ${String(input.practice_status)}`);
  }

  // Required booleans
  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof input[field] !== "boolean") {
      fail(`${field} must be a boolean`);
    }
  }

  // Nullable numerics: finite when provided
  for (const field of NULLABLE_NUMERIC_FIELDS) {
    const value = input[field];
    if (value !== null && value !== undefined && !isFiniteNumber(value)) {
      fail(`${field} must be finite when provided`);
    }
  }

  // Rates/shares in [0,1] when provided (workload_ramp_factor excluded)
  for (const field of RATE_FIELDS) {
    const value = input[field];
    if (value !== null && value !== undefined && isFiniteNumber(value)) {
      if (value < 0 || value > 1) {
        fail(`${field} is outside [0,1]: ${value}`);
      }
    }
  }

  // QB environment score in [0,100] when provided
  if (
    input.qb_environment_score !== null &&
    input.qb_environment_score !== undefined &&
    (input.qb_environment_score < 0 || input.qb_environment_score > 100)
  ) {
    fail(`qb_environment_score is outside [0,100]: ${input.qb_environment_score}`);
  }

  // Provided non-negative fields
  for (const field of NON_NEGATIVE_NULLABLE_FIELDS) {
    const value = input[field];
    if (value !== null && value !== undefined && isFiniteNumber(value) && value < 0) {
      fail(`${field} must not be negative: ${value}`);
    }
  }

  // Scoring
  if (input.scoring !== undefined) {
    const scoring = input.scoring;
    if (typeof scoring !== "object" || scoring === null) {
      fail("scoring must be an object when provided");
    }
    for (const field of [
      "points_per_reception",
      "points_per_receiving_yard",
      "points_per_receiving_td",
    ] as const) {
      const value = scoring[field];
      if (!isFiniteNumber(value) || value < 0) {
        fail(`scoring.${field} must be a finite non-negative number`);
      }
    }
  }

  // Timestamp
  if (
    typeof input.as_of_timestamp !== "string" ||
    !ISO_8601_TIMESTAMP.test(input.as_of_timestamp) ||
    !Number.isFinite(Date.parse(input.as_of_timestamp))
  ) {
    fail(`as_of_timestamp is not a valid ISO-8601 timestamp: ${String(input.as_of_timestamp)}`);
  }
}
