import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalSerializeQBOutput } from "../../src/qb-model/index.js";
import { round1 } from "../../src/qb-model/math.js";
import { EXPECTED_DIR, FIXTURE_DIR, evalFixture } from "./helpers.js";
import type { QBMVPOutput } from "../../src/qb-model/types.js";

export const FIXTURE_NAMES = [
  "QB-G01",
  "QB-G02",
  "QB-G03",
  "QB-G04",
  "QB-G05",
  "QB-G06",
  "QB-G07",
  "QB-G08",
  "QB-G09",
  "QB-G10",
  "QB-G11",
  "QB-G12",
  "QB-E01",
  "QB-E02",
  "QB-E03",
  "QB-G11-HEALTHY",
  "QB-E02-BASE",
  "QB-E03-HEALTHY",
  "QB-I01-A",
  "QB-I01-B",
  "QB-I02-A",
  "QB-I02-B",
  "QB-I03-A",
  "QB-I03-B",
] as const;

const out = Object.fromEntries(FIXTURE_NAMES.map((n) => [n, evalFixture(n)])) as Record<
  (typeof FIXTURE_NAMES)[number],
  QBMVPOutput
>;

describe("golden fixtures (26.16.6 / 26.16.7)", () => {
  it("all fixture inputs exist", () => {
    for (const name of FIXTURE_NAMES) {
      expect(existsSync(join(FIXTURE_DIR, `${name}.json`)), name).toBe(true);
    }
  });

  for (const name of FIXTURE_NAMES) {
    it(`${name}: canonical output is byte-identical to its golden file`, () => {
      const goldenPath = join(EXPECTED_DIR, `${name}.json`);
      expect(existsSync(goldenPath), `golden missing — run: npm run generate:qb-goldens`).toBe(
        true
      );
      const actual = `${canonicalSerializeQBOutput(out[name])}\n`;
      expect(actual).toBe(readFileSync(goldenPath, "utf8"));
    });
  }

  it("golden outputs are deterministic across repeated evaluation", () => {
    for (const name of FIXTURE_NAMES) {
      expect(canonicalSerializeQBOutput(evalFixture(name))).toBe(
        canonicalSerializeQBOutput(out[name])
      );
    }
  });
});

/** Section 26.16.8 full-precision audit anchors. */
describe("audit anchors (26.16.8)", () => {
  const anchor = (got: number, expected: number) => expect(got).toBeCloseTo(expected, 3);

  it("matches every published full-precision spot-check value", () => {
    anchor(out["QB-G01"].components.rushing_value, 69.0812);
    anchor(out["QB-G02"].components.passing_quality, 76.3742);
    anchor(out["QB-G03"].components.sustainability, 48.925);
    anchor(out["QB-G03"].composites.weekly, 53.3966);
    anchor(out["QB-G03"].composites.three_year, 61.2507);
    anchor(out["QB-G03"].volatility.score, 18.2407);
    anchor(out["QB-G04"].components.passing_opportunity, 45.8824);
    anchor(out["QB-G05"].components.rushing_value, 75.7276);
    anchor(out["QB-G05"].volatility.score, 34.9311);
    anchor(out["QB-G08"].components.age_development, 72.3);
    anchor(out["QB-G08"].composites.one_year, 63.6587);
    anchor(out["QB-G08"].composites.three_year, 63.2047);
    anchor(out["QB-G08"].composites.dynasty, 62.3734);
    anchor(out["QB-G09"].composites.weekly, 57.3741);
    anchor(out["QB-G09"].composites.dynasty, 58.3953);
    anchor(out["QB-G10"].volatility.score, 28.0882);
    expect(out["QB-I02-A"].confidence.score).toBe(100);
    expect(out["QB-I02-B"].confidence.score).toBe(92);
  });
});

/** Section 26.16.6 mandatory per-fixture relational assertions. */
describe("fixture relational assertions (26.16.6)", () => {
  it("QB-G01", () => {
    const o = out["QB-G01"];
    expect(o.components.passing_quality).toBeGreaterThanOrEqual(65);
    expect(o.components.rushing_value).toBeGreaterThanOrEqual(65);
    expect(o.components.role_security).toBeGreaterThanOrEqual(80);
    expect(o.composites.weekly).toBeGreaterThanOrEqual(70);
    expect(o.confidence.score).toBeGreaterThanOrEqual(70);
    expect(o.volatility.rushing_dependence).toBeGreaterThanOrEqual(25);
  });
  it("QB-G02", () => {
    const o = out["QB-G02"];
    expect(o.components.passing_quality).toBeGreaterThanOrEqual(75);
    expect(o.components.passing_opportunity).toBeGreaterThanOrEqual(70);
    expect(o.components.rushing_value).toBeLessThanOrEqual(40);
    expect(o.components.role_security).toBeGreaterThanOrEqual(80);
    expect(o.composites.weekly).toBeGreaterThanOrEqual(65);
    expect(o.composites.dynasty).toBeGreaterThanOrEqual(55);
  });
  it("QB-G03", () => {
    const o = out["QB-G03"];
    expect(o.components.passing_opportunity).toBeGreaterThanOrEqual(70);
    expect(o.components.passing_quality).toBeLessThanOrEqual(40);
    expect(o.components.sustainability).toBeLessThanOrEqual(50);
    expect(o.composites.weekly).toBeLessThan(o.composites.three_year);
    expect(o.volatility.score).toBeGreaterThanOrEqual(15);
  });
  it("QB-G04", () => {
    const o = out["QB-G04"];
    expect(o.components.passing_opportunity).toBeLessThanOrEqual(50);
    expect(o.components.rushing_value).toBeLessThanOrEqual(40);
    expect(o.components.sustainability).toBeGreaterThanOrEqual(50);
    expect(o.components.role_security).toBeGreaterThanOrEqual(70);
    expect(o.composites.weekly).toBeLessThanOrEqual(out["QB-G01"].composites.weekly - 10);
  });
  it("QB-G05", () => {
    const o = out["QB-G05"];
    expect(o.components.rushing_value).toBeGreaterThanOrEqual(75);
    expect(o.components.passing_quality).toBeLessThanOrEqual(45);
    expect(o.volatility.rushing_dependence).toBeGreaterThanOrEqual(40);
    expect(o.volatility.score).toBeGreaterThanOrEqual(30);
  });
  it("QB-G06", () => {
    const o = out["QB-G06"];
    expect(o.components.age_development).toBeGreaterThanOrEqual(80);
    expect(o.components.role_security).toBeGreaterThanOrEqual(70);
    expect(o.composites.dynasty).toBeGreaterThanOrEqual(o.composites.ros);
    expect(o.confidence.score).toBeLessThan(out["QB-G08"].confidence.score);
  });
  it("QB-G07", () => {
    const o = out["QB-G07"];
    expect(o.components.age_development).toBeGreaterThanOrEqual(75);
    expect(o.confidence.label).toBe("LOW");
    expect(o.status).toBe("FALLBACK_HEAVY");
    expect(o.composites.dynasty).toBeGreaterThan(o.composites.weekly);
  });
  it("QB-G08", () => {
    const o = out["QB-G08"];
    expect(o.confidence.label).toBe("HIGH");
    expect(o.components.age_development).toBeLessThanOrEqual(75);
    expect(o.composites.three_year).toBeLessThan(o.composites.one_year);
    expect(o.composites.dynasty).toBeLessThanOrEqual(o.composites.one_year - 1);
  });
  it("QB-G09", () => {
    const o = out["QB-G09"];
    expect(o.expected_fantasy_output.weekly_fantasy_points).toBeGreaterThan(0);
    expect(o.components.role_security).toBeLessThanOrEqual(55);
    expect(o.composites.weekly).toBeLessThan(o.composites.dynasty);
  });
  it("QB-G10", () => {
    const o = out["QB-G10"];
    expect(o.components.role_security).toBeLessThanOrEqual(55);
    expect(o.volatility.score).toBeGreaterThanOrEqual(25);
  });
  it("QB-G11", () => {
    const o = out["QB-G11"];
    expect(round1(o.expected_fantasy_output.weekly_fantasy_points)).toBe(
      round1(0.7 * o.expected_fantasy_output.conditional_on_active.fantasy_points)
    );
    expect(o.components.availability).toBeLessThan(out["QB-G11-HEALTHY"].components.availability);
    expect(o.confidence.penalty_codes).toContain("INJURY_QUESTIONABLE");
    expect(o.volatility.score).toBeGreaterThan(out["QB-G11-HEALTHY"].volatility.score);
  });
  it("QB-G12", () => {
    const o = out["QB-G12"];
    expect(o.status).toBe("FALLBACK_HEAVY");
    expect(o.confidence.penalty_codes).toContain("FALLBACK_8_PLUS");
    expect(o.fallback_log).toEqual([...new Set(o.fallback_log)].sort());
    for (const v of Object.values(o.components)) expect(Number.isFinite(v)).toBe(true);
  });
  it("QB-E01", () => {
    const o = out["QB-E01"];
    expect(o.components.role_security).toBeLessThanOrEqual(30);
    expect(o.components.passing_opportunity).toBeLessThanOrEqual(30);
    expect(o.composites.dynasty).toBeGreaterThan(0);
    expect(o.expected_fantasy_output.weekly_fantasy_points).toBeGreaterThan(0);
  });
  it("QB-E02", () => {
    const o = out["QB-E02"];
    const base = out["QB-E02-BASE"];
    expect(o.components.role_security).toBeLessThan(base.components.role_security);
    expect(o.volatility.score).toBeGreaterThan(base.volatility.score);
    expect(o.explanations.negative).toContain(
      "Recent benching creates severe starting-role uncertainty."
    );
  });
  it("QB-E03", () => {
    const o = out["QB-E03"];
    const healthy = out["QB-E03-HEALTHY"];
    expect(o.expected_fantasy_output.weekly_fantasy_points).toBe(0);
    expect(o.expected_fantasy_output.conditional_on_active.fantasy_points).toBeGreaterThan(0);
    expect(o.components.availability).toBeLessThan(healthy.components.availability);
    for (const c of [
      "passing_opportunity",
      "passing_quality",
      "rushing_value",
      "scoring_environment",
      "role_security",
      "age_development",
      "sustainability",
    ] as const) {
      expect(o.components[c]).toBeCloseTo(healthy.components[c], 12);
    }
  });
});
