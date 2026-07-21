// Player-level confidence aggregation (REGISTRY §11.1–§11.4).
//
//   player_conf = clamp( min( WGM(field confidences, weights), weakest_critical ),
//                        PLAYER_FLOOR, PLAYER_CAP )   [integer, round half away]
//
// This is the reusable AGGREGATION framework. It takes already-computed field
// confidences; it does NOT compute any field confidence (that is inference-family
// logic, deferred to later phases).

import {
  HIGH_BAND,
  LOW_BAND,
  PLAYER_CONFIDENCE_CAP,
  PLAYER_CONFIDENCE_FLOOR,
} from '@/inference/registry/constants';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';
import { weightedGeometricMean } from './weightedGeometricMean';
import type { ConfidenceBand, ConfidenceEntry, PlayerConfidenceResult } from './types';

/** Band label for a 0..1000 confidence (REGISTRY §11.4). */
export function confidenceBand(score: number): ConfidenceBand {
  if (score >= HIGH_BAND) return 'HIGH';
  if (score >= LOW_BAND) return 'MEDIUM';
  return 'LOW';
}

/**
 * Aggregate per-field confidences into a player confidence.
 *
 * `entries` are the fields that participate in the WGM (REGISTRY §11.1 membership:
 * present-value and present-null fields; NOT_APPLICABLE and omitted fields are
 * excluded by the caller before this point). The weakest-critical cap ranges only
 * over the present CRITICAL fields.
 */
export function aggregatePlayerConfidence(
  entries: readonly ConfidenceEntry[],
): PlayerConfidenceResult {
  if (entries.length === 0) {
    throw new Error('aggregatePlayerConfidence requires at least one field entry');
  }

  const wgmRaw = weightedGeometricMean(
    entries.map((e) => ({ value: e.confidence, weight: e.weight })),
  );
  const wgm = roundHalfAwayFromZero(wgmRaw, 0);

  const criticalConfidences = entries.filter((e) => e.critical).map((e) => e.confidence);
  const weakestCritical =
    criticalConfidences.length > 0 ? Math.min(...criticalConfidences) : null;

  const capped = weakestCritical === null ? wgm : Math.min(wgm, weakestCritical);
  const score = roundHalfAwayFromZero(
    clamp(capped, PLAYER_CONFIDENCE_FLOOR, PLAYER_CONFIDENCE_CAP),
    0,
  );

  return { score, band: confidenceBand(score), wgm, weakestCritical };
}
