import { describe, expect, it } from "vitest";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { FIXTURE_OPTIONS, baseInput } from "./helpers.js";
import type { QBMVPInput } from "../../src/qb-model/types.js";

const run = (o: Partial<QBMVPInput> = {}) => evaluateQuarterback(baseInput(o), FIXTURE_OPTIONS);

/** Section 26.8 components and Section 26.16.2 QB-specific behaviour. */
describe("component ranges (26.16.1 #6)", () => {
  it("every component stays within [0,100] across archetypes", () => {
    const cases: Partial<QBMVPInput>[] = [
      {},
      { role_status: "BACKUP", depth_chart_status: "BACKUP" },
      { age: 44, nfl_seasons_completed: 20 },
      { recent_pass_attempts: 0, recent_completions: 0, recent_passing_tds: 0, recent_interceptions: 0 },
      { injury_status: "OUT", probability_active: 0 },
    ];
    for (const c of cases) {
      const out = run(c);
      for (const v of Object.values(out.components)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("QB-specific component behaviour (26.16.2)", () => {
  // Rushing-monotonicity cases hold recent_rush_attempts high so the designed + scrambles
  // decomposition never violates the recent_rush_attempts bound.
  it("#1 increasing designed rush attempts does not decrease RV", () => {
    const lo = run({ recent_rush_attempts: 90, scrambles: 0, designed_rush_attempts: 5, expected_active_game_designed_rush_attempts: 1 });
    const hi = run({ recent_rush_attempts: 90, scrambles: 0, designed_rush_attempts: 60, expected_active_game_designed_rush_attempts: 1 });
    expect(hi.components.rushing_value).toBeGreaterThanOrEqual(lo.components.rushing_value);
  });

  it("#2 increasing goal-line rushes does not decrease RV or expected rushing TDs", () => {
    const lo = run({
      goal_line_rush_attempts: 1,
      expected_active_game_goal_line_rush_attempts: 0.2,
    });
    const hi = run({
      goal_line_rush_attempts: 14,
      expected_active_game_goal_line_rush_attempts: 2.0,
    });
    expect(hi.components.rushing_value).toBeGreaterThanOrEqual(lo.components.rushing_value);
    expect(hi.expected_fantasy_output.conditional_on_active.rushing_tds).toBeGreaterThanOrEqual(
      lo.expected_fantasy_output.conditional_on_active.rushing_tds
    );
  });

  it("#3 increasing scrambles alone does not increase PO", () => {
    const lo = run({ recent_rush_attempts: 90, designed_rush_attempts: 5, scrambles: 10 });
    const hi = run({ recent_rush_attempts: 90, designed_rush_attempts: 5, scrambles: 60 });
    expect(hi.components.passing_opportunity).toBeCloseTo(lo.components.passing_opportunity, 12);
  });

  it("#4 pass volume is not a direct Passing Quality input", () => {
    // Varying expected volume and dropback share changes PO/EFO but never PQ.
    const lo = run({ expected_active_game_pass_attempts: 25, team_dropback_share: 0.7 });
    const hi = run({ expected_active_game_pass_attempts: 45, team_dropback_share: 1.0 });
    expect(hi.components.passing_quality).toBeCloseTo(lo.components.passing_quality, 12);
    expect(hi.components.passing_opportunity).toBeGreaterThan(lo.components.passing_opportunity);
  });

  it("#5 increasing interception rate does not directly alter PQ", () => {
    const lo = run({ recent_interceptions: 2 });
    const hi = run({ recent_interceptions: 15 });
    expect(hi.components.passing_quality).toBeCloseTo(lo.components.passing_quality, 12);
  });

  it("#6 increasing competition pressure does not increase RS", () => {
    const lo = run({ competition_pressure: 0.05 });
    const hi = run({ competition_pressure: 0.9 });
    expect(hi.components.role_security).toBeLessThan(lo.components.role_security);
  });
});

describe("age isolation (26.16.1 #14, 26.16.2 #12)", () => {
  it("age affects only AD (and downstream composites), never PO/PQ/RV/SE/RS/AV/SU or EFO", () => {
    const young = run({ age: 27 });
    const old = run({ age: 38 });
    for (const c of [
      "passing_opportunity",
      "passing_quality",
      "rushing_value",
      "scoring_environment",
      "role_security",
      "availability",
      "sustainability",
    ] as const) {
      expect(old.components[c]).toBeCloseTo(young.components[c], 12);
    }
    expect(old.components.age_development).toBeLessThan(young.components.age_development);
    expect(JSON.stringify(old.expected_fantasy_output)).toBe(
      JSON.stringify(young.expected_fantasy_output)
    );
  });

  it("#12 a 38-year-old elite QB is not penalized in PQ, PO, or Weekly EFO by age", () => {
    const young = run({ age: 27 });
    const old = run({ age: 38 });
    expect(old.components.passing_quality).toBeCloseTo(young.components.passing_quality, 12);
    expect(old.components.passing_opportunity).toBeCloseTo(young.components.passing_opportunity, 12);
    expect(old.expected_fantasy_output.weekly_fantasy_points).toBeCloseTo(
      young.expected_fantasy_output.weekly_fantasy_points,
      12
    );
  });
});
