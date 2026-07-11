import { describe, expect, it } from "vitest";
import { shrink } from "../../src/qb-model/math.js";
import { computePriors, qbPriorStrength } from "../../src/qb-model/priors.js";
import { baseInput } from "./helpers.js";

/** Section 26.6 shrinkage and prior formulas. */
describe("shrinkage (26.6.1)", () => {
  it("blends observed and prior by sample weight", () => {
    // w = 100/(100+100) = 0.5 -> midpoint.
    expect(shrink(10, 100, 20, 100)).toBeCloseTo(15, 12);
  });

  it("returns the prior exactly when sample = 0", () => {
    expect(shrink(999, 0, 6.8, 250)).toBe(6.8);
  });

  it("approaches observed as sample grows large", () => {
    expect(shrink(9.5, 10_000_000, 6.2, 250)).toBeCloseTo(9.5, 3);
  });
});

describe("QB priors (26.6.2)", () => {
  it("maps draft round to prior strength", () => {
    expect(qbPriorStrength(1)).toBe(0.7);
    expect(qbPriorStrength(4)).toBe(0.49);
    expect(qbPriorStrength(7)).toBe(0.42);
    expect(qbPriorStrength(null)).toBe(0.4);
  });

  it("derives metric priors deterministically from prior strength", () => {
    const priors = computePriors(baseInput({ draft_round: 1 }));
    expect(priors.qb_prior_strength).toBe(0.7);
    expect(priors.aypa_prior).toBeCloseTo(6.2 + 1.2 * 0.7, 12);
    expect(priors.passing_ypa_prior).toBeCloseTo(6.5 + 0.8 * 0.7, 12);
    expect(priors.cpoe_prior).toBeCloseTo(-0.01 + 0.02 * 0.7, 12);
    expect(priors.completion_rate_prior).toBeCloseTo(0.6 + 0.07 * 0.7, 12);
    expect(priors.explosive_prior).toBeCloseTo(0.085 + 0.03 * 0.7, 12);
    expect(priors.interception_prior).toBeCloseTo(0.03 - 0.01 * 0.7, 12);
    expect(priors.passing_td_prior).toBeCloseTo(0.04 + 0.015 * 0.7, 12);
  });
});
