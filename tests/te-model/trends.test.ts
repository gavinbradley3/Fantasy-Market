import { describe, expect, it } from "vitest";
import { computeTrends } from "../../src/te-model/trends.js";
import { resolveCanonicalValues } from "../../src/te-model/fallbacks.js";
import { computePriors } from "../../src/te-model/priors.js";
import { resolveReference } from "../../src/te-model/references.js";
import type { TEMVPInput } from "../../src/te-model/types.js";
import { baseInput } from "./helpers.js";

function trendsFor(input: TEMVPInput) {
  const resolution = resolveCanonicalValues(
    input,
    computePriors(input),
    resolveReference(undefined)
  );
  return computeTrends(input, resolution.canonical, resolution.shrunk_tprr);
}

describe("exact trend formulas (26.7)", () => {
  it("route trend: 50 + 220 × delta, clamped", () => {
    const up = trendsFor(baseInput({ previous_route_participation: 0.6 }));
    expect(up.route_trend_score).toBeCloseTo(50 + 220 * (0.7 - 0.6), 12);
    const down = trendsFor(baseInput({ previous_route_participation: 0.8 }));
    expect(down.route_trend_score).toBeCloseTo(50 + 220 * (0.7 - 0.8), 12);
    const clampedHigh = trendsFor(baseInput({ previous_route_participation: 0.0 }));
    expect(clampedHigh.route_trend_score).toBe(100);
    const clampedLow = trendsFor(
      baseInput({ route_participation_last4: 0.1, previous_route_participation: 0.9 })
    );
    expect(clampedLow.route_trend_score).toBe(0);
  });

  it("TPRR trend uses shrunk TPRR: 50 + 300 × delta, clamped", () => {
    const input = baseInput({ previous_targets_per_route_run: 0.15 });
    const resolution = resolveCanonicalValues(
      input,
      computePriors(input),
      resolveReference(undefined)
    );
    const trends = computeTrends(input, resolution.canonical, resolution.shrunk_tprr);
    expect(trends.tprr_trend_score).toBeCloseTo(
      Math.min(100, Math.max(0, 50 + 300 * (resolution.shrunk_tprr - 0.15))),
      12
    );
  });

  it("route consistency: 100 - 250 × |RP4 - RP8|, clamped", () => {
    const t = trendsFor(baseInput({ route_participation_last4: 0.7, route_participation_last8: 0.6 }));
    expect(t.route_consistency_score).toBeCloseTo(100 - 250 * 0.1, 10);
    const wide = trendsFor(
      baseInput({ route_participation_last4: 0.9, route_participation_last8: 0.3 })
    );
    expect(wide.route_consistency_score).toBe(0);
  });

  it("missing previous history is neutral 50", () => {
    const t = trendsFor(
      baseInput({ previous_route_participation: null, previous_targets_per_route_run: null })
    );
    expect(t.route_trend_score).toBe(50);
    expect(t.tprr_trend_score).toBe(50);
  });
});
