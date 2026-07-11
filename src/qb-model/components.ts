/**
 * Exact derived percentiles and the eight QB component formulas (Section 26.8).
 * Every component output is clamped to [0,100].
 */

import {
  AGE_SCORE_MAX_AGE,
  AGE_SCORE_MIN_AGE,
  AGE_SCORE_TABLE,
  AV_INJURY_STATUS_SCORE,
  DEVELOPMENTAL_ROLE_SCORE,
  DRAFT_INVESTMENT_SCORE_BY_ROUND,
  DRAFT_INVESTMENT_SCORE_UNDRAFTED,
  EXPERIENCE_DEVELOPMENT_SCORE,
  RS_DEPTH_CHART_SCORE,
  RS_ROLE_STATUS_SCORE,
} from "./constants.js";
import { clamp, inversePercentile, percentile } from "./math.js";
import type { ResolvedReference } from "./references.js";
import type {
  QBComponentScores,
  QBMVPInput,
  QBResolvedValues,
  QBShrunkValues,
  QBTrendValues,
} from "./types.js";

/** Shared percentile values (Section 26.8.1) reused by components and Sustainability. */
export interface QBPercentiles {
  P_pass_volume: number;
  P_dropback_share: number;
  P_recent_start_rate: number;
  P_aypa: number;
  P_completion_quality: number;
  P_explosive: number;
  P_designed: number;
  P_scramble: number;
  P_rush_yards: number;
  P_goal_line: number;
  P_environment: number;
  P_protection: number;
  P_int_safety: number;
  P_sack_resilience: number;
  P_td_rate: number;
}

export function computePercentiles(
  resolved: QBResolvedValues,
  shrunk: QBShrunkValues,
  reference: ResolvedReference
): QBPercentiles {
  const ref = reference.distributions;
  return {
    P_pass_volume: percentile(
      resolved.expected_active_game_pass_attempts,
      ref.active_game_pass_attempts
    ),
    P_dropback_share: percentile(resolved.team_dropback_share, ref.team_dropback_share),
    P_recent_start_rate: percentile(shrunk.recent_start_rate, ref.recent_start_rate),
    P_aypa: percentile(shrunk.aypa_shrunk, ref.adjusted_yards_per_attempt),
    P_completion_quality: shrunk.completion_quality_percentile,
    P_explosive: percentile(shrunk.explosive_pass_rate_shrunk, ref.explosive_pass_rate),
    P_designed: percentile(shrunk.designed_rushes_per_start, ref.designed_rush_attempts_per_start),
    P_scramble: percentile(shrunk.scrambles_per_start, ref.scrambles_per_start),
    P_rush_yards: percentile(shrunk.rushing_yards_per_start, ref.rushing_yards_per_start),
    P_goal_line: percentile(
      shrunk.goal_line_rushes_per_start,
      ref.goal_line_rush_attempts_per_start
    ),
    P_environment: percentile(
      resolved.offensive_environment_score,
      ref.offensive_environment_score
    ),
    P_protection: percentile(resolved.protection_context_score, ref.protection_context_score),
    P_int_safety: inversePercentile(shrunk.interception_rate_shrunk, ref.interception_rate),
    P_sack_resilience: inversePercentile(shrunk.sack_rate_shrunk, ref.sack_rate),
    P_td_rate: percentile(shrunk.passing_td_rate_shrunk, ref.passing_td_rate),
  };
}

/** Age score with linear interpolation for non-integer age (Section 26.8.8). */
export function ageScore(age: number): number {
  if (age <= AGE_SCORE_MIN_AGE) return AGE_SCORE_TABLE[AGE_SCORE_MIN_AGE] as number;
  if (age >= AGE_SCORE_MAX_AGE) return AGE_SCORE_TABLE[AGE_SCORE_MAX_AGE] as number;
  const lo = Math.floor(age);
  const hi = Math.ceil(age);
  const loScore = AGE_SCORE_TABLE[lo] as number;
  if (lo === hi) return loScore;
  const hiScore = AGE_SCORE_TABLE[hi] as number;
  return loScore + (age - lo) * (hiScore - loScore);
}

export function experienceDevelopmentScore(seasons: number): number {
  const k = seasons >= 10 ? 10 : Math.max(0, Math.floor(seasons));
  return EXPERIENCE_DEVELOPMENT_SCORE[k] as number;
}

export function draftInvestmentScore(round: QBMVPInput["draft_round"]): number {
  if (round === null) return DRAFT_INVESTMENT_SCORE_UNDRAFTED;
  return DRAFT_INVESTMENT_SCORE_BY_ROUND[round] ?? DRAFT_INVESTMENT_SCORE_UNDRAFTED;
}

export function computeComponents(
  input: QBMVPInput,
  resolved: QBResolvedValues,
  trends: QBTrendValues,
  P: QBPercentiles
): QBComponentScores {
  // 26.8.2 Passing Opportunity.
  const PO = clamp(
    0.55 * P.P_pass_volume + 0.25 * P.P_dropback_share + 0.2 * P.P_recent_start_rate,
    0,
    100
  );

  // 26.8.3 Passing Quality.
  const PQ = clamp(
    0.45 * P.P_aypa + 0.3 * P.P_completion_quality + 0.25 * P.P_explosive,
    0,
    100
  );

  // 26.8.4 Rushing Value.
  const RV = clamp(
    0.35 * P.P_designed + 0.2 * P.P_scramble + 0.3 * P.P_rush_yards + 0.15 * P.P_goal_line,
    0,
    100
  );

  // 26.8.5 Scoring Environment.
  const SE = clamp(0.65 * P.P_environment + 0.2 * P.P_protection + 0.15 * P.P_td_rate, 0, 100);

  // 26.8.6 Role Security.
  const depthChartScore = RS_DEPTH_CHART_SCORE[input.depth_chart_status];
  const roleStatusScore = RS_ROLE_STATUS_SCORE[input.role_status];
  const RS = clamp(
    0.3 * depthChartScore +
      0.3 * roleStatusScore +
      0.25 * (100 * resolved.organizational_commitment) +
      0.15 * (100 * (1 - resolved.competition_pressure)),
    0,
    100
  );

  // 26.8.7 Availability.
  const injuryStatusScore = AV_INJURY_STATUS_SCORE[input.injury_status];
  const career_start_availability =
    input.career_games_played > 0
      ? clamp((100 * input.career_starts) / input.career_games_played, 0, 100)
      : 50;
  const AV = clamp(
    0.7 * (100 * resolved.probability_active) +
      0.2 * injuryStatusScore +
      0.1 * career_start_availability,
    0,
    100
  );

  // 26.8.8 Age & Development.
  const age_score = ageScore(input.age);
  const experience_development_score = experienceDevelopmentScore(input.nfl_seasons_completed);
  const draft_investment_score = draftInvestmentScore(input.draft_round);
  const developmental_role_score = DEVELOPMENTAL_ROLE_SCORE[input.role_status];
  let AD: number;
  if (input.nfl_seasons_completed <= 2) {
    AD =
      0.4 * age_score +
      0.2 * experience_development_score +
      0.25 * draft_investment_score +
      0.15 * developmental_role_score;
  } else {
    AD =
      0.65 * age_score +
      0.15 * experience_development_score +
      0.1 * draft_investment_score +
      0.1 * developmental_role_score;
  }
  AD = clamp(AD, 0, 100);

  // 26.8.9 Sustainability.
  const sample_support = clamp(
    (100 * input.career_pass_attempts) / (input.career_pass_attempts + 600),
    0,
    100
  );
  const trend_stability = 100 - Math.abs(trends.passing_efficiency_trend - 50);
  const SU = clamp(
    0.25 * P.P_int_safety +
      0.2 * P.P_sack_resilience +
      0.15 * P.P_td_rate +
      0.2 * sample_support +
      0.1 * trend_stability +
      0.1 * trends.turnover_trend,
    0,
    100
  );

  return { PO, PQ, RV, SE, RS, AV, AD, SU };
}
