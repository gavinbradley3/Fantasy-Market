// §26.7 trend scores. Missing previous history uses the neutral 50 (not zero) and
// is NOT a §26.5 fallback — no log entry, no penalty, no PARTIAL status.

import { TREND_NEUTRAL, TREND_SLOPE, WORKLOAD_TREND_WEIGHTS } from '@/rb-model/constants';
import { clamp, isFiniteNumber } from '@/rb-model/math';

function trend(current: number, previous: number | null): number {
  if (!isFiniteNumber(previous)) return TREND_NEUTRAL;
  return clamp(TREND_NEUTRAL + TREND_SLOPE * (current - previous), 0, 100);
}

export interface TrendScores {
  snapTrendScore: number;
  carryTrendScore: number;
  routeTrendScore: number;
  workloadTrendScore: number;
}

// snap/carry/route use canonical Snap4, carry_share, route_participation.
export function computeTrends(
  snap4: number,
  carryShare: number,
  routeParticipation: number,
  previousSnap: number | null,
  previousCarry: number | null,
  previousRoute: number | null,
): TrendScores {
  const snapTrendScore = trend(snap4, previousSnap);
  const carryTrendScore = trend(carryShare, previousCarry);
  const routeTrendScore = trend(routeParticipation, previousRoute);
  const workloadTrendScore =
    WORKLOAD_TREND_WEIGHTS.snap * snapTrendScore +
    WORKLOAD_TREND_WEIGHTS.carry * carryTrendScore +
    WORKLOAD_TREND_WEIGHTS.route * routeTrendScore;
  return { snapTrendScore, carryTrendScore, routeTrendScore, workloadTrendScore };
}
