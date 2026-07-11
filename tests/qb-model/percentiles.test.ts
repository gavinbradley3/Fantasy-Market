import { describe, expect, it } from "vitest";
import { inversePercentile, percentile } from "../../src/qb-model/math.js";

/** Section 26.4.1 percentile estimator tests (26.16.1 #3–#5). */
describe("percentile estimator (26.4.1)", () => {
  const A = [0, 2, 4, 6, 8, 10];

  it("exact minimum returns 0", () => {
    expect(percentile(0, A)).toBe(0);
    expect(percentile(-5, A)).toBe(0);
  });

  it("exact maximum returns 100", () => {
    expect(percentile(10, A)).toBe(100);
    expect(percentile(99, A)).toBe(100);
  });

  it("interpolation is deterministic and linear between anchors", () => {
    // n = 6, midpoint of first interval [0,2]: i=0, fraction=0.5 -> 100*0.5/5 = 10.
    expect(percentile(1, A)).toBeCloseTo(10, 12);
    // value exactly on an interior anchor A[3]=6 -> i=3 -> 100*3/5 = 60.
    expect(percentile(6, A)).toBeCloseTo(60, 12);
    // repeat call is identical.
    expect(percentile(3.5, A)).toBe(percentile(3.5, A));
  });

  it("handles repeated terminal values without ambiguity", () => {
    const withDupes = [0, 0.5, 1, 1, 1];
    // x below the duplicate plateau uses the first bracket where it fits.
    expect(percentile(0.25, withDupes)).toBeCloseTo((100 * 0.5) / 4, 12);
    // x >= last element returns 100.
    expect(percentile(1, withDupes)).toBe(100);
  });

  it("inversePercentile is 100 - percentile", () => {
    expect(inversePercentile(1, A)).toBeCloseTo(100 - percentile(1, A), 12);
    expect(inversePercentile(0, A)).toBe(100);
    expect(inversePercentile(10, A)).toBe(0);
  });
});
