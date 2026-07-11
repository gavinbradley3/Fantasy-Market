import { describe, expect, it } from "vitest";
import { clamp, pct, roundTo } from "../../src/te-model/percentiles.js";

describe("shared mid-rank percentile estimator (26.4)", () => {
  const ref = [10, 20, 20, 30, 40];

  it("uses count below plus half of exact ties", () => {
    // x=20: below=1, equal=2 → 100 × (1 + 1) / 5 = 40
    expect(pct(20, ref)).toBe(40);
  });

  it("returns 0 below the minimum and 100 above the maximum", () => {
    expect(pct(5, ref)).toBe(0);
    expect(pct(45, ref)).toBe(100);
  });

  it("does not interpolate between observations", () => {
    // x=25: below=3, equal=0 → 60 regardless of distance to neighbors
    expect(pct(25, ref)).toBe(60);
    expect(pct(29.999, ref)).toBe(60);
  });

  it("handles unsorted reference arrays", () => {
    expect(pct(20, [40, 20, 10, 30, 20])).toBe(40);
  });

  it("uses strict numeric equality for ties (no epsilon)", () => {
    expect(pct(20.0000001, ref)).toBe(60); // not treated as equal to 20
  });

  it("exact minimum and maximum use mid-rank", () => {
    expect(pct(10, ref)).toBe(10); // (0 + 0.5) / 5
    expect(pct(40, ref)).toBe(90); // (4 + 0.5) / 5
  });

  it("throws on an empty distribution", () => {
    expect(() => pct(1, [])).toThrow();
  });
});

describe("clamp and rounding helpers", () => {
  it("clamps to bounds", () => {
    expect(clamp(-1, 0, 100)).toBe(0);
    expect(clamp(101, 0, 100)).toBe(100);
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it("rounds half away from zero at the declared precision", () => {
    expect(roundTo(1.25, 1)).toBe(1.3);
    expect(roundTo(1.24, 1)).toBe(1.2);
    expect(roundTo(0.6785, 3)).toBe(0.679);
  });
});
