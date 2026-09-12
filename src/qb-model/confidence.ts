/**
 * Exact confidence formula and penalty codes (Section 26.11). Confidence measures
 * evidence reliability; a high or low component score never alters it.
 *
 * CONFIDENCE MEASURES THIS PLAYER'S EVIDENCE. COVERAGE IS A DIFFERENT QUESTION.
 *
 * Section 26.11.2 used to open with a fallback-count bucket: 8 or more substituted inputs cost
 * 20 points. The intent was sound — a valuation that needed unusual amounts of substitution is
 * less well evidenced — but it assumed the substitutions would VARY between players. In the
 * production pipeline they do not. Measured on the live board, all 81 quarterbacks resolved
 * exactly 16 fallbacks, and 15 of the 16 codes were identical for every one of them: there is
 * no free feed for protection context, offensive environment, explosive pass rate, CPOE,
 * dropback share, expected per-game splits, organizational commitment or competition pressure,
 * so every quarterback gets the same substitutions in the same places.
 *
 * A term with the same value for every member of a population carries no information about any
 * member of it. What it does carry is a true statement about the MODEL'S COVERAGE — and that
 * belongs where a coverage statement belongs. The engine already publishes it: `fallback_log`
 * names every substituted input on every output, and the count reaches the product from there.
 *
 * The observable damage was not subtle. The deduction shifted all 81 quarterbacks down 20
 * points, capping the board's best-evidenced passers at exactly 80 (nine were tied there,
 * none above), and it pushed 12 quarterbacks into the clamp at 0 — where a player with a
 * genuinely thin record and a player with nearly twice as much evidence became the same
 * number, and the metric stopped distinguishing them at all.
 *
 * Everything below this line is player-specific by construction: four measures of how much of
 * this quarterback's own football has been observed, and seven circumstances of his own that
 * make the observation less informative about what comes next.
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

  // 26.11.2 — the fallback-count bucket is DELIBERATELY ABSENT. See the note at the top of this
  // file: it is a coverage measure, it is constant across the whole production population, and
  // it is published through `fallback_log` rather than deducted here.
  //
  // `fallbackCount` remains a parameter because the caller computes it anyway and the
  // explanations layer consumes it; confidence no longer reads it.
  void fallbackCount;

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
