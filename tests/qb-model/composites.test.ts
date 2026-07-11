import { describe, expect, it } from "vitest";
import { HORIZONS, HORIZON_WEIGHTS, COMPONENT_ORDER } from "../../src/qb-model/constants.js";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { FIXTURE_OPTIONS, baseInput } from "./helpers.js";

/** Section 26.9 composites and 26.16.1 #7, #8. */
describe("horizon composites (26.9)", () => {
  it("#8 every horizon weight row sums to 1.00 within 1e-12", () => {
    for (const horizon of HORIZONS) {
      const weights = HORIZON_WEIGHTS[horizon];
      let sum = 0;
      for (const component of COMPONENT_ORDER) sum += weights[component];
      expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
    }
  });

  it("#7 every composite stays within [0,100]", () => {
    const outs = [
      evaluateQuarterback(baseInput(), FIXTURE_OPTIONS),
      evaluateQuarterback(baseInput({ role_status: "BACKUP", depth_chart_status: "FREE_AGENT" }), FIXTURE_OPTIONS),
      evaluateQuarterback(baseInput({ age: 45, nfl_seasons_completed: 21 }), FIXTURE_OPTIONS),
    ];
    for (const out of outs) {
      for (const v of Object.values(out.composites)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("each composite equals the weighted sum of the eight components", () => {
    const out = evaluateQuarterback(baseInput(), FIXTURE_OPTIONS);
    const comp = {
      PO: out.components.passing_opportunity,
      PQ: out.components.passing_quality,
      RV: out.components.rushing_value,
      SE: out.components.scoring_environment,
      RS: out.components.role_security,
      AV: out.components.availability,
      AD: out.components.age_development,
      SU: out.components.sustainability,
    };
    for (const horizon of HORIZONS) {
      const weights = HORIZON_WEIGHTS[horizon];
      let expected = 0;
      for (const c of COMPONENT_ORDER) expected += comp[c] * weights[c];
      const key = horizon.toLowerCase() as keyof typeof out.composites;
      expect(out.composites[key]).toBeCloseTo(expected, 10);
    }
  });
});
