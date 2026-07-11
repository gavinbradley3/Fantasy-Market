import { describe, expect, it } from "vitest";
import {
  canonicalSerializeQBOutput,
  evaluateQuarterback,
} from "../../src/qb-model/index.js";
import { HORIZON_WEIGHTS } from "../../src/qb-model/constants.js";
import { FIXTURE_OPTIONS, baseInput, evalFixture, loadFixtureInput } from "./helpers.js";
import type { QBEvaluatorOptions } from "../../src/qb-model/types.js";

const run = (o = {}, opt: QBEvaluatorOptions = FIXTURE_OPTIONS) =>
  evaluateQuarterback(baseInput(o), opt);

/** Section 26.16.1 invariant-isolation tests and 26.16.2 archetype checks. */
describe("invariant isolation (26.16.1)", () => {
  it("#12 RS is never multiplied into Weekly EFO", () => {
    const established = run({ role_status: "ESTABLISHED_STARTER" });
    const bridge = run({ role_status: "BRIDGE_STARTER" });
    expect(bridge.components.role_security).not.toBeCloseTo(
      established.components.role_security,
      3
    );
    expect(bridge.expected_fantasy_output.weekly_fantasy_points).toBeCloseTo(
      established.expected_fantasy_output.weekly_fantasy_points,
      12
    );
  });

  it("#13 AV enters composites linearly with its weight (never multiplied after weighting)", () => {
    const a = run({ probability_active: 0.99 });
    const b = run({ probability_active: 0.6 });
    const deltaAV = b.components.availability - a.components.availability;
    const deltaWeekly = b.composites.weekly - a.composites.weekly;
    expect(deltaWeekly).toBeCloseTo(HORIZON_WEIGHTS.WEEKLY.AV * deltaAV, 9);
  });

  it("#15 selected horizon changes explanations only", () => {
    const weekly = evaluateQuarterback(baseInput(), { ...FIXTURE_OPTIONS, selected_horizon: "WEEKLY" });
    const dynasty = evaluateQuarterback(baseInput(), { ...FIXTURE_OPTIONS, selected_horizon: "DYNASTY" });
    expect(weekly.components).toEqual(dynasty.components);
    expect(weekly.composites).toEqual(dynasty.composites);
    expect(weekly.expected_fantasy_output).toEqual(dynasty.expected_fantasy_output);
    expect(weekly.confidence).toEqual(dynasty.confidence);
    expect(weekly.volatility).toEqual(dynasty.volatility);
  });

  it("#16 scoring overrides change EFO and rushing dependence but not components or composites", () => {
    const base = run();
    const scored = run(
      {},
      { ...FIXTURE_OPTIONS, scoring: { ...FIXTURE_OPTIONS.scoring, points_per_rushing_td: 9 } }
    );
    expect(scored.components).toEqual(base.components);
    expect(scored.composites).toEqual(base.composites);
    expect(
      scored.expected_fantasy_output.conditional_on_active.fantasy_points
    ).not.toBeCloseTo(base.expected_fantasy_output.conditional_on_active.fantasy_points, 6);
    expect(scored.volatility.rushing_dependence).not.toBeCloseTo(
      base.volatility.rushing_dependence,
      6
    );
  });

  it("#17 identical input plus fixed timestamp produces byte-identical output", () => {
    const a = run();
    const b = run();
    expect(canonicalSerializeQBOutput(a)).toBe(canonicalSerializeQBOutput(b));
  });
});

describe("archetype behaviour (26.16.2)", () => {
  it("#7 temporary starter status reduces long-horizon composites more than Weekly", () => {
    const temp = evalFixture("QB-G09");
    const established = evalFixture("QB-I02-A");
    const weeklyDrop = established.composites.weekly - temp.composites.weekly;
    const dynastyDrop = established.composites.dynasty - temp.composites.dynasty;
    expect(dynastyDrop).toBeGreaterThan(weeklyDrop);
  });

  it("#8 a healthy temporary starter still has non-zero Weekly EFO", () => {
    expect(evalFixture("QB-G09").expected_fantasy_output.weekly_fantasy_points).toBeGreaterThan(0);
  });

  it("#9 strong rushing / weak passing retains Weekly value without high PQ", () => {
    const out = evalFixture("QB-G05");
    expect(out.components.passing_quality).toBeLessThanOrEqual(45);
    expect(out.components.rushing_value).toBeGreaterThanOrEqual(75);
    expect(out.expected_fantasy_output.weekly_fantasy_points).toBeGreaterThan(15);
  });

  it("#10 a pocket passer reaches elite value through PO/PQ/SE/RS/SU despite low RV", () => {
    const out = evalFixture("QB-G02");
    expect(out.components.rushing_value).toBeLessThanOrEqual(40);
    expect(out.composites.weekly).toBeGreaterThanOrEqual(65);
  });

  it("#11 draft round has greater AD influence for Years 0–2 than for veterans", () => {
    const rookieR1 = run({ nfl_seasons_completed: 1, draft_round: 1 });
    const rookieR7 = run({ nfl_seasons_completed: 1, draft_round: 7 });
    const vetR1 = run({ nfl_seasons_completed: 8, draft_round: 1 });
    const vetR7 = run({ nfl_seasons_completed: 8, draft_round: 7 });
    const rookieGap = rookieR1.components.age_development - rookieR7.components.age_development;
    const vetGap = vetR1.components.age_development - vetR7.components.age_development;
    expect(rookieGap).toBeGreaterThan(vetGap);
  });
});

describe("rushing / role / age isolation pairs (26.16.6)", () => {
  it("QB-I01 changes only rushing outputs", () => {
    const a = evalFixture("QB-I01-A");
    const b = evalFixture("QB-I01-B");
    for (const c of [
      "passing_opportunity",
      "passing_quality",
      "scoring_environment",
      "role_security",
      "availability",
      "age_development",
      "sustainability",
    ] as const) {
      expect(b.components[c]).toBeCloseTo(a.components[c], 12);
    }
    expect(b.confidence).toEqual(a.confidence);
    expect(b.status).toBe(a.status);
    expect(b.fallback_log).toEqual(a.fallback_log);
    expect(b.components.rushing_value).toBeGreaterThan(a.components.rushing_value);
    expect(b.expected_fantasy_output.weekly_fantasy_points).toBeGreaterThan(
      a.expected_fantasy_output.weekly_fantasy_points
    );
  });

  it("QB-I02 changes role security; confidence differs only by ROLE_COMPETITION", () => {
    const a = evalFixture("QB-I02-A");
    const b = evalFixture("QB-I02-B");
    for (const c of [
      "passing_quality",
      "rushing_value",
      "scoring_environment",
      "availability",
      "sustainability",
      "passing_opportunity",
    ] as const) {
      expect(b.components[c]).toBeCloseTo(a.components[c], 12);
    }
    expect(b.expected_fantasy_output.conditional_on_active).toEqual(
      a.expected_fantasy_output.conditional_on_active
    );
    expect(b.expected_fantasy_output.weekly_fantasy_points).toBeCloseTo(
      a.expected_fantasy_output.weekly_fantasy_points,
      12
    );
    expect(a.confidence.penalty_codes).not.toContain("ROLE_COMPETITION");
    expect(b.confidence.penalty_codes).toContain("ROLE_COMPETITION");
    expect(b.confidence.penalty_codes.filter((c) => !a.confidence.penalty_codes.includes(c))).toEqual(
      ["ROLE_COMPETITION"]
    );
    expect(a.confidence.score).toBe(100);
    expect(b.confidence.score).toBe(92);
    expect(a.confidence.label).toBe("HIGH");
    expect(b.confidence.label).toBe("HIGH");
    expect(b.components.role_security).toBeLessThan(a.components.role_security);
    expect(b.status).toBe(a.status);
    expect(b.fallback_log).toEqual(a.fallback_log);
  });

  it("QB-I03 changes only AD, composites, and explanations", () => {
    const a = evalFixture("QB-I03-A");
    const b = evalFixture("QB-I03-B");
    for (const c of [
      "passing_opportunity",
      "passing_quality",
      "rushing_value",
      "scoring_environment",
      "role_security",
      "availability",
      "sustainability",
    ] as const) {
      expect(b.components[c]).toBeCloseTo(a.components[c], 12);
    }
    expect(b.expected_fantasy_output).toEqual(a.expected_fantasy_output);
    expect(b.confidence).toEqual(a.confidence);
    expect(b.volatility).toEqual(a.volatility);
    expect(b.status).toBe(a.status);
    expect(b.fallback_log).toEqual(a.fallback_log);
    expect(b.components.age_development).toBeLessThan(a.components.age_development);
    expect(b.composites.three_year).toBeLessThan(a.composites.three_year);
    expect(b.composites.dynasty).toBeLessThan(a.composites.dynasty);
  });
});
