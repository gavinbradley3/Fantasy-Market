import { describe, expect, it } from "vitest";
import { REFERENCE_DISTRIBUTION_NAMES } from "../../src/te-model/constants.js";
import {
  referenceMedian,
  resolveReference,
  TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
  validateBundledReference,
} from "../../src/te-model/references.js";
import { evaluateTightEnd } from "../../src/te-model/index.js";
import type { TEReferenceDistributions } from "../../src/te-model/types.js";
import { baseInput } from "./helpers.js";

const RATE_DISTRIBUTIONS = [
  "route_participation",
  "snap_share",
  "targets_per_route_run",
  "target_share",
  "red_zone_target_rate",
  "end_zone_target_rate",
  "catchable_target_rate",
  "catch_rate",
] as const;

describe("bundled TE_REFERENCE_V1 object (26.4.1)", () => {
  it("has the exact reference version", () => {
    expect(TE_MVP_V1_REFERENCE_DISTRIBUTIONS.reference_version).toBe("TE_REFERENCE_V1");
  });

  it("contains all 16 named arrays, non-empty, finite, sorted ascending", () => {
    expect(REFERENCE_DISTRIBUTION_NAMES).toHaveLength(16);
    for (const name of REFERENCE_DISTRIBUTION_NAMES) {
      const values = TE_MVP_V1_REFERENCE_DISTRIBUTIONS[name];
      expect(Array.isArray(values), name).toBe(true);
      expect(values.length, name).toBeGreaterThan(0);
      for (let i = 0; i < values.length; i += 1) {
        expect(Number.isFinite(values[i]), `${name}[${i}]`).toBe(true);
        if (i > 0) {
          expect(values[i]!, `${name} sorted at ${i}`).toBeGreaterThanOrEqual(values[i - 1]!);
        }
      }
    }
  });

  it("keeps every rate-valued array inside [0,1] and non-negative units elsewhere", () => {
    for (const name of RATE_DISTRIBUTIONS) {
      for (const v of TE_MVP_V1_REFERENCE_DISTRIBUTIONS[name]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    for (const name of [
      "yards_per_target",
      "yards_per_reception",
      "yac_per_reception",
      "projected_team_dropbacks",
      "team_points_per_drive",
      "team_red_zone_trips_per_game",
      "expected_targets_per_game",
      "average_depth_of_target",
    ] as const) {
      for (const v of TE_MVP_V1_REFERENCE_DISTRIBUTIONS[name]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is deeply immutable: attempted mutation cannot change stored values", () => {
    const outer = TE_MVP_V1_REFERENCE_DISTRIBUTIONS as unknown as Record<string, unknown>;
    expect(() => {
      "use strict";
      outer["reference_version"] = "HACKED";
    }).toThrow();
    const arr = TE_MVP_V1_REFERENCE_DISTRIBUTIONS.route_participation as unknown as number[];
    expect(() => {
      "use strict";
      arr[0] = 999;
    }).toThrow();
    expect(() => {
      "use strict";
      arr.push(999);
    }).toThrow();
    expect(TE_MVP_V1_REFERENCE_DISTRIBUTIONS.route_participation[0]).toBe(0.18);
    expect(TE_MVP_V1_REFERENCE_DISTRIBUTIONS.reference_version).toBe("TE_REFERENCE_V1");
  });

  it("passes its own binding validation", () => {
    expect(() => validateBundledReference(TE_MVP_V1_REFERENCE_DISTRIBUTIONS)).not.toThrow();
  });

  it("an invalid bundled object is a fatal configuration error", () => {
    const broken = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      catch_rate: [],
    } as unknown as TEReferenceDistributions;
    expect(() => validateBundledReference(broken)).toThrow(/catch_rate/);
    const unsorted = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      catch_rate: [0.9, 0.1],
    } as unknown as TEReferenceDistributions;
    expect(() => validateBundledReference(unsorted)).toThrow(/sorted/);
    const nonFinite = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      catch_rate: [0.5, Number.NaN],
    } as unknown as TEReferenceDistributions;
    expect(() => validateBundledReference(nonFinite)).toThrow(/finite/);
  });
});

describe("reference resolution and overrides (26.4 / 26.16.10)", () => {
  it("omitting options uses the bundled arrays and version without copying", () => {
    const resolved = resolveReference(undefined);
    expect(resolved.reference_version).toBe("TE_REFERENCE_V1");
    expect(resolved.missing).toHaveLength(0);
    for (const name of REFERENCE_DISTRIBUTION_NAMES) {
      expect(resolved.distributions[name]).toBe(TE_MVP_V1_REFERENCE_DISTRIBUTIONS[name]);
    }
  });

  it("omitting reference options uses the bundled reference_version in the output", () => {
    const out = evaluateTightEnd(baseInput());
    expect(out.reference_version).toBe("TE_REFERENCE_V1");
    expect(out.status).toBe("OK");
  });

  it("a valid custom reference object overrides the bundle for that evaluation", () => {
    const custom: TEReferenceDistributions = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      reference_version: "TE_REFERENCE_CUSTOM_TEST",
    };
    const out = evaluateTightEnd(baseInput(), { reference_distributions: custom });
    expect(out.reference_version).toBe("TE_REFERENCE_CUSTOM_TEST");
    expect(out.status).toBe("OK");
  });

  it("a missing distribution in a custom object → percentile 50, one log, 5-point penalty, PARTIAL", () => {
    const custom = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      reference_version: "TE_REFERENCE_PARTIAL_TEST",
    } as unknown as Record<string, unknown>;
    delete custom["yac_per_reception"];
    const out = evaluateTightEnd(baseInput(), {
      reference_distributions: custom as unknown as TEReferenceDistributions,
    });
    expect(out.status).toBe("PARTIAL");
    const entries = out.fallback_log.filter(
      (e) => e.field === "REFERENCE_DISTRIBUTION:yac_per_reception"
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.fallback_used).toBe("PERCENTILE_50");
    expect(entries[0]!.confidence_penalty).toBe(5);
    expect(
      out.confidence.penalties.filter((p) => p === "MISSING_REFERENCE:yac_per_reception")
    ).toHaveLength(1);
    expect(out.confidence.score).toBe(95);
  });

  it("a distribution with no finite values is treated as missing", () => {
    const custom = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      reference_version: "TE_REFERENCE_NAN_TEST",
      catch_rate: [Number.NaN],
    } as unknown as TEReferenceDistributions;
    const out = evaluateTightEnd(baseInput(), { reference_distributions: custom });
    expect(
      out.fallback_log.some((e) => e.field === "REFERENCE_DISTRIBUTION:catch_rate")
    ).toBe(true);
  });

  it("non-finite members of an otherwise valid custom array are filtered", () => {
    const values = [...TE_MVP_V1_REFERENCE_DISTRIBUTIONS.catch_rate, Number.NaN];
    const custom = {
      ...TE_MVP_V1_REFERENCE_DISTRIBUTIONS,
      reference_version: "TE_REFERENCE_FILTER_TEST",
      catch_rate: values,
    } as unknown as TEReferenceDistributions;
    const out = evaluateTightEnd(baseInput(), { reference_distributions: custom });
    expect(out.status).toBe("OK");
  });
});

describe("reference median (26.4)", () => {
  it("even-length arrays use the arithmetic mean of the two central sorted values", () => {
    expect(referenceMedian([4, 1, 3, 2])).toBe(2.5);
    expect(referenceMedian(TE_MVP_V1_REFERENCE_DISTRIBUTIONS.projected_team_dropbacks)).toBe(
      34.25
    );
    expect(referenceMedian(TE_MVP_V1_REFERENCE_DISTRIBUTIONS.team_points_per_drive)).toBe(2.08);
    expect(
      referenceMedian(TE_MVP_V1_REFERENCE_DISTRIBUTIONS.team_red_zone_trips_per_game)
    ).toBe(3.25);
  });

  it("odd-length arrays return the middle sorted value", () => {
    expect(referenceMedian([9, 1, 5])).toBe(5);
  });

  it("does not mutate the input array", () => {
    const values = [3, 1, 2];
    referenceMedian(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it("ignores non-finite values and returns null when none remain", () => {
    expect(referenceMedian([Number.NaN, 2, 4])).toBe(3);
    expect(referenceMedian([Number.NaN])).toBeNull();
    expect(referenceMedian(null)).toBeNull();
  });
});
