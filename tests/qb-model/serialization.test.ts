import { describe, expect, it } from "vitest";
import {
  canonicalSerializeQBOutput,
  evaluateQuarterback,
} from "../../src/qb-model/index.js";
import { assertExactQBOutputShape, canonicalTimestamp } from "../../src/qb-model/serialization.js";
import { FIXTURE_OPTIONS, baseInput } from "./helpers.js";

/** Section 26.2.3 / 26.2.5 canonical serialization. */
describe("canonical serialization (26.2.5)", () => {
  const output = evaluateQuarterback(baseInput(), FIXTURE_OPTIONS);
  const json = canonicalSerializeQBOutput(output);

  it("canonicalizes as_of and generated_at to UTC", () => {
    expect(output.player.as_of).toBe("2026-09-10T22:00:00.000Z");
    expect(output.generated_at).toBe("2026-09-10T22:00:00.000Z");
    expect(canonicalTimestamp("2026-09-10T16:00:00-06:00")).toBe("2026-09-10T22:00:00.000Z");
  });

  it("emits key order matching Section 26.15", () => {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      "schema_version",
      "model_version",
      "reference_version",
      "generated_at",
      "player",
      "scoring",
      "status",
      "fallback_log",
      "components",
      "composites",
      "expected_fantasy_output",
      "confidence",
      "volatility",
      "explanations",
    ]);
    expect(Object.keys(parsed.components as object)).toEqual([
      "passing_opportunity",
      "passing_quality",
      "rushing_value",
      "scoring_environment",
      "role_security",
      "availability",
      "age_development",
      "sustainability",
    ]);
  });

  it("emits no insignificant whitespace and no exponent notation", () => {
    expect(json).not.toMatch(/\n/);
    expect(json).not.toMatch(/: /);
    expect(json).not.toMatch(/[eE][+-]?\d/);
    // Values remain JSON numbers, never numeric strings.
    expect(json).toContain('"role_security":');
    expect(json).not.toMatch(/"role_security":"/);
  });

  it("drops insignificant trailing zeros (70.0 -> 70)", () => {
    const zeroed = evaluateQuarterback(
      baseInput({ injury_status: "OUT", probability_active: 0, expected_games_limited: 2 }),
      FIXTURE_OPTIONS
    );
    const s = canonicalSerializeQBOutput(zeroed);
    expect(s).toContain('"weekly_fantasy_points":0');
    expect(s).not.toContain('"weekly_fantasy_points":0.0');
    // No numeric value serializes as negative zero (dates contain "-0", values never do).
    expect(s).not.toContain(":-0");
  });

  it("assertExactQBOutputShape rejects unknown and missing properties", () => {
    const bad = JSON.parse(JSON.stringify(output)) as Record<string, unknown> & {
      components: Record<string, unknown>;
    };
    bad.surprise = 1;
    expect(() => assertExactQBOutputShape(bad as never)).toThrow();

    const missing = JSON.parse(JSON.stringify(output)) as { components: Record<string, unknown> };
    delete missing.components.sustainability;
    expect(() => assertExactQBOutputShape(missing as never)).toThrow();
  });

  it("is idempotent and deterministic", () => {
    expect(canonicalSerializeQBOutput(output)).toBe(json);
    expect(canonicalSerializeQBOutput(evaluateQuarterback(baseInput(), FIXTURE_OPTIONS))).toBe(json);
  });
});
