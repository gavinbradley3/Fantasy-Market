// §26.6 shrinkage. Only two rules exist in Version 1; no other signal is shrunk.

import {
  CROE_NEUTRAL_PRIOR,
  EFFICIENCY_SHRINK_K,
  TPRR_PRIOR,
  TPRR_SHRINK_K,
} from '@/wr-model/constants';
import { referenceMedian } from '@/wr-model/percentiles';
import type { DraftRound, WRReferenceDistributions } from '@/wr-model/types';

export interface TPRRShrinkage {
  shrunkTPRR: number;
  sampleWeight: number;
  priorWeight: number;
  priorTPRR: number;
}

export function priorTPRR(round: DraftRound): number {
  if (round === null) return TPRR_PRIOR.UDFA;
  return TPRR_PRIOR[round];
}

// shrunk_TPRR = w·observed + (1−w)·prior,  w = routes/(routes+150)
export function shrinkTPRR(
  resolvedTPRR: number,
  careerRoutes: number,
  draftRound: DraftRound,
): TPRRShrinkage {
  const sampleWeight = careerRoutes / (careerRoutes + TPRR_SHRINK_K);
  const priorWeight = 1 - sampleWeight;
  const prior = priorTPRR(draftRound);
  return {
    shrunkTPRR: sampleWeight * resolvedTPRR + priorWeight * prior,
    sampleWeight,
    priorWeight,
    priorTPRR: prior,
  };
}

// shrunk = w·observed + (1−w)·neutral,  w = routes/(routes+250)
export function shrinkEfficiency(observed: number, careerRoutes: number, neutral: number): number {
  const sampleWeight = careerRoutes / (careerRoutes + EFFICIENCY_SHRINK_K);
  return sampleWeight * observed + (1 - sampleWeight) * neutral;
}

export function shrinkCROE(croe: number, careerRoutes: number): number {
  return shrinkEfficiency(croe, careerRoutes, CROE_NEUTRAL_PRIOR);
}

export function shrinkDepthAdjYpt(
  depthAdjYpt: number,
  careerRoutes: number,
  reference: WRReferenceDistributions,
): number {
  const neutral = referenceMedian('depth_adjusted_yards_per_target', reference);
  return shrinkEfficiency(depthAdjYpt, careerRoutes, neutral);
}
