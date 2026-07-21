// Field-level confidence for the Phase-2A inference families (REGISTRY §10).
//
//   conf = clamp(1000 − Σ penalties, 0, 1000)   (integer)
//   unvalidated model → conf capped at UNVALIDATED_CONF_CAP + UNVALIDATED_MODEL
//
// Penalties are exact step functions from the registry (no interpolation). This
// composes the Phase-1 confidence primitives with the §10 registry penalties; it
// contains no family-specific business logic beyond selecting which penalties apply.

import {
  P_CLASS_CATCHALL,
  P_CLASS_REDUCED,
  P_COMPLETENESS_CAP,
  P_COMPLETENESS_PER,
  P_CONFLICT,
  P_CROSS_SEASON,
  P_PROVENANCE,
  P_RECENCY,
  P_SAMPLE,
  UNVALIDATED_CONF_CAP,
} from '@/inference/registry/family';
import { LIMITATION_CODES, type LimitationCode } from '@/inference/types';
import type { InferenceProvenance } from '@/inference/types';
import type { FreshnessState } from '@/inference/util/freshness';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';

export interface FieldConfidenceInputs {
  readonly provenance: InferenceProvenance;
  readonly freshness: FreshnessState;
  /** observed sample ÷ min_sample; ≥1 = full, [0.5,1) = below-min, <0.5 = below-half. */
  readonly coverageRatio?: number;
  readonly missingRequiredFeatures?: number;
  readonly conflict?: boolean;
  readonly crossSeason?: boolean;
  /** role assigned at its catch-all rung (§3). */
  readonly catchall?: boolean;
  /** role assigned from a reduced-signal ladder (§20.F4). */
  readonly reducedSignal?: boolean;
  /** model has completed validation (§10 p_model_error). Default false (Phase 2A). */
  readonly validated?: boolean;
}

export interface FieldConfidenceResult {
  readonly score: number;
  readonly limitations: readonly LimitationCode[];
}

function samplefPenalty(coverageRatio: number): number {
  if (coverageRatio >= 1) return P_SAMPLE.full;
  if (coverageRatio >= 0.5) return P_SAMPLE.belowMin;
  return P_SAMPLE.belowHalfMin;
}

/** Compute a field confidence (0..1000) and its confidence-driven limitations. */
export function computeFieldConfidence(inputs: FieldConfidenceInputs): FieldConfidenceResult {
  const limitations: LimitationCode[] = [];
  let penalty = 0;

  penalty += P_PROVENANCE[inputs.provenance];
  penalty += P_RECENCY[inputs.freshness];
  if (inputs.freshness === 'STALE_USABLE' || inputs.freshness === 'UNUSABLE') {
    limitations.push(LIMITATION_CODES.STALE);
  }

  if (inputs.coverageRatio !== undefined) {
    penalty += samplefPenalty(inputs.coverageRatio);
  }
  if (inputs.missingRequiredFeatures && inputs.missingRequiredFeatures > 0) {
    penalty += Math.min(inputs.missingRequiredFeatures * P_COMPLETENESS_PER, P_COMPLETENESS_CAP);
  }
  if (inputs.conflict) penalty += P_CONFLICT;
  if (inputs.crossSeason) penalty += P_CROSS_SEASON;
  if (inputs.catchall) penalty += P_CLASS_CATCHALL;
  if (inputs.reducedSignal) penalty += P_CLASS_REDUCED;

  let score = clamp(roundHalfAwayFromZero(1000 - penalty, 0), 0, 1000);

  if (inputs.validated !== true) {
    if (score > UNVALIDATED_CONF_CAP) score = UNVALIDATED_CONF_CAP;
    limitations.push(LIMITATION_CODES.UNVALIDATED_MODEL);
  }

  return { score, limitations };
}
