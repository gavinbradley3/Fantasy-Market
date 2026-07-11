/**
 * Exact volatility formula and dependence metrics (Section 26.12). Volatility measures
 * instability of expected value and is not derived from confidence.
 */

import { INJURY_UNCERTAINTY_BY_INJURY } from "./constants.js";
import { clamp, percentile } from "./math.js";
import type { ResolvedReference } from "./references.js";
import type {
  QBActiveGameProjection,
  QBComponentScores,
  QBMVPInput,
  QBScoring,
  QBShrunkValues,
  QBTrendValues,
} from "./types.js";

export interface QBVolatilityResult {
  score: number;
  rushing_dependence: number;
  turnover_risk: number;
  role_instability: number;
}

export function computeVolatility(
  input: QBMVPInput,
  components: QBComponentScores,
  shrunk: QBShrunkValues,
  trends: QBTrendValues,
  conditional: QBActiveGameProjection,
  scoring: QBScoring,
  reference: ResolvedReference
): QBVolatilityResult {
  // 26.12.1 Role instability.
  const role_instability = 100 - components.RS;

  // 26.12.2 Rushing dependence (uses conditional active-game contributions).
  const passing_fp =
    conditional.completions * scoring.points_per_completion +
    conditional.passing_yards * scoring.points_per_passing_yard +
    conditional.passing_tds * scoring.points_per_passing_td +
    conditional.interceptions * scoring.points_per_interception;
  const rushing_fp =
    conditional.rushing_yards * scoring.points_per_rushing_yard +
    conditional.rushing_tds * scoring.points_per_rushing_td;
  const positive_total_fp = Math.max(passing_fp, 0) + Math.max(rushing_fp, 0);
  const rushing_dependence =
    positive_total_fp > 0 ? (100 * Math.max(rushing_fp, 0)) / positive_total_fp : 0;

  // 26.12.3 Turnover risk.
  const turnover_risk = percentile(
    shrunk.interception_rate_shrunk,
    reference.distributions.interception_rate
  );

  // 26.12.4 Passing instability.
  const passing_instability = trends.no_prior_efficiency_window
    ? 35
    : Math.abs(trends.passing_efficiency_trend - 50) * 2;

  // 26.12.5 Sample uncertainty.
  const pass_sample_confidence = clamp((100 * input.career_pass_attempts) / 1200, 0, 100);
  const start_sample_confidence = clamp((100 * input.career_starts) / 32, 0, 100);
  const sample_uncertainty =
    100 - clamp(0.6 * pass_sample_confidence + 0.4 * start_sample_confidence, 0, 100);

  // 26.12.6 Injury uncertainty.
  const injury_uncertainty = INJURY_UNCERTAINTY_BY_INJURY[input.injury_status];

  // 26.12.7 Change uncertainty.
  const change_uncertainty = clamp(
    (input.team_change ? 35 : 0) +
      (input.major_system_change ? 30 : 0) +
      (input.recent_role_change ? 40 : 0),
    0,
    100
  );

  // 26.12.8 Final volatility.
  const score = clamp(
    0.25 * role_instability +
      0.15 * rushing_dependence +
      0.15 * turnover_risk +
      0.15 * passing_instability +
      0.15 * sample_uncertainty +
      0.1 * injury_uncertainty +
      0.05 * change_uncertainty,
    0,
    100
  );

  return { score, rushing_dependence, turnover_risk, role_instability };
}
