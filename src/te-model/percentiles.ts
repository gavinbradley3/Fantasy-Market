/**
 * Shared empirical mid-rank percentile estimator (Section 26.4).
 *
 * pct(x) = 100 × (count(strictly below x) + 0.5 × count(exactly equal to x)) / N
 *
 * Arrays may be unsorted. Ties use strict numeric equality (no epsilon, no rounding).
 * No interpolation. Result clamped to [0,100].
 */
export function pct(x: number, values: readonly number[]): number {
  const n = values.length;
  if (n === 0) {
    throw new Error("pct requires a non-empty reference distribution");
  }
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below += 1;
    else if (v === x) equal += 1;
  }
  const raw = (100 * (below + 0.5 * equal)) / n;
  return clamp(raw, 0, 100);
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Round to a fixed number of decimals, half away from zero. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
}
