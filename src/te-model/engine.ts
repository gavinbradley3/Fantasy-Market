/**
 * Public TE MVP engine (Section 26.1) executing the binding calculation order of
 * Section 26.14. Deterministic: no randomness, no clock reads, no network, no
 * file-system access, no mutable global state.
 */

import {
  DEFAULT_MODEL_VERSION,
  DEFAULT_SCORING,
  DEFAULT_SELECTED_HORIZON,
  MISSING_REFERENCE_PENALTY,
  SCHEMA_VERSION,
} from "./constants.js";
import { computeComponents, computeDerived } from "./components.js";
import { computeComposites } from "./composites.js";
import { computeConfidence } from "./confidence.js";
import { generateExplanations } from "./explanations.js";
import { resolveCanonicalValues } from "./fallbacks.js";
import { computePriors } from "./priors.js";
import { resolveReference } from "./references.js";
import {
  confidenceLabel,
  round1,
  round3,
  validateSerializedOutput,
  volatilityLabel,
} from "./serialization.js";
import { computeShrunkValues } from "./shrinkage.js";
import { computeProjections } from "./projections.js";
import { computeTrends } from "./trends.js";
import { validateInput, validateOptions } from "./validation.js";
import { computeVolatility } from "./volatility.js";
import type {
  TEEvaluateOptions,
  TEFallbackLogEntry,
  TEMVPInput,
  TEMVPOutput,
  TEScoring,
} from "./types.js";

export function evaluateTightEnd(
  input: TEMVPInput,
  options?: TEEvaluateOptions
): TEMVPOutput {
  // 1. Validate input, scoring, options, and any explicitly supplied runtime reference.
  validateOptions(options);
  validateInput(input);

  // 2–4. Trim identity/version strings; resolve defaults and the applicable reference.
  const playerId = input.player_id.trim();
  const playerName = input.player_name.trim();
  const modelVersion = (options?.model_version ?? DEFAULT_MODEL_VERSION).trim();
  const selectedHorizon = options?.selected_horizon ?? DEFAULT_SELECTED_HORIZON;
  const scoring: TEScoring = input.scoring
    ? {
        points_per_reception: input.scoring.points_per_reception,
        points_per_receiving_yard: input.scoring.points_per_receiving_yard,
        points_per_receiving_td: input.scoring.points_per_receiving_td,
      }
    : { ...DEFAULT_SCORING };
  const reference = resolveReference(options?.reference_distributions);

  // 5. Priors required by fallback rules.
  const priors = computePriors(input);

  // 6–13. Canonical fallback resolution in the binding dependency order, including the
  //        shrunk_TPRR computation the target-share fallback depends on.
  const { canonical, shrunk_tprr, entries } = resolveCanonicalValues(input, priors, reference);

  // 14. Remaining shrinkage formulas.
  const shrunk = computeShrunkValues(input, canonical, shrunk_tprr);

  // 15. Trends (missing history is neutral, never a fallback).
  const trends = computeTrends(input, canonical, shrunk_tprr);

  // 16. Shared role and opportunity values.
  const derived = computeDerived(canonical, shrunk_tprr);

  // 17–18. Percentiles and the eight components with gates, floors, and caps.
  const components = computeComponents(input, canonical, shrunk, trends, derived, reference);

  // 19. Five horizon composites.
  const composites = computeComposites(components);

  // 20–24. Availability, Pactive, conditional projections, Weekly EFO, ROS EFO.
  const projections = computeProjections(input, canonical, shrunk, scoring, components.AV);

  // 25. Confidence.
  const confidence = computeConfidence(input, entries, reference);

  // 26. Volatility and dependence ratios.
  const volatility = computeVolatility(
    input,
    canonical,
    shrunk,
    derived,
    projections.current_active_game,
    scoring
  );

  // 27. Explanations for the selected horizon.
  const explanations = generateExplanations(
    input,
    canonical,
    shrunk,
    derived,
    components,
    volatility.td_dependence,
    selectedHorizon
  );

  // 28. Status: PARTIAL when any documented field or reference fallback occurred.
  const status: "OK" | "PARTIAL" =
    entries.length > 0 || reference.missing.length > 0 ? "PARTIAL" : "OK";

  // Fallback log: canonical fields in table order, then missing reference
  // distributions in interface order (Section 26.5.8).
  const fallbackLog: TEFallbackLogEntry[] = [
    ...entries.map((entry) => ({ ...entry })),
    ...reference.missing.map((name) => ({
      field: `REFERENCE_DISTRIBUTION:${name}`,
      fallback_used: "PERCENTILE_50",
      confidence_penalty: MISSING_REFERENCE_PENALTY,
    })),
  ];

  // 29–30. Round, serialize, and derive labels from rounded scores.
  const confidenceScore = round1(confidence.score);
  const volatilityScore = round1(volatility.score);

  const output: TEMVPOutput = {
    schema_version: SCHEMA_VERSION,
    model_version: modelVersion,
    reference_version: reference.reference_version,
    selected_horizon: selectedHorizon,
    scoring,
    player_id: playerId,
    player_name: playerName,
    team: input.team,
    as_of_timestamp: input.as_of_timestamp,

    components: {
      RR: round1(components.RR),
      TE: round1(components.TE),
      TQ: round1(components.TQ),
      RE: round1(components.RE),
      TC: round1(components.TC),
      RD: round1(components.RD),
      AD: round1(components.AD),
      AV: round1(components.AV),
    },

    composites: {
      WEEKLY: round1(composites.WEEKLY),
      ROS: round1(composites.ROS),
      ONE_YEAR: round1(composites.ONE_YEAR),
      THREE_YEAR: round1(composites.THREE_YEAR),
      DYNASTY: round1(composites.DYNASTY),
    },

    weekly: {
      probability_active: round3(projections.probability_active),
      workload_ramp_factor: round3(projections.effective_ramp),
      expected_routes: round1(projections.current_active_game.expected_routes),
      expected_targets: round1(projections.current_active_game.expected_targets),
      expected_receptions: round1(projections.current_active_game.expected_receptions),
      expected_receiving_yards: round1(
        projections.current_active_game.expected_receiving_yards
      ),
      expected_receiving_touchdowns: round1(
        projections.current_active_game.expected_receiving_touchdowns
      ),
      expected_fantasy_points: round1(projections.weekly_expected_fantasy_points),
    },

    ros: {
      expected_active_games: round1(projections.expected_active_games_remaining),
      expected_fantasy_points: round1(projections.ros_expected_fantasy_points),
    },

    confidence: {
      score: confidenceScore,
      label: confidenceLabel(confidenceScore),
      penalties: confidence.penalties,
    },

    volatility: {
      score: volatilityScore,
      label: volatilityLabel(volatilityScore),
      td_dependence: round1(volatility.td_dependence),
      explosive_dependence: round1(volatility.explosive_dependence),
    },

    explanations,

    fallback_log: fallbackLog,

    status,
  };

  // 31. Final finiteness/range validation of every serialized numeric output.
  validateSerializedOutput(output);

  return output;
}
