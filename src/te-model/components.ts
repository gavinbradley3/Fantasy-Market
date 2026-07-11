/**
 * Shared pre-component values and the eight TE component formulas (Section 26.8).
 */

import {
  AD_AGE_BASE,
  AD_LATE_CAREER_BASE,
  AV_DOUBTFUL,
  AV_HEALTHY,
  AV_INACTIVE_LIST,
  AV_QUESTIONABLE_DNP_UNKNOWN,
  AV_QUESTIONABLE_FULL,
  AV_QUESTIONABLE_LIMITED,
  AV_UNKNOWN,
  INACTIVE_LIST_STATUSES,
} from "./constants.js";
import { clamp, pct } from "./percentiles.js";
import type { ResolvedReference } from "./references.js";
import type {
  TECanonicalValues,
  TEComponentScores,
  TEDerivedValues,
  TEMVPInput,
  TEReferenceDistributionName,
  TEShrunkValues,
  TETrendValues,
} from "./types.js";

/**
 * Percentile against a named resolved distribution. A missing runtime distribution
 * produces percentile 50 wherever it is consumed (Section 26.4).
 */
export function percentileOf(
  reference: ResolvedReference,
  name: TEReferenceDistributionName,
  x: number
): number {
  const values = reference.distributions[name];
  if (values === null) return 50;
  return pct(x, values);
}

export function computeDerived(
  canonical: TECanonicalValues,
  shrunkTprrValue: number
): TEDerivedValues {
  const blockingGap = clamp(canonical.snap4 - canonical.rp4, 0, 1);
  const blockingHeavyRole = blockingGap >= 0.25 && canonical.rp4 < 0.65;
  const baseExpectedRoutes = canonical.projected_team_dropbacks * canonical.rp4;
  const baseExpectedTargets = baseExpectedRoutes * shrunkTprrValue;
  return {
    blocking_gap: blockingGap,
    blocking_heavy_role: blockingHeavyRole,
    base_expected_routes: baseExpectedRoutes,
    base_expected_targets: baseExpectedTargets,
  };
}

export function computeComponents(
  input: TEMVPInput,
  canonical: TECanonicalValues,
  shrunk: TEShrunkValues,
  trends: TETrendValues,
  derived: TEDerivedValues,
  reference: ResolvedReference
): TEComponentScores {
  const p = (name: TEReferenceDistributionName, x: number): number =>
    percentileOf(reference, name, x);

  // Route Role — RR (26.8.2)
  let RR = clamp(
    0.5 * p("route_participation", canonical.rp4) +
      0.2 * p("route_participation", canonical.rp8) +
      0.15 * trends.route_trend_score +
      0.1 * trends.route_consistency_score +
      0.05 * p("snap_share", canonical.snap4),
    0,
    100
  );
  // Binding blocking-role gate: the complete Version 1 blocking gate.
  if (derived.blocking_heavy_role) {
    RR = Math.min(RR, 65);
  }

  // Target Earning — TE (26.8.3)
  let TE = clamp(
    0.65 * p("targets_per_route_run", shrunk.shrunk_tprr) +
      0.2 * p("target_share", canonical.target_share) +
      0.15 * trends.tprr_trend_score,
    0,
    100
  );
  // Low-route ceiling on established target dominance only.
  if (canonical.rp4 < 0.45) {
    TE = Math.min(TE, 82);
  }

  // Target Quality — TQ (26.8.4)
  const depthQualityScore = clamp(
    100 - 5 * Math.abs(canonical.average_depth_of_target - 8.0),
    0,
    100
  );
  const tqRaw =
    0.25 * depthQualityScore +
    0.25 * p("catchable_target_rate", canonical.catchable_target_rate) +
    0.25 * p("red_zone_target_rate", shrunk.shrunk_red_zone_target_rate) +
    0.25 * p("end_zone_target_rate", shrunk.shrunk_end_zone_target_rate);
  let TQ: number;
  if (derived.base_expected_targets < 2.0) {
    TQ = Math.min(tqRaw, 72);
  } else {
    TQ = tqRaw;
  }
  TQ = clamp(TQ, 0, 100);

  // Receiving Efficiency — RE (26.8.5)
  const reRaw =
    0.35 * p("catch_rate", shrunk.shrunk_catch_rate) +
    0.35 * p("yards_per_target", shrunk.shrunk_yards_per_target) +
    0.2 * p("yards_per_reception", shrunk.shrunk_yards_per_reception) +
    0.1 * p("yac_per_reception", shrunk.shrunk_yac_per_reception);
  let RE: number;
  if (input.career_targets < 40) {
    RE = clamp(reRaw, 25, 75);
  } else if (input.career_targets < 100) {
    RE = clamp(reRaw, 15, 85);
  } else {
    RE = clamp(reRaw, 0, 100);
  }

  // Team Context — TC (26.8.6)
  const TC = clamp(
    0.35 * p("projected_team_dropbacks", canonical.projected_team_dropbacks) +
      0.2 * p("team_points_per_drive", canonical.team_points_per_drive) +
      0.2 * p("team_red_zone_trips_per_game", canonical.team_red_zone_trips_per_game) +
      0.15 * canonical.qb_environment_score +
      0.1 * (100 - 100 * canonical.competition_pressure),
    0,
    100
  );

  // Role Durability — RD (26.8.7)
  const roleChangeAdjustment =
    input.role_change === "PROMOTED" ? 12 : input.role_change === "DEMOTED" ? -12 : 0;
  const depthChartAdjustment =
    input.depth_chart_role === "TE1"
      ? 10
      : input.depth_chart_role === "TE2"
        ? 2
        : input.depth_chart_role === "TE3_OR_DEPTH"
          ? -10
          : 0;
  const coachingAdjustment =
    input.coaching_continuity === "CONTINUITY"
      ? 5
      : input.coaching_continuity === "CHANGE"
        ? -5
        : 0;
  const ageSecurityAdjustment =
    input.age <= 25 ? 5 : input.age <= 29 ? 0 : input.age <= 31 ? -5 : -10;
  const receivingRoleAdjustment =
    canonical.rp4 >= 0.7 && shrunk.shrunk_tprr >= 0.18
      ? 6
      : derived.blocking_heavy_role && shrunk.shrunk_tprr < 0.16
        ? -8
        : 0;

  const RD = clamp(
    45 +
      20 * canonical.contract_security -
      22 * canonical.competition_pressure +
      roleChangeAdjustment +
      depthChartAdjustment +
      coachingAdjustment +
      ageSecurityAdjustment +
      receivingRoleAdjustment -
      (input.teammate_return_flag ? 8 : 0) -
      (input.another_receiving_te_flag ? 8 : 0) -
      (input.temporary_opportunity_flag ? 10 : 0) -
      (input.new_team_flag ? 6 : 0),
    0,
    100
  );

  // Age & Development — AD (26.8.8)
  const ageBase = AD_AGE_BASE[input.age] ?? AD_LATE_CAREER_BASE;
  const developmentAdjustment =
    input.nfl_seasons_completed === 1 || input.nfl_seasons_completed === 2
      ? 6
      : input.nfl_seasons_completed === 3
        ? 3
        : 0;
  const prospectAdjustment =
    input.prospect_type === "RECEIVING" && input.career_routes < 300
      ? 3
      : input.prospect_type === "BLOCKING_FIRST" && input.career_routes < 300
        ? -3
        : 0;
  const AD = clamp(ageBase + developmentAdjustment + prospectAdjustment, 0, 100);

  // Availability — AV (26.8.9)
  const AV = availabilityScore(input);

  return { RR, TE, TQ, RE, TC, RD, AD, AV };
}

export function availabilityScore(input: TEMVPInput): number {
  const status = input.injury_status;
  if (INACTIVE_LIST_STATUSES.includes(status)) return AV_INACTIVE_LIST;
  switch (status) {
    case "HEALTHY":
      return AV_HEALTHY;
    case "QUESTIONABLE":
      switch (input.practice_status) {
        case "FULL":
          return AV_QUESTIONABLE_FULL;
        case "LIMITED":
          return AV_QUESTIONABLE_LIMITED;
        default:
          return AV_QUESTIONABLE_DNP_UNKNOWN;
      }
    case "DOUBTFUL":
      return AV_DOUBTFUL;
    default:
      return AV_UNKNOWN;
  }
}
