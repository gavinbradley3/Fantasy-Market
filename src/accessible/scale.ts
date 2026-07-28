// Deterministic scoring primitives for the accessible-data model tier.
//
// The accessible models score against FIXED, FOOTBALL-ANCHORED scales rather than fitted
// statistical distributions or population percentiles. That choice is deliberate and is the
// load-bearing honesty decision of this tier:
//
//  • A population percentile would make one player's value depend on the cohort ingested in
//    the same run. The pipeline values players ONE AT A TIME (one artifact, one checksum per
//    canonical id), so a cohort-relative score would break per-player replay and would let a
//    quiet backup's number move because an unrelated player was added to the board.
//  • A distribution FITTED to the ingested seasons would embed data from the whole ingestion
//    window into every valuation, including runs whose as-of predates part of that window.
//    That is a point-in-time leak, and it is not detectable from the output.
//
// Fixed anchors avoid both. They are ordinary, checkable football statements — "16 carries a
// game is a lead back", "4.3 yards a carry is league-average" — so a reader can disagree with
// a specific number without having to trust an opaque fit. Each anchor table cites its
// reasoning where it is declared.

import { clamp, roundHalfAwayFromZero } from './numeric';

/** One point on a monotone scale: an input value and the 0–100 score it maps to. */
export interface Anchor {
  readonly at: number;
  readonly score: number;
}

/**
 * Piecewise-linear interpolation through `anchors` (which must be sorted ascending by `at`
 * and is validated as such). Below the first anchor the first score is returned; above the
 * last, the last score — the scale saturates rather than extrapolating into nonsense.
 *
 * Deterministic: no floating-point accumulation across calls, result rounded to 2dp.
 */
export function scaleFrom(anchors: readonly Anchor[], x: number): number {
  if (anchors.length === 0) throw new Error('scaleFrom requires at least one anchor');
  if (!Number.isFinite(x)) throw new Error(`scaleFrom: non-finite input ${x}`);
  if (x <= anchors[0].at) return anchors[0].score;
  const last = anchors[anchors.length - 1];
  if (x >= last.at) return last.score;
  for (let i = 1; i < anchors.length; i++) {
    const lo = anchors[i - 1];
    const hi = anchors[i];
    if (hi.at <= lo.at) throw new Error('scaleFrom anchors must ascend by `at`');
    if (x <= hi.at) {
      const t = (x - lo.at) / (hi.at - lo.at);
      return roundHalfAwayFromZero(lo.score + t * (hi.score - lo.score), 2);
    }
  }
  return last.score;
}

/**
 * Regress an observed rate toward a prior by sample size:
 *   shrunk = (n·observed + k·prior) / (n + k)
 *
 * `k` is the pseudo-count — the sample size at which observed and prior carry equal weight.
 * This is the mechanism `career_routes` used to serve in the frozen engines (as the `n` in
 * their TPRR and catch-rate shrinkage); the accessible tier supplies `n` from an OBSERVED
 * denominator instead (carries for rushing rates, targets for receiving rates), which is
 * both available and the semantically correct exposure count for the rate being regressed.
 */
export function shrink(observed: number, n: number, prior: number, k: number): number {
  if (n <= 0) return prior;
  if (k <= 0) throw new Error('shrink requires a positive pseudo-count');
  return (n * observed + k * prior) / (n + k);
}

/** Ratio that reports `null` rather than dividing by an absent or zero denominator. */
export function rate(numerator: number | null, denominator: number | null, minDenominator = 1): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator < minDenominator || denominator <= 0) return null;
  return numerator / denominator;
}

/** Weighted mean over the components that are present; null when none are. */
export function weightedMean(parts: readonly { readonly value: number | null; readonly weight: number }[]): number | null {
  let sum = 0;
  let w = 0;
  for (const p of parts) {
    if (p.value === null) continue;
    if (p.weight <= 0) continue;
    sum += p.value * p.weight;
    w += p.weight;
  }
  return w > 0 ? sum / w : null;
}

/** Round a 0–100 score to 1dp and clamp, the accessible tier's output convention. */
export function score100(value: number): number {
  return roundHalfAwayFromZero(clamp(value, 0, 100), 1);
}
