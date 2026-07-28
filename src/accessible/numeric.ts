// Deterministic numeric helpers for the accessible-data model tier.
//
// Re-implemented here, rather than imported from `@/inference/util/numeric`, for the same
// reason that module re-implements them rather than importing from a frozen engine: the model
// package must not depend on the layers that CONSUME it. Both the ingestion layer (which
// builds this tier's input) and the inference layer (which invokes it) import `@/accessible`,
// so a dependency in the other direction would be a package cycle.
//
// Behaviour is intentionally identical to `@/inference/util/numeric`; REGISTRY §1 remains the
// source of the convention. `numeric.parity.test.ts` fails if the two ever diverge.

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Round half away from zero to `decimals` places (REGISTRY §1 rounding_mode).
 * `roundHalfAwayFromZero(2.5, 0) === 3`, `(-2.5, 0) === -3`. Negative zero is normalized
 * to zero (REGISTRY §15.2) so serialized bytes never depend on the sign of a zero.
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`roundHalfAwayFromZero: non-finite value ${value}`);
  }
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  const rounded = (sign * Math.round(Math.abs(value) * factor)) / factor;
  return rounded === 0 ? 0 : rounded;
}
