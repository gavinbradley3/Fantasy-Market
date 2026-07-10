// The public RB MVP engine. Orchestrates the exact §26.14 calculation order and
// returns the §26.15 output. Deterministic: no randomness, no clock reads
// (as_of_timestamp comes from the input), no network, no hidden state.

import {
  DEFAULT_HORIZON,
  DEFAULT_MODEL_VERSION,
  DEFAULT_SCORING,
  MISSING_REFERENCE_PENALTY,
  SCHEMA_VERSION,
} from '@/rb-model/constants';
import { DEFAULT_REFERENCE_DISTRIBUTIONS } from '@/rb-model/referenceDistributions';
import { validateInput } from '@/rb-model/validation';
import { resolveFallbacks } from '@/rb-model/fallbacks';
import {
  shrinkCatchRate,
  shrinkExplosiveRate,
  shrinkRecYardsPerReception,
  shrinkSuccessRate,
  shrinkTPRR,
  shrinkYPC,
} from '@/rb-model/shrinkage';
import { computeTrends } from '@/rb-model/trends';
import { computeComponents, type ShrunkValues } from '@/rb-model/components';
import { computeComposites } from '@/rb-model/composites';
import { computeProjections } from '@/rb-model/projections';
import { computeConfidence, confidenceLabel } from '@/rb-model/confidence';
import { computeVolatility, volatilityLabel } from '@/rb-model/volatility';
import { computeExplanations } from '@/rb-model/explanations';
import { PRECISION, round } from '@/rb-model/rounding';
import type { PercentileContext } from '@/rb-model/percentiles';
import type { EvaluateOptions, InjuryStatus, RBMVPInput, RBMVPOutput, ReferenceKey } from '@/rb-model/types';

const INACTIVE_LIST: InjuryStatus[] = ['OUT', 'IR', 'PUP', 'SUSPENDED'];

export function evaluateRunningBack(input: RBMVPInput, options: EvaluateOptions = {}): RBMVPOutput {
  const horizon = options.selected_horizon ?? DEFAULT_HORIZON;
  const reference = options.reference_distributions ?? DEFAULT_REFERENCE_DISTRIBUTIONS;
  const modelVersion = options.model_version ?? DEFAULT_MODEL_VERSION;
  const scoring = input.scoring ?? DEFAULT_SCORING;

  // 1) Validate — throws RBValidationError on bad input (never fabricates output).
  validateInput(input, options.selected_horizon);

  // 2–3) Capture originals + apply canonical fallbacks (de-duplicated log + penalty).
  const { resolved, log: fallbackLog, penalty: fallbackPenalty } = resolveFallbacks(input, reference);

  // §26.4 missing-reference penalty accounting (recorded once per missing key).
  const missingReferenceKeys = new Set<ReferenceKey>();
  const ctx: PercentileContext = {
    reference,
    onMissingReference: (key) => missingReferenceKeys.add(key),
  };

  // 5–6) Shrinkage.
  const tprrShrink = shrinkTPRR(resolved.tprr, input.career_routes, input.draft_round);
  const shrunk: ShrunkValues = {
    shrunkTPRR: tprrShrink.shrunkTPRR,
    shrunkYPC: shrinkYPC(resolved.ypc, input.career_carries, input.yards_per_carry, input.career_yards_per_carry),
    shrunkSuccessRate: shrinkSuccessRate(resolved.successRate, input.career_carries),
    shrunkExplosiveRate: shrinkExplosiveRate(resolved.explosiveRate, input.career_carries),
    shrunkCatchRate: shrinkCatchRate(resolved.catchRate, input.career_routes, input.catch_rate, input.career_catch_rate),
    shrunkRecYardsPerReception: shrinkRecYardsPerReception(
      resolved.recYardsPerReception,
      input.career_routes,
      input.receiving_yards_per_reception,
      input.career_receiving_yards_per_reception,
    ),
  };

  // 7) Trends.
  const trends = computeTrends(
    resolved.snap4,
    resolved.carryShare,
    resolved.routeParticipation,
    input.previous_snap_share,
    input.previous_carry_share,
    input.previous_route_participation,
  );

  // 8–10) Shared derived values, percentiles, and eight components.
  const { components } = computeComponents(input, resolved, shrunk, trends.workloadTrendScore, ctx);

  // 11) Composites.
  const composites = computeComposites(components);

  // 12–13) Active-game statistics + Weekly/ROS EFO.
  const inactiveList = INACTIVE_LIST.includes(input.injury_status);
  const proj = computeProjections({
    av: components.AV,
    inactiveList,
    teamNonQbRush: resolved.teamNonQbRush,
    carryShare: resolved.carryShare,
    qbRushPressure: resolved.qbRushPressure,
    teamDropbacks: resolved.teamDropbacks,
    routeParticipation: resolved.routeParticipation,
    shrunkTPRR: shrunk.shrunkTPRR,
    shrunkCatchRate: shrunk.shrunkCatchRate,
    shrunkRecYardsPerReception: shrunk.shrunkRecYardsPerReception,
    shrunkYPC: shrunk.shrunkYPC,
    pointsPerDrive: resolved.pointsPerDrive,
    goalLineShare: resolved.goalLineShare,
    redZoneShare: resolved.redZoneShare,
    workloadRamp: resolved.workloadRamp,
    expectedGamesRemaining: input.expected_games_remaining,
    scoring,
  });

  // 14) Confidence.
  const missingReferencePenalty = missingReferenceKeys.size * MISSING_REFERENCE_PENALTY;
  const confidence = computeConfidence(input, fallbackLog, fallbackPenalty, missingReferencePenalty);

  // 15) Volatility + dependence measures.
  const volatility = computeVolatility(
    input,
    resolved.snap4,
    resolved.competitionPressure,
    shrunk.shrunkExplosiveRate,
    proj.currentActiveGame,
    input.career_routes,
    input.career_carries,
    scoring,
  );

  // 16) Explanations for the selected horizon.
  const explanations = computeExplanations({
    components,
    resolved,
    currentExpectedTargets: proj.currentActiveGame.expectedTargets,
    tdDependence: volatility.tdDependence,
    teammateReturnFlag: input.teammate_return_flag,
    horizon,
  });

  // 17) Status: PARTIAL if any §26.5 fallback or §26.4 missing-reference was used.
  const status: 'OK' | 'PARTIAL' =
    fallbackLog.length > 0 || missingReferenceKeys.size > 0 ? 'PARTIAL' : 'OK';

  // 18) Serialize with required rounding (§26.2.4). Confidence and volatility
  // labels derive from the ROUNDED score so the reported score and label never
  // disagree at a boundary (e.g. a raw 32.97 volatility that displays as 33.0).
  const cg = proj.currentActiveGame;
  const confidenceScore = round(confidence.score, PRECISION.confidence);
  const volatilityScore = round(volatility.score, PRECISION.volatility);

  return {
    schema_version: SCHEMA_VERSION,
    model_version: modelVersion,
    reference_version: reference.reference_version,
    player_id: input.player_id,
    player_name: input.player_name,
    as_of_timestamp: input.as_of_timestamp,

    components: {
      WRK: round(components.WRK, PRECISION.component),
      OQ: round(components.OQ, PRECISION.component),
      RE: round(components.RE, PRECISION.component),
      RU: round(components.RU, PRECISION.component),
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
      workload_ramp_factor: round(proj.effectiveRamp, PRECISION.workloadRamp),
      expected_carries: round(cg.expectedCarries, PRECISION.projection),
      expected_rushing_yards: round(cg.expectedRushingYards, PRECISION.projection),
      expected_rushing_touchdowns: round(cg.expectedRushingTouchdowns, PRECISION.projection),
      expected_routes: round(cg.expectedRoutes, PRECISION.projection),
      expected_targets: round(cg.expectedTargets, PRECISION.projection),
      expected_receptions: round(cg.expectedReceptions, PRECISION.projection),
      expected_receiving_yards: round(cg.expectedReceivingYards, PRECISION.projection),
      expected_receiving_touchdowns: round(cg.expectedReceivingTouchdowns, PRECISION.projection),
      expected_fantasy_points: round(proj.weeklyEFO, PRECISION.projection),
    },

    ros: {
      expected_active_games: round(proj.expectedActiveGamesRemaining, PRECISION.projection),
      expected_fantasy_points: round(proj.rosEFO, PRECISION.projection),
    },

    confidence: {
      score: confidenceScore,
      label: confidenceLabel(confidenceScore),
      penalties: confidence.penalties,
    },

    volatility: {
      score: volatilityScore,
      label: volatilityLabel(volatilityScore),
      td_dependence: round(volatility.tdDependence, PRECISION.dependence),
      receiving_dependence: round(volatility.receivingDependence, PRECISION.dependence),
    },

    explanations,
    fallback_log: fallbackLog,
    status,
  };
}
