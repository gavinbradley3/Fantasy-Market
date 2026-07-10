// §26.12 volatility — a transparent output-instability heuristic (not a medical
// diagnosis, and separate from confidence). Dependence ratios use the CURRENT
// active-game outputs, not Pactive-weighted Weekly EFO.

import { VOL, VOL_LABELS } from '@/rb-model/constants';
import { clamp } from '@/rb-model/math';
import type { RBMVPInput, ScoringVector, VolatilityLabel } from '@/rb-model/types';
import type { ActiveGame } from '@/rb-model/projections';

export interface VolatilityResult {
  score: number;
  tdDependence: number;
  receivingDependence: number;
}

export function computeVolatility(
  input: RBMVPInput,
  canonicalSnap4: number,
  canonicalCompetitionPressure: number,
  shrunkExplosiveRate: number,
  currentActiveGame: ActiveGame,
  careerRoutes: number,
  careerCarries: number,
  scoring: ScoringVector,
): VolatilityResult {
  const touchdownPoints =
    currentActiveGame.expectedRushingTouchdowns * scoring.points_per_rushing_td +
    currentActiveGame.expectedReceivingTouchdowns * scoring.points_per_receiving_td;
  const receptionPoints = currentActiveGame.expectedReceptions * scoring.points_per_reception;

  const denom = Math.max(currentActiveGame.activeGameFantasyPoints, 1);
  const tdDependence = clamp(touchdownPoints / denom, 0, 1);
  const receivingDependence = clamp(receptionPoints / denom, 0, 1);

  const priorWeight = VOL.priorConstant / (VOL.priorConstant + careerRoutes + careerCarries);

  let score =
    VOL.snap * (1 - canonicalSnap4) +
    VOL.competition * canonicalCompetitionPressure +
    VOL.td * tdDependence +
    VOL.receiving * receivingDependence +
    VOL.prior * priorWeight;

  if (input.injury_status === 'QUESTIONABLE' || input.injury_status === 'UNKNOWN') {
    score += VOL.injury;
  }
  if (
    input.role_change === 'PROMOTED' ||
    input.role_change === 'DEMOTED' ||
    input.role_change === 'UNKNOWN'
  ) {
    score += VOL.role;
  }
  if (input.teammate_return_flag) score += VOL.teammate;
  if (shrunkExplosiveRate >= VOL.explosiveThreshold) score += VOL.explosive;

  return {
    score: clamp(score, 0, 100),
    tdDependence,
    receivingDependence,
  };
}

export function volatilityLabel(score: number): VolatilityLabel {
  if (score >= VOL_LABELS.high) return 'HIGH';
  if (score >= VOL_LABELS.medium) return 'MEDIUM';
  return 'LOW';
}
