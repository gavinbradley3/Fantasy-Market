import { describe, expect, it } from "vitest";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import {
  COMPONENT_EXPLANATIONS,
  DIRECT_EXPLANATIONS,
} from "../../src/qb-model/constants.js";
import { FIXTURE_OPTIONS, evalFixture, loadFixtureInput } from "./helpers.js";
import type { QBHorizon } from "../../src/qb-model/types.js";

const withHorizon = (name: string, selected_horizon: QBHorizon) =>
  evaluateQuarterback(loadFixtureInput(name), { ...FIXTURE_OPTIONS, selected_horizon });

/** Section 26.13 explanations and 26.16.4. */
describe("explanations (26.13)", () => {
  it("#1/#2 at most three positive and three negative explanations", () => {
    for (const name of ["QB-G01", "QB-G05", "QB-G07", "QB-E01"]) {
      const out = evalFixture(name);
      expect(out.explanations.positive.length).toBeLessThanOrEqual(3);
      expect(out.explanations.negative.length).toBeLessThanOrEqual(3);
    }
  });

  it("#3 explanation text is exact and de-duplicated", () => {
    const out = evalFixture("QB-G01");
    expect(new Set(out.explanations.positive).size).toBe(out.explanations.positive.length);
    expect(new Set(out.explanations.negative).size).toBe(out.explanations.negative.length);
  });

  it("#5 temporary-starter direct explanation appears outside WEEKLY only", () => {
    const weekly = withHorizon("QB-G09", "WEEKLY");
    const dynasty = withHorizon("QB-G09", "DYNASTY");
    expect(weekly.explanations.negative).not.toContain(DIRECT_EXPLANATIONS.TEMPORARY_STARTER);
    expect(dynasty.explanations.negative).toContain(DIRECT_EXPLANATIONS.TEMPORARY_STARTER);
  });

  it("#6 fallback-heavy explanation appears at five or more unique fallback codes", () => {
    const out = evalFixture("QB-G07");
    expect(out.fallback_log.length).toBeGreaterThanOrEqual(5);
    expect(out.explanations.negative).toContain(DIRECT_EXPLANATIONS.FALLBACK_HEAVY);
  });

  it("recently-benched direct explanation uses the exact template", () => {
    const out = evalFixture("QB-E02");
    expect(out.explanations.negative).toContain(DIRECT_EXPLANATIONS.RECENTLY_BENCHED);
  });

  it("rushing-dependence positive appears for a rushing-heavy strong-RV profile", () => {
    const out = evalFixture("QB-G05");
    expect(out.explanations.positive).toContain(DIRECT_EXPLANATIONS.RUSHING_DEPENDENCE);
  });

  it("#4/#7 selected horizon changes component ranking only; output is deterministic", () => {
    const a = withHorizon("QB-G01", "WEEKLY");
    const b = withHorizon("QB-G01", "WEEKLY");
    expect(a.explanations).toEqual(b.explanations);

    // Non-component (direct) negatives are horizon-invariant except the temporary-starter
    // rule; component-driver templates are the only pieces re-ranked by horizon weights.
    const weekly = withHorizon("QB-G08", "WEEKLY");
    const dynasty = withHorizon("QB-G08", "DYNASTY");
    const componentTexts = new Set(
      Object.values(COMPONENT_EXPLANATIONS).flatMap((t) => [t.positive, t.negative])
    );
    const nonComponentNeg = (arr: string[]) => arr.filter((t) => !componentTexts.has(t));
    expect(nonComponentNeg(weekly.explanations.negative)).toEqual(
      nonComponentNeg(dynasty.explanations.negative)
    );
  });
});
