// Complete player-confidence aggregation (REGISTRY §11.1–§11.2 + §20.F2 membership).
// Uses the Phase-1 WGM aggregation engine; centralizes the null-field confidence and
// membership rules so they match the registry regardless of how a field was built.

import { aggregatePlayerConfidence, confidenceBand } from './aggregate';
import type { ConfidenceEntry, PlayerConfidenceResult } from './types';
import { IMPORTANCE_WEIGHT, NULL_FIELD_CONFIDENCE, PLAYER_CONFIDENCE_CAP } from '@/inference/registry/constants';
import { LIMITATION_CODES } from '@/inference/types';
import type { IntermediateField } from '@/inference/result/types';
import type { SupportedPosition } from '@/inference/types';

/** §11.2 CRITICAL field sets. */
export const CRITICAL_FIELDS: Readonly<Record<SupportedPosition, readonly string[]>> = {
  WR: ['career_routes', 'route_participation_last4', 'target_share', 'projected_team_dropbacks', 'expected_games_remaining'],
  RB: ['snap_share_last4', 'carry_share_last4', 'career_touches', 'projected_team_non_qb_rush_attempts', 'expected_games_remaining'],
  TE: ['snap_share_last4', 'target_share', 'career_routes', 'projected_team_dropbacks', 'expected_games_remaining'],
  QB: ['career_starts', 'expected_active_game_pass_attempts', 'offensive_environment_score', 'expected_games_remaining'],
};

/** §20.F2 membership confidence; null = excluded (NOT_APPLICABLE). */
export function membershipConfidence(field: IntermediateField<unknown>): number | null {
  switch (field.status) {
    case 'NOT_APPLICABLE':
      return null;
    case 'INSUFFICIENT_DATA':
      return NULL_FIELD_CONFIDENCE.INSUFFICIENT_DATA;
    case 'UNAVAILABLE':
      return NULL_FIELD_CONFIDENCE.UNAVAILABLE;
    case 'AVAILABLE':
    case 'LOW_CONFIDENCE':
      if (field.limitations.includes(LIMITATION_CODES.NEUTRAL_DEFAULT)) {
        return NULL_FIELD_CONFIDENCE.NEUTRAL_DEFAULT;
      }
      return field.confidence;
  }
}

function importanceWeight(fieldName: string, position: SupportedPosition): number {
  if (CRITICAL_FIELDS[position].includes(fieldName)) return IMPORTANCE_WEIGHT.critical;
  if (fieldName.startsWith('previous_') || fieldName.startsWith('career_')) return IMPORTANCE_WEIGHT.minor;
  return IMPORTANCE_WEIGHT.standard;
}

/**
 * Aggregate player confidence from the emitted intermediate fields (§11.1). Fields
 * with status NOT_APPLICABLE are excluded; a present-null field contributes its
 * §20.F2 confidence; the weakest-critical cap ranges only over present CRITICAL
 * fields. Throws if no field participates.
 */
export function buildPlayerConfidence(
  fields: readonly IntermediateField<unknown>[],
  position: SupportedPosition,
): PlayerConfidenceResult {
  const entries: ConfidenceEntry[] = [];
  for (const f of fields) {
    const conf = membershipConfidence(f);
    if (conf === null) continue; // NOT_APPLICABLE excluded
    entries.push({
      field: f.field,
      confidence: conf,
      weight: importanceWeight(f.field, position),
      critical: CRITICAL_FIELDS[position].includes(f.field),
    });
  }
  // No AIL-produced fields participate (e.g. a facts-complete player): the inference
  // layer contributed no estimate, hence no inference uncertainty → max confidence.
  if (entries.length === 0) {
    return { score: PLAYER_CONFIDENCE_CAP, band: confidenceBand(PLAYER_CONFIDENCE_CAP), wgm: PLAYER_CONFIDENCE_CAP, weakestCritical: null };
  }
  return aggregatePlayerConfidence(entries);
}
