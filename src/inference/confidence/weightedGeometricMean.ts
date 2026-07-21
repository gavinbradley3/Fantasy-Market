// Weighted geometric mean engine (REGISTRY §11.1).
//
//   WGM = exp( Σ_f w_f · ln(max(conf_f, FLOOR_IN)) / Σ_f w_f )
//
// FLOOR_IN avoids ln(0). This is a pure numeric engine over supplied
// (confidence, weight) pairs; it embeds no field-specific confidence logic.

import { WGM_FLOOR_IN } from '@/inference/registry/constants';

export interface WeightedValue {
  readonly value: number;
  readonly weight: number;
}

/**
 * Weighted geometric mean with an input floor. Throws on empty input or a
 * non-positive total weight (both are caller errors, not silent zeros).
 * The result is unrounded; callers round at the aggregation boundary.
 */
export function weightedGeometricMean(
  entries: readonly WeightedValue[],
  floorIn: number = WGM_FLOOR_IN,
): number {
  if (entries.length === 0) {
    throw new Error('weightedGeometricMean requires at least one entry');
  }
  let weightSum = 0;
  let logSum = 0;
  for (const { value, weight } of entries) {
    if (weight < 0) {
      throw new Error(`weightedGeometricMean: negative weight ${weight}`);
    }
    weightSum += weight;
    logSum += weight * Math.log(Math.max(value, floorIn));
  }
  if (weightSum <= 0) {
    throw new Error('weightedGeometricMean requires a positive total weight');
  }
  return Math.exp(logSum / weightSum);
}
