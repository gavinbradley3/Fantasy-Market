import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import type { TEMVPInput, TEMVPOutput } from "../../src/te-model/types.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "te");
const EXPECTED_DIR = join(FIXTURE_DIR, "expected");

export const FIXTURE_NAMES = [
  "elite-receiving-focal-point",
  "full-time-balanced",
  "blocking-heavy-starter",
  "red-zone-specialist",
  "low-route-high-tprr",
  "young-breakout",
  "committee-tight-end",
  "aging-veteran",
  "injury-return",
  "out-player",
  "missing-data",
  "equal-snaps-low-routes",
  "equal-snaps-high-routes",
] as const;

function loadInput(name: string): TEMVPInput {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8")) as TEMVPInput;
}

function loadExpected(name: string): TEMVPOutput {
  return JSON.parse(readFileSync(join(EXPECTED_DIR, `${name}.json`), "utf8")) as TEMVPOutput;
}

describe("golden fixture outputs (26.16.6 / 26.16.8)", () => {
  it("all thirteen fixture inputs exist", () => {
    for (const name of FIXTURE_NAMES) {
      expect(existsSync(join(FIXTURE_DIR, `${name}.json`)), name).toBe(true);
    }
  });

  for (const name of FIXTURE_NAMES) {
    it(`${name}: complete serialized output matches its golden file field-for-field`, () => {
      const goldenPath = join(EXPECTED_DIR, `${name}.json`);
      expect(
        existsSync(goldenPath),
        `golden output missing — run: npm run generate:te-goldens`
      ).toBe(true);
      const actual = evaluateTightEnd(loadInput(name));
      expect(actual).toEqual(loadExpected(name));
      // Byte-level determinism against the stored golden serialization.
      expect(JSON.stringify(actual, null, 2) + "\n").toBe(
        readFileSync(goldenPath, "utf8")
      );
    });
  }
});

describe("fixture directional expectations", () => {
  const out = Object.fromEntries(
    FIXTURE_NAMES.map((name) => [name, evaluateTightEnd(loadInput(name))])
  ) as Record<(typeof FIXTURE_NAMES)[number], TEMVPOutput>;

  it("elite receiving focal point: strong RR/TE, high EFO, HIGH confidence, OK", () => {
    const elite = out["elite-receiving-focal-point"];
    expect(elite.components.RR).toBeGreaterThan(75);
    expect(elite.components.TE).toBeGreaterThan(75);
    expect(elite.weekly.expected_fantasy_points).toBeGreaterThan(12);
    expect(elite.ros.expected_fantasy_points).toBeGreaterThan(90);
    expect(elite.confidence.label).toBe("HIGH");
    expect(["LOW", "MEDIUM"]).toContain(elite.volatility.label);
    expect(elite.status).toBe("OK");
    expect(elite.fallback_log).toHaveLength(0);
  });

  it("full-time balanced: solid RR, moderate TE/TQ, strong RD, OK", () => {
    const balanced = out["full-time-balanced"];
    expect(balanced.components.RR).toBeGreaterThan(55);
    expect(balanced.components.TE).toBeGreaterThan(40);
    expect(balanced.components.TE).toBeLessThan(80);
    expect(balanced.components.RD).toBeGreaterThan(60);
    expect(balanced.status).toBe("OK");
  });

  it("blocking-heavy starter: snaps do not become routes; limited receiving EFO; durable football role", () => {
    const blocker = out["blocking-heavy-starter"];
    const elite = out["elite-receiving-focal-point"];
    expect(blocker.components.RR).toBeLessThanOrEqual(65); // gate
    expect(blocker.weekly.expected_routes).toBeLessThan(
      elite.weekly.expected_routes * 0.45
    );
    expect(blocker.weekly.expected_fantasy_points).toBeLessThan(
      elite.weekly.expected_fantasy_points * 0.45
    );
    expect(blocker.components.RD).toBeGreaterThan(40); // football role can stay stable
    expect(blocker.explanations.negative_drivers).toContain(
      "A blocking-heavy role limits receiving volume."
    );
  });

  it("red-zone specialist: elevated TD opportunity but not elite overall", () => {
    const specialist = out["red-zone-specialist"];
    const elite = out["elite-receiving-focal-point"];
    expect(specialist.volatility.td_dependence).toBeGreaterThan(
      out["full-time-balanced"].volatility.td_dependence
    );
    expect(specialist.weekly.expected_fantasy_points).toBeLessThan(
      elite.weekly.expected_fantasy_points * 0.75
    );
    expect(specialist.explanations.positive_drivers).toContain(
      "Red-zone usage supports touchdown opportunity."
    );
  });

  it("low-route/high-TPRR: TE exceeds RR; routes constrain volume", () => {
    const player = out["low-route-high-tprr"];
    expect(player.components.TE).toBeGreaterThan(player.components.RR);
    expect(player.weekly.expected_targets).toBeLessThan(
      out["elite-receiving-focal-point"].weekly.expected_targets * 0.75
    );
  });

  it("young breakout: strong AD, reduced confidence, elevated volatility, PARTIAL", () => {
    const young = out["young-breakout"];
    expect(young.components.AD).toBeGreaterThan(85);
    expect(young.confidence.score).toBeLessThan(85);
    expect(young.volatility.score).toBeGreaterThan(
      out["elite-receiving-focal-point"].volatility.score
    );
    expect(young.status).toBe("PARTIAL");
    expect(young.fallback_log.length).toBeGreaterThanOrEqual(1);
  });

  it("committee TE: constrained durability and limited ceiling, honest volatility", () => {
    const committee = out["committee-tight-end"];
    expect(committee.components.RD).toBeLessThan(50);
    expect(committee.weekly.expected_fantasy_points).toBeLessThan(
      out["full-time-balanced"].weekly.expected_fantasy_points
    );
    expect(committee.explanations.negative_drivers).toContain(
      "Another receiving option creates meaningful route and target competition."
    );
  });

  it("aging veteran: useful Weekly/ROS, HIGH confidence, Dynasty well below Weekly", () => {
    const veteran = out["aging-veteran"];
    expect(veteran.weekly.expected_fantasy_points).toBeGreaterThan(9);
    expect(veteran.confidence.label).toBe("HIGH");
    expect(veteran.composites.DYNASTY).toBeLessThan(veteran.composites.WEEKLY - 10);
    expect(veteran.status).toBe("OK");
  });

  it("injury return: ramp reduces conditional stats; Pactive applied once; first-game-only ROS ramp", () => {
    const returning = out["injury-return"];
    expect(returning.weekly.probability_active).toBeCloseTo(0.68, 12);
    expect(returning.weekly.workload_ramp_factor).toBeCloseTo(0.75, 12);
    // Conditional routes = dropbacks × RP4 × ramp = 35 × 0.70 × 0.75 = 18.375 → 18.4.
    expect(returning.weekly.expected_routes).toBeCloseTo(18.4, 12);
    // ROS: expected active games = 6 × 0.68 = 4.08 → 4.1 serialized.
    expect(returning.ros.expected_active_games).toBeCloseTo(4.1, 12);
    expect(returning.ros.expected_fantasy_points).toBeGreaterThan(0);
  });

  it("out player: all availability-driven outputs are zero", () => {
    const outPlayer = out["out-player"];
    expect(outPlayer.components.AV).toBe(0);
    expect(outPlayer.weekly.probability_active).toBe(0);
    expect(outPlayer.weekly.workload_ramp_factor).toBe(0);
    expect(outPlayer.weekly.expected_routes).toBe(0);
    expect(outPlayer.weekly.expected_fantasy_points).toBe(0);
    expect(outPlayer.ros.expected_active_games).toBe(0);
    expect(outPlayer.ros.expected_fantasy_points).toBe(0);
  });

  it("missing data: every fallback logged once, LOW confidence, PARTIAL, finite, no silent zeros", () => {
    const missing = out["missing-data"];
    expect(missing.fallback_log).toHaveLength(20);
    expect(new Set(missing.fallback_log.map((e) => e.field)).size).toBe(20);
    expect(missing.confidence.label).toBe("LOW");
    expect(missing.status).toBe("PARTIAL");
    expect(missing.weekly.expected_routes).toBeGreaterThan(0);
    expect(missing.weekly.expected_fantasy_points).toBeGreaterThan(0);
  });

  it("equal-snap pair: materially higher RR, routes, targets, EFO for the high-route player", () => {
    const high = out["equal-snaps-high-routes"];
    const low = out["equal-snaps-low-routes"];
    expect(high.components.RR).toBeGreaterThan(low.components.RR);
    expect(high.weekly.expected_routes).toBeGreaterThanOrEqual(
      low.weekly.expected_routes * 1.4
    );
    expect(high.weekly.expected_targets).toBeGreaterThanOrEqual(
      low.weekly.expected_targets * 1.4
    );
    expect(high.weekly.expected_fantasy_points).toBeGreaterThanOrEqual(
      low.weekly.expected_fantasy_points * 1.4
    );
  });
});
