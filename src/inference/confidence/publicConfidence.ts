// Public confidence & honesty state (REGISTRY §11.3–§11.4). Decision-state only —
// this phase does NOT activate publishing, readiness, or an engine call. The
// engine-confidence multiplication is supplied optionally (deferred to integration).

import { PUBLIC_CONFIDENCE, PUBLIC_FACTOR_BOUNDS } from '@/inference/registry';
import { HIGH_BAND, LOW_BAND } from '@/inference/registry/constants';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';
import type { HonestyState } from '@/inference/types';

export interface PublicConfidenceInput {
  readonly playerConfidence: number; // 0..1000 (§11.1)
  readonly verifiedShare: number; // # DIRECT/DERIVED inputs ÷ # required inputs
  readonly sourceQualityFactor: number; // §20.F9
  /** optional engine confidence 0..1 (deferred integration); omitted → AIL factor only. */
  readonly engineConfidence01?: number;
}

export interface PublicConfidenceResult {
  readonly coverageFactor: number;
  readonly qualityFactor: number;
  readonly sourceQualityFactor: number;
  /** product of the three AIL factors (coverage·quality·source), 0..1. */
  readonly ailFactor: number;
  /** 0..100 public confidence when engineConfidence01 supplied; else null (deferred). */
  readonly publicConfidence: number | null;
}

/** §11.3 public-confidence factor maps. */
export function computePublicConfidence(input: PublicConfidenceInput): PublicConfidenceResult {
  const coverageFactor = clamp(
    PUBLIC_CONFIDENCE.coverageBase + PUBLIC_CONFIDENCE.coverageSlope * input.verifiedShare,
    PUBLIC_FACTOR_BOUNDS.coverage.min,
    PUBLIC_FACTOR_BOUNDS.coverage.max,
  );
  const qualityFactor = clamp(
    PUBLIC_CONFIDENCE.qualityBase + PUBLIC_CONFIDENCE.qualitySlope * (input.playerConfidence / 1000),
    PUBLIC_FACTOR_BOUNDS.quality.min,
    PUBLIC_FACTOR_BOUNDS.quality.max,
  );
  const ailFactor = coverageFactor * qualityFactor * input.sourceQualityFactor;
  const publicConfidence =
    input.engineConfidence01 === undefined
      ? null
      : roundHalfAwayFromZero(clamp(input.engineConfidence01 * ailFactor, 0, 1) * 100, 0);
  return { coverageFactor, qualityFactor, sourceQualityFactor: input.sourceQualityFactor, ailFactor, publicConfidence };
}

export interface HonestyInput {
  readonly playerConfidence: number; // 0..1000
  readonly anyCriticalOmitted: boolean; // → NOT_READY
  readonly allCriticalOfficial: boolean; // every CRITICAL input DIRECT/DERIVED
  readonly anyCriticalFallback: boolean; // any CRITICAL provenance FALLBACK
}

/** §11.4 honesty state. Decision-state only; does not gate publishing. */
export function honestyState(input: HonestyInput): HonestyState {
  if (input.anyCriticalOmitted) return 'UNAVAILABLE';
  if (input.playerConfidence < LOW_BAND || input.anyCriticalFallback) return 'LIMITED';
  if (input.playerConfidence >= HIGH_BAND) {
    return input.allCriticalOfficial ? 'VERIFIED' : 'ESTIMATED_HIGH_CONFIDENCE';
  }
  return 'ESTIMATED';
}
