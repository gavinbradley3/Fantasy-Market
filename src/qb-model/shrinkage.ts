/**
 * Exact shrinkage formulas and priors (Section 26.6), including AY/A for Passing Quality
 * and ordinary passing YPA used separately for yardage projection.
 */

import { percentile, shrink } from "./math.js";
import type { ResolvedReference } from "./references.js";
import type {
  QBMVPInput,
  QBPriors,
  QBResolvedValues,
  QBShrunkValues,
} from "./types.js";

export function computeShrunkValues(
  input: QBMVPInput,
  resolved: QBResolvedValues,
  priors: QBPriors,
  reference: ResolvedReference
): QBShrunkValues {
  const rpa = input.recent_pass_attempts;
  const starts = input.recent_starts;
  const ref = reference.distributions;

  // 26.6.3 Adjusted yards per attempt (Passing Quality metric).
  const aypa_shrunk = shrink(resolved.adjusted_yards_per_attempt, rpa, priors.aypa_prior, 250);

  // 26.6.3A Ordinary passing YPA for yardage projection (never percentile-scored).
  const observed_passing_yards_per_attempt = rpa > 0 ? input.recent_passing_yards / rpa : 6.9;
  const passing_yards_per_attempt_shrunk = shrink(
    observed_passing_yards_per_attempt,
    rpa,
    priors.passing_ypa_prior,
    250
  );

  // 26.6.4 Completion pathway.
  let completion_quality_percentile: number;
  let completion_quality_value: number | null = null;
  let completion_rate_shrunk: number | null = null;
  if (resolved.cpoe_supplied) {
    const cpoe = input.completion_percentage_over_expected as number;
    completion_quality_value = shrink(cpoe, rpa, priors.cpoe_prior, 250);
    completion_quality_percentile = percentile(completion_quality_value, ref.cpoe);
  } else {
    const observed_completion_rate = rpa > 0 ? input.recent_completions / rpa : 0.64;
    completion_rate_shrunk = shrink(
      observed_completion_rate,
      rpa,
      priors.completion_rate_prior,
      250
    );
    completion_quality_percentile = percentile(completion_rate_shrunk, ref.completion_rate);
  }

  // 26.6.5 Explosive pass rate.
  const explosive_pass_rate_shrunk = shrink(
    resolved.explosive_pass_rate,
    rpa,
    priors.explosive_prior,
    200
  );

  // 26.6.6 Interception rate.
  const observed_interception_rate = rpa > 0 ? input.recent_interceptions / rpa : 0.025;
  const interception_rate_shrunk = shrink(
    observed_interception_rate,
    rpa,
    priors.interception_prior,
    300
  );

  // 26.6.7 Sack rate.
  const dropbacks_for_sack_rate = rpa + input.recent_sacks;
  const observed_sack_rate =
    dropbacks_for_sack_rate > 0 ? input.recent_sacks / dropbacks_for_sack_rate : 0.075;
  const sack_rate_shrunk = shrink(observed_sack_rate, dropbacks_for_sack_rate, 0.075, 250);

  // 26.6.8 Passing touchdown rate.
  const observed_passing_td_rate = rpa > 0 ? input.recent_passing_tds / rpa : 0.045;
  const passing_td_rate_shrunk = shrink(
    observed_passing_td_rate,
    rpa,
    priors.passing_td_prior,
    300
  );

  // 26.6.9 Rushing rates.
  const starts_denominator = Math.max(starts, 1);
  const designed_rushes_per_start = shrink(
    resolved.designed_rush_attempts / starts_denominator,
    starts,
    1.5,
    4
  );
  const scrambles_per_start = shrink(resolved.scrambles / starts_denominator, starts, 1.8, 4);
  const rushing_yards_per_start = shrink(
    input.recent_rushing_yards / starts_denominator,
    starts,
    18.0,
    4
  );
  const goal_line_rushes_per_start = shrink(
    resolved.goal_line_rush_attempts / starts_denominator,
    starts,
    0.25,
    6
  );

  // 26.6.10 Start rate (no shrinkage).
  const recent_start_rate = input.recent_games > 0 ? starts / input.recent_games : 0;

  return {
    aypa_shrunk,
    passing_yards_per_attempt_shrunk,
    completion_quality_percentile,
    completion_quality_value,
    completion_rate_shrunk,
    explosive_pass_rate_shrunk,
    interception_rate_shrunk,
    observed_interception_rate,
    sack_rate_shrunk,
    passing_td_rate_shrunk,
    designed_rushes_per_start,
    scrambles_per_start,
    rushing_yards_per_start,
    goal_line_rushes_per_start,
    recent_start_rate,
  };
}
