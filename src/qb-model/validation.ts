/**
 * Exact input, timestamp, options, and scoring validation (Sections 26.1, 26.2.3,
 * 26.2.4). Reject invalid data; never silently clamp or default around it.
 */

import {
  DEPTH_CHART_STATUSES,
  HORIZONS,
  INACTIVE_INJURY_STATUSES,
  INJURY_STATUSES,
  ROLE_STATUSES,
  SCORING_KEYS,
  SCORING_RANGES,
} from "./constants.js";
import { QBValidationError } from "./errors.js";
import { validateCustomReference } from "./references.js";
import type {
  QBEvaluatorOptions,
  QBInjuryStatus,
  QBMVPInput,
  QBScoring,
} from "./types.js";

/** All allowed top-level input property names (Section 26.3). */
const INPUT_KEYS: readonly string[] = [
  "player_id",
  "player_name",
  "team",
  "as_of",
  "age",
  "nfl_seasons_completed",
  "draft_round",
  "career_games_played",
  "career_starts",
  "career_pass_attempts",
  "career_rush_attempts",
  "recent_games",
  "recent_starts",
  "recent_pass_attempts",
  "recent_completions",
  "recent_passing_yards",
  "recent_passing_tds",
  "recent_interceptions",
  "recent_sacks",
  "recent_rush_attempts",
  "recent_rushing_yards",
  "recent_rushing_tds",
  "designed_rush_attempts",
  "scrambles",
  "goal_line_rush_attempts",
  "adjusted_yards_per_attempt",
  "completion_percentage_over_expected",
  "explosive_pass_rate",
  "team_dropback_share",
  "expected_active_game_pass_attempts",
  "expected_active_game_designed_rush_attempts",
  "expected_active_game_scrambles",
  "expected_active_game_goal_line_rush_attempts",
  "offensive_environment_score",
  "protection_context_score",
  "depth_chart_status",
  "role_status",
  "competition_pressure",
  "organizational_commitment",
  "probability_active",
  "injury_status",
  "expected_games_remaining",
  "expected_games_limited",
  "team_change",
  "major_system_change",
  "recent_role_change",
  "prior_recent_pass_attempts",
  "prior_adjusted_yards_per_attempt",
  "prior_interception_rate",
  "prior_rush_attempts_per_start",
];

const OPTION_KEYS: readonly string[] = [
  "selected_horizon",
  "scoring",
  "reference_distributions",
  "model_version",
  "generated_at",
];

/** ISO-8601 timestamp requiring explicit timezone (Z or numeric UTC offset). */
const ISO_TZ_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/;

export function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!ISO_TZ_RE.test(value)) return false;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms);
}

function requireFiniteNumber(field: string, value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new QBValidationError(`${field} must be a finite number`);
  }
  return value;
}

function requireNonNegative(field: string, value: unknown): number {
  const n = requireFiniteNumber(field, value);
  if (n < 0) throw new QBValidationError(`${field} must not be negative`);
  return n;
}

function requireUnit(field: string, value: unknown): number {
  const n = requireFiniteNumber(field, value);
  if (n < 0 || n > 1) throw new QBValidationError(`${field} must be within [0,1]`);
  return n;
}

function requireScore(field: string, value: unknown): number {
  const n = requireFiniteNumber(field, value);
  if (n < 0 || n > 100) throw new QBValidationError(`${field} must be within [0,100]`);
  return n;
}

function requireBoolean(field: string, value: unknown): void {
  if (typeof value !== "boolean") {
    throw new QBValidationError(`${field} must be a boolean`);
  }
}

/** Nullable numeric field with a custom per-value check. */
function nullableNumber(
  field: string,
  value: unknown,
  check: (field: string, v: unknown) => number
): number | null {
  if (value === null) return null;
  return check(field, value);
}

export function validateInput(input: unknown): asserts input is QBMVPInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new QBValidationError("input must be a non-null object");
  }
  const rec = input as Record<string, unknown>;

  // Unknown property rejection (Section 26.2.3).
  const allowed = new Set(INPUT_KEYS);
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) {
      throw new QBValidationError(`unknown input property: ${key}`);
    }
  }
  // Required-field presence.
  for (const key of INPUT_KEYS) {
    if (!(key in rec)) {
      throw new QBValidationError(`missing required input field: ${key}`);
    }
  }

  // Identity strings.
  if (typeof rec.player_id !== "string" || rec.player_id.trim().length === 0) {
    throw new QBValidationError("player_id must be a non-empty string");
  }
  if (typeof rec.player_name !== "string" || rec.player_name.trim().length === 0) {
    throw new QBValidationError("player_name must be a non-empty string");
  }
  if (rec.team !== null && typeof rec.team !== "string") {
    throw new QBValidationError("team must be null or a string");
  }
  if (typeof rec.as_of !== "string") {
    throw new QBValidationError("as_of must be a string");
  }
  if (!isValidTimestamp(rec.as_of)) {
    throw new QBValidationError("as_of must be an ISO-8601 timestamp with timezone");
  }

  // Age and career-stage.
  const age = requireFiniteNumber("age", rec.age);
  if (age < 20 || age > 50) throw new QBValidationError("age must be within [20,50]");
  const seasons = requireFiniteNumber("nfl_seasons_completed", rec.nfl_seasons_completed);
  if (seasons < 0) throw new QBValidationError("nfl_seasons_completed must not be negative");
  if (
    rec.draft_round !== null &&
    !(
      typeof rec.draft_round === "number" &&
      Number.isInteger(rec.draft_round) &&
      rec.draft_round >= 1 &&
      rec.draft_round <= 7
    )
  ) {
    throw new QBValidationError("draft_round must be 1..7 or null");
  }

  // Career counts.
  const careerGames = requireNonNegative("career_games_played", rec.career_games_played);
  const careerStarts = requireNonNegative("career_starts", rec.career_starts);
  requireNonNegative("career_pass_attempts", rec.career_pass_attempts);
  requireNonNegative("career_rush_attempts", rec.career_rush_attempts);
  if (careerStarts > careerGames) {
    throw new QBValidationError("career_starts must not exceed career_games_played");
  }

  // Recent window counts.
  const recentGames = requireNonNegative("recent_games", rec.recent_games);
  if (recentGames > 8) throw new QBValidationError("recent_games must be within [0,8]");
  const recentStarts = requireNonNegative("recent_starts", rec.recent_starts);
  if (recentStarts > recentGames) {
    throw new QBValidationError("recent_starts must not exceed recent_games");
  }
  const recentPass = requireNonNegative("recent_pass_attempts", rec.recent_pass_attempts);
  if (recentPass > 1000) throw new QBValidationError("recent_pass_attempts must not exceed 1000");
  const recentComp = requireNonNegative("recent_completions", rec.recent_completions);
  if (recentComp > recentPass) {
    throw new QBValidationError("recent_completions must not exceed recent_pass_attempts");
  }
  // Negative passing/rushing yards are permitted (Section 26.2.3).
  requireFiniteNumber("recent_passing_yards", rec.recent_passing_yards);
  const recentPassTds = requireNonNegative("recent_passing_tds", rec.recent_passing_tds);
  if (recentPassTds > recentPass) {
    throw new QBValidationError("recent_passing_tds must not exceed recent_pass_attempts");
  }
  const recentInts = requireNonNegative("recent_interceptions", rec.recent_interceptions);
  if (recentInts > recentPass) {
    throw new QBValidationError("recent_interceptions must not exceed recent_pass_attempts");
  }
  if (recentPassTds + recentInts > recentPass) {
    throw new QBValidationError(
      "recent_passing_tds + recent_interceptions must not exceed recent_pass_attempts"
    );
  }
  requireNonNegative("recent_sacks", rec.recent_sacks);
  const recentRush = requireNonNegative("recent_rush_attempts", rec.recent_rush_attempts);
  requireFiniteNumber("recent_rushing_yards", rec.recent_rushing_yards);
  requireNonNegative("recent_rushing_tds", rec.recent_rushing_tds);

  // Rushing decomposition (nullable, bounded by recent_rush_attempts).
  const designed = nullableNumber(
    "designed_rush_attempts",
    rec.designed_rush_attempts,
    requireNonNegative
  );
  if (designed !== null && designed > recentRush) {
    throw new QBValidationError("designed_rush_attempts must not exceed recent_rush_attempts");
  }
  const scrambles = nullableNumber("scrambles", rec.scrambles, requireNonNegative);
  if (scrambles !== null && scrambles > recentRush) {
    throw new QBValidationError("scrambles must not exceed recent_rush_attempts");
  }
  const goalLine = nullableNumber(
    "goal_line_rush_attempts",
    rec.goal_line_rush_attempts,
    requireNonNegative
  );
  if (goalLine !== null && goalLine > recentRush) {
    throw new QBValidationError("goal_line_rush_attempts must not exceed recent_rush_attempts");
  }
  if (designed !== null && scrambles !== null && designed + scrambles > recentRush) {
    throw new QBValidationError(
      "designed_rush_attempts + scrambles must not exceed recent_rush_attempts"
    );
  }

  // Passing-quality signals (nullable).
  nullableNumber("adjusted_yards_per_attempt", rec.adjusted_yards_per_attempt, requireFiniteNumber);
  nullableNumber(
    "completion_percentage_over_expected",
    rec.completion_percentage_over_expected,
    requireFiniteNumber
  );
  nullableNumber("explosive_pass_rate", rec.explosive_pass_rate, requireUnit);

  // Volume signals (nullable).
  nullableNumber("team_dropback_share", rec.team_dropback_share, requireUnit);
  nullableNumber(
    "expected_active_game_pass_attempts",
    rec.expected_active_game_pass_attempts,
    requireNonNegative
  );
  const expDesigned = nullableNumber(
    "expected_active_game_designed_rush_attempts",
    rec.expected_active_game_designed_rush_attempts,
    requireNonNegative
  );
  const expScrambles = nullableNumber(
    "expected_active_game_scrambles",
    rec.expected_active_game_scrambles,
    requireNonNegative
  );
  const expGoalLine = nullableNumber(
    "expected_active_game_goal_line_rush_attempts",
    rec.expected_active_game_goal_line_rush_attempts,
    requireNonNegative
  );
  if (
    expGoalLine !== null &&
    expDesigned !== null &&
    expScrambles !== null &&
    expGoalLine > expDesigned + expScrambles
  ) {
    throw new QBValidationError(
      "expected_active_game_goal_line_rush_attempts must not exceed expected designed + scrambles"
    );
  }

  // Context scores (nullable, 0..100).
  nullableNumber("offensive_environment_score", rec.offensive_environment_score, requireScore);
  nullableNumber("protection_context_score", rec.protection_context_score, requireScore);

  // Enums.
  if (!DEPTH_CHART_STATUSES.includes(rec.depth_chart_status as never)) {
    throw new QBValidationError("depth_chart_status is outside its enum");
  }
  if (!ROLE_STATUSES.includes(rec.role_status as never)) {
    throw new QBValidationError("role_status is outside its enum");
  }
  if (!INJURY_STATUSES.includes(rec.injury_status as never)) {
    throw new QBValidationError("injury_status is outside its enum");
  }
  const injuryStatus = rec.injury_status as QBInjuryStatus;

  // Role and availability (nullable).
  nullableNumber("competition_pressure", rec.competition_pressure, requireUnit);
  nullableNumber("organizational_commitment", rec.organizational_commitment, requireUnit);
  const probActive = nullableNumber("probability_active", rec.probability_active, requireUnit);
  if (
    INACTIVE_INJURY_STATUSES.includes(injuryStatus) &&
    probActive !== null &&
    probActive > 0
  ) {
    throw new QBValidationError(
      "probability_active must be 0 when injury_status is OUT, IR, or PUP"
    );
  }

  const gamesRemaining = requireNonNegative("expected_games_remaining", rec.expected_games_remaining);
  if (gamesRemaining > 21) {
    throw new QBValidationError("expected_games_remaining must be within [0,21]");
  }
  const gamesLimited = nullableNumber(
    "expected_games_limited",
    rec.expected_games_limited,
    requireNonNegative
  );
  if (gamesLimited !== null && gamesLimited > gamesRemaining) {
    throw new QBValidationError("expected_games_limited must not exceed expected_games_remaining");
  }

  // Boolean flags.
  requireBoolean("team_change", rec.team_change);
  requireBoolean("major_system_change", rec.major_system_change);
  requireBoolean("recent_role_change", rec.recent_role_change);

  // Prior-window fields (nullable).
  nullableNumber("prior_recent_pass_attempts", rec.prior_recent_pass_attempts, requireNonNegative);
  nullableNumber(
    "prior_adjusted_yards_per_attempt",
    rec.prior_adjusted_yards_per_attempt,
    requireFiniteNumber
  );
  nullableNumber("prior_interception_rate", rec.prior_interception_rate, requireUnit);
  nullableNumber(
    "prior_rush_attempts_per_start",
    rec.prior_rush_attempts_per_start,
    requireNonNegative
  );
}

/** Validate scoring overrides and merge with defaults (Section 26.2.4). */
export function validateAndMergeScoring(
  override: Partial<QBScoring> | undefined,
  defaults: Readonly<QBScoring>
): QBScoring {
  const merged: QBScoring = { ...defaults };
  if (override === undefined) return merged;
  if (typeof override !== "object" || override === null || Array.isArray(override)) {
    throw new QBValidationError("scoring must be a non-null object");
  }
  const rec = override as Record<string, unknown>;
  const allowed = new Set<string>(SCORING_KEYS as readonly string[]);
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) {
      throw new QBValidationError(`scoring has unknown key: ${key}`);
    }
  }
  for (const key of SCORING_KEYS) {
    if (!(key in rec)) continue;
    const value = rec[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new QBValidationError(`scoring.${key} must be finite`);
    }
    const [lo, hi] = SCORING_RANGES[key];
    if (value < lo || value > hi) {
      throw new QBValidationError(`scoring.${key} must be within [${lo},${hi}]`);
    }
    merged[key] = value;
  }
  return merged;
}

/**
 * Validate runtime options (Section 26.1). Scoring and reference_distributions are
 * validated separately; this enforces the shape, unknown-key, and per-option rules.
 */
export function validateOptions(options: QBEvaluatorOptions | undefined): void {
  if (options === undefined) return;
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new QBValidationError("options must be a non-null object");
  }
  const rec = options as Record<string, unknown>;
  const allowed = new Set(OPTION_KEYS);
  for (const key of Object.keys(rec)) {
    if (!allowed.has(key)) {
      throw new QBValidationError(`unknown option key: ${key}`);
    }
  }
  if ("selected_horizon" in rec && rec.selected_horizon !== undefined) {
    if (!HORIZONS.includes(rec.selected_horizon as never)) {
      throw new QBValidationError("selected_horizon is not a declared QBHorizon");
    }
  }
  if ("model_version" in rec && rec.model_version !== undefined) {
    if (typeof rec.model_version !== "string" || rec.model_version.trim().length < 1) {
      throw new QBValidationError("model_version must be a non-empty string after trimming");
    }
  }
  if ("generated_at" in rec && rec.generated_at !== undefined) {
    if (!isValidTimestamp(rec.generated_at)) {
      throw new QBValidationError("generated_at must be an ISO-8601 timestamp with timezone");
    }
  }
  if ("reference_distributions" in rec && rec.reference_distributions !== undefined) {
    validateCustomReference(rec.reference_distributions);
  }
  // scoring is validated by validateAndMergeScoring.
}
