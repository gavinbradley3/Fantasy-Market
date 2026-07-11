import { describe, expect, it } from "vitest";
import { resolveFallbacks } from "../../src/qb-model/fallbacks.js";
import { computePriors } from "../../src/qb-model/priors.js";
import { resolveReference } from "../../src/qb-model/references.js";
import { computeShrunkValues } from "../../src/qb-model/shrinkage.js";
import { computeTrends } from "../../src/qb-model/trends.js";
import { baseInput } from "./helpers.js";
import type { QBMVPInput } from "../../src/qb-model/types.js";

function trendsFor(input: QBMVPInput) {
  const priors = computePriors(input);
  const reference = resolveReference(undefined);
  const { resolved } = resolveFallbacks(input);
  const shrunk = computeShrunkValues(input, resolved, priors, reference);
  return computeTrends(input, priors, shrunk, resolved.adjusted_yards_per_attempt);
}

/** Section 26.7 trend formulas. */
describe("trends (26.7)", () => {
  it("passing-efficiency trend is neutral 50 without a prior window", () => {
    const t = trendsFor(
      baseInput({ prior_adjusted_yards_per_attempt: null, prior_recent_pass_attempts: null })
    );
    expect(t.passing_efficiency_trend).toBe(50);
    expect(t.no_prior_efficiency_window).toBe(true);
  });

  it("turnover trend is neutral 50 without a prior interception window", () => {
    const t = trendsFor(baseInput({ prior_interception_rate: null }));
    expect(t.turnover_trend).toBe(50);
  });

  it("rushing-role trend is neutral 50 without a prior rush window", () => {
    const t = trendsFor(baseInput({ prior_rush_attempts_per_start: null }));
    expect(t.rushing_role_trend).toBe(50);
  });

  it("improving efficiency raises the passing-efficiency trend above 50", () => {
    const t = trendsFor(
      baseInput({ adjusted_yards_per_attempt: 9.5, prior_adjusted_yards_per_attempt: 6.0 })
    );
    expect(t.passing_efficiency_trend).toBeGreaterThan(50);
    expect(t.no_prior_efficiency_window).toBe(false);
  });

  it("rising interception rate lowers the turnover trend below 50", () => {
    const t = trendsFor(
      baseInput({ recent_interceptions: 20, prior_interception_rate: 0.005 })
    );
    expect(t.turnover_trend).toBeLessThan(50);
  });

  it("trend scores stay clamped to [0,100]", () => {
    const t = trendsFor(
      baseInput({ adjusted_yards_per_attempt: 10.6, prior_adjusted_yards_per_attempt: 4.0 })
    );
    expect(t.passing_efficiency_trend).toBeGreaterThanOrEqual(0);
    expect(t.passing_efficiency_trend).toBeLessThanOrEqual(100);
  });
});
