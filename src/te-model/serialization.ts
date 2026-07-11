/**
 * Serialization rounding contract, label derivation, and final output validation
 * (Sections 26.2.4 and 26.14 steps 29–31).
 */

import { roundTo } from "./percentiles.js";
import type { TEMVPOutput } from "./types.js";

export function confidenceLabel(roundedScore: number): "LOW" | "MEDIUM" | "HIGH" {
  if (roundedScore <= 59.9) return "LOW";
  if (roundedScore <= 79.9) return "MEDIUM";
  return "HIGH";
}

export function volatilityLabel(roundedScore: number): "LOW" | "MEDIUM" | "HIGH" {
  if (roundedScore <= 32.9) return "LOW";
  if (roundedScore <= 65.9) return "MEDIUM";
  return "HIGH";
}

export const round1 = (value: number): number => roundTo(value, 1);
export const round3 = (value: number): number => roundTo(value, 3);

interface RangeRule {
  min: number;
  max: number;
}

const SCORE_RANGE: RangeRule = { min: 0, max: 100 };
const UNIT_RANGE: RangeRule = { min: 0, max: 1 };
const NON_NEGATIVE: RangeRule = { min: 0, max: Number.POSITIVE_INFINITY };

/**
 * Validate that every serialized numeric output is finite and within its declared
 * range (Section 26.14 step 31). Throws on violation.
 */
export function validateSerializedOutput(output: TEMVPOutput): void {
  const check = (path: string, value: number, rule: RangeRule): void => {
    if (!Number.isFinite(value)) {
      throw new Error(`serialized output ${path} is not finite`);
    }
    if (value < rule.min || value > rule.max) {
      throw new Error(`serialized output ${path} is outside its declared range: ${value}`);
    }
  };

  for (const [name, value] of Object.entries(output.components)) {
    check(`components.${name}`, value, SCORE_RANGE);
  }
  for (const [name, value] of Object.entries(output.composites)) {
    check(`composites.${name}`, value, SCORE_RANGE);
  }
  check("weekly.probability_active", output.weekly.probability_active, UNIT_RANGE);
  check("weekly.workload_ramp_factor", output.weekly.workload_ramp_factor, UNIT_RANGE);
  check("weekly.expected_routes", output.weekly.expected_routes, NON_NEGATIVE);
  check("weekly.expected_targets", output.weekly.expected_targets, NON_NEGATIVE);
  check("weekly.expected_receptions", output.weekly.expected_receptions, NON_NEGATIVE);
  check("weekly.expected_receiving_yards", output.weekly.expected_receiving_yards, NON_NEGATIVE);
  check(
    "weekly.expected_receiving_touchdowns",
    output.weekly.expected_receiving_touchdowns,
    NON_NEGATIVE
  );
  check("weekly.expected_fantasy_points", output.weekly.expected_fantasy_points, NON_NEGATIVE);
  check("ros.expected_active_games", output.ros.expected_active_games, NON_NEGATIVE);
  check("ros.expected_fantasy_points", output.ros.expected_fantasy_points, NON_NEGATIVE);
  check("confidence.score", output.confidence.score, SCORE_RANGE);
  check("volatility.score", output.volatility.score, SCORE_RANGE);
  check("volatility.td_dependence", output.volatility.td_dependence, UNIT_RANGE);
  check("volatility.explosive_dependence", output.volatility.explosive_dependence, UNIT_RANGE);
  for (const entry of output.fallback_log) {
    check(`fallback_log[${entry.field}].confidence_penalty`, entry.confidence_penalty, {
      min: 0,
      max: 100,
    });
  }
}
