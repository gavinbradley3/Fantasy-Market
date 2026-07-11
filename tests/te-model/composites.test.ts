import { describe, expect, it } from "vitest";
import { COMPONENT_ORDER, HORIZON_WEIGHTS, HORIZONS } from "../../src/te-model/constants.js";
import { computeComposites } from "../../src/te-model/composites.js";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import { baseInput, missingDataInput } from "./helpers.js";

describe("horizon weights (26.9)", () => {
  it("every horizon row sums to 1.00 within machine tolerance", () => {
    for (const horizon of HORIZONS) {
      const weights = HORIZON_WEIGHTS[horizon];
      const sum = COMPONENT_ORDER.reduce((acc, c) => acc + weights[c], 0);
      expect(Math.abs(sum - 1.0), horizon).toBeLessThan(1e-12);
    }
  });

  it("matches the exact binding table", () => {
    expect(HORIZON_WEIGHTS.WEEKLY).toEqual({ RR: 0.25, TE: 0.22, TQ: 0.1, RE: 0.05, TC: 0.14, RD: 0.05, AD: 0.02, AV: 0.17 });
    expect(HORIZON_WEIGHTS.ROS).toEqual({ RR: 0.22, TE: 0.22, TQ: 0.1, RE: 0.06, TC: 0.11, RD: 0.14, AD: 0.05, AV: 0.1 });
    expect(HORIZON_WEIGHTS.ONE_YEAR).toEqual({ RR: 0.17, TE: 0.2, TQ: 0.09, RE: 0.08, TC: 0.08, RD: 0.21, AD: 0.13, AV: 0.04 });
    expect(HORIZON_WEIGHTS.THREE_YEAR).toEqual({ RR: 0.12, TE: 0.18, TQ: 0.08, RE: 0.09, TC: 0.05, RD: 0.24, AD: 0.2, AV: 0.04 });
    expect(HORIZON_WEIGHTS.DYNASTY).toEqual({ RR: 0.09, TE: 0.17, TQ: 0.07, RE: 0.08, TC: 0.03, RD: 0.25, AD: 0.27, AV: 0.04 });
  });
});

describe("composites (26.9)", () => {
  it("composite equals the weighted component sum", () => {
    const components = { RR: 80, TE: 70, TQ: 60, RE: 50, TC: 40, RD: 30, AD: 20, AV: 90 };
    const composites = computeComposites(components);
    for (const horizon of HORIZONS) {
      const weights = HORIZON_WEIGHTS[horizon];
      const expected = COMPONENT_ORDER.reduce(
        (acc, c) => acc + components[c] * weights[c],
        0
      );
      expect(composites[horizon]).toBeCloseTo(expected, 12);
    }
  });

  it("all five composites are always returned, finite, and within [0,100]", () => {
    for (const input of [baseInput(), missingDataInput(), baseInput({ injury_status: "OUT" })]) {
      const out = evaluateTightEnd(input);
      expect(Object.keys(out.composites)).toEqual([
        "WEEKLY",
        "ROS",
        "ONE_YEAR",
        "THREE_YEAR",
        "DYNASTY",
      ]);
      for (const value of Object.values(out.composites)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
