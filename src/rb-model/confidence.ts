// §26.11 confidence. Start 100; subtract each unique §26.5 fallback penalty
// (already summed) plus §26.4 missing-reference penalties, then the situational
// deductions below. Confidence never changes EFO, components, composites, or
// football-stat expectations — it only communicates reliability.

import {
  CONF_COACHING_UNKNOWN,
  CONF_INJURY_UNKNOWN,
  CONF_LABELS,
  CONF_ROLE_UNKNOWN,
  CONF_START,
  CONF_TEAM_NULL,
  CONF_TEAMMATE_RETURN,
  CONF_TOUCHES,
} from '@/rb-model/constants';
import { clamp } from '@/rb-model/math';
import type { ConfidenceLabel, FallbackLogEntry, RBMVPInput } from '@/rb-model/types';

export interface ConfidenceResult {
  score: number;
  penalties: string[];
}

export function computeConfidence(
  input: RBMVPInput,
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

  // Career-touch tiers (mutually exclusive).
  const t = input.career_touches;
  if (t <= CONF_TOUCHES.veryLow.max) {
    penalties.push(`Career touches < 50 (−${CONF_TOUCHES.veryLow.penalty})`);
    total += CONF_TOUCHES.veryLow.penalty;
  } else if (t <= CONF_TOUCHES.low.max) {
    penalties.push(`Career touches 50–149 (−${CONF_TOUCHES.low.penalty})`);
    total += CONF_TOUCHES.low.penalty;
  } else if (t <= CONF_TOUCHES.mid.max) {
    penalties.push(`Career touches 150–299 (−${CONF_TOUCHES.mid.penalty})`);
    total += CONF_TOUCHES.mid.penalty;
  }

  if (input.injury_status === 'UNKNOWN') {
    penalties.push(`Injury status UNKNOWN (−${CONF_INJURY_UNKNOWN})`);
    total += CONF_INJURY_UNKNOWN;
  }
  if (input.role_change === 'UNKNOWN') {
    penalties.push(`Role change UNKNOWN (−${CONF_ROLE_UNKNOWN})`);
    total += CONF_ROLE_UNKNOWN;
  }
  if (input.teammate_return_flag) {
    penalties.push(`Teammate return expected (−${CONF_TEAMMATE_RETURN})`);
    total += CONF_TEAMMATE_RETURN;
  }
  if (input.team === null) {
    penalties.push(`Team is null (−${CONF_TEAM_NULL})`);
    total += CONF_TEAM_NULL;
  }
  if (input.coaching_continuity === 'UNKNOWN') {
    penalties.push(`Coaching continuity UNKNOWN (−${CONF_COACHING_UNKNOWN})`);
    total += CONF_COACHING_UNKNOWN;
  }

  return { score: clamp(CONF_START - total, 0, 100), penalties };
}

export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= CONF_LABELS.high) return 'HIGH';
  if (score >= CONF_LABELS.medium) return 'MEDIUM';
  return 'LOW';
}
