import { describe, expect, it } from "vitest";
import { computeShrunkValues, shrink, shrunkTprr } from "../../src/te-model/shrinkage.js";
import { resolveCanonicalValues } from "../../src/te-model/fallbacks.js";
import { computePriors } from "../../src/te-model/priors.js";
import { resolveReference } from "../../src/te-model/references.js";
import type { TEMVPInput } from "../../src/te-model/types.js";
import { baseInput } from "./helpers.js";

function shrunkFor(input: TEMVPInput) {
  const resolution = resolveCanonicalValues(
    input,
    computePriors(input),
    resolveReference(undefined)
  );
  return computeShrunkValues(input, resolution.canonical, resolution.shrunk_tprr);
}

describe("shared shrinkage form (26.6)", () => {
  it("sample_weight = n/(n+k) blends observed and prior", () => {
    expect(shrink(0.3, 0, 100, 0.2)).toBeCloseTo(0.2, 12); // zero exposure → prior
    expect(shrink(0.3, 100, 100, 0.2)).toBeCloseTo(0.25, 12); // half weight
    expect(shrink(0.3, 900, 100, 0.2)).toBeCloseTo(0.29, 12); // large exposure → observed
  });
});

describe("TPRR shrinkage (26.6.1, k=140 on career routes)", () => {
  const prior = 0.195; // round 2, BALANCED

  it.each([
    [0, prior],
    [70, (70 / 210) * 0.26 + (140 / 210) * prior],
    [140, 0.5 * 0.26 + 0.5 * prior],
    [1400, (1400 / 1540) * 0.26 + (140 / 1540) * prior],
  ])("career_routes=%d", (routes, expected) => {
    expect(shrunkTprr(0.26, routes as number, prior)).toBeCloseTo(expected as number, 12);
  });
});

describe("per-signal shrinkage constants and priors (26.6.2–26.6.7)", () => {
  it("uses exact k values and career priors at medium exposure", () => {
    const input = baseInput({ career_targets: 120 });
    const s = shrunkFor(input);
    const w = (k: number) => 120 / (120 + k);
    expect(s.shrunk_catch_rate).toBeCloseTo(w(120) * 0.7 + (1 - w(120)) * 0.69, 12);
    expect(s.shrunk_yards_per_target).toBeCloseTo(w(180) * 7.6 + (1 - w(180)) * 7.5, 12);
    expect(s.shrunk_yards_per_reception).toBeCloseTo(w(160) * 10.9 + (1 - w(160)) * 10.8, 12);
    expect(s.shrunk_yac_per_reception).toBeCloseTo(w(180) * 4.9 + (1 - w(180)) * 4.8, 12);
    expect(s.shrunk_red_zone_target_rate).toBeCloseTo(w(120) * 0.2 + (1 - w(120)) * 0.19, 12);
    expect(s.shrunk_end_zone_target_rate).toBeCloseTo(w(160) * 0.09 + (1 - w(160)) * 0.08, 12);
  });

  it("uses fixed neutral priors when non-overlapping career values are null", () => {
    const input = baseInput({
      career_targets: 0,
      career_catch_rate: null,
      career_yards_per_target: null,
      career_yards_per_reception: null,
      career_yac_per_reception: null,
      career_red_zone_target_rate: null,
      career_end_zone_target_rate: null,
    });
    const s = shrunkFor(input);
    // Zero exposure → shrunk value equals the neutral prior exactly.
    expect(s.shrunk_catch_rate).toBeCloseTo(0.68, 12);
    expect(s.shrunk_yards_per_target).toBeCloseTo(7.2, 12);
    expect(s.shrunk_yards_per_reception).toBeCloseTo(10.6, 12);
    expect(s.shrunk_yac_per_reception).toBeCloseTo(4.6, 12);
    expect(s.shrunk_red_zone_target_rate).toBeCloseTo(0.18, 12);
    expect(s.shrunk_end_zone_target_rate).toBeCloseTo(0.08, 12);
  });

  it("large exposure converges toward observed values", () => {
    const input = baseInput({ career_targets: 100000 });
    const s = shrunkFor(input);
    expect(s.shrunk_catch_rate).toBeCloseTo(0.7, 3);
    expect(s.shrunk_yards_per_target).toBeCloseTo(7.6, 3);
  });

  it("only the seven approved signals are shrunk", () => {
    const s = shrunkFor(baseInput());
    expect(Object.keys(s).sort()).toEqual(
      [
        "shrunk_catch_rate",
        "shrunk_end_zone_target_rate",
        "shrunk_red_zone_target_rate",
        "shrunk_tprr",
        "shrunk_yac_per_reception",
        "shrunk_yards_per_reception",
        "shrunk_yards_per_target",
      ].sort()
    );
  });

  it("route participation is not shrunk (canonical equals observed)", () => {
    const input = baseInput({ career_routes: 0, career_targets: 0 });
    const resolution = resolveCanonicalValues(
      input,
      computePriors(input),
      resolveReference(undefined)
    );
    expect(resolution.canonical.rp4).toBe(0.7);
    expect(resolution.canonical.rp8).toBe(0.68);
  });
});
