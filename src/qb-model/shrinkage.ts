/**
 * Exact shrinkage formulas and priors (Section 26.6), including AY/A for Passing Quality
 * and ordinary passing YPA used separately for yardage projection.
 */

import { percentile, shrink } from "./math.js";
import { CAREER_ANCHOR } from "./constants.js";
import type { ResolvedReference } from "./references.js";
import type {
  QBMVPInput,
  QBPriors,
  QBResolvedValues,
  QBShrunkValues,
} from "./types.js";

/**
 * §26.6.3-CA — the career anchor and the resistance it lends the recent window.
 *
 * Stage 1: the quarterback's own career rate, regressed toward the draft-capital prior by his
 * career sample. Stage 2: the `k` the recent window is shrunk against, which grows linearly
 * with that same sample, so the weight on recent form is
 * `n_recent / (n_recent + k_base · (1 + n_career/k_career))`. Recent form always keeps a real
 * share; an established record simply raises the bar for overturning it.
 *
 * THE ANCHOR'S SAMPLE EXCLUDES THE RECENT WINDOW. The recent games are part of the career, so
 * counting them on both sides would let a player whose career IS his recent window have that
 * window twice: a quarterback with 74 of his 94 career attempts in the last eight games would
 * be "anchored" almost entirely to the same eight games he is then adjusted by. Subtracting
 * the recent sample leaves the anchor holding only INDEPENDENT career evidence — 20 attempts
 * for that backup, 3,700 for an established starter — which is the whole distinction the
 * revision exists to draw. (The career RATE still spans the whole career; only its weight is
 * reduced, which is the conservative direction.)
 *
 * WITH NO CAREER RATE the effective career sample is ZERO, not the raw count: an anchor that
 * is entirely the draft prior carries no career evidence, so it must not also resist the
 * recent window as though it did. That makes the revision exactly backwards compatible — omit
 * the career inputs and the engine reproduces its pre-revision output byte for byte.
 */
export function careerAnchoredShrink(params: {
  readonly recentRate: number;
  readonly recentSample: number;
  readonly careerRate: number | null | undefined;
  readonly careerSample: number;
  readonly prior: number;
  readonly kCareer: number;
  readonly kRecent: number;
}): number {
  const hasCareer =
    params.careerRate !== null &&
    params.careerRate !== undefined &&
    Number.isFinite(params.careerRate);
  // Independent career evidence: the whole career minus the window that is about to adjust it.
  const n = hasCareer ? Math.max(0, params.careerSample - Math.max(0, params.recentSample)) : 0;
  const anchor = hasCareer ? shrink(params.careerRate as number, n, params.prior, params.kCareer) : params.prior;
  const k = params.kRecent * (1 + n / params.kCareer);
  return shrink(params.recentRate, params.recentSample, anchor, k);
}

export function computeShrunkValues(
  input: QBMVPInput,
  resolved: QBResolvedValues,
  priors: QBPriors,
  reference: ResolvedReference
): QBShrunkValues {
  const rpa = input.recent_pass_attempts;
  const starts = input.recent_starts;
  const ref = reference.distributions;

  // 26.6.3 + 26.6.3-CA Adjusted yards per attempt (Passing Quality metric).
  //
  // Two stages. The career anchor replaces the flat draft-capital prior with what this
  // quarterback has actually done, in proportion to how much career there is; recent form then
  // adjusts that anchor, against a resistance that grows with the career sample behind it.
  //
  // The stage-2 `k` scaling is the whole revision: with it, eight games move a 94-attempt
  // backup a long way and a 4,000-attempt starter only a little, which is the correct reading
  // of the evidence in both cases. Without it — the pre-revision behaviour — both moved
  // equally, and a short hot streak could out-score an established record.
  const aypa_shrunk = careerAnchoredShrink({
    recentRate: resolved.adjusted_yards_per_attempt,
    recentSample: rpa,
    careerRate: input.career_adjusted_yards_per_attempt,
    careerSample: input.career_pass_attempts,
    prior: priors.aypa_prior,
    kCareer: CAREER_ANCHOR.kAypaCareer,
    kRecent: 250,
  });

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
  // 26.6.9 + 26.6.3-CA — the same two-stage treatment for rushing yards per start, where the
  // sample is starts rather than attempts. A quarterback with one productive relief appearance
  // divides eight games of rushing by one or two starts; the career anchor is what keeps that
  // from reading as a career rushing profile.
  const rushing_yards_per_start = careerAnchoredShrink({
    recentRate: input.recent_rushing_yards / starts_denominator,
    recentSample: starts,
    careerRate: input.career_rushing_yards_per_start,
    careerSample: input.career_starts,
    prior: 18.0,
    kCareer: CAREER_ANCHOR.kRushCareer,
    kRecent: 4,
  });
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
