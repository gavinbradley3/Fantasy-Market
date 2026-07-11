import { describe, expect, it } from "vitest";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { FIXTURE_OPTIONS, baseInput, evalFixture } from "./helpers.js";

const run = (o = {}) => evaluateQuarterback(baseInput(o), FIXTURE_OPTIONS);

/** Section 26.12 volatility and 26.16.1 #10, 26.16.2 #13. */
describe("volatility (26.12)", () => {
  it("#10 volatility stays within [0,100]", () => {
    for (const out of [run(), run({ role_status: "RECENTLY_BENCHED", team_change: true, major_system_change: true, recent_role_change: true }), evalFixture("QB-G05")]) {
      expect(out.volatility.score).toBeGreaterThanOrEqual(0);
      expect(out.volatility.score).toBeLessThanOrEqual(100);
    }
  });

  it("role instability equals 100 - RS", () => {
    const out = run({ role_status: "COMPETITION", competition_pressure: 0.75, depth_chart_status: "CO_STARTER" });
    expect(out.volatility.role_instability).toBeCloseTo(100 - out.components.role_security, 10);
  });

  it("#13 rushing dependence and confidence are not mathematical inverses", () => {
    const out = evalFixture("QB-G05");
    // Rushing-dependent volatile QB: dependence high, confidence not simply its complement.
    expect(out.volatility.rushing_dependence + out.confidence.score).not.toBeCloseTo(100, 6);
  });

  it("volatility is not the inverse of confidence", () => {
    const out = run();
    expect(out.volatility.score).not.toBeCloseTo(100 - out.confidence.score, 6);
  });

  it("turnover risk is the direct (non-inverse) interception percentile", () => {
    const clean = run({ recent_interceptions: 2, prior_interception_rate: 0.01 });
    const risky = run({ recent_interceptions: 15, prior_interception_rate: 0.05 });
    expect(risky.volatility.turnover_risk).toBeGreaterThan(clean.volatility.turnover_risk);
  });
});
