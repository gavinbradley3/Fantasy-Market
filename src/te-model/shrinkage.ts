/**
 * Exact shrinkage formulas (Section 26.6).
 *
 *   sample_weight = n / (n + k)
 *   shrunk_value  = sample_weight × observed + (1 - sample_weight) × prior
 *
 * Version 1 shrinks TPRR, catch rate, yards per target, yards per reception,
 * YAC per reception, red-zone target rate, and end-zone target rate. No other signal
 * is shrunk.
 */

import {
  CATCH_RATE_NEUTRAL_PRIOR,
  CATCH_RATE_SHRINK_K,
  EZ_NEUTRAL_PRIOR,
  EZ_SHRINK_K,
  RZ_NEUTRAL_PRIOR,
  RZ_SHRINK_K,
  TPRR_SHRINK_K,
  YAC_NEUTRAL_PRIOR,
  YAC_SHRINK_K,
  YPR_NEUTRAL_PRIOR,
  YPR_SHRINK_K,
  YPT_NEUTRAL_PRIOR,
  YPT_SHRINK_K,
} from "./constants.js";
import type { TECanonicalValues, TEMVPInput, TEShrunkValues } from "./types.js";

export function shrink(observed: number, n: number, k: number, prior: number): number {
  const weight = n / (n + k);
  return weight * observed + (1 - weight) * prior;
}

export function shrunkTprr(
  canonicalTprr: number,
  careerRoutes: number,
  draftProspectTprrPrior: number
): number {
  return shrink(canonicalTprr, careerRoutes, TPRR_SHRINK_K, draftProspectTprrPrior);
}

export function computeShrunkValues(
  input: TEMVPInput,
  canonical: TECanonicalValues,
  shrunkTprrValue: number
): TEShrunkValues {
  const n = input.career_targets;
  return {
    shrunk_tprr: shrunkTprrValue,
    shrunk_catch_rate: shrink(
      canonical.catch_rate,
      n,
      CATCH_RATE_SHRINK_K,
      input.career_catch_rate ?? CATCH_RATE_NEUTRAL_PRIOR
    ),
    shrunk_yards_per_target: shrink(
      canonical.yards_per_target,
      n,
      YPT_SHRINK_K,
      input.career_yards_per_target ?? YPT_NEUTRAL_PRIOR
    ),
    shrunk_yards_per_reception: shrink(
      canonical.yards_per_reception,
      n,
      YPR_SHRINK_K,
      input.career_yards_per_reception ?? YPR_NEUTRAL_PRIOR
    ),
    shrunk_yac_per_reception: shrink(
      canonical.yac_per_reception,
      n,
      YAC_SHRINK_K,
      input.career_yac_per_reception ?? YAC_NEUTRAL_PRIOR
    ),
    shrunk_red_zone_target_rate: shrink(
      canonical.red_zone_target_rate,
      n,
      RZ_SHRINK_K,
      input.career_red_zone_target_rate ?? RZ_NEUTRAL_PRIOR
    ),
    shrunk_end_zone_target_rate: shrink(
      canonical.end_zone_target_rate,
      n,
      EZ_SHRINK_K,
      input.career_end_zone_target_rate ?? EZ_NEUTRAL_PRIOR
    ),
  };
}
