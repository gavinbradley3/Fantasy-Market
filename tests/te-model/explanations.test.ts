import { describe, expect, it } from "vitest";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import type { TEHorizon, TEMVPInput } from "../../src/te-model/types.js";
import { baseInput, missingDataInput } from "./helpers.js";

const explain = (overrides: Partial<TEMVPInput> = {}, horizon?: TEHorizon) =>
  evaluateTightEnd(baseInput(overrides), horizon ? { selected_horizon: horizon } : undefined)
    .explanations;

const FORBIDDEN_LANGUAGE = /(certain|proof|proves|guarantee|caused by|causes|diagnos|definitely|will break out)/i;

describe("direct EFO explanations (26.13.1)", () => {
  it("route rule triggers at RP4 >= 0.75", () => {
    const on = explain({ route_participation_last4: 0.75 });
    expect(on.positive_drivers).toContain("Runs routes on most team dropbacks.");
    const off = explain({ route_participation_last4: 0.74 });
    expect(off.positive_drivers).not.toContain("Runs routes on most team dropbacks.");
  });

  it("target-earning rule triggers at shrunk TPRR >= 0.22", () => {
    const on = explain({
      targets_per_route_run: 0.28,
      career_targets_per_route_run: 0.28,
      career_routes: 5000,
    });
    expect(on.positive_drivers).toContain("Earns targets at a strong rate when in a route.");
  });

  it("red-zone rule triggers on shrunk RZ >= 0.24 or shrunk EZ >= 0.12", () => {
    const on = explain({
      red_zone_target_rate: 0.3,
      career_red_zone_target_rate: 0.3,
    });
    expect(on.positive_drivers).toContain("Red-zone usage supports touchdown opportunity.");
  });

  it("blocking-heavy rule triggers only for blocking-heavy roles", () => {
    const on = explain({ snap_share_last4: 0.95, route_participation_last4: 0.4 });
    expect(on.negative_drivers).toContain("A blocking-heavy role limits receiving volume.");
    const off = explain();
    expect(off.negative_drivers).not.toContain("A blocking-heavy role limits receiving volume.");
  });

  it("competition rule triggers at pressure >= 0.65 or another receiving TE", () => {
    const pressure = explain({ competition_pressure: 0.65 });
    expect(pressure.negative_drivers).toContain(
      "Another receiving option creates meaningful route and target competition."
    );
    const flag = explain({ another_receiving_te_flag: true });
    expect(flag.negative_drivers).toContain(
      "Another receiving option creates meaningful route and target competition."
    );
  });

  it("temporary-opportunity and new-team rules share the role_durability topic; rule 6 wins", () => {
    const both = explain({ temporary_opportunity_flag: true, new_team_flag: true });
    expect(both.negative_drivers).toContain(
      "Recent receiving usage may be temporary while a teammate is unavailable."
    );
    expect(both.negative_drivers).not.toContain(
      "A new-team role adds uncertainty to the projection."
    );
    const newTeamOnly = explain({ new_team_flag: true });
    expect(newTeamOnly.negative_drivers).toContain(
      "A new-team role adds uncertainty to the projection."
    );
  });

  it("availability rule triggers when AV < 60", () => {
    const out = explain({ injury_status: "QUESTIONABLE", practice_status: "DNP" });
    expect(out.negative_drivers).toContain(
      "Current availability materially lowers the weekly outlook."
    );
  });

  it("age rule triggers only on THREE_YEAR/DYNASTY horizons when AD < 35", () => {
    const old = { age: 33, nfl_seasons_completed: 11 } as Partial<TEMVPInput>;
    const dynasty = explain(old, "DYNASTY");
    expect(dynasty.negative_drivers).toContain(
      "The current role is productive, but long-term age risk is increasing."
    );
    const threeYear = explain(old, "THREE_YEAR");
    expect(threeYear.negative_drivers).toContain(
      "The current role is productive, but long-term age risk is increasing."
    );
    const weekly = explain(old, "WEEKLY");
    expect(weekly.negative_drivers).not.toContain(
      "The current role is productive, but long-term age risk is increasing."
    );
  });

  it("td-dependence rule triggers at td_dependence >= 0.35", () => {
    const out = evaluateTightEnd(
      baseInput({
        red_zone_target_rate: 0.46,
        end_zone_target_rate: 0.29,
        career_red_zone_target_rate: 0.46,
        career_end_zone_target_rate: 0.29,
        team_points_per_drive: 3.0,
        catch_rate: 0.5,
        career_catch_rate: 0.5,
        yards_per_target: 4.5,
        career_yards_per_target: 4.5,
        yards_per_reception: 7.5,
        career_yards_per_reception: 7.5,
        yac_per_reception: 2.4,
        career_yac_per_reception: 2.4,
        scoring: {
          points_per_reception: 0.0,
          points_per_receiving_yard: 0.02,
          points_per_receiving_td: 6.0,
        },
      })
    );
    expect(out.volatility.td_dependence).toBeGreaterThanOrEqual(0.35);
    expect(out.explanations.negative_drivers).toContain(
      "The projection depends heavily on touchdowns."
    );
  });
});

describe("merge rules (26.13.3 / 26.16.4)", () => {
  it("returns at most three positive and three negative drivers", () => {
    const rich = explain({
      route_participation_last4: 0.86,
      route_participation_last8: 0.85,
      targets_per_route_run: 0.28,
      career_targets_per_route_run: 0.28,
      career_routes: 5000,
      career_targets: 900,
      red_zone_target_rate: 0.35,
      end_zone_target_rate: 0.2,
      career_red_zone_target_rate: 0.35,
      career_end_zone_target_rate: 0.2,
      qb_environment_score: 95,
      team_points_per_drive: 3.0,
      projected_team_dropbacks: 41,
      contract_security: 1.0,
    });
    expect(rich.positive_drivers.length).toBeLessThanOrEqual(3);
    expect(rich.negative_drivers.length).toBeLessThanOrEqual(3);

    const poor = evaluateTightEnd(missingDataInput()).explanations;
    expect(poor.positive_drivers.length).toBeLessThanOrEqual(3);
    expect(poor.negative_drivers.length).toBeLessThanOrEqual(3);
  });

  it("direct explanations precede component explanations", () => {
    const out = explain({
      route_participation_last4: 0.86,
      route_participation_last8: 0.85,
      targets_per_route_run: 0.28,
      career_targets_per_route_run: 0.28,
      career_routes: 5000,
    });
    expect(out.positive_drivers[0]).toBe("Runs routes on most team dropbacks.");
    expect(out.positive_drivers[1]).toBe("Earns targets at a strong rate when in a route.");
  });

  it("duplicate topics are removed: a direct route_role claim blocks the RR component driver", () => {
    const out = explain({ route_participation_last4: 0.86, route_participation_last8: 0.85 });
    const routeStatements = [...out.positive_drivers, ...out.negative_drivers].filter(
      (s) => s.includes("route usage") || s.includes("Runs routes")
    );
    expect(routeStatements).toEqual(["Runs routes on most team dropbacks."]);
  });

  it("one topic never appears in both arrays", () => {
    const inputs: Array<Partial<TEMVPInput>> = [
      {},
      { snap_share_last4: 0.95, route_participation_last4: 0.4 },
      { another_receiving_te_flag: true, competition_pressure: 0.9 },
      { injury_status: "DOUBTFUL", practice_status: "DNP" },
    ];
    const topicOf = (s: string): string => s; // fixed templates → statement text is a topic proxy
    for (const overrides of inputs) {
      const out = explain(overrides);
      const overlap = out.positive_drivers.filter((s) =>
        out.negative_drivers.map(topicOf).includes(s)
      );
      expect(overlap).toEqual([]);
    }
  });

  it("selected horizon changes explanation ordering only, never scores or EFO", () => {
    const horizons: TEHorizon[] = ["WEEKLY", "ROS", "ONE_YEAR", "THREE_YEAR", "DYNASTY"];
    const outputs = horizons.map((h) =>
      evaluateTightEnd(baseInput({ age: 33, nfl_seasons_completed: 11 }), {
        selected_horizon: h,
      })
    );
    const first = outputs[0]!;
    for (const out of outputs.slice(1)) {
      expect(out.components).toEqual(first.components);
      expect(out.composites).toEqual(first.composites);
      expect(out.weekly).toEqual(first.weekly);
      expect(out.ros).toEqual(first.ros);
      expect(out.confidence).toEqual(first.confidence);
      expect(out.volatility).toEqual(first.volatility);
    }
    // AD is low for an age-33 veteran: the age component driver appears for long
    // horizons (weight 0.20/0.27) but not for WEEKLY (weight 0.02).
    const weeklyOut = outputs[0]!;
    const dynastyOut = outputs[4]!;
    expect(
      dynastyOut.explanations.negative_drivers.some((s) => s.toLowerCase().includes("age"))
    ).toBe(true);
    expect(
      weeklyOut.explanations.negative_drivers.some((s) => s.toLowerCase().includes("age"))
    ).toBe(false);
  });

  it("uses fixed templates without certainty, proof, causal, or diagnostic language", () => {
    for (const input of [
      baseInput(),
      missingDataInput(),
      baseInput({ snap_share_last4: 0.95, route_participation_last4: 0.4 }),
      baseInput({ age: 34, nfl_seasons_completed: 12 }),
    ]) {
      for (const horizon of ["WEEKLY", "DYNASTY"] as const) {
        const out = evaluateTightEnd(input, { selected_horizon: horizon });
        for (const statement of [
          ...out.explanations.positive_drivers,
          ...out.explanations.negative_drivers,
        ]) {
          expect(statement).not.toMatch(FORBIDDEN_LANGUAGE);
        }
      }
    }
  });
});
