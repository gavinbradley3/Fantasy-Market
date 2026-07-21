// Deterministic numeric utilities for the Automated Inference Layer.
//
// These reproduce the repository conventions bound by REGISTRY §1 —
//   • rounding = round half AWAY FROM ZERO (mirrors `te-model/percentiles.ts roundTo`)
//   • percentile = mid-rank, no interpolation, clamp [0,100] (mirrors `pct`)
// They are re-implemented AIL-side (rather than imported from a frozen engine
// module) so the inference layer does not depend on engine internals. Behaviour is
// intentionally identical; the engine files remain the source of the convention.

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Round half away from zero to `decimals` places (REGISTRY §1 rounding_mode).
 * `roundHalfAwayFromZero(2.5, 0) === 3`, `(-2.5,0) === -3`.
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`roundHalfAwayFromZero: non-finite value ${value}`);
  }
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  const rounded = (sign * Math.round(Math.abs(value) * factor)) / factor;
  // Normalize negative zero to zero (REGISTRY §15.2).
  return rounded === 0 ? 0 : rounded;
}

/**
 * Empirical mid-rank percentile (REGISTRY §1 percentile_fn):
 *   pct(x) = 100 · (count(< x) + 0.5 · count(= x)) / N, clamped to [0,100].
 * Ties use strict numeric equality; no interpolation. Throws on an empty
 * reference distribution (a reference must never be empty — REGISTRY §21).
 */
export function pct(x: number, values: readonly number[]): number {
  const n = values.length;
  if (n === 0) {
    throw new Error('pct requires a non-empty reference distribution');
  }
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below += 1;
    else if (v === x) equal += 1;
  }
  return clamp((100 * (below + 0.5 * equal)) / n, 0, 100);
}

/**
 * Lower-median of a numeric array (REGISTRY §1 median_fn): sort ascending, take
 * index floor((N-1)/2), no averaging. Deterministic, interpolation-free.
 */
export function lowerMedian(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) {
    throw new Error('lowerMedian requires a non-empty array');
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((n - 1) / 2)];
}
