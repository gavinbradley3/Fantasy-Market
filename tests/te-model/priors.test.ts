import { describe, expect, it } from "vitest";
import {
  contractSecurityMapping,
  draftProspectTprrPrior,
} from "../../src/te-model/priors.js";

describe("TPRR prior mapping (26.5.7)", () => {
  it("uses the exact draft-round bases", () => {
    expect(draftProspectTprrPrior(1, "BALANCED")).toBeCloseTo(0.205, 12);
    expect(draftProspectTprrPrior(2, "BALANCED")).toBeCloseTo(0.195, 12);
    expect(draftProspectTprrPrior(3, "BALANCED")).toBeCloseTo(0.185, 12);
    expect(draftProspectTprrPrior(4, "BALANCED")).toBeCloseTo(0.175, 12);
    expect(draftProspectTprrPrior(5, "BALANCED")).toBeCloseTo(0.175, 12);
    expect(draftProspectTprrPrior(6, "BALANCED")).toBeCloseTo(0.165, 12);
    expect(draftProspectTprrPrior(7, "BALANCED")).toBeCloseTo(0.165, 12);
    expect(draftProspectTprrPrior(null, "BALANCED")).toBeCloseTo(0.16, 12);
  });

  it("applies exactly one prospect-type adjustment", () => {
    expect(draftProspectTprrPrior(3, "RECEIVING")).toBeCloseTo(0.2, 12);
    expect(draftProspectTprrPrior(3, "BLOCKING_FIRST")).toBeCloseTo(0.17, 12);
    expect(draftProspectTprrPrior(3, "UNKNOWN")).toBeCloseTo(0.185, 12);
  });

  it("clamps the prior to [0.145, 0.225]", () => {
    expect(draftProspectTprrPrior(1, "RECEIVING")).toBeCloseTo(0.22, 12);
    expect(draftProspectTprrPrior(null, "BLOCKING_FIRST")).toBeCloseTo(0.145, 12);
    for (const round of [1, 2, 3, 4, 5, 6, 7, null] as const) {
      for (const type of ["RECEIVING", "BALANCED", "BLOCKING_FIRST", "UNKNOWN"] as const) {
        const prior = draftProspectTprrPrior(round, type);
        expect(prior).toBeGreaterThanOrEqual(0.145);
        expect(prior).toBeLessThanOrEqual(0.225);
      }
    }
  });
});

describe("contract-security mapping (26.5.6)", () => {
  it("matches the exact table", () => {
    expect(contractSecurityMapping(1)).toBe(1.0);
    expect(contractSecurityMapping(2)).toBe(0.82);
    expect(contractSecurityMapping(3)).toBe(0.65);
    expect(contractSecurityMapping(4)).toBe(0.45);
    expect(contractSecurityMapping(5)).toBe(0.45);
    expect(contractSecurityMapping(6)).toBe(0.26);
    expect(contractSecurityMapping(7)).toBe(0.26);
    expect(contractSecurityMapping(null)).toBe(0.2);
  });
});
