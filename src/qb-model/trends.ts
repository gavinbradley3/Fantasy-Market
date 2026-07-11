/**
 * Exact trend formulas (Section 26.7). Trend feeds Sustainability and volatility only;
 * it is not a ninth component.
 */

import { clamp, shrink } from "./math.js";
import type { QBMVPInput, QBPriors, QBShrunkValues, QBTrendValues } from "./types.js";

export function computeTrends(
  input: QBMVPInput,
  priors: QBPriors,
  shrunk: QBShrunkValues,
  resolvedAypa: number
): QBTrendValues {
  const rpa = input.recent_pass_attempts;
  const starts = input.recent_starts;

  // 26.7.1 Passing-efficiency trend.
  const noPriorEfficiencyWindow =
    input.prior_adjusted_yards_per_attempt === null ||
    input.prior_recent_pass_attempts === null;
  let passing_efficiency_trend: number;
  if (noPriorEfficiencyWindow) {
    passing_efficiency_trend = 50;
  } else {
    const current_trend_aypa = shrink(resolvedAypa, rpa, priors.aypa_prior, 150);
    const prior_trend_aypa = shrink(
      input.prior_adjusted_yards_per_attempt as number,
      input.prior_recent_pass_attempts as number,
      priors.aypa_prior,
      150
    );
    const aypa_delta = current_trend_aypa - prior_trend_aypa;
    passing_efficiency_trend = clamp(50 + 12 * aypa_delta, 0, 100);
  }

  // 26.7.2 Turnover trend.
  let turnover_trend: number;
  if (input.prior_interception_rate === null || input.prior_recent_pass_attempts === null) {
    turnover_trend = 50;
  } else {
    const current_int = shrink(
      shrunk.observed_interception_rate,
      rpa,
      priors.interception_prior,
      150
    );
    const prior_int = shrink(
      input.prior_interception_rate,
      input.prior_recent_pass_attempts,
      priors.interception_prior,
      150
    );
    turnover_trend = clamp(50 - 800 * (current_int - prior_int), 0, 100);
  }

  // 26.7.3 Rushing-role trend.
  let rushing_role_trend: number;
  if (input.prior_rush_attempts_per_start === null) {
    rushing_role_trend = 50;
  } else {
    const current_rush_attempts_per_start = starts > 0 ? input.recent_rush_attempts / starts : 0;
    rushing_role_trend = clamp(
      50 + 8 * (current_rush_attempts_per_start - input.prior_rush_attempts_per_start),
      0,
      100
    );
  }

  return {
    passing_efficiency_trend,
    turnover_trend,
    rushing_role_trend,
    no_prior_efficiency_window: noPriorEfficiencyWindow,
  };
}
