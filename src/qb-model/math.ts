/**
 * Shared deterministic math utilities (Section 26.2.2 and 26.4.1).
 * No randomness, no clock, no global state.
 */

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/** Round half away from zero to `decimals` decimal places (Section 26.2.2). */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
}

export const round1 = (value: number): number => roundTo(value, 1);
export const round3 = (value: number): number => roundTo(value, 3);

/** Normalize negative zero to positive zero after rounding (Section 26.2.5). */
export function normalizeNumber(value: number, decimals: 1 | 3): number {
  if (!Number.isFinite(value)) {
    throw new Error("NON_FINITE_OUTPUT");
  }
  const rounded = decimals === 1 ? round1(value) : round3(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Percentile estimator (Section 26.4.1). `A` is sorted ascending. Result clamped to
 * [0,100].
 */
export function percentile(x: number, A: readonly number[]): number {
  const n = A.length;
  const first = A[0] as number;
  const last = A[n - 1] as number;
  if (x <= first) return 0;
  if (x >= last) return 100;
  for (let i = 0; i < n - 1; i += 1) {
    const lo = A[i] as number;
    const hi = A[i + 1] as number;
    if (lo <= x && x <= hi) {
      let pct: number;
      if (hi === lo) {
        pct = (100 * i) / (n - 1);
      } else {
        const fraction = (x - lo) / (hi - lo);
        pct = (100 * (i + fraction)) / (n - 1);
      }
      return clamp(pct, 0, 100);
    }
  }
  // Unreachable for sorted A with first < x < last; defensive clamp.
  return clamp((100 * (n - 1)) / (n - 1), 0, 100);
}

/** Inverse-risk percentile (Section 26.4.1). */
export function inversePercentile(x: number, A: readonly number[]): number {
  return 100 - percentile(x, A);
}

/**
 * Sample-size shrinkage (Section 26.6.1).
 *   shrink = (sample/(sample+k))*observed + (k/(sample+k))*prior
 * If sample = 0, returns prior.
 */
export function shrink(
  observed: number,
  sample: number,
  prior: number,
  k: number
): number {
  if (sample === 0) return prior;
  const w = sample / (sample + k);
  return w * observed + (1 - w) * prior;
}

/** Lexical sort of a string array (ascending, stable copy). */
export function lexicalSort(values: readonly string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** De-duplicate preserving first-seen order. */
export function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
