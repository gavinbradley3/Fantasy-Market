/**
 * Exact fallback resolution (Section 26.5) in the binding dependency order of
 * Section 26.5.3. Each nullable field uses its supplied value or the exact documented
 * fallback; each fallback code is appended at most once. No missing value silently
 * becomes zero.
 */

import {
  ACTIVE_PROBABILITY_BY_INJURY,
  COMPETITION_PRESSURE_BY_ROLE,
  DRAFT_COMMITMENT_BY_ROUND,
  DRAFT_COMMITMENT_UNDRAFTED,
  DROPBACK_SHARE_BY_DEPTH,
  EXPECTED_PASS_ATTEMPTS_BY_ROLE,
  LIMITED_GAMES_CAP_BY_INJURY,
  ROLE_COMMITMENT_BY_ROLE,
} from "./constants.js";
import type { QBMVPInput, QBResolvedValues } from "./types.js";

export interface FallbackResolution {
  resolved: QBResolvedValues;
  /** Raw fallback codes in application order (de-duplicated + sorted downstream). */
  codes: string[];
}

export function resolveFallbacks(input: QBMVPInput): FallbackResolution {
  const codes: string[] = [];
  const add = (code: string): void => {
    codes.push(code);
  };

  const recentRush = input.recent_rush_attempts;
  const recentPass = input.recent_pass_attempts;
  const starts = input.recent_starts;

  // 1. scrambles
  let scrambles: number;
  if (input.scrambles !== null) {
    scrambles = input.scrambles;
  } else {
    scrambles = 0.45 * recentRush;
    add("SCRAMBLES_FROM_RUSH_SHARE");
  }

  // 2. designed_rush_attempts
  let designed: number;
  if (input.designed_rush_attempts !== null) {
    designed = input.designed_rush_attempts;
  } else {
    designed = Math.max(0, recentRush - scrambles);
    add("DESIGNED_RUSH_FROM_TOTAL_MINUS_SCRAMBLES");
  }

  // 3. goal_line_rush_attempts
  let goalLine: number;
  if (input.goal_line_rush_attempts !== null) {
    goalLine = input.goal_line_rush_attempts;
  } else {
    goalLine = 0.1 * recentRush;
    add("GOAL_LINE_RUSH_FROM_TOTAL");
  }

  // 4. adjusted_yards_per_attempt
  let aypa: number;
  if (input.adjusted_yards_per_attempt !== null) {
    aypa = input.adjusted_yards_per_attempt;
  } else if (recentPass > 0) {
    aypa =
      (input.recent_passing_yards +
        20 * input.recent_passing_tds -
        45 * input.recent_interceptions) /
      recentPass;
    add("AYPA_DERIVED");
  } else {
    aypa = 6.8;
    add("AYPA_PRIOR");
  }

  // 5. completion_percentage_over_expected pathway flag
  const cpoeSupplied = input.completion_percentage_over_expected !== null;
  if (!cpoeSupplied) {
    add("CPOE_TO_COMPLETION_RATE");
  }

  // 6. explosive_pass_rate
  let explosive: number;
  if (input.explosive_pass_rate !== null) {
    explosive = input.explosive_pass_rate;
  } else {
    explosive = 0.1;
    add("EXPLOSIVE_PASS_RATE_PRIOR");
  }

  // 7. team_dropback_share
  let dropbackShare: number;
  if (input.team_dropback_share !== null) {
    dropbackShare = input.team_dropback_share;
  } else {
    dropbackShare = DROPBACK_SHARE_BY_DEPTH[input.depth_chart_status];
    add("DROPBACK_SHARE_FROM_DEPTH_CHART");
  }

  // 8. expected_active_game_pass_attempts
  let expPassAttempts: number;
  if (input.expected_active_game_pass_attempts !== null) {
    expPassAttempts = input.expected_active_game_pass_attempts;
  } else if (starts > 0) {
    expPassAttempts = recentPass / starts;
    add("PASS_ATTEMPTS_FROM_RECENT_STARTS");
  } else {
    expPassAttempts = EXPECTED_PASS_ATTEMPTS_BY_ROLE[input.role_status];
    add("PASS_ATTEMPTS_FROM_ROLE");
  }

  // 9. expected_active_game_designed_rush_attempts
  let expDesigned: number;
  if (input.expected_active_game_designed_rush_attempts !== null) {
    expDesigned = input.expected_active_game_designed_rush_attempts;
  } else if (starts > 0) {
    expDesigned = designed / starts;
    add("EXPECTED_DESIGNED_RUSH_FALLBACK");
  } else {
    expDesigned = 1.5;
    add("EXPECTED_DESIGNED_RUSH_FALLBACK");
  }

  // 10. expected_active_game_scrambles
  let expScrambles: number;
  if (input.expected_active_game_scrambles !== null) {
    expScrambles = input.expected_active_game_scrambles;
  } else if (starts > 0) {
    expScrambles = scrambles / starts;
    add("EXPECTED_SCRAMBLES_FALLBACK");
  } else {
    expScrambles = 1.8;
    add("EXPECTED_SCRAMBLES_FALLBACK");
  }

  // 11. expected_active_game_goal_line_rush_attempts
  let expGoalLine: number;
  if (input.expected_active_game_goal_line_rush_attempts !== null) {
    expGoalLine = input.expected_active_game_goal_line_rush_attempts;
  } else if (starts > 0) {
    expGoalLine = goalLine / starts;
    add("EXPECTED_GOAL_LINE_RUSH_FALLBACK");
  } else {
    expGoalLine = 0.25;
    add("EXPECTED_GOAL_LINE_RUSH_FALLBACK");
  }

  // 12. offensive_environment_score
  let offEnv: number;
  if (input.offensive_environment_score !== null) {
    offEnv = input.offensive_environment_score;
  } else {
    offEnv = 50;
    add("OFFENSIVE_ENVIRONMENT_NEUTRAL");
  }

  // 13. protection_context_score
  let protection: number;
  if (input.protection_context_score !== null) {
    protection = input.protection_context_score;
  } else {
    protection = 50;
    add("PROTECTION_CONTEXT_NEUTRAL");
  }

  // 14. competition_pressure
  let competition: number;
  if (input.competition_pressure !== null) {
    competition = input.competition_pressure;
  } else {
    competition = COMPETITION_PRESSURE_BY_ROLE[input.role_status];
    add("COMPETITION_FROM_ROLE");
  }

  // 15. organizational_commitment
  let orgCommitment: number;
  if (input.organizational_commitment !== null) {
    orgCommitment = input.organizational_commitment;
  } else {
    const draftCommitment =
      input.draft_round === null
        ? DRAFT_COMMITMENT_UNDRAFTED
        : (DRAFT_COMMITMENT_BY_ROUND[input.draft_round] ?? DRAFT_COMMITMENT_UNDRAFTED);
    const roleCommitment = ROLE_COMMITMENT_BY_ROLE[input.role_status];
    orgCommitment = 0.65 * roleCommitment + 0.35 * draftCommitment;
    add("COMMITMENT_FROM_ROLE_DRAFT");
  }

  // 16. probability_active
  let probActive: number;
  if (input.probability_active !== null) {
    probActive = input.probability_active;
  } else {
    probActive = ACTIVE_PROBABILITY_BY_INJURY[input.injury_status];
    add("ACTIVE_PROBABILITY_FROM_INJURY");
  }

  // 17. expected_games_limited
  let gamesLimited: number;
  if (input.expected_games_limited !== null) {
    gamesLimited = input.expected_games_limited;
  } else {
    gamesLimited = Math.min(
      LIMITED_GAMES_CAP_BY_INJURY[input.injury_status],
      input.expected_games_remaining
    );
    add("LIMITED_GAMES_FROM_INJURY");
  }

  const resolved: QBResolvedValues = {
    scrambles,
    designed_rush_attempts: designed,
    goal_line_rush_attempts: goalLine,
    adjusted_yards_per_attempt: aypa,
    cpoe_supplied: cpoeSupplied,
    explosive_pass_rate: explosive,
    team_dropback_share: dropbackShare,
    expected_active_game_pass_attempts: expPassAttempts,
    expected_active_game_designed_rush_attempts: expDesigned,
    expected_active_game_scrambles: expScrambles,
    expected_active_game_goal_line_rush_attempts: expGoalLine,
    offensive_environment_score: offEnv,
    protection_context_score: protection,
    competition_pressure: competition,
    organizational_commitment: orgCommitment,
    probability_active: probActive,
    expected_games_limited: gamesLimited,
  };

  return { resolved, codes };
}
