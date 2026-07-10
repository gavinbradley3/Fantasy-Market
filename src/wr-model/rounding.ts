// Serialization rounding (Decision 5). All computation is full-precision;
// only the returned output is rounded, per a fixed per-field precision map, so
// golden snapshots reproduce exactly. §26.2 fixes 1 dp for component scores and
// fantasy outputs; the rest use stable, sensible precisions.

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // +0 normalizes -0 to 0 for clean, stable snapshots.
  return Math.round(value * f) / f + 0;
}

export const PRECISION = {
  component: 1,
  composite: 4,
  probabilityActive: 4,
  routes: 2,
  targets: 2,
  receptions: 2,
  yards: 1,
  touchdowns: 2,
  fantasyPoints: 1,
  activeGames: 2,
  confidence: 1,
  volatility: 1,
} as const;
