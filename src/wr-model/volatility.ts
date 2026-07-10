// §26.12 volatility — a transparent revision/output-instability heuristic
// (not a medical injury-risk score). prior_weight is the TPRR shrinkage prior
// weight (§26.6).

import {
  VOL_ADOT_COEF,
  VOL_ADOT_DIVISOR,
  VOL_INJURY_ADD,
  VOL_LABELS,
  VOL_LOW_SAMPLE_ADD,
  VOL_LOW_SAMPLE_ROUTES,
  VOL_PRIOR_COEF,
  VOL_ROLE_ADD,
  VOL_RP_COEF,
} from '@/wr-model/constants';
import { clamp } from '@/wr-model/math';
import type { VolatilityLabel, WRMVPInput } from '@/wr-model/types';

export interface VolatilityResult {
  score: number;
  label: VolatilityLabel;
}

export function computeVolatility(
  input: WRMVPInput,
  rp4: number,
  adot: number,
  priorWeight: number,
): VolatilityResult {
  let score =
    VOL_RP_COEF * (1 - rp4) +
    VOL_ADOT_COEF * Math.min(adot / VOL_ADOT_DIVISOR, 1) +
    VOL_PRIOR_COEF * Math.min(priorWeight, 1);

  if (input.injury_status === 'QUESTIONABLE' || input.injury_status === 'UNKNOWN') {
    score += VOL_INJURY_ADD;
  }
  if (
    input.route_role_change === 'PROMOTED' ||
    input.route_role_change === 'DEMOTED' ||
    input.route_role_change === 'UNKNOWN'
  ) {
    score += VOL_ROLE_ADD;
  }
  if (input.career_routes < VOL_LOW_SAMPLE_ROUTES) {
    score += VOL_LOW_SAMPLE_ADD;
  }

  const clamped = clamp(score, 0, 100);
  return { score: clamped, label: volatilityLabel(clamped) };
}

export function volatilityLabel(score: number): VolatilityLabel {
  if (score >= VOL_LABELS.high) return 'HIGH';
  if (score >= VOL_LABELS.medium) return 'MEDIUM';
  return 'LOW';
}
