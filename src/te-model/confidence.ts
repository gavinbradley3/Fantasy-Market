/**
 * Confidence score and canonical penalty codes (Section 26.11). Confidence never
 * changes EFO, components, composites, or football statistics.
 */

import {
  MISSING_REFERENCE_PENALTY,
  NON_FALLBACK_CONFIDENCE_RULES,
} from "./constants.js";
import { clamp } from "./percentiles.js";
import type { ResolvedReference } from "./references.js";
import type { TEFallbackLogEntry, TEMVPInput } from "./types.js";

export interface TEConfidenceResult {
  score: number;
  penalties: string[];
}

export function computeConfidence(
  input: TEMVPInput,
  fallbackEntries: readonly TEFallbackLogEntry[],
  reference: ResolvedReference
): TEConfidenceResult {
  const penalties: string[] = [];
  let totalPenalty = 0;

  // 1. Canonical field fallbacks in fallback-table order (entries are already ordered).
  for (const entry of fallbackEntries) {
    penalties.push(`FALLBACK:${entry.field}`);
    totalPenalty += entry.confidence_penalty;
  }

  // 2. Missing reference distributions in reference-interface order.
  for (const name of reference.missing) {
    penalties.push(`MISSING_REFERENCE:${name}`);
    totalPenalty += MISSING_REFERENCE_PENALTY;
  }

  // 3. Non-fallback rules in the binding order. Career-route tiers are mutually
  //    exclusive; each code appears at most once.
  const applies: Record<string, boolean> = {
    LOW_CAREER_ROUTES_LT_75: input.career_routes < 75,
    LOW_CAREER_ROUTES_75_TO_199: input.career_routes >= 75 && input.career_routes <= 199,
    LOW_CAREER_ROUTES_200_TO_399: input.career_routes >= 200 && input.career_routes <= 399,
    UNKNOWN_INJURY_STATUS: input.injury_status === "UNKNOWN",
    UNKNOWN_ROLE_CHANGE: input.role_change === "UNKNOWN",
    UNKNOWN_DEPTH_CHART_ROLE: input.depth_chart_role === "UNKNOWN",
    UNKNOWN_COACHING_CONTINUITY: input.coaching_continuity === "UNKNOWN",
    NEW_TEAM: input.new_team_flag,
    ANOTHER_RECEIVING_TE: input.another_receiving_te_flag,
    MISSING_TEAM: input.team === null,
  };
  for (const rule of NON_FALLBACK_CONFIDENCE_RULES) {
    if (applies[rule.code]) {
      penalties.push(rule.code);
      totalPenalty += rule.penalty;
    }
  }

  const score = clamp(100 - totalPenalty, 0, 100);
  return { score, penalties };
}
