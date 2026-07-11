import { describe, expect, it } from "vitest";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { FIXTURE_OPTIONS, baseInput, evalFixture } from "./helpers.js";
import type { QBEvaluatorOptions, QBMVPInput } from "../../src/qb-model/types.js";

const run = (o: Partial<QBMVPInput> = {}, opt: QBEvaluatorOptions = FIXTURE_OPTIONS) =>
  evaluateQuarterback(baseInput(o), opt);

/** Section 26.10 EFO and 26.16.3 / 26.16.1 #11, #21, #22. */
describe("Expected Fantasy Output (26.10)", () => {
  it("#1 points_per_passing_td override changes fantasy points exactly through passing TDs", () => {
    const base = run();
    const bumped = run(
      {},
      { ...FIXTURE_OPTIONS, scoring: { ...FIXTURE_OPTIONS.scoring, points_per_passing_td: 8 } }
    );
    const c = base.expected_fantasy_output.conditional_on_active;
    const expectedDelta = c.passing_tds * (8 - 4);
    expect(
      bumped.expected_fantasy_output.conditional_on_active.fantasy_points -
        c.fantasy_points
    ).toBeCloseTo(expectedDelta, 9);
  });

  it("#2 points_per_completion override changes fantasy points exactly through completions", () => {
    const base = run();
    const bumped = run(
      {},
      { ...FIXTURE_OPTIONS, scoring: { ...FIXTURE_OPTIONS.scoring, points_per_completion: 1 } }
    );
    const c = base.expected_fantasy_output.conditional_on_active;
    expect(
      bumped.expected_fantasy_output.conditional_on_active.fantasy_points - c.fantasy_points
    ).toBeCloseTo(c.completions * (1 - 0), 9);
  });

  it("#3 interception penalties apply with their signed scoring value", () => {
    const base = run();
    const harsher = run(
      {},
      { ...FIXTURE_OPTIONS, scoring: { ...FIXTURE_OPTIONS.scoring, points_per_interception: -4 } }
    );
    const c = base.expected_fantasy_output.conditional_on_active;
    expect(
      harsher.expected_fantasy_output.conditional_on_active.fantasy_points - c.fantasy_points
    ).toBeCloseTo(c.interceptions * (-4 - -2), 9);
  });

  it("#4 goal-line bonus is applied exactly once (bounded expected rushing TDs)", () => {
    const out = run({ expected_active_game_goal_line_rush_attempts: 1.5 });
    expect(out.expected_fantasy_output.conditional_on_active.rushing_tds).toBeLessThanOrEqual(1.5);
    expect(out.expected_fantasy_output.conditional_on_active.rushing_tds).toBeGreaterThan(0);
  });

  it("#5 probability active is applied exactly once to Weekly EFO", () => {
    const out = evalFixture("QB-G11"); // probability_active = 0.70
    const cond = out.expected_fantasy_output.conditional_on_active.fantasy_points;
    expect(out.expected_fantasy_output.weekly_fantasy_points).toBeCloseTo(0.7 * cond, 9);
  });

  it("#7 expected_games_remaining = 0 produces ros_fantasy_points = 0", () => {
    const out = run({ expected_games_remaining: 0, expected_games_limited: 0 });
    expect(out.expected_fantasy_output.ros_fantasy_points).toBe(0);
  });

  it("11 Weekly EFO is exactly 0 for OUT/IR/PUP but conditional stays positive", () => {
    for (const injury_status of ["OUT", "IR", "PUP"] as const) {
      const out = run({ injury_status, probability_active: 0, expected_games_limited: 2 });
      expect(out.expected_fantasy_output.weekly_fantasy_points).toBe(0);
      expect(
        out.expected_fantasy_output.conditional_on_active.fantasy_points
      ).toBeGreaterThan(0);
    }
  });

  it("#21 projected passing yards use ordinary shrunk passing YPA, never AY/A", () => {
    // Hold recent passing yards/attempts fixed but vary AY/A wildly: passing yards unchanged.
    const lowAypa = run({ adjusted_yards_per_attempt: 4.0 });
    const highAypa = run({ adjusted_yards_per_attempt: 10.6 });
    expect(highAypa.expected_fantasy_output.conditional_on_active.passing_yards).toBeCloseTo(
      lowAypa.expected_fantasy_output.conditional_on_active.passing_yards,
      12
    );
  });

  it("#22 changing recent TDs/INTs (yards & attempts fixed) does not change expected passing yards", () => {
    const a = run({ recent_passing_tds: 5, recent_interceptions: 2 });
    const b = run({ recent_passing_tds: 25, recent_interceptions: 12 });
    expect(b.expected_fantasy_output.conditional_on_active.passing_yards).toBeCloseTo(
      a.expected_fantasy_output.conditional_on_active.passing_yards,
      12
    );
  });

  it("total rush attempts equal designed + scrambles", () => {
    const c = run().expected_fantasy_output.conditional_on_active;
    expect(c.total_rush_attempts).toBeCloseTo(c.designed_rush_attempts + c.scrambles, 12);
  });
});
