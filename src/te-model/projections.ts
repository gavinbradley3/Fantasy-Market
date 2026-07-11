/**
 * Conditional active-game projections, Weekly EFO, and recovery-aware ROS EFO
 * (Section 26.10).
 */

import {
  BASE_RECEIVING_TD_RATE_PER_TARGET,
  EXPECTED_CATCH_RATE_MAX,
  EXPECTED_CATCH_RATE_MIN,
  EXPECTED_YPR_MAX,
  EXPECTED_YPR_MIN,
  INACTIVE_LIST_STATUSES,
  TD_RATE_MAX,
  TD_RATE_MIN,
  TEAM_SCORING_BASELINE_PPD,
} from "./constants.js";
import { clamp } from "./percentiles.js";
import type {
  TEActiveGameProjection,
  TECanonicalValues,
  TEMVPInput,
  TEScoring,
  TEShrunkValues,
} from "./types.js";

/**
 * calculate_active_game(ramp) — Section 26.10.2. Conditional on the player being
 * active; excludes Pactive.
 */
export function calculateActiveGame(
  ramp: number,
  canonical: TECanonicalValues,
  shrunk: TEShrunkValues,
  scoring: TEScoring
): TEActiveGameProjection {
  const expectedRoutes = canonical.projected_team_dropbacks * canonical.rp4 * ramp;
  const expectedTargets = expectedRoutes * shrunk.shrunk_tprr;

  const adot = canonical.average_depth_of_target;
  const depthCatchAdjustment = -0.01 * Math.max(adot - 8, 0) + 0.006 * Math.max(8 - adot, 0);
  const qbCatchAdjustment = 0.08 * ((canonical.qb_environment_score - 50) / 50);

  const expectedCatchRate = clamp(
    0.55 * shrunk.shrunk_catch_rate +
      0.3 * canonical.catchable_target_rate +
      0.15 * 0.68 +
      depthCatchAdjustment +
      qbCatchAdjustment,
    EXPECTED_CATCH_RATE_MIN,
    EXPECTED_CATCH_RATE_MAX
  );

  const expectedReceptions = expectedTargets * expectedCatchRate;

  const yprFromDepth = 6.8 + 0.52 * adot;
  let expectedYardsPerReception = clamp(
    0.55 * shrunk.shrunk_yards_per_reception +
      0.25 * yprFromDepth +
      0.2 * (6.0 + shrunk.shrunk_yac_per_reception),
    EXPECTED_YPR_MIN,
    EXPECTED_YPR_MAX
  );

  const yptConsistencyCap = clamp(
    shrunk.shrunk_yards_per_target / Math.max(expectedCatchRate, 0.01),
    EXPECTED_YPR_MIN,
    EXPECTED_YPR_MAX
  );

  expectedYardsPerReception = clamp(
    0.75 * expectedYardsPerReception + 0.25 * yptConsistencyCap,
    EXPECTED_YPR_MIN,
    EXPECTED_YPR_MAX
  );

  const expectedReceivingYards = expectedReceptions * expectedYardsPerReception;

  const redZoneOpportunityFactor = clamp(
    0.7 + 1.5 * shrunk.shrunk_red_zone_target_rate,
    0.7,
    1.35
  );
  const endZoneOpportunityFactor = clamp(
    0.75 + 2.5 * shrunk.shrunk_end_zone_target_rate,
    0.75,
    1.35
  );
  const teamScoringFactor = clamp(
    canonical.team_points_per_drive / TEAM_SCORING_BASELINE_PPD,
    0.7,
    1.35
  );

  const expectedTdRatePerTarget = clamp(
    BASE_RECEIVING_TD_RATE_PER_TARGET *
      redZoneOpportunityFactor *
      endZoneOpportunityFactor *
      teamScoringFactor,
    TD_RATE_MIN,
    TD_RATE_MAX
  );

  const expectedReceivingTouchdowns = expectedTargets * expectedTdRatePerTarget;

  const activeGameFantasyPoints =
    expectedReceptions * scoring.points_per_reception +
    expectedReceivingYards * scoring.points_per_receiving_yard +
    expectedReceivingTouchdowns * scoring.points_per_receiving_td;

  return {
    expected_routes: expectedRoutes,
    expected_targets: expectedTargets,
    expected_catch_rate: expectedCatchRate,
    expected_receptions: expectedReceptions,
    expected_yards_per_reception: expectedYardsPerReception,
    expected_receiving_yards: expectedReceivingYards,
    expected_td_rate_per_target: expectedTdRatePerTarget,
    expected_receiving_touchdowns: expectedReceivingTouchdowns,
    active_game_fantasy_points: activeGameFantasyPoints,
  };
}

export interface TEProjections {
  probability_active: number;
  effective_ramp: number;
  current_active_game: TEActiveGameProjection;
  full_workload_active_game: TEActiveGameProjection;
  weekly_expected_fantasy_points: number;
  expected_active_games_remaining: number;
  ros_expected_fantasy_points: number;
}

export function computeProjections(
  input: TEMVPInput,
  canonical: TECanonicalValues,
  shrunk: TEShrunkValues,
  scoring: TEScoring,
  availability: number
): TEProjections {
  const inactiveList = INACTIVE_LIST_STATUSES.includes(input.injury_status);

  // Pactive = AV / 100 (26.10.1); inactive-list statuses force AV = 0 upstream.
  const probabilityActive = availability / 100;
  const effectiveRamp = inactiveList ? 0 : clamp(canonical.workload_ramp_factor, 0, 1);

  const currentActiveGame = calculateActiveGame(effectiveRamp, canonical, shrunk, scoring);
  const fullWorkloadActiveGame = calculateActiveGame(1.0, canonical, shrunk, scoring);

  // Weekly EFO: Pactive applied exactly once (26.10.3).
  const weeklyExpectedFantasyPoints =
    probabilityActive * currentActiveGame.active_game_fantasy_points;

  // ROS recovery-aware formula (26.10.4).
  const expectedActiveGamesRemaining = input.expected_games_remaining * probabilityActive;
  let rosExpectedFantasyPoints: number;
  if (expectedActiveGamesRemaining <= 0) {
    rosExpectedFantasyPoints = 0;
  } else {
    const firstActiveGameWeight = Math.min(expectedActiveGamesRemaining, 1);
    const laterActiveGames = Math.max(expectedActiveGamesRemaining - firstActiveGameWeight, 0);
    rosExpectedFantasyPoints =
      firstActiveGameWeight * currentActiveGame.active_game_fantasy_points +
      laterActiveGames * fullWorkloadActiveGame.active_game_fantasy_points;
  }

  return {
    probability_active: probabilityActive,
    effective_ramp: effectiveRamp,
    current_active_game: currentActiveGame,
    full_workload_active_game: fullWorkloadActiveGame,
    weekly_expected_fantasy_points: weeklyExpectedFantasyPoints,
    expected_active_games_remaining: expectedActiveGamesRemaining,
    ros_expected_fantasy_points: rosExpectedFantasyPoints,
  };
}
