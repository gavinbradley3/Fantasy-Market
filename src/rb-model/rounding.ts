// Serialization rounding (§26.2.4). All computation is full-precision; only the
// returned output is rounded. §26.2.4 fixes ONE decimal place for component scores,
// composites, projection outputs, confidence scores, volatility scores, TD
// dependence, and receiving dependence; and permits THREE decimals for
// weekly.probability_active and weekly.workload_ramp_factor. Every projection
// stat output therefore serializes to one decimal, per the contract's
// "projection outputs ... to one decimal place" (Decision 4).

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // +0 normalizes -0 to 0 for clean, stable snapshots.
  return Math.round(value * f) / f + 0;
}

export const PRECISION = {
  component: 1, // §26.2.4
  composite: 1, // §26.2.4
  probabilityActive: 3, // §26.2.4
  workloadRamp: 3, // §26.2.4
  confidence: 1, // §26.2.4
  volatility: 1, // §26.2.4
  dependence: 1, // §26.2.4
  projection: 1, // §26.2.4 — all projection stat outputs to one decimal
} as const;
