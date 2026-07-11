/**
 * Weekly and ROS Expected Fantasy Output (Section 26.10). EFO is computed from expected
 * statistics only, never from component scores. Role Security is never multiplied into
 * EFO; probability_active is applied exactly once to Weekly EFO.
 */

import {
  FUTURE_HEALTHY_ACTIVE_PROBABILITY_BY_ROLE,
  INACTIVE_INJURY_STATUSES,
  LIMITED_WORKLOAD_FACTOR_BY_INJURY,
} from "./constants.js";
import { clamp, shrink } from "./math.js";
import type {
  QBActiveGameProjection,
  QBMVPInput,
  QBResolvedValues,
  QBScoring,
  QBShrunkValues,
} from "./types.js";

export interface QBProjections {
  conditional: QBActiveGameProjection;
  probability_active: number;
  weekly_fantasy_points: number;
  ros_fantasy_points: number;
  expected_games_remaining: number;
  expected_games_limited: number;
}

export function computeProjections(
  input: QBMVPInput,
  resolved: QBResolvedValues,
  shrunk: QBShrunkValues,
  scoring: QBScoring
): QBProjections {
  const rpa = input.recent_pass_attempts;

  // 26.10.2 Conditional-on-active passing expectations.
  const expected_pass_attempts = resolved.expected_active_game_pass_attempts;

  let expected_completion_rate: number;
  if (resolved.cpoe_supplied) {
    const baseline_completion_rate = rpa > 0 ? input.recent_completions / rpa : 0.64;
    const completion_quality_value = shrunk.completion_quality_value as number;
    expected_completion_rate = clamp(
      0.7 * baseline_completion_rate + 0.3 * (0.64 + completion_quality_value),
      0.45,
      0.8
    );
  } else {
    expected_completion_rate = clamp(shrunk.completion_rate_shrunk as number, 0.45, 0.8);
  }
  const expected_completions = expected_pass_attempts * expected_completion_rate;

  const expected_yards_per_attempt = clamp(
    0.7 * shrunk.passing_yards_per_attempt_shrunk + 0.3 * 6.9,
    4.0,
    10.5
  );
  const expected_passing_yards = expected_pass_attempts * expected_yards_per_attempt;

  const environment_td_modifier = 0.8 + 0.4 * (resolved.offensive_environment_score / 100);
  const expected_passing_td_rate = clamp(
    (0.65 * shrunk.passing_td_rate_shrunk + 0.35 * 0.045) * environment_td_modifier,
    0.015,
    0.09
  );
  const expected_passing_tds = expected_pass_attempts * expected_passing_td_rate;

  const expected_interception_rate = clamp(
    0.75 * shrunk.interception_rate_shrunk + 0.25 * 0.025,
    0.005,
    0.06
  );
  const expected_interceptions = expected_pass_attempts * expected_interception_rate;

  // 26.10.3 Conditional-on-active rushing expectations.
  const expected_designed_rush_attempts = resolved.expected_active_game_designed_rush_attempts;
  const expected_scrambles = resolved.expected_active_game_scrambles;
  const expected_total_rush_attempts = expected_designed_rush_attempts + expected_scrambles;

  const observed_rush_yards_per_attempt =
    input.recent_rush_attempts > 0
      ? input.recent_rushing_yards / input.recent_rush_attempts
      : 4.5;
  const expected_rush_yards_per_attempt = clamp(
    shrink(observed_rush_yards_per_attempt, input.recent_rush_attempts, 4.5, 40),
    1.5,
    8.5
  );
  const expected_rushing_yards = expected_total_rush_attempts * expected_rush_yards_per_attempt;

  const observed_rushing_td_rate =
    input.recent_rush_attempts > 0
      ? input.recent_rushing_tds / input.recent_rush_attempts
      : 0.035;
  const rushing_td_rate_shrunk = shrink(
    observed_rushing_td_rate,
    input.recent_rush_attempts,
    0.035,
    50
  );
  const goal_line_bonus = 0.08 * resolved.expected_active_game_goal_line_rush_attempts;
  const expected_rushing_tds = clamp(
    expected_total_rush_attempts * rushing_td_rate_shrunk + goal_line_bonus,
    0,
    1.5
  );

  // 26.10.4 Conditional-on-active fantasy points.
  const active_game_fantasy_points =
    expected_completions * scoring.points_per_completion +
    expected_passing_yards * scoring.points_per_passing_yard +
    expected_passing_tds * scoring.points_per_passing_td +
    expected_interceptions * scoring.points_per_interception +
    expected_rushing_yards * scoring.points_per_rushing_yard +
    expected_rushing_tds * scoring.points_per_rushing_td;

  const conditional: QBActiveGameProjection = {
    pass_attempts: expected_pass_attempts,
    completions: expected_completions,
    completion_rate: expected_completion_rate,
    passing_yards: expected_passing_yards,
    passing_tds: expected_passing_tds,
    interceptions: expected_interceptions,
    designed_rush_attempts: expected_designed_rush_attempts,
    scrambles: expected_scrambles,
    total_rush_attempts: expected_total_rush_attempts,
    rushing_yards: expected_rushing_yards,
    rushing_tds: expected_rushing_tds,
    fantasy_points: active_game_fantasy_points,
  };

  // 26.10.5 Weekly EFO.
  const inactive = INACTIVE_INJURY_STATUSES.includes(input.injury_status);
  const weekly_fantasy_points = inactive
    ? 0
    : resolved.probability_active * active_game_fantasy_points;

  // 26.10.6 ROS recovery-aware EFO.
  const G = input.expected_games_remaining;
  const L = Math.min(resolved.expected_games_limited, G);
  const F = Math.max(G - L, 0);
  const limited_workload_factor = LIMITED_WORKLOAD_FACTOR_BY_INJURY[input.injury_status];
  const limited_active_probability = resolved.probability_active;
  const future_healthy_active_probability =
    FUTURE_HEALTHY_ACTIVE_PROBABILITY_BY_ROLE[input.role_status];
  const limited_game_efo =
    active_game_fantasy_points * limited_workload_factor * limited_active_probability;
  const future_healthy_game_efo = active_game_fantasy_points * future_healthy_active_probability;
  const ros_fantasy_points = G === 0 ? 0 : L * limited_game_efo + F * future_healthy_game_efo;

  return {
    conditional,
    probability_active: resolved.probability_active,
    weekly_fantasy_points,
    ros_fantasy_points,
    expected_games_remaining: G,
    expected_games_limited: resolved.expected_games_limited,
  };
}
