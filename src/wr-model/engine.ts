// The public WR MVP engine. Orchestrates the exact §26.14 calculation order and
// returns the §26.15 output. Deterministic: no randomness, no clock reads
// (as_of_timestamp comes from the input), no network, no hidden state.

import { DEFAULT_HORIZON, DEFAULT_MODEL_VERSION, DEFAULT_SCORING, SCHEMA_VERSION } from '@/wr-model/constants';
import { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/wr-model/referenceDistributions';
import { validateInput } from '@/wr-model/validation';
import { resolveFallbacks } from '@/wr-model/fallbacks';
import { shrinkCROE, shrinkDepthAdjYpt, shrinkTPRR } from '@/wr-model/shrinkage';
import { routeTrendScore, tprrTrendScore } from '@/wr-model/trends';
import { computeComponents } from '@/wr-model/components';
import { computeComposites } from '@/wr-model/composites';
import { computeProjections } from '@/wr-model/projections';
import { computeConfidence, confidenceLabel } from '@/wr-model/confidence';
import { computeVolatility, volatilityLabel } from '@/wr-model/volatility';
import { computeExplanations } from '@/wr-model/explanations';
import { PRECISION, round } from '@/wr-model/rounding';
import type { PercentileContext } from '@/wr-model/percentiles';
import type {
  EvaluateOptions,
  ReferenceKey,
  WRMVPInput,
  WRMVPOutput,
} from '@/wr-model/types';

const MISSING_REFERENCE_PENALTY = 5; // §26.4

export function evaluateWideReceiver(input: WRMVPInput, options: EvaluateOptions = {}): WRMVPOutput {
  const horizon = options.selected_horizon ?? DEFAULT_HORIZON;
  const reference = options.reference_distributions ?? DEFAULT_REFERENCE_DISTRIBUTIONS;
  const modelVersion = options.model_version ?? DEFAULT_MODEL_VERSION;
  const scoring = input.scoring ?? DEFAULT_SCORING;

  // 1) Validate — throws WRValidationError on bad input (never fabricates output).
  validateInput(input);

  // 2) Fallbacks + log + penalty tally.
  const { resolved, log: fallbackLog, penalty: fallbackPenalty } = resolveFallbacks(input, reference);

  // §26.4 missing-reference penalty accounting (recorded once per missing key).
  const missingReferenceKeys = new Set<ReferenceKey>();
  const ctx: PercentileContext = {
    reference,
    onMissingReference: (key) => missingReferenceKeys.add(key),
  };

  // 3) Shrinkage.
  const tprrShrink = shrinkTPRR(resolved.tprr, input.career_routes, input.draft_round);
  const shrunkCROE = shrinkCROE(resolved.croe, input.career_routes);
  const shrunkDepthAdjYpt = shrinkDepthAdjYpt(resolved.depthAdjYpt, input.career_routes, reference);

  // 4) Trend scores.
  const rTrend = routeTrendScore(resolved.rp4, input.previous_route_participation);
  const tTrend = tprrTrendScore(tprrShrink.shrunkTPRR, input.previous_targets_per_route_run);

  // 5+6) Percentiles + components.
  const components = computeComponents(
    {
      resolved,
      shrunkTPRR: tprrShrink.shrunkTPRR,
      shrunkCROE,
      shrunkDepthAdjYpt,
      routeTrendScore: rTrend,
      tprrTrendScore: tTrend,
      input,
    },
    ctx,
  );

  // 7) Composites.
  const composites = computeComposites(components);

  // 8) Projections (Weekly + ROS).
  const proj = computeProjections({
    av: components.AV,
    teamDropbacks: resolved.teamDropbacks,
    rp4: resolved.rp4,
    shrunkTPRR: tprrShrink.shrunkTPRR,
    adot: resolved.adot,
    shrunkCROE,
    shrunkDepthAdjYpt,
    xtdPerTarget: resolved.xtdPerTarget,
    expectedGamesRemaining: input.expected_games_remaining,
    scoring,
  });

  // 9) Confidence + volatility.
  const missingReferencePenalty = missingReferenceKeys.size * MISSING_REFERENCE_PENALTY;
  const confidence = computeConfidence(input, fallbackLog, fallbackPenalty, missingReferencePenalty);
  const volatility = computeVolatility(input, resolved.rp4, resolved.adot, tprrShrink.priorWeight);

  // 10) Explanations for the selected horizon.
  const explanations = computeExplanations(components, horizon);

  // Status: PARTIAL if any §26.5 fallback (or missing reference) was required.
  const status: 'OK' | 'PARTIAL' =
    fallbackLog.length > 0 || missingReferenceKeys.size > 0 ? 'PARTIAL' : 'OK';

  // 11) Round for serialization (Decision 5) and return. Labels are derived
  // from the ROUNDED score so the reported score and label never disagree at a
  // boundary (e.g. a raw 32.97 volatility that displays as 33.0).
  const confidenceScoreRounded = round(confidence.score, PRECISION.confidence);
  const volatilityScoreRounded = round(volatility.score, PRECISION.volatility);
  return {
    schema_version: SCHEMA_VERSION,
    model_version: modelVersion,
    player_id: input.player_id,
    player_name: input.player_name,
    as_of_timestamp: input.as_of_timestamp,

    components: {
      RR: round(components.RR, PRECISION.component),
      TE: round(components.TE, PRECISION.component),
      TQ: round(components.TQ, PRECISION.component),
      EF: round(components.EF, PRECISION.component),
      TC: round(components.TC, PRECISION.component),
      RD: round(components.RD, PRECISION.component),
      AD: round(components.AD, PRECISION.component),
      AV: round(components.AV, PRECISION.component),
    },

    composites: {
      WEEKLY: round(composites.WEEKLY, PRECISION.composite),
      ROS: round(composites.ROS, PRECISION.composite),
      ONE_YEAR: round(composites.ONE_YEAR, PRECISION.composite),
      THREE_YEAR: round(composites.THREE_YEAR, PRECISION.composite),
      DYNASTY: round(composites.DYNASTY, PRECISION.composite),
    },

    weekly: {
      probability_active: round(proj.probabilityActive, PRECISION.probabilityActive),
      expected_routes: round(proj.expectedRoutes, PRECISION.routes),
      expected_targets: round(proj.expectedTargets, PRECISION.targets),
      expected_receptions: round(proj.expectedReceptions, PRECISION.receptions),
      expected_receiving_yards: round(proj.expectedReceivingYards, PRECISION.yards),
      expected_receiving_touchdowns: round(proj.expectedReceivingTouchdowns, PRECISION.touchdowns),
      expected_fantasy_points: round(proj.weeklyEFO, PRECISION.fantasyPoints),
    },

    ros: {
      expected_active_games: round(proj.expectedActiveGamesRemaining, PRECISION.activeGames),
      expected_fantasy_points: round(proj.rosEFO, PRECISION.fantasyPoints),
    },

    confidence: {
      score: confidenceScoreRounded,
      label: confidenceLabel(confidenceScoreRounded),
      penalties: confidence.penalties,
    },

    volatility: {
      score: volatilityScoreRounded,
      label: volatilityLabel(volatilityScoreRounded),
    },

    explanations,
    fallback_log: fallbackLog,
    status,
  };
}
