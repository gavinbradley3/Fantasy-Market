import { describe, expect, it } from "vitest";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import type { TEMVPInput } from "../../src/te-model/types.js";
import { baseInput } from "./helpers.js";

const vol = (overrides: Partial<TEMVPInput> = {}) =>
  evaluateTightEnd(baseInput(overrides)).volatility;

describe("volatility contributors (26.12)", () => {
  it("lower route participation raises volatility (16 × (1 - RP4))", () => {
    const high = vol({ route_participation_last4: 0.9 });
    const low = vol({ route_participation_last4: 0.3 });
    expect(low.score).toBeGreaterThan(high.score);
  });

  it("blocking gap contributes 10 × gap", () => {
    const tight = vol({ snap_share_last4: 0.7 });
    const wide = vol({ snap_share_last4: 1.0 });
    expect(wide.score - tight.score).toBeCloseTo(10 * 0.3, 1);
  });

  it("competition pressure contributes 16 × pressure", () => {
    const low = vol({ competition_pressure: 0.1 });
    const high = vol({ competition_pressure: 0.9 });
    expect(high.score - low.score).toBeCloseTo(16 * 0.8, 1);
  });

  it("prior weight contributes 140/(career_routes + 140)", () => {
    const rookie = vol({ career_routes: 0 });
    const veteran = vol({ career_routes: 14000 });
    expect(rookie.score - veteran.score).toBeCloseTo(
      14 * (1 - 140 / 14140),
      0
    );
  });

  it("status and flag terms add exactly", () => {
    const base = vol().score;
    expect(vol({ injury_status: "QUESTIONABLE", practice_status: "FULL" }).score).toBeCloseTo(
      base + 10,
      1
    );
    expect(vol({ role_change: "PROMOTED" }).score).toBeCloseTo(base + 10, 1);
    expect(vol({ role_change: "DEMOTED" }).score).toBeCloseTo(base + 10, 1);
    expect(vol({ role_change: "UNKNOWN" }).score).toBeCloseTo(base + 10, 1);
    expect(vol({ teammate_return_flag: true }).score).toBeCloseTo(base + 8, 1);
    expect(vol({ another_receiving_te_flag: true }).score).toBeCloseTo(base + 8, 1);
    expect(vol({ temporary_opportunity_flag: true }).score).toBeCloseTo(base + 8, 1);
    expect(vol({ new_team_flag: true }).score).toBeCloseTo(base + 6, 1);
  });

  it("td_dependence uses current active-game values, not Pactive-weighted EFO", () => {
    const healthy = vol();
    const doubtful = vol({ injury_status: "DOUBTFUL", practice_status: "DNP" });
    // Ramp stays 1.0 (supplied) → active-game values identical → same dependence,
    // even though Weekly EFO collapses with Pactive = 0.12.
    expect(doubtful.td_dependence).toBe(healthy.td_dependence);
    expect(doubtful.explosive_dependence).toBe(healthy.explosive_dependence);
  });

  it("dependences are serialized to one decimal within [0,1]", () => {
    const v = vol();
    expect(v.td_dependence).toBeGreaterThanOrEqual(0);
    expect(v.td_dependence).toBeLessThanOrEqual(1);
    expect(Number.isInteger(v.td_dependence * 10)).toBe(true);
    expect(Number.isInteger(v.explosive_dependence * 10)).toBe(true);
  });

  it("a stable low-volume blocker is not forced to high volatility", () => {
    const blocker = vol({
      route_participation_last4: 0.38,
      route_participation_last8: 0.4,
      snap_share_last4: 0.92,
      targets_per_route_run: 0.11,
      career_targets_per_route_run: 0.11,
      career_routes: 4000,
      competition_pressure: 0.3,
    });
    expect(blocker.score).toBeLessThan(66); // not HIGH
  });

  it("volatility does not alter projections", () => {
    const calm = evaluateTightEnd(baseInput());
    const flagged = evaluateTightEnd(baseInput({ new_team_flag: true }));
    expect(flagged.weekly.expected_routes).toBe(calm.weekly.expected_routes);
    expect(flagged.weekly.expected_fantasy_points).toBe(calm.weekly.expected_fantasy_points);
    expect(flagged.ros.expected_fantasy_points).toBe(calm.ros.expected_fantasy_points);
    expect(flagged.volatility.score).toBeGreaterThan(calm.volatility.score);
  });

  it("high TD-opportunity profiles show higher td_dependence", () => {
    const specialist = vol({
      red_zone_target_rate: 0.45,
      end_zone_target_rate: 0.26,
      career_red_zone_target_rate: 0.45,
      career_end_zone_target_rate: 0.26,
      team_points_per_drive: 2.8,
    });
    const lowTd = vol({
      red_zone_target_rate: 0.02,
      end_zone_target_rate: 0.0,
      career_red_zone_target_rate: 0.02,
      career_end_zone_target_rate: 0.0,
      team_points_per_drive: 1.3,
    });
    expect(specialist.td_dependence).toBeGreaterThan(lowTd.td_dependence);
  });
});
