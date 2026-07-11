import { describe, expect, it } from "vitest";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { FIXTURE_OPTIONS, baseInput, evalFixture } from "./helpers.js";

const run = (o = {}) => evaluateQuarterback(baseInput(o), FIXTURE_OPTIONS);

/** Section 26.11 confidence and 26.16.1 #9, 26.16.2 #13/#14. */
describe("confidence (26.11)", () => {
  it("#9 confidence stays within [0,100]", () => {
    for (const out of [run(), run({ nfl_seasons_completed: 0, role_status: "RECENTLY_BENCHED", recent_role_change: true }), evalFixture("QB-G07")]) {
      expect(out.confidence.score).toBeGreaterThanOrEqual(0);
      expect(out.confidence.score).toBeLessThanOrEqual(100);
    }
  });

  it("full-evidence established starter earns a perfect base score", () => {
    const out = run();
    expect(out.confidence.score).toBe(100);
    expect(out.confidence.label).toBe("HIGH");
    expect(out.confidence.penalty_codes).toHaveLength(0);
  });

  it("applies exact penalty codes additively", () => {
    const out = run({
      role_status: "COMPETITION",
      team_change: true,
      major_system_change: true,
    });
    expect(out.confidence.penalty_codes).toContain("ROLE_COMPETITION");
    expect(out.confidence.penalty_codes).toContain("TEAM_CHANGE");
    expect(out.confidence.penalty_codes).toContain("SYSTEM_CHANGE");
    // 100 - 8 - 5 - 5 = 82.
    expect(out.confidence.score).toBe(82);
  });

  it("penalty codes are de-duplicated and lexically sorted", () => {
    const out = evalFixture("QB-G12");
    const sorted = [...new Set(out.confidence.penalty_codes)].sort();
    expect(out.confidence.penalty_codes).toEqual(sorted);
  });

  it("#14 a fallback-heavy player can have a high composite yet low confidence", () => {
    const out = evalFixture("QB-G07");
    expect(out.confidence.label).toBe("LOW");
    expect(out.composites.dynasty).toBeGreaterThan(out.composites.weekly);
  });

  it("labels follow the unrounded boundaries", () => {
    // QB-G09 is a documented LOW-confidence starter.
    expect(evalFixture("QB-G09").confidence.label).toBe("LOW");
  });
});
