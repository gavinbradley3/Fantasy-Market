/**
 * Exact confidence formula and penalty codes (Section 26.11). Confidence measures
 * evidence reliability; a high or low component score never alters it.
 */

import { clamp } from "./math.js";
import type { QBMVPInput } from "./types.js";

export interface QBConfidenceResult {
  score: number;
  /** Raw penalty codes (de-duplicated + sorted downstream). */
  codes: string[];
}

export function computeConfidence(
  input: QBMVPInput,
  fallbackCount: number
): QBConfidenceResult {
  // 26.11.1 Base evidence.
  const pass_sample_confidence = clamp((100 * input.career_pass_attempts) / 1200, 0, 100);
  const start_sample_confidence = clamp((100 * input.career_starts) / 32, 0, 100);
  const recent_sample_confidence = clamp((100 * input.recent_pass_attempts) / 250, 0, 100);
  const rush_sample_confidence = clamp((100 * input.career_rush_attempts) / 180, 0, 100);

  const base_confidence =
    0.35 * pass_sample_confidence +
    0.25 * start_sample_confidence +
    0.25 * recent_sample_confidence +
    0.15 * rush_sample_confidence;

  const codes: string[] = [];
  let penalty = 0;

  // 26.11.2 Fallback-count bucket.
  if (fallbackCount >= 8) {
    penalty += -20;
    codes.push("FALLBACK_8_PLUS");
  } else if (fallbackCount >= 5) {
    penalty += -14;
    codes.push("FALLBACK_5_7");
  } else if (fallbackCount >= 3) {
    penalty += -8;
    codes.push("FALLBACK_3_4");
  } else if (fallbackCount >= 1) {
    penalty += -4;
    codes.push("FALLBACK_1_2");
  }

  if (input.nfl_seasons_completed === 0) {
    penalty += -10;
    codes.push("ROOKIE_UNCERTAINTY");
  }
  if (input.role_status === "COMPETITION") {
    penalty += -8;
    codes.push("ROLE_COMPETITION");
  }
  if (input.role_status === "TEMPORARY_INJURY_REPLACEMENT") {
    penalty += -8;
    codes.push("TEMPORARY_STARTER");
  }
  if (input.role_status === "RECENTLY_BENCHED") {
    penalty += -12;
    codes.push("RECENT_BENCHING");
  }
  if (input.team_change) {
    penalty += -5;
    codes.push("TEAM_CHANGE");
  }
  if (input.major_system_change) {
    penalty += -5;
    codes.push("SYSTEM_CHANGE");
  }
  if (input.recent_role_change) {
    penalty += -7;
    codes.push("RECENT_ROLE_CHANGE");
  }
  if (input.injury_status === "QUESTIONABLE") {
    penalty += -5;
    codes.push("INJURY_QUESTIONABLE");
  } else if (
    input.injury_status === "DOUBTFUL" ||
    input.injury_status === "OUT" ||
    input.injury_status === "IR" ||
    input.injury_status === "PUP"
  ) {
    penalty += -10;
    codes.push("INJURY_MAJOR");
  }

  const score = clamp(base_confidence + penalty, 0, 100);
  return { score, codes };
}
