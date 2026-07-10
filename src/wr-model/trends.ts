// §26.7 trend scores. Missing history uses the neutral 50 (not zero) and is NOT
// a §26.5 fallback — no log entry, no penalty (Decision 3).

import { ROUTE_TREND_SLOPE, TPRR_TREND_SLOPE, TREND_NEUTRAL } from '@/wr-model/constants';
import { clamp, isFiniteNumber } from '@/wr-model/math';

// route_trend_score = clamp(50 + 200 × (RP4 − previous_RP), 0, 100)
export function routeTrendScore(rp4: number, previousRP: number | null): number {
  if (!isFiniteNumber(previousRP)) return TREND_NEUTRAL;
  return clamp(TREND_NEUTRAL + ROUTE_TREND_SLOPE * (rp4 - previousRP), 0, 100);
}

// tprr_trend_score = clamp(50 + 300 × (shrunk_TPRR − previous_TPRR), 0, 100)
export function tprrTrendScore(shrunkTPRR: number, previousTPRR: number | null): number {
  if (!isFiniteNumber(previousTPRR)) return TREND_NEUTRAL;
  return clamp(TREND_NEUTRAL + TPRR_TREND_SLOPE * (shrunkTPRR - previousTPRR), 0, 100);
}
