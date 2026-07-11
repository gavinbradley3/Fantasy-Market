import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import { resolveCanonicalValues } from "../../src/te-model/fallbacks.js";
import { computePriors } from "../../src/te-model/priors.js";
import { resolveReference } from "../../src/te-model/references.js";
import { computeShrunkValues } from "../../src/te-model/shrinkage.js";
import { calculateActiveGame } from "../../src/te-model/projections.js";
import { DEFAULT_SCORING } from "../../src/te-model/constants.js";
import type { TEMVPInput } from "../../src/te-model/types.js";
import { baseInput, missingDataInput } from "./helpers.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "te");

function loadFixture(name: string): TEMVPInput {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8")) as TEMVPInput;
}

/** Full-precision active-game values for the paired invariant (pre-serialization). */
function activeGameFor(input: TEMVPInput) {
  const resolution = resolveCanonicalValues(
    input,
    computePriors(input),
    resolveReference(undefined)
  );
  const shrunk = computeShrunkValues(input, resolution.canonical, resolution.shrunk_tprr);
  return calculateActiveGame(
    resolution.canonical.workload_ramp_factor,
    resolution.canonical,
    shrunk,
    DEFAULT_SCORING
  );
}

describe("mandatory paired equal-snap invariant (26.16.7)", () => {
  const playerA = loadFixture("equal-snaps-high-routes");
  const playerB = loadFixture("equal-snaps-low-routes");

  it("fixtures differ only in RP4 (and identity)", () => {
    const a = { ...playerA, player_id: "", player_name: "", team: "", route_participation_last4: 0 };
    const b = { ...playerB, player_id: "", player_name: "", team: "", route_participation_last4: 0 };
    expect(a).toEqual(b);
    expect(playerA.snap_share_last4).toBe(0.82);
    expect(playerB.snap_share_last4).toBe(0.82);
    expect(playerA.route_participation_last4).toBe(0.78);
    expect(playerB.route_participation_last4).toBe(0.52);
  });

  it("holds before serialization with the exact 1.50 ratios at 1e-9 relative tolerance", () => {
    const gameA = activeGameFor(playerA);
    const gameB = activeGameFor(playerB);
    const outA = evaluateTightEnd(playerA, { selected_horizon: "WEEKLY" });
    const outB = evaluateTightEnd(playerB, { selected_horizon: "WEEKLY" });

    // Threshold conditions.
    expect(gameA.expected_routes).toBeGreaterThanOrEqual(gameB.expected_routes * 1.4);
    expect(gameA.expected_targets).toBeGreaterThanOrEqual(gameB.expected_targets * 1.4);
    const weeklyA = 0.98 * gameA.active_game_fantasy_points;
    const weeklyB = 0.98 * gameB.active_game_fantasy_points;
    expect(weeklyA).toBeGreaterThanOrEqual(weeklyB * 1.4);
    expect(outA.components.RR).toBeGreaterThan(outB.components.RR);

    // Exact linear ratio 0.78 / 0.52 = 1.50 at 1e-9 relative tolerance.
    const expectedRatio = 0.78 / 0.52;
    for (const [a, b] of [
      [gameA.expected_routes, gameB.expected_routes],
      [gameA.expected_targets, gameB.expected_targets],
      [weeklyA, weeklyB],
    ] as const) {
      expect(Math.abs(a / b - expectedRatio) / expectedRatio).toBeLessThan(1e-9);
    }
  });

  it("the high-route player also wins on serialized outputs", () => {
    const outA = evaluateTightEnd(playerA);
    const outB = evaluateTightEnd(playerB);
    expect(outA.weekly.expected_routes).toBeGreaterThan(outB.weekly.expected_routes);
    expect(outA.weekly.expected_targets).toBeGreaterThan(outB.weekly.expected_targets);
    expect(outA.weekly.expected_fantasy_points).toBeGreaterThan(
      outB.weekly.expected_fantasy_points
    );
    expect(outA.components.RR).toBeGreaterThan(outB.components.RR);
  });
});

describe("general invariants (26.16.1 / 26.16.10)", () => {
  it("identical inputs, options, and references reproduce byte-equivalent output", () => {
    const a = evaluateTightEnd(baseInput(), { selected_horizon: "ROS" });
    const b = evaluateTightEnd(baseInput(), { selected_horizon: "ROS" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("no serialized numeric output is non-finite across representative profiles", () => {
    for (const input of [baseInput(), missingDataInput(), baseInput({ injury_status: "OUT", practice_status: "DNP" })]) {
      const out = evaluateTightEnd(input);
      const walk = (value: unknown): void => {
        if (typeof value === "number") {
          expect(Number.isFinite(value)).toBe(true);
        } else if (Array.isArray(value)) {
          value.forEach(walk);
        } else if (value !== null && typeof value === "object") {
          Object.values(value).forEach(walk);
        }
      };
      walk(out);
    }
  });

  it("high snap share alone cannot produce elite routes, RR, or EFO when routes are low", () => {
    const blocker = evaluateTightEnd(
      baseInput({
        snap_share_last4: 0.97,
        route_participation_last4: 0.35,
        route_participation_last8: 0.35,
        previous_route_participation: 0.35,
      })
    );
    const receiver = evaluateTightEnd(
      baseInput({
        snap_share_last4: 0.8,
        route_participation_last4: 0.85,
        route_participation_last8: 0.85,
        previous_route_participation: 0.85,
      })
    );
    expect(blocker.components.RR).toBeLessThanOrEqual(65);
    expect(blocker.weekly.expected_routes).toBeLessThan(receiver.weekly.expected_routes * 0.5);
    expect(blocker.weekly.expected_fantasy_points).toBeLessThan(
      receiver.weekly.expected_fantasy_points * 0.6
    );
  });

  it("snap-share proxy sets PARTIAL with canonical RP4/RP8 logs only (26.16.2 #9)", () => {
    const out = evaluateTightEnd(
      baseInput({
        route_participation_last4: null,
        route_participation_last8: null,
        snap_share_last4: 0.9,
      })
    );
    expect(out.status).toBe("PARTIAL");
    expect(out.fallback_log).toEqual([
      { field: "RP4", fallback_used: "SNAP_SHARE_PROXY", confidence_penalty: 15 },
      { field: "RP8", fallback_used: "SNAP_SHARE_PROXY", confidence_penalty: 12 },
    ]);
  });

  it("blocking gap never reduces expected routes below observed RP4 (26.16.2 #12)", () => {
    const gapped = evaluateTightEnd(
      baseInput({ snap_share_last4: 1.0, route_participation_last4: 0.6, route_participation_last8: 0.6 })
    );
    const flat = evaluateTightEnd(
      baseInput({ snap_share_last4: 0.6, route_participation_last4: 0.6, route_participation_last8: 0.6 })
    );
    expect(gapped.weekly.expected_routes).toBe(flat.weekly.expected_routes);
    expect(gapped.weekly.expected_targets).toBe(flat.weekly.expected_targets);
    expect(gapped.weekly.expected_fantasy_points).toBe(flat.weekly.expected_fantasy_points);
  });

  it("realized touchdown totals are not an input and cannot change output", () => {
    const input = baseInput();
    const withExtra = { ...input, realized_touchdowns: 9 } as unknown as TEMVPInput;
    expect(JSON.stringify(evaluateTightEnd(withExtra))).toBe(
      JSON.stringify(evaluateTightEnd(input))
    );
  });

  it("a low-route/high-TPRR player has TE > RR and stays route-capped (26.16.2 #5)", () => {
    const player = loadFixture("low-route-high-tprr");
    const out = evaluateTightEnd(player);
    expect(out.components.TE).toBeGreaterThan(out.components.RR);
    const fullRouteTwin = evaluateTightEnd({
      ...player,
      route_participation_last4: 0.8,
      route_participation_last8: 0.8,
    });
    expect(out.weekly.expected_fantasy_points).toBeLessThan(
      fullRouteTwin.weekly.expected_fantasy_points
    );
  });

  it("a touchdown specialist cannot reach elite EFO from TD opportunity alone (26.16.2 #6)", () => {
    const specialist = evaluateTightEnd(loadFixture("red-zone-specialist"));
    const elite = evaluateTightEnd(loadFixture("elite-receiving-focal-point"));
    expect(specialist.weekly.expected_fantasy_points).toBeLessThan(
      elite.weekly.expected_fantasy_points * 0.75
    );
  });

  it("a young low-route TE is more prior-driven with lower confidence and higher volatility (26.16.2 #7)", () => {
    const young = evaluateTightEnd(loadFixture("young-breakout"));
    const established = evaluateTightEnd(loadFixture("elite-receiving-focal-point"));
    expect(young.confidence.score).toBeLessThan(established.confidence.score);
    expect(young.volatility.score).toBeGreaterThan(established.volatility.score);
  });

  it("an aging productive veteran keeps Weekly/ROS but loses long-term composites (26.16.2 #8)", () => {
    const veteran = evaluateTightEnd(loadFixture("aging-veteran"));
    expect(veteran.confidence.label).toBe("HIGH");
    expect(veteran.weekly.expected_fantasy_points).toBeGreaterThan(8);
    expect(veteran.composites.DYNASTY).toBeLessThan(veteran.composites.WEEKLY - 10);
    expect(veteran.composites.THREE_YEAR).toBeLessThan(veteran.composites.ROS);
  });

  it("another receiving TE lowers RD and raises volatility exactly (26.16.2 #10)", () => {
    const solo = evaluateTightEnd(baseInput());
    const shared = evaluateTightEnd(baseInput({ another_receiving_te_flag: true }));
    expect(solo.components.RD - shared.components.RD).toBeCloseTo(8, 10);
    expect(shared.volatility.score - solo.volatility.score).toBeCloseTo(8, 10);
    const returning = evaluateTightEnd(baseInput({ teammate_return_flag: true }));
    expect(solo.components.RD - returning.components.RD).toBeCloseTo(8, 10);
    expect(returning.volatility.score - solo.volatility.score).toBeCloseTo(8, 10);
  });

  it("components and composites never feed EFO: equal chains → equal EFO despite different components", () => {
    // Change only RD/AD inputs (flags, age, contract, depth chart) that do not enter the
    // projection chain: EFO must be identical while composites move.
    const a = evaluateTightEnd(baseInput());
    const b = evaluateTightEnd(
      baseInput({
        age: 33,
        nfl_seasons_completed: 11,
        contract_security: 0.1,
        depth_chart_role: "TE3_OR_DEPTH",
        coaching_continuity: "CHANGE",
        role_change: "DEMOTED",
      })
    );
    expect(b.weekly.expected_fantasy_points).toBe(a.weekly.expected_fantasy_points);
    expect(b.ros.expected_fantasy_points).toBe(a.ros.expected_fantasy_points);
    expect(b.composites.DYNASTY).not.toBe(a.composites.DYNASTY);
  });

  it("selected horizon does not change anything outside explanations", () => {
    const weekly = evaluateTightEnd(baseInput(), { selected_horizon: "WEEKLY" });
    const dynasty = evaluateTightEnd(baseInput(), { selected_horizon: "DYNASTY" });
    expect(dynasty.components).toEqual(weekly.components);
    expect(dynasty.composites).toEqual(weekly.composites);
    expect(dynasty.weekly).toEqual(weekly.weekly);
    expect(dynasty.ros).toEqual(weekly.ros);
    expect(dynasty.confidence).toEqual(weekly.confidence);
    expect(dynasty.volatility).toEqual(weekly.volatility);
    expect(dynasty.selected_horizon).toBe("DYNASTY");
  });

  it("output metadata includes resolved scoring, horizon, versions, and timestamp from input", () => {
    const out = evaluateTightEnd(baseInput(), { selected_horizon: "ROS" });
    expect(out.schema_version).toBe("te-mvp-1.0");
    expect(out.model_version).toBe("te-mvp-1.0");
    expect(out.reference_version).toBe("TE_REFERENCE_V1");
    expect(out.selected_horizon).toBe("ROS");
    expect(out.as_of_timestamp).toBe("2025-11-05T12:00:00Z");
  });
});
