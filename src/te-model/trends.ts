/**
 * Exact trend formulas (Section 26.7). Missing previous history is neutral (50) and is
 * never a fallback, penalty, or PARTIAL trigger.
 */

import { clamp } from "./percentiles.js";
import type { TECanonicalValues, TEMVPInput, TETrendValues } from "./types.js";

export function computeTrends(
  input: TEMVPInput,
  canonical: TECanonicalValues,
  shrunkTprrValue: number
): TETrendValues {
  let routeTrendScore: number;
  if (input.previous_route_participation === null) {
    routeTrendScore = 50;
  } else {
    const routeDelta = canonical.rp4 - input.previous_route_participation;
    routeTrendScore = clamp(50 + 220 * routeDelta, 0, 100);
  }

  let tprrTrendScore: number;
  if (input.previous_targets_per_route_run === null) {
    tprrTrendScore = 50;
  } else {
    const tprrDelta = shrunkTprrValue - input.previous_targets_per_route_run;
    tprrTrendScore = clamp(50 + 300 * tprrDelta, 0, 100);
  }

  const routeConsistencyScore = clamp(100 - 250 * Math.abs(canonical.rp4 - canonical.rp8), 0, 100);

  return {
    route_trend_score: routeTrendScore,
    tprr_trend_score: tprrTrendScore,
    route_consistency_score: routeConsistencyScore,
  };
}
