import { describe, expect, it } from "vitest";
import { REFERENCE_DISTRIBUTION_NAMES } from "../../src/qb-model/constants.js";
import { QBValidationError } from "../../src/qb-model/errors.js";
import {
  QB_MVP_V1_REFERENCE_DISTRIBUTIONS,
  resolveReference,
  validateBundledReference,
  validateCustomReference,
} from "../../src/qb-model/references.js";
import { evaluateQuarterback } from "../../src/qb-model/index.js";
import { FIXTURE_OPTIONS, baseInput } from "./helpers.js";
import type { QBReferenceDistributions } from "../../src/qb-model/types.js";

/** Section 26.4.2 / 26.4.3 and 26.16.1 #1, #2, #19, #23. */
describe("reference distributions (26.4)", () => {
  it("every required reference array exists", () => {
    for (const name of REFERENCE_DISTRIBUTION_NAMES) {
      expect(Array.isArray(QB_MVP_V1_REFERENCE_DISTRIBUTIONS[name]), name).toBe(true);
      expect(QB_MVP_V1_REFERENCE_DISTRIBUTIONS[name].length).toBeGreaterThanOrEqual(2);
    }
    expect(REFERENCE_DISTRIBUTION_NAMES).toHaveLength(16);
  });

  it("every bundled reference array is sorted ascending", () => {
    for (const name of REFERENCE_DISTRIBUTION_NAMES) {
      const arr = QB_MVP_V1_REFERENCE_DISTRIBUTIONS[name];
      for (let i = 1; i < arr.length; i += 1) {
        expect((arr[i - 1] as number) <= (arr[i] as number), `${name}[${i}]`).toBe(true);
      }
    }
    expect(() => validateBundledReference(QB_MVP_V1_REFERENCE_DISTRIBUTIONS)).not.toThrow();
  });

  it("supplying custom references sets reference_version = CUSTOM (26.16.1 #23)", () => {
    // Custom arrays must be strictly increasing (no duplicates), unlike the bundled
    // default whose recent_start_rate has repeated terminal values.
    const custom: QBReferenceDistributions = {
      ...QB_MVP_V1_REFERENCE_DISTRIBUTIONS,
      recent_start_rate: [
        0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.84, 0.89, 0.93, 0.96, 0.98, 0.99,
        0.995, 0.999, 1.0,
      ],
    };
    expect(() => validateCustomReference(custom)).not.toThrow();
    const out = evaluateQuarterback(baseInput(), {
      ...FIXTURE_OPTIONS,
      reference_distributions: custom,
    });
    expect(out.reference_version).toBe("CUSTOM");
  });

  it("omitting references sets reference_version = QB_REFERENCE_V1 (26.16.1 #23)", () => {
    const out = evaluateQuarterback(baseInput(), FIXTURE_OPTIONS);
    expect(out.reference_version).toBe("QB_REFERENCE_V1");
    expect(resolveReference(undefined).reference_version).toBe("QB_REFERENCE_V1");
  });

  it("invalid custom references throw (26.16.1 #19)", () => {
    const clone = (): Record<string, unknown> =>
      JSON.parse(JSON.stringify(QB_MVP_V1_REFERENCE_DISTRIBUTIONS)) as Record<string, unknown>;

    // Missing a required key.
    const missing = clone();
    delete missing.cpoe;
    expect(() => validateCustomReference(missing)).toThrow(QBValidationError);

    // Unknown key.
    const unknown = clone();
    unknown.bogus = [1, 2, 3];
    expect(() => validateCustomReference(unknown)).toThrow(QBValidationError);

    // Non-strictly-increasing (custom arrays may not contain duplicates).
    const dup = clone();
    dup.completion_rate = [0.5, 0.5, 0.6];
    expect(() => validateCustomReference(dup)).toThrow(QBValidationError);

    // Fewer than two finite numbers.
    const tooShort = clone();
    tooShort.sack_rate = [0.05];
    expect(() => validateCustomReference(tooShort)).toThrow(QBValidationError);

    // NaN / infinity.
    const nonFinite = clone();
    nonFinite.interception_rate = [0.01, Number.POSITIVE_INFINITY];
    expect(() => validateCustomReference(nonFinite)).toThrow(QBValidationError);

    // Invalid reference passed through the evaluator also throws.
    expect(() =>
      evaluateQuarterback(baseInput(), {
        ...FIXTURE_OPTIONS,
        reference_distributions: missing as unknown as QBReferenceDistributions,
      })
    ).toThrow(QBValidationError);
  });
});
