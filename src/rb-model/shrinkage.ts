// §26.6 shrinkage. Six rules; no other Version-1 signal is shrunk.
//   w = n / (n + k),   shrunk = w·observed + (1 − w)·prior
//
// Non-overlapping career priors (YPC, catch rate, receiving yds/reception) are
// used ONLY when the value excludes the current-season sample. We treat a career
// value as valid non-overlapping evidence when it is finite AND (the current input
// is missing OR differs from it); a career value equal to the current sample is
// read as self-blend/overlap and the neutral prior is used instead (§26.3.1,
// Decision 2).

import { SHRINK } from '@/rb-model/constants';
import { isFiniteNumber } from '@/rb-model/math';
import { draftRoundTPRRPrior } from '@/rb-model/fallbacks';
import type { DraftRound } from '@/rb-model/types';

function shrink(observed: number, n: number, k: number, prior: number): number {
  const w = n / (n + k);
  return w * observed + (1 - w) * prior;
}

/** Career prior is valid only when finite and non-overlapping with the current sample. */
export function validCareerPrior(
  currentInput: number | null | undefined,
  careerValue: number | null | undefined,
  neutral: number,
): number {
  if (!isFiniteNumber(careerValue)) return neutral;
  if (isFiniteNumber(currentInput) && careerValue === currentInput) return neutral; // overlap
  return careerValue;
}

export interface TPRRShrinkage {
  shrunkTPRR: number;
  sampleWeight: number;
  priorWeight: number;
  prior: number;
}

// §26.6.1 — TPRR, blended toward the draft-round prior.
export function shrinkTPRR(
  canonicalTPRR: number,
  careerRoutes: number,
  draftRound: DraftRound,
): TPRRShrinkage {
  const sampleWeight = careerRoutes / (careerRoutes + SHRINK.tprr_k);
  const prior = draftRoundTPRRPrior(draftRound);
  return {
    shrunkTPRR: shrink(canonicalTPRR, careerRoutes, SHRINK.tprr_k, prior),
    sampleWeight,
    priorWeight: 1 - sampleWeight,
    prior,
  };
}

// §26.6.2 — YPC.
export function shrinkYPC(
  canonicalYPC: number,
  careerCarries: number,
  currentInputYPC: number | null | undefined,
  careerYPC: number | null | undefined,
): number {
  const prior = validCareerPrior(currentInputYPC, careerYPC, SHRINK.ypc_prior);
  return shrink(canonicalYPC, careerCarries, SHRINK.ypc_k, prior);
}

// §26.6.3 — success rate.
export function shrinkSuccessRate(canonical: number, careerCarries: number): number {
  return shrink(canonical, careerCarries, SHRINK.success_k, SHRINK.success_prior);
}

// §26.6.4 — explosive run rate.
export function shrinkExplosiveRate(canonical: number, careerCarries: number): number {
  return shrink(canonical, careerCarries, SHRINK.explosive_k, SHRINK.explosive_prior);
}

// §26.6.5 — catch rate.
export function shrinkCatchRate(
  canonical: number,
  careerRoutes: number,
  currentInputCatch: number | null | undefined,
  careerCatch: number | null | undefined,
): number {
  const prior = validCareerPrior(currentInputCatch, careerCatch, SHRINK.catch_prior);
  return shrink(canonical, careerRoutes, SHRINK.catch_k, prior);
}

// §26.6.6 — receiving yards per reception.
export function shrinkRecYardsPerReception(
  canonical: number,
  careerRoutes: number,
  currentInputRYPR: number | null | undefined,
  careerRYPR: number | null | undefined,
): number {
  const prior = validCareerPrior(currentInputRYPR, careerRYPR, SHRINK.rypr_prior);
  return shrink(canonical, careerRoutes, SHRINK.rypr_k, prior);
}
