// §26.11 confidence. Start 100; subtract §26.5 fallback penalties (already
// summed) plus the additional deductions below. Career-route tiers are mutually
// exclusive. Confidence never changes EFO or components — it only communicates
// reliability. `penalties` is the human-readable list emitted in the output.

import {
  CONF_CAREER_ROUTES_LOW,
  CONF_CAREER_ROUTES_MID,
  CONF_INJURY_UNKNOWN,
  CONF_LABELS,
  CONF_ROLE_UNKNOWN,
  CONF_START,
  CONF_TEAM_NULL,
} from '@/wr-model/constants';
import { clamp } from '@/wr-model/math';
import type { ConfidenceLabel, FallbackLogEntry, WRMVPInput } from '@/wr-model/types';

export interface ConfidenceResult {
  score: number;
  label: ConfidenceLabel;
  penalties: string[];
}

export function computeConfidence(
  input: WRMVPInput,
  fallbackLog: FallbackLogEntry[],
  fallbackPenalty: number,
  missingReferencePenalty: number,
): ConfidenceResult {
  const penalties: string[] = [];
  let total = 0;

  // §26.5 fallback penalties (itemized for transparency).
  for (const f of fallbackLog) {
    penalties.push(`Fallback ${f.field} → ${f.fallback_used} (−${f.confidence_penalty})`);
  }
  total += fallbackPenalty;

  // §26.4 missing-reference penalties.
  if (missingReferencePenalty > 0) {
    penalties.push(`Missing reference distribution(s) (−${missingReferencePenalty})`);
    total += missingReferencePenalty;
  }

  // Career-route tiers (mutually exclusive).
  if (input.career_routes < CONF_CAREER_ROUTES_LOW.threshold) {
    penalties.push(`Career routes < 100 (−${CONF_CAREER_ROUTES_LOW.penalty})`);
    total += CONF_CAREER_ROUTES_LOW.penalty;
  } else if (input.career_routes <= CONF_CAREER_ROUTES_MID.max) {
    penalties.push(`Career routes 100–299 (−${CONF_CAREER_ROUTES_MID.penalty})`);
    total += CONF_CAREER_ROUTES_MID.penalty;
  }

  if (input.injury_status === 'UNKNOWN') {
    penalties.push(`Injury status UNKNOWN (−${CONF_INJURY_UNKNOWN})`);
    total += CONF_INJURY_UNKNOWN;
  }
  if (input.route_role_change === 'UNKNOWN') {
    penalties.push(`Route role change UNKNOWN (−${CONF_ROLE_UNKNOWN})`);
    total += CONF_ROLE_UNKNOWN;
  }
  if (input.team === null) {
    penalties.push(`Team is null (−${CONF_TEAM_NULL})`);
    total += CONF_TEAM_NULL;
  }

  const score = clamp(CONF_START - total, 0, 100);
  return { score, label: confidenceLabel(score), penalties };
}

export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= CONF_LABELS.high) return 'HIGH';
  if (score >= CONF_LABELS.medium) return 'MEDIUM';
  return 'LOW';
}
