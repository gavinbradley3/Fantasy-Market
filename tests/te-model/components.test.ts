import { describe, expect, it } from "vitest";
import { availabilityScore, computeComponents, computeDerived, percentileOf } from "../../src/te-model/components.js";
import { resolveCanonicalValues } from "../../src/te-model/fallbacks.js";
import { computePriors } from "../../src/te-model/priors.js";
import { resolveReference } from "../../src/te-model/references.js";
import { computeShrunkValues } from "../../src/te-model/shrinkage.js";
import { computeTrends } from "../../src/te-model/trends.js";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import type { TEComponentScores, TEMVPInput } from "../../src/te-model/types.js";
import { baseInput, missingDataInput } from "./helpers.js";

const reference = resolveReference(undefined);

function componentsFor(input: TEMVPInput): TEComponentScores {
  const resolution = resolveCanonicalValues(input, computePriors(input), reference);
  const shrunk = computeShrunkValues(input, resolution.canonical, resolution.shrunk_tprr);
  const trends = computeTrends(input, resolution.canonical, resolution.shrunk_tprr);
  const derived = computeDerived(resolution.canonical, resolution.shrunk_tprr);
  return computeComponents(input, resolution.canonical, shrunk, trends, derived, reference);
}

describe("shared pre-component values (26.8.1)", () => {
  it("blocking gap and blocking-heavy role", () => {
    const input = baseInput({ snap_share_last4: 0.9, route_participation_last4: 0.4 });
    const resolution = resolveCanonicalValues(input, computePriors(input), reference);
    const derived = computeDerived(resolution.canonical, resolution.shrunk_tprr);
    expect(derived.blocking_gap).toBeCloseTo(0.5, 12);
    expect(derived.blocking_heavy_role).toBe(true);
  });

  it("blocking-heavy requires both gap >= 0.25 and RP4 < 0.65", () => {
    const highRoutes = baseInput({ snap_share_last4: 0.95, route_participation_last4: 0.68 });
    const r1 = resolveCanonicalValues(highRoutes, computePriors(highRoutes), reference);
    expect(computeDerived(r1.canonical, r1.shrunk_tprr).blocking_heavy_role).toBe(false);
    const smallGap = baseInput({ snap_share_last4: 0.6, route_participation_last4: 0.5 });
    const r2 = resolveCanonicalValues(smallGap, computePriors(smallGap), reference);
    expect(computeDerived(r2.canonical, r2.shrunk_tprr).blocking_heavy_role).toBe(false);
  });

  it("base expected routes/targets exclude Pactive and ramp", () => {
    const input = baseInput({ workload_ramp_factor: 0.5, injury_status: "QUESTIONABLE" });
    const resolution = resolveCanonicalValues(input, computePriors(input), reference);
    const derived = computeDerived(resolution.canonical, resolution.shrunk_tprr);
    expect(derived.base_expected_routes).toBeCloseTo(35 * 0.7, 12);
    expect(derived.base_expected_targets).toBeCloseTo(35 * 0.7 * resolution.shrunk_tprr, 12);
  });
});

describe("RR — Route Role (26.8.2)", () => {
  it("matches the exact weighted formula", () => {
    const input = baseInput();
    const resolution = resolveCanonicalValues(input, computePriors(input), reference);
    const trends = computeTrends(input, resolution.canonical, resolution.shrunk_tprr);
    const expected =
      0.5 * percentileOf(reference, "route_participation", 0.7) +
      0.2 * percentileOf(reference, "route_participation", 0.68) +
      0.15 * trends.route_trend_score +
      0.1 * trends.route_consistency_score +
      0.05 * percentileOf(reference, "snap_share", 0.8);
    expect(componentsFor(input).RR).toBeCloseTo(expected, 10);
  });

  it("applies the blocking gate: RR capped at 65 for blocking-heavy roles", () => {
    // Very strong trend/consistency but blocking-heavy deployment.
    const input = baseInput({
      snap_share_last4: 0.97,
      route_participation_last4: 0.62,
      route_participation_last8: 0.62,
      previous_route_participation: 0.3,
    });
    const c = componentsFor(input);
    expect(c.RR).toBeLessThanOrEqual(65);
  });

  it("does not apply the gate when routes are high", () => {
    const input = baseInput({
      snap_share_last4: 0.97,
      route_participation_last4: 0.7,
      route_participation_last8: 0.7,
    });
    // gap = 0.27 but RP4 >= 0.65 → no gate.
    const c = componentsFor(input);
    expect(c.RR).toBeGreaterThan(65);
  });
});

describe("TE — Target Earning (26.8.3)", () => {
  it("matches the exact weighted formula", () => {
    const input = baseInput();
    const resolution = resolveCanonicalValues(input, computePriors(input), reference);
    const shrunk = computeShrunkValues(input, resolution.canonical, resolution.shrunk_tprr);
    const trends = computeTrends(input, resolution.canonical, resolution.shrunk_tprr);
    const expected =
      0.65 * percentileOf(reference, "targets_per_route_run", shrunk.shrunk_tprr) +
      0.2 * percentileOf(reference, "target_share", 0.14) +
      0.15 * trends.tprr_trend_score;
    expect(componentsFor(input).TE).toBeCloseTo(expected, 10);
  });

  it("caps TE at 82 when RP4 < 0.45; cap does not change expected targets", () => {
    const lowRoute = baseInput({
      route_participation_last4: 0.42,
      route_participation_last8: 0.42,
      targets_per_route_run: 0.3,
      career_targets_per_route_run: 0.3,
      target_share: 0.25,
      previous_targets_per_route_run: 0.1,
      career_routes: 5000,
    });
    const c = componentsFor(lowRoute);
    expect(c.TE).toBe(82);
    // Same player at RP4 0.46: no cap.
    const above = componentsFor(
      baseInput({
        route_participation_last4: 0.46,
        route_participation_last8: 0.46,
        targets_per_route_run: 0.3,
        career_targets_per_route_run: 0.3,
        target_share: 0.25,
        previous_targets_per_route_run: 0.1,
        career_routes: 5000,
      })
    );
    expect(above.TE).toBeGreaterThan(82);
  });
});

describe("TQ — Target Quality (26.8.4)", () => {
  it("depth quality peaks at aDOT 8.0 and decreases 5 points per yard away", () => {
    const at8 = componentsFor(baseInput({ average_depth_of_target: 8.0 }));
    const at10 = componentsFor(baseInput({ average_depth_of_target: 10.0 }));
    // Only the depth term differs: 0.25 × (100 - 5×2) vs 0.25 × 100.
    expect(at8.TQ - at10.TQ).toBeCloseTo(0.25 * 10, 10);
  });

  it("applies the volume gate at base expected targets < 2.0", () => {
    const lowVolume = baseInput({
      route_participation_last4: 0.2,
      route_participation_last8: 0.2,
      snap_share_last4: 0.3,
      targets_per_route_run: 0.1,
      career_targets_per_route_run: 0.1,
      projected_team_dropbacks: 28,
      red_zone_target_rate: 0.45,
      end_zone_target_rate: 0.28,
      career_red_zone_target_rate: 0.45,
      career_end_zone_target_rate: 0.28,
      catchable_target_rate: 0.95,
      average_depth_of_target: 8.0,
      career_targets: 500,
      career_routes: 3000,
    });
    const c = componentsFor(lowVolume);
    expect(c.TQ).toBeLessThanOrEqual(72);
  });
});

describe("RE — Receiving Efficiency (26.8.5)", () => {
  it("applies sample caps by career targets", () => {
    const elite = {
      catch_rate: 0.88,
      yards_per_target: 12,
      yards_per_reception: 15.8,
      yac_per_reception: 9.4,
      career_catch_rate: 0.88 as number | null,
      career_yards_per_target: 12 as number | null,
      career_yards_per_reception: 15.8 as number | null,
      career_yac_per_reception: 9.4 as number | null,
    };
    const tiny = componentsFor(baseInput({ ...elite, career_targets: 39 }));
    expect(tiny.RE).toBeLessThanOrEqual(75);
    const mid = componentsFor(baseInput({ ...elite, career_targets: 99 }));
    expect(mid.RE).toBeLessThanOrEqual(85);
    const large = componentsFor(baseInput({ ...elite, career_targets: 5000 }));
    expect(large.RE).toBeGreaterThan(85);

    const awful = {
      catch_rate: 0.4,
      yards_per_target: 4.0,
      yards_per_reception: 7.0,
      yac_per_reception: 2.0,
      career_catch_rate: 0.4 as number | null,
      career_yards_per_target: 4.0 as number | null,
      career_yards_per_reception: 7.0 as number | null,
      career_yac_per_reception: 2.0 as number | null,
    };
    const tinyAwful = componentsFor(baseInput({ ...awful, career_targets: 10 }));
    expect(tinyAwful.RE).toBeGreaterThanOrEqual(25);
    const midAwful = componentsFor(baseInput({ ...awful, career_targets: 60 }));
    expect(midAwful.RE).toBeGreaterThanOrEqual(15);
  });
});

describe("TC — Team Context (26.8.6)", () => {
  it("matches the exact weighted formula", () => {
    const input = baseInput();
    const expected =
      0.35 * percentileOf(reference, "projected_team_dropbacks", 35) +
      0.2 * percentileOf(reference, "team_points_per_drive", 2.0) +
      0.2 * percentileOf(reference, "team_red_zone_trips_per_game", 3.3) +
      0.15 * 65 +
      0.1 * (100 - 100 * 0.4);
    expect(componentsFor(input).TC).toBeCloseTo(expected, 10);
  });

  it("higher competition pressure lowers TC through its 10% term only", () => {
    const low = componentsFor(baseInput({ competition_pressure: 0.2 }));
    const high = componentsFor(baseInput({ competition_pressure: 0.8 }));
    expect(low.TC - high.TC).toBeCloseTo(0.1 * 100 * 0.6, 10);
  });
});

describe("RD — Role Durability (26.8.7)", () => {
  it("matches the exact base formula for the baseline", () => {
    // 45 + 20×0.7 - 22×0.4 + 0 + 10 + 5 + 0 + 6(RP4 0.70 & shrunk TPRR ≥ 0.18)
    const input = baseInput();
    const c = componentsFor(input);
    expect(c.RD).toBeCloseTo(45 + 14 - 8.8 + 10 + 5 + 6, 10);
  });

  it("role change, depth chart, coaching, age, and flags adjust exactly", () => {
    const base = componentsFor(baseInput()).RD;
    expect(componentsFor(baseInput({ role_change: "PROMOTED" })).RD).toBeCloseTo(base + 12, 10);
    expect(componentsFor(baseInput({ role_change: "DEMOTED" })).RD).toBeCloseTo(base - 12, 10);
    expect(componentsFor(baseInput({ depth_chart_role: "TE2" })).RD).toBeCloseTo(base - 8, 10);
    expect(componentsFor(baseInput({ depth_chart_role: "TE3_OR_DEPTH" })).RD).toBeCloseTo(
      base - 20,
      10
    );
    expect(componentsFor(baseInput({ coaching_continuity: "CHANGE" })).RD).toBeCloseTo(
      base - 10,
      10
    );
    expect(componentsFor(baseInput({ age: 24 })).RD).toBeCloseTo(base + 5, 10);
    expect(componentsFor(baseInput({ age: 30 })).RD).toBeCloseTo(base - 5, 10);
    expect(componentsFor(baseInput({ age: 33 })).RD).toBeCloseTo(base - 10, 10);
    expect(componentsFor(baseInput({ teammate_return_flag: true })).RD).toBeCloseTo(base - 8, 10);
    expect(componentsFor(baseInput({ another_receiving_te_flag: true })).RD).toBeCloseTo(
      base - 8,
      10
    );
    expect(componentsFor(baseInput({ temporary_opportunity_flag: true })).RD).toBeCloseTo(
      base - 10,
      10
    );
    expect(componentsFor(baseInput({ new_team_flag: true })).RD).toBeCloseTo(base - 6, 10);
  });

  it("increasing competition pressure lowers RD by 22 per unit", () => {
    const low = componentsFor(baseInput({ competition_pressure: 0.1 })).RD;
    const high = componentsFor(baseInput({ competition_pressure: 0.9 })).RD;
    expect(low - high).toBeCloseTo(22 * 0.8, 10);
  });

  it("blocking-heavy with low shrunk TPRR takes the -8 receiving-role adjustment", () => {
    const blocking = baseInput({
      snap_share_last4: 0.92,
      route_participation_last4: 0.38,
      route_participation_last8: 0.38,
      targets_per_route_run: 0.1,
      career_targets_per_route_run: 0.1,
      draft_round: 7,
      prospect_type: "BLOCKING_FIRST",
      career_routes: 5000,
    });
    const stable = componentsFor({ ...blocking, snap_share_last4: 0.5 });
    const gated = componentsFor(blocking);
    expect(gated.RD).toBeCloseTo(stable.RD - 8, 10);
  });
});

describe("AD — Age & Development (26.8.8)", () => {
  const AD_TABLE: Array<[number, number]> = [
    [18, 88], [19, 88], [20, 88], [21, 88], [22, 86], [23, 84], [24, 82], [25, 78],
    [26, 73], [27, 68], [28, 63], [29, 57], [30, 49], [31, 40], [32, 31], [33, 23],
    [34, 16], [40, 16], [45, 16],
  ];

  it("uses the exact discrete age table", () => {
    for (const [age, expected] of AD_TABLE) {
      const c = componentsFor(
        baseInput({ age, nfl_seasons_completed: 5, prospect_type: "BALANCED" })
      );
      expect(c.AD, `age ${age}`).toBe(expected);
    }
  });

  it("applies development and prospect adjustments", () => {
    expect(componentsFor(baseInput({ age: 26, nfl_seasons_completed: 1 })).AD).toBe(79);
    expect(componentsFor(baseInput({ age: 26, nfl_seasons_completed: 2 })).AD).toBe(79);
    expect(componentsFor(baseInput({ age: 26, nfl_seasons_completed: 3 })).AD).toBe(76);
    expect(componentsFor(baseInput({ age: 26, nfl_seasons_completed: 0 })).AD).toBe(73);
    expect(
      componentsFor(
        baseInput({ age: 26, nfl_seasons_completed: 5, prospect_type: "RECEIVING", career_routes: 299 })
      ).AD
    ).toBe(76);
    expect(
      componentsFor(
        baseInput({
          age: 26,
          nfl_seasons_completed: 5,
          prospect_type: "BLOCKING_FIRST",
          career_routes: 299,
        })
      ).AD
    ).toBe(70);
    expect(
      componentsFor(
        baseInput({ age: 26, nfl_seasons_completed: 5, prospect_type: "RECEIVING", career_routes: 300 })
      ).AD
    ).toBe(73);
  });
});

describe("AV — Availability (26.8.9)", () => {
  it("matches the exact lookup", () => {
    const av = (injury: TEMVPInput["injury_status"], practice: TEMVPInput["practice_status"]) =>
      availabilityScore(baseInput({ injury_status: injury, practice_status: practice }));
    expect(av("HEALTHY", "FULL")).toBe(98);
    expect(av("QUESTIONABLE", "FULL")).toBe(85);
    expect(av("QUESTIONABLE", "LIMITED")).toBe(68);
    expect(av("QUESTIONABLE", "DNP")).toBe(42);
    expect(av("QUESTIONABLE", "UNKNOWN")).toBe(42);
    expect(av("DOUBTFUL", "FULL")).toBe(12);
    expect(av("OUT", "DNP")).toBe(0);
    expect(av("IR", "DNP")).toBe(0);
    expect(av("PUP", "DNP")).toBe(0);
    expect(av("SUSPENDED", "DNP")).toBe(0);
    expect(av("UNKNOWN", "FULL")).toBe(72);
  });
});

describe("component ranges", () => {
  it("all components stay in [0,100] across extreme profiles", () => {
    for (const input of [baseInput(), missingDataInput(), baseInput({ age: 45, competition_pressure: 1, contract_security: 0, depth_chart_role: "TE3_OR_DEPTH", role_change: "DEMOTED", coaching_continuity: "CHANGE", teammate_return_flag: true, another_receiving_te_flag: true, temporary_opportunity_flag: true, new_team_flag: true })]) {
      const out = evaluateTightEnd(input);
      for (const value of Object.values(out.components)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
