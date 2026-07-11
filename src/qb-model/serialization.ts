/**
 * Canonical JSON serialization, timestamp canonicalization, and labels
 * (Sections 26.2.3 and 26.2.5). The authoritative golden representation is the UTF-8
 * text returned by canonicalSerializeQBOutput.
 */

import { lexicalSort, normalizeNumber, unique } from "./math.js";
import type { QBMVPOutput } from "./types.js";

export function canonicalTimestamp(value: string): string {
  return new Date(value).toISOString();
}

/** Confidence label from the unrounded score (Section 26.2.5). */
export function confidenceLabel(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score < 40) return "LOW";
  if (score < 70) return "MEDIUM";
  return "HIGH";
}

/** Volatility label from the unrounded score (Section 26.2.5). */
export function volatilityLabel(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score < 35) return "LOW";
  if (score < 65) return "MEDIUM";
  return "HIGH";
}

const OUTPUT_TOP_KEYS = [
  "schema_version",
  "model_version",
  "reference_version",
  "generated_at",
  "player",
  "scoring",
  "status",
  "fallback_log",
  "components",
  "composites",
  "expected_fantasy_output",
  "confidence",
  "volatility",
  "explanations",
];

function assertExactKeys(obj: unknown, keys: readonly string[], path: string): void {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error(`${path} must be a non-null object`);
  }
  const present = Object.keys(obj as Record<string, unknown>);
  for (const key of present) {
    if (!keys.includes(key)) {
      throw new Error(`${path} has unknown property: ${key}`);
    }
  }
  for (const key of keys) {
    if (!(key in (obj as Record<string, unknown>))) {
      throw new Error(`${path} is missing property: ${key}`);
    }
  }
}

function assertFinite(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
}

/**
 * Recursively reject missing/unknown properties and prohibited values (Section 26.2.5).
 */
export function assertExactQBOutputShape(output: QBMVPOutput): void {
  assertExactKeys(output, OUTPUT_TOP_KEYS, "output");
  assertExactKeys(output.player, ["player_id", "player_name", "team", "as_of"], "output.player");
  assertExactKeys(
    output.scoring,
    [
      "points_per_completion",
      "points_per_passing_yard",
      "points_per_passing_td",
      "points_per_interception",
      "points_per_rushing_yard",
      "points_per_rushing_td",
    ],
    "output.scoring"
  );
  assertExactKeys(
    output.components,
    [
      "passing_opportunity",
      "passing_quality",
      "rushing_value",
      "scoring_environment",
      "role_security",
      "availability",
      "age_development",
      "sustainability",
    ],
    "output.components"
  );
  assertExactKeys(
    output.composites,
    ["weekly", "ros", "one_year", "three_year", "dynasty"],
    "output.composites"
  );
  assertExactKeys(
    output.expected_fantasy_output,
    [
      "conditional_on_active",
      "probability_active",
      "weekly_fantasy_points",
      "ros_fantasy_points",
      "expected_games_remaining",
      "expected_games_limited",
    ],
    "output.expected_fantasy_output"
  );
  assertExactKeys(
    output.expected_fantasy_output.conditional_on_active,
    [
      "pass_attempts",
      "completions",
      "completion_rate",
      "passing_yards",
      "passing_tds",
      "interceptions",
      "designed_rush_attempts",
      "scrambles",
      "total_rush_attempts",
      "rushing_yards",
      "rushing_tds",
      "fantasy_points",
    ],
    "output.expected_fantasy_output.conditional_on_active"
  );
  assertExactKeys(output.confidence, ["score", "label", "penalty_codes"], "output.confidence");
  assertExactKeys(
    output.volatility,
    ["score", "label", "rushing_dependence", "turnover_risk", "role_instability"],
    "output.volatility"
  );
  assertExactKeys(output.explanations, ["positive", "negative"], "output.explanations");

  // Finiteness of numeric leaves.
  for (const v of Object.values(output.components)) assertFinite(v, "components");
  for (const v of Object.values(output.composites)) assertFinite(v, "composites");
  for (const v of Object.values(output.expected_fantasy_output.conditional_on_active)) {
    assertFinite(v, "conditional_on_active");
  }
  assertFinite(output.expected_fantasy_output.probability_active, "probability_active");
  assertFinite(output.expected_fantasy_output.weekly_fantasy_points, "weekly_fantasy_points");
  assertFinite(output.expected_fantasy_output.ros_fantasy_points, "ros_fantasy_points");
  assertFinite(output.expected_fantasy_output.expected_games_remaining, "expected_games_remaining");
  assertFinite(output.expected_fantasy_output.expected_games_limited, "expected_games_limited");
  assertFinite(output.confidence.score, "confidence.score");
  assertFinite(output.volatility.score, "volatility.score");
  assertFinite(output.volatility.rushing_dependence, "volatility.rushing_dependence");
  assertFinite(output.volatility.turnover_risk, "volatility.turnover_risk");
  assertFinite(output.volatility.role_instability, "volatility.role_instability");
  for (const v of Object.values(output.scoring)) assertFinite(v, "scoring");
}

export function canonicalSerializeQBOutput(output: QBMVPOutput): string {
  assertExactQBOutputShape(output);

  const canonical = {
    schema_version: output.schema_version,
    model_version: output.model_version,
    reference_version: output.reference_version,
    generated_at: canonicalTimestamp(output.generated_at),
    player: {
      player_id: output.player.player_id,
      player_name: output.player.player_name,
      team: output.player.team,
      as_of: canonicalTimestamp(output.player.as_of),
    },
    scoring: {
      points_per_completion: normalizeNumber(output.scoring.points_per_completion, 3),
      points_per_passing_yard: normalizeNumber(output.scoring.points_per_passing_yard, 3),
      points_per_passing_td: normalizeNumber(output.scoring.points_per_passing_td, 3),
      points_per_interception: normalizeNumber(output.scoring.points_per_interception, 3),
      points_per_rushing_yard: normalizeNumber(output.scoring.points_per_rushing_yard, 3),
      points_per_rushing_td: normalizeNumber(output.scoring.points_per_rushing_td, 3),
    },
    status: output.status,
    fallback_log: lexicalSort(unique(output.fallback_log)),
    components: {
      passing_opportunity: normalizeNumber(output.components.passing_opportunity, 1),
      passing_quality: normalizeNumber(output.components.passing_quality, 1),
      rushing_value: normalizeNumber(output.components.rushing_value, 1),
      scoring_environment: normalizeNumber(output.components.scoring_environment, 1),
      role_security: normalizeNumber(output.components.role_security, 1),
      availability: normalizeNumber(output.components.availability, 1),
      age_development: normalizeNumber(output.components.age_development, 1),
      sustainability: normalizeNumber(output.components.sustainability, 1),
    },
    composites: {
      weekly: normalizeNumber(output.composites.weekly, 1),
      ros: normalizeNumber(output.composites.ros, 1),
      one_year: normalizeNumber(output.composites.one_year, 1),
      three_year: normalizeNumber(output.composites.three_year, 1),
      dynasty: normalizeNumber(output.composites.dynasty, 1),
    },
    expected_fantasy_output: {
      conditional_on_active: {
        pass_attempts: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.pass_attempts,
          1
        ),
        completions: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.completions,
          1
        ),
        completion_rate: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.completion_rate,
          3
        ),
        passing_yards: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.passing_yards,
          1
        ),
        passing_tds: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.passing_tds,
          1
        ),
        interceptions: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.interceptions,
          1
        ),
        designed_rush_attempts: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.designed_rush_attempts,
          1
        ),
        scrambles: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.scrambles,
          1
        ),
        total_rush_attempts: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.total_rush_attempts,
          1
        ),
        rushing_yards: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.rushing_yards,
          1
        ),
        rushing_tds: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.rushing_tds,
          1
        ),
        fantasy_points: normalizeNumber(
          output.expected_fantasy_output.conditional_on_active.fantasy_points,
          1
        ),
      },
      probability_active: normalizeNumber(
        output.expected_fantasy_output.probability_active,
        1
      ),
      weekly_fantasy_points: normalizeNumber(
        output.expected_fantasy_output.weekly_fantasy_points,
        1
      ),
      ros_fantasy_points: normalizeNumber(
        output.expected_fantasy_output.ros_fantasy_points,
        1
      ),
      expected_games_remaining: normalizeNumber(
        output.expected_fantasy_output.expected_games_remaining,
        1
      ),
      expected_games_limited: normalizeNumber(
        output.expected_fantasy_output.expected_games_limited,
        1
      ),
    },
    confidence: {
      score: normalizeNumber(output.confidence.score, 1),
      label: output.confidence.label,
      penalty_codes: lexicalSort(unique(output.confidence.penalty_codes)),
    },
    volatility: {
      score: normalizeNumber(output.volatility.score, 1),
      label: output.volatility.label,
      rushing_dependence: normalizeNumber(output.volatility.rushing_dependence, 1),
      turnover_risk: normalizeNumber(output.volatility.turnover_risk, 1),
      role_instability: normalizeNumber(output.volatility.role_instability, 1),
    },
    explanations: {
      positive: [...output.explanations.positive],
      negative: [...output.explanations.negative],
    },
  };

  const json = JSON.stringify(canonical);
  if (/(^|[[,:])-?\d+(?:\.\d+)?[eE][+-]?\d+/.test(json)) {
    throw new Error("EXPONENT_NOTATION_PROHIBITED");
  }
  return json;
}
