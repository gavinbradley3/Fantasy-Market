import { describe, expect, it } from "vitest";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import type { TEMVPInput } from "../../src/te-model/types.js";
import { baseInput } from "./helpers.js";

const weekly = (overrides: Partial<TEMVPInput> = {}) =>
  evaluateTightEnd(baseInput(overrides)).weekly;

describe("monotonic projection behavior (26.16.1)", () => {
  it("higher team dropbacks increase expected routes and Weekly EFO", () => {
    const low = weekly({ projected_team_dropbacks: 30 });
    const high = weekly({ projected_team_dropbacks: 40 });
    expect(high.expected_routes).toBeGreaterThan(low.expected_routes);
    expect(high.expected_fantasy_points).toBeGreaterThan(low.expected_fantasy_points);
  });

  it("higher route participation increases expected routes, targets, and Weekly EFO", () => {
    const low = weekly({ route_participation_last4: 0.5 });
    const high = weekly({ route_participation_last4: 0.8 });
    expect(high.expected_routes).toBeGreaterThan(low.expected_routes);
    expect(high.expected_targets).toBeGreaterThan(low.expected_targets);
    expect(high.expected_fantasy_points).toBeGreaterThan(low.expected_fantasy_points);
  });

  it("higher TPRR increases expected targets and Weekly EFO", () => {
    const low = weekly({ targets_per_route_run: 0.12 });
    const high = weekly({ targets_per_route_run: 0.26 });
    expect(high.expected_targets).toBeGreaterThan(low.expected_targets);
    expect(high.expected_fantasy_points).toBeGreaterThan(low.expected_fantasy_points);
  });

  it("higher catch-rate inputs increase expected receptions", () => {
    const low = weekly({ catch_rate: 0.55, career_catch_rate: 0.55 });
    const high = weekly({ catch_rate: 0.8, career_catch_rate: 0.8 });
    expect(high.expected_receptions).toBeGreaterThan(low.expected_receptions);
  });

  it("higher yardage conversion increases expected yards within caps", () => {
    const low = weekly({ yards_per_reception: 8.5, career_yards_per_reception: 8.5 });
    const high = weekly({ yards_per_reception: 13.5, career_yards_per_reception: 13.5 });
    expect(high.expected_receiving_yards).toBeGreaterThan(low.expected_receiving_yards);
  });

  it("higher red-zone/end-zone opportunity increases expected TDs", () => {
    const low = weekly({
      red_zone_target_rate: 0.05,
      end_zone_target_rate: 0.02,
      career_red_zone_target_rate: 0.05,
      career_end_zone_target_rate: 0.02,
    });
    const high = weekly({
      red_zone_target_rate: 0.4,
      end_zone_target_rate: 0.2,
      career_red_zone_target_rate: 0.4,
      career_end_zone_target_rate: 0.2,
    });
    expect(high.expected_receiving_touchdowns).toBeGreaterThan(
      low.expected_receiving_touchdowns
    );
  });
});

describe("Pactive and ramp semantics (26.10)", () => {
  it("Pactive = AV/100 and lowers Weekly EFO without touching conditional stats", () => {
    const healthy = evaluateTightEnd(baseInput());
    const questionable = evaluateTightEnd(
      baseInput({ injury_status: "QUESTIONABLE", practice_status: "FULL" })
    );
    expect(healthy.weekly.probability_active).toBeCloseTo(0.98, 12);
    expect(questionable.weekly.probability_active).toBeCloseTo(0.85, 12);
    // Ramp supplied as 1.0 for both → conditional stats identical.
    expect(questionable.weekly.expected_routes).toBe(healthy.weekly.expected_routes);
    expect(questionable.weekly.expected_targets).toBe(healthy.weekly.expected_targets);
    expect(questionable.weekly.expected_receptions).toBe(healthy.weekly.expected_receptions);
    expect(questionable.weekly.expected_fantasy_points).toBeLessThan(
      healthy.weekly.expected_fantasy_points
    );
  });

  it("Pactive is applied exactly once to Weekly EFO", () => {
    const out = evaluateTightEnd(baseInput());
    // Conditional FP implied by unrounded parts: EFO / Pactive must reproduce the
    // conditional statistics chain, not Pactive² × conditional.
    const conditionalFp =
      out.weekly.expected_receptions * 1.0 +
      out.weekly.expected_receiving_yards * 0.1 +
      out.weekly.expected_receiving_touchdowns * 6.0;
    expect(out.weekly.expected_fantasy_points).toBeCloseTo(0.98 * conditionalFp, 0);
  });

  it("workload ramp scales conditional statistics linearly", () => {
    const full = evaluateTightEnd(baseInput({ workload_ramp_factor: 1.0 }));
    const half = evaluateTightEnd(baseInput({ workload_ramp_factor: 0.5 }));
    expect(half.weekly.workload_ramp_factor).toBe(0.5);
    expect(half.weekly.expected_routes).toBeCloseTo(full.weekly.expected_routes * 0.5, 0);
    expect(half.weekly.expected_targets).toBeCloseTo(full.weekly.expected_targets * 0.5, 0);
  });

  it("ramp does not change Pactive", () => {
    const half = evaluateTightEnd(baseInput({ workload_ramp_factor: 0.5 }));
    expect(half.weekly.probability_active).toBeCloseTo(0.98, 12);
  });
});

describe("inactive-list policy (26.10.1)", () => {
  it.each(["OUT", "IR", "PUP", "SUSPENDED"] as const)("%s zeroes everything", (status) => {
    const out = evaluateTightEnd(
      baseInput({ injury_status: status, practice_status: "DNP" })
    );
    expect(out.components.AV).toBe(0);
    expect(out.weekly.probability_active).toBe(0);
    expect(out.weekly.workload_ramp_factor).toBe(0);
    expect(out.weekly.expected_routes).toBe(0);
    expect(out.weekly.expected_targets).toBe(0);
    expect(out.weekly.expected_receptions).toBe(0);
    expect(out.weekly.expected_receiving_yards).toBe(0);
    expect(out.weekly.expected_receiving_touchdowns).toBe(0);
    expect(out.weekly.expected_fantasy_points).toBe(0);
    expect(out.ros.expected_active_games).toBe(0);
    expect(out.ros.expected_fantasy_points).toBe(0);
  });

  it("a supplied nonzero ramp cannot revive an OUT player", () => {
    const out = evaluateTightEnd(
      baseInput({ injury_status: "OUT", practice_status: "DNP", workload_ramp_factor: 0.9 })
    );
    expect(out.weekly.workload_ramp_factor).toBe(0);
    expect(out.weekly.expected_fantasy_points).toBe(0);
    expect(out.ros.expected_fantasy_points).toBe(0);
  });
});

describe("ROS recovery-aware formula (26.10.4)", () => {
  it("applies the current ramp to the first expected active game only", () => {
    const ramped = evaluateTightEnd(
      baseInput({
        injury_status: "QUESTIONABLE",
        practice_status: "LIMITED",
        workload_ramp_factor: 0.6,
        expected_games_remaining: 6,
      })
    );
    const fullOutput = evaluateTightEnd(
      baseInput({
        injury_status: "QUESTIONABLE",
        practice_status: "LIMITED",
        workload_ramp_factor: 1.0,
        expected_games_remaining: 6,
      })
    );
    // Pactive = 0.68 both; expected active games = 4.08.
    expect(ramped.ros.expected_active_games).toBeCloseTo(4.1, 12);
    // Full-workload variant: all games at full FP. Ramped variant replaces exactly the
    // first game's FP with 0.6× the full-game FP (linear chain in ramp).
    const fullGameFp = fullOutput.ros.expected_fantasy_points / 4.08;
    const expected = 1 * 0.6 * fullGameFp + 3.08 * fullGameFp;
    expect(ramped.ros.expected_fantasy_points).toBeCloseTo(expected, 0);
    // The ramp is NOT applied to every remaining game.
    expect(ramped.ros.expected_fantasy_points).toBeGreaterThan(
      0.6 * fullOutput.ros.expected_fantasy_points + 0.01
    );
  });

  it("expected active games below one uses only the current-ramp game", () => {
    const out = evaluateTightEnd(
      baseInput({
        injury_status: "DOUBTFUL",
        practice_status: "DNP",
        workload_ramp_factor: 0.5,
        expected_games_remaining: 1,
      })
    );
    // Pactive = 0.12 → expected active games 0.12 < 1 → all at current ramp.
    expect(out.ros.expected_active_games).toBeCloseTo(0.1, 12);
    expect(out.ros.expected_fantasy_points).toBeGreaterThan(0);
  });
});

describe("scoring (26.2.3)", () => {
  it("defaults to 1.0 / 0.1 / 6.0 and echoes resolved scoring in the output", () => {
    const out = evaluateTightEnd(baseInput());
    expect(out.scoring).toEqual({
      points_per_reception: 1.0,
      points_per_receiving_yard: 0.1,
      points_per_receiving_td: 6.0,
    });
  });

  it("scoring changes fantasy points only, never football statistics or components", () => {
    const ppr = evaluateTightEnd(baseInput());
    const halfPpr = evaluateTightEnd(
      baseInput({
        scoring: {
          points_per_reception: 0.5,
          points_per_receiving_yard: 0.1,
          points_per_receiving_td: 6.0,
        },
      })
    );
    expect(halfPpr.weekly.expected_routes).toBe(ppr.weekly.expected_routes);
    expect(halfPpr.weekly.expected_targets).toBe(ppr.weekly.expected_targets);
    expect(halfPpr.weekly.expected_receptions).toBe(ppr.weekly.expected_receptions);
    expect(halfPpr.weekly.expected_receiving_yards).toBe(ppr.weekly.expected_receiving_yards);
    expect(halfPpr.weekly.expected_receiving_touchdowns).toBe(
      ppr.weekly.expected_receiving_touchdowns
    );
    expect(halfPpr.components).toEqual(ppr.components);
    expect(halfPpr.composites).toEqual(ppr.composites);
    expect(halfPpr.confidence).toEqual(ppr.confidence);
    expect(halfPpr.status).toBe(ppr.status);
    expect(halfPpr.weekly.expected_fantasy_points).toBeLessThan(
      ppr.weekly.expected_fantasy_points
    );
    expect(halfPpr.ros.expected_fantasy_points).toBeLessThan(ppr.ros.expected_fantasy_points);
  });

  it("touchdown expectation is opportunity-driven and capped", () => {
    // Even extreme opportunity cannot push the TD rate past 0.095 per target.
    const extreme = evaluateTightEnd(
      baseInput({
        red_zone_target_rate: 1.0,
        end_zone_target_rate: 1.0,
        career_red_zone_target_rate: 1.0,
        career_end_zone_target_rate: 1.0,
        team_points_per_drive: 6.0,
      })
    );
    const targets = extreme.weekly.expected_targets;
    expect(extreme.weekly.expected_receiving_touchdowns).toBeLessThanOrEqual(
      targets * 0.095 + 0.1
    );
  });
});
