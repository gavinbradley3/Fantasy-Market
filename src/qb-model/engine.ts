/**
 * Public QB MVP engine (Section 26.1) executing the binding calculation order of
 * Section 26.14. Deterministic: the only non-deterministic input is the default
 * generated_at clock read, which becomes deterministic when options.generated_at is
 * supplied. No network, file-system, or mutable global state. Inputs, options, scoring,
 * and reference objects are never mutated.
 */

import { computeComponents, computePercentiles } from "./components.js";
import { computeComposites } from "./composites.js";
import { computeConfidence } from "./confidence.js";
import {
  DEFAULT_MODEL_VERSION,
  DEFAULT_SCORING,
  DEFAULT_SELECTED_HORIZON,
  SCHEMA_VERSION,
} from "./constants.js";
import { generateExplanations } from "./explanations.js";
import { resolveFallbacks } from "./fallbacks.js";
import { lexicalSort, unique } from "./math.js";
import { computePriors } from "./priors.js";
import { resolveReference } from "./references.js";
import {
  assertExactQBOutputShape,
  canonicalTimestamp,
  confidenceLabel,
  volatilityLabel,
} from "./serialization.js";
import { computeShrunkValues } from "./shrinkage.js";
import { computeProjections } from "./projections.js";
import { computeTrends } from "./trends.js";
import { validateAndMergeScoring, validateInput, validateOptions } from "./validation.js";
import { computeVolatility } from "./volatility.js";
import type { QBEvaluatorOptions, QBMVPInput, QBMVPOutput } from "./types.js";

export function evaluateQuarterback(
  input: QBMVPInput,
  options?: QBEvaluatorOptions
): QBMVPOutput {
  // 1–4. Validate raw input, options, scoring overrides, and any custom references.
  validateOptions(options);
  validateInput(input);
  const scoring = validateAndMergeScoring(options?.scoring, DEFAULT_SCORING);
  const reference = resolveReference(options?.reference_distributions);

  const selectedHorizon = options?.selected_horizon ?? DEFAULT_SELECTED_HORIZON;
  const modelVersion = (options?.model_version ?? DEFAULT_MODEL_VERSION).trim();
  const generatedAt = canonicalTimestamp(options?.generated_at ?? new Date().toISOString());

  // 5–8. Resolve nullable inputs; de-duplicate + lexically sort fallback log; status.
  const { resolved, codes } = resolveFallbacks(input);
  const fallbackLog = lexicalSort(unique(codes));
  const fallbackCount = fallbackLog.length;
  const status: QBMVPOutput["status"] =
    fallbackCount === 0 ? "COMPLETE" : fallbackCount <= 4 ? "PARTIAL" : "FALLBACK_HEAVY";

  // 9–11. Priors, shrinkage (incl. AY/A and ordinary passing YPA), trends.
  const priors = computePriors(input);
  const shrunk = computeShrunkValues(input, resolved, priors, reference);
  const trends = computeTrends(input, priors, shrunk, resolved.adjusted_yards_per_attempt);

  // 12. Percentiles.
  const percentiles = computePercentiles(resolved, shrunk, reference);

  // 13–20. Eight components.
  const components = computeComponents(input, resolved, trends, percentiles);

  // 21. Five horizon composites.
  const composites = computeComposites(components);

  // 22–26. Conditional projections, Weekly EFO, ROS EFO.
  const projections = computeProjections(input, resolved, shrunk, scoring);

  // 27. Confidence and penalty codes.
  const confidence = computeConfidence(input, fallbackCount);

  // 28. Volatility and dependence metrics.
  const volatility = computeVolatility(
    input,
    components,
    shrunk,
    trends,
    projections.conditional,
    scoring,
    reference
  );

  // 29. Explanations for the selected horizon (unrounded comparisons).
  const explanations = generateExplanations(
    input,
    components,
    selectedHorizon,
    resolved.probability_active,
    volatility.rushing_dependence,
    fallbackCount
  );

  // 30. Construct the output object at full internal precision (Section 26.14 step 30).
  const output: QBMVPOutput = {
    schema_version: SCHEMA_VERSION,
    model_version: modelVersion,
    reference_version: reference.reference_version,
    generated_at: generatedAt,
    player: {
      player_id: input.player_id.trim(),
      player_name: input.player_name.trim(),
      team: input.team,
      as_of: canonicalTimestamp(input.as_of),
    },
    scoring: {
      points_per_completion: scoring.points_per_completion,
      points_per_passing_yard: scoring.points_per_passing_yard,
      points_per_passing_td: scoring.points_per_passing_td,
      points_per_interception: scoring.points_per_interception,
      points_per_rushing_yard: scoring.points_per_rushing_yard,
      points_per_rushing_td: scoring.points_per_rushing_td,
    },
    status,
    fallback_log: fallbackLog,
    components: {
      passing_opportunity: components.PO,
      passing_quality: components.PQ,
      rushing_value: components.RV,
      scoring_environment: components.SE,
      role_security: components.RS,
      availability: components.AV,
      age_development: components.AD,
      sustainability: components.SU,
    },
    composites: {
      weekly: composites.WEEKLY,
      ros: composites.ROS,
      one_year: composites.ONE_YEAR,
      three_year: composites.THREE_YEAR,
      dynasty: composites.DYNASTY,
    },
    expected_fantasy_output: {
      conditional_on_active: {
        pass_attempts: projections.conditional.pass_attempts,
        completions: projections.conditional.completions,
        completion_rate: projections.conditional.completion_rate,
        passing_yards: projections.conditional.passing_yards,
        passing_tds: projections.conditional.passing_tds,
        interceptions: projections.conditional.interceptions,
        designed_rush_attempts: projections.conditional.designed_rush_attempts,
        scrambles: projections.conditional.scrambles,
        total_rush_attempts: projections.conditional.total_rush_attempts,
        rushing_yards: projections.conditional.rushing_yards,
        rushing_tds: projections.conditional.rushing_tds,
        fantasy_points: projections.conditional.fantasy_points,
      },
      probability_active: projections.probability_active,
      weekly_fantasy_points: projections.weekly_fantasy_points,
      ros_fantasy_points: projections.ros_fantasy_points,
      expected_games_remaining: projections.expected_games_remaining,
      expected_games_limited: projections.expected_games_limited,
    },
    confidence: {
      score: confidence.score,
      label: confidenceLabel(confidence.score),
      penalty_codes: lexicalSort(unique(confidence.codes)),
    },
    volatility: {
      score: volatility.score,
      label: volatilityLabel(volatility.score),
      rushing_dependence: volatility.rushing_dependence,
      turnover_risk: volatility.turnover_risk,
      role_instability: volatility.role_instability,
    },
    explanations,
  };

  // 31. Reject any non-finite value or shape violation before returning (rounding is
  //     applied only by canonicalSerializeQBOutput).
  assertExactQBOutputShape(output);

  return output;
}
