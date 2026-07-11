/**
 * Canonical fallback resolution (Sections 26.5.1–26.5.8) in the binding dependency
 * order of Section 26.5.3:
 *
 *   priors → RP4/RP8 (from originals) → Snap4 → TPRR → shrunk_TPRR → target share →
 *   QB environment → catchable rate → all remaining canonical fields.
 *
 * Every canonical field logs at most once and is penalized once; mutual fallbacks use
 * original submitted values; no missing value becomes a silent zero.
 */

import {
  ADOT_FIXED_FALLBACK,
  CATCHABLE_RATE_FIXED_FALLBACK,
  CATCH_RATE_FIXED_FALLBACK,
  COMPETITION_PRESSURE_FIXED_FALLBACK,
  CONTRACT_SECURITY_FIXED_FALLBACK,
  DROPBACKS_FIXED_FALLBACK,
  END_ZONE_RATE_FIXED_FALLBACK,
  FALLBACK_FIELD_ORDER,
  FALLBACK_PENALTIES,
  INACTIVE_LIST_STATUSES,
  POINTS_PER_DRIVE_FIXED_FALLBACK,
  QB_CATCHABLE_BASE,
  QB_CATCHABLE_MAX,
  QB_CATCHABLE_MIN,
  QB_CATCHABLE_SLOPE,
  QB_ENVIRONMENT_FIXED_FALLBACK,
  RAMP_DOUBTFUL,
  RAMP_HEALTHY,
  RAMP_INACTIVE_LIST,
  RAMP_QUESTIONABLE_DNP_UNKNOWN,
  RAMP_QUESTIONABLE_FULL,
  RAMP_QUESTIONABLE_LIMITED,
  RAMP_UNKNOWN_STATUS,
  RED_ZONE_RATE_FIXED_FALLBACK,
  RED_ZONE_TRIPS_FIXED_FALLBACK,
  ROUTE_PARTICIPATION_FIXED_FALLBACK,
  SNAP_FROM_ROUTE_DIVISOR,
  SNAP_ROUTE_PROXY_CAP,
  SNAP_ROUTE_PROXY_FACTOR,
  SNAP_SHARE_FIXED_FALLBACK,
  TARGET_SHARE_FIXED_FALLBACK,
  TARGET_SHARE_PROXY_CAP,
  TARGET_SHARE_PROXY_FACTOR,
  YAC_FIXED_FALLBACK,
  YPR_FIXED_FALLBACK,
  YPT_FIXED_FALLBACK,
  type TEFallbackField,
} from "./constants.js";
import { clamp } from "./percentiles.js";
import type { TEPriors } from "./priors.js";
import type { ResolvedReference } from "./references.js";
import { referenceMedian } from "./references.js";
import { shrunkTprr } from "./shrinkage.js";
import type { TECanonicalValues, TEFallbackLogEntry, TEMVPInput } from "./types.js";

export interface FallbackResolution {
  canonical: TECanonicalValues;
  shrunk_tprr: number;
  /** Entries in binding canonical-table order (Section 26.5.8). */
  entries: TEFallbackLogEntry[];
}

export function resolveCanonicalValues(
  input: TEMVPInput,
  priors: TEPriors,
  reference: ResolvedReference
): FallbackResolution {
  const logged = new Map<TEFallbackField, string>();
  const log = (field: TEFallbackField, fallbackUsed: string): void => {
    // Each canonical field appears at most once in fallback_log (Section 26.5.1).
    if (!logged.has(field)) {
      logged.set(field, fallbackUsed);
    }
  };

  // Original nullable values, preserved for mutual fallback resolution (26.5.2.1).
  const originalRp4 = input.route_participation_last4;
  const originalRp8 = input.route_participation_last8;
  const originalSnap4 = input.snap_share_last4;

  const snapProxy =
    originalSnap4 !== null
      ? clamp(originalSnap4 * SNAP_ROUTE_PROXY_FACTOR, 0, SNAP_ROUTE_PROXY_CAP)
      : null;

  // Canonical RP4 (26.5.2.1 / 26.5.2.2)
  let rp4: number;
  if (originalRp4 !== null) {
    rp4 = originalRp4;
  } else if (originalRp8 !== null) {
    rp4 = originalRp8;
    log("RP4", "RP8_CROSS_WINDOW");
  } else if (snapProxy !== null) {
    rp4 = snapProxy;
    log("RP4", "SNAP_SHARE_PROXY");
  } else {
    rp4 = ROUTE_PARTICIPATION_FIXED_FALLBACK;
    log("RP4", "FIXED_0.50");
  }

  // Canonical RP8
  let rp8: number;
  if (originalRp8 !== null) {
    rp8 = originalRp8;
  } else if (originalRp4 !== null) {
    rp8 = originalRp4;
    log("RP8", "RP4_CROSS_WINDOW");
  } else if (snapProxy !== null) {
    rp8 = snapProxy;
    log("RP8", "SNAP_SHARE_PROXY");
  } else {
    rp8 = ROUTE_PARTICIPATION_FIXED_FALLBACK;
    log("RP8", "FIXED_0.50");
  }

  // Canonical Snap4 from canonical route-participation values (26.5.2 / 26.5.3 step 4).
  let snap4: number;
  if (originalSnap4 !== null) {
    snap4 = originalSnap4;
  } else {
    // The route-participation proxy is always computable because canonical RP4/RP8
    // always exist; FIXED_0.65 remains a defensive branch (see decisions log).
    const fromRoutes = clamp(Math.max(rp4, rp8) / SNAP_FROM_ROUTE_DIVISOR, 0, 1);
    if (Number.isFinite(fromRoutes)) {
      snap4 = fromRoutes;
      log("SNAP4", "ROUTE_PARTICIPATION_PROXY");
    } else {
      snap4 = SNAP_SHARE_FIXED_FALLBACK;
      log("SNAP4", "FIXED_0.65");
    }
  }

  // Canonical TPRR (26.5.2): current → non-overlapping career TPRR → draft/prospect prior.
  let tprr: number;
  if (input.targets_per_route_run !== null) {
    tprr = input.targets_per_route_run;
  } else if (input.career_targets_per_route_run !== null) {
    tprr = input.career_targets_per_route_run;
    log("TPRR", "CAREER_TPRR");
  } else {
    tprr = priors.draft_prospect_tprr_prior;
    log("TPRR", "DRAFT_PROSPECT_PRIOR");
  }

  // shrunk_TPRR (26.5.3 step 6) — required by the target-share fallback.
  const shrunkTprrValue = shrunkTprr(tprr, input.career_routes, priors.draft_prospect_tprr_prior);

  // Canonical target share (26.5.3 step 7): must use shrunk_TPRR, never unshrunk TPRR.
  let targetShare: number;
  if (input.target_share !== null) {
    targetShare = input.target_share;
  } else {
    const derived = rp4 * shrunkTprrValue * TARGET_SHARE_PROXY_FACTOR;
    if (Number.isFinite(derived)) {
      targetShare = Math.min(derived, TARGET_SHARE_PROXY_CAP);
      log("TARGET_SHARE", "RP4_SHRUNK_TPRR_PROXY");
    } else {
      targetShare = TARGET_SHARE_FIXED_FALLBACK;
      log("TARGET_SHARE", "FIXED_0.12");
    }
  }

  // Canonical QB environment (26.5.3 step 8).
  let qbEnvironmentScore: number;
  if (input.qb_environment_score !== null) {
    qbEnvironmentScore = input.qb_environment_score;
  } else {
    qbEnvironmentScore = QB_ENVIRONMENT_FIXED_FALLBACK;
    log("QB_ENVIRONMENT_SCORE", "FIXED_50");
  }

  // Canonical catchable-target rate (26.5.3 step 9 / 26.5.4): QB mapping uses the
  // canonical QB environment score after its own fallback.
  let catchableTargetRate: number;
  if (input.catchable_target_rate !== null) {
    catchableTargetRate = input.catchable_target_rate;
  } else {
    const mapped = clamp(
      QB_CATCHABLE_BASE + QB_CATCHABLE_SLOPE * qbEnvironmentScore,
      QB_CATCHABLE_MIN,
      QB_CATCHABLE_MAX
    );
    if (Number.isFinite(mapped)) {
      catchableTargetRate = mapped;
      log("CATCHABLE_TARGET_RATE", "QB_ENVIRONMENT_PROXY");
    } else {
      catchableTargetRate = CATCHABLE_RATE_FIXED_FALLBACK;
      log("CATCHABLE_TARGET_RATE", "FIXED_0.76");
    }
  }

  // Remaining canonical fields (26.5.3 step 10), in fallback-table order.

  let adot: number;
  if (input.average_depth_of_target !== null) {
    adot = input.average_depth_of_target;
  } else {
    adot = ADOT_FIXED_FALLBACK;
    log("AVERAGE_DEPTH_OF_TARGET", "FIXED_7.50");
  }

  let redZoneTargetRate: number;
  if (input.red_zone_target_rate !== null) {
    redZoneTargetRate = input.red_zone_target_rate;
  } else if (input.career_red_zone_target_rate !== null) {
    redZoneTargetRate = input.career_red_zone_target_rate;
    log("RED_ZONE_TARGET_RATE", "CAREER_RED_ZONE_TARGET_RATE");
  } else {
    redZoneTargetRate = RED_ZONE_RATE_FIXED_FALLBACK;
    log("RED_ZONE_TARGET_RATE", "FIXED_0.18");
  }

  let endZoneTargetRate: number;
  if (input.end_zone_target_rate !== null) {
    endZoneTargetRate = input.end_zone_target_rate;
  } else if (input.career_end_zone_target_rate !== null) {
    endZoneTargetRate = input.career_end_zone_target_rate;
    log("END_ZONE_TARGET_RATE", "CAREER_END_ZONE_TARGET_RATE");
  } else {
    endZoneTargetRate = END_ZONE_RATE_FIXED_FALLBACK;
    log("END_ZONE_TARGET_RATE", "FIXED_0.08");
  }

  let catchRate: number;
  if (input.catch_rate !== null) {
    catchRate = input.catch_rate;
  } else if (input.career_catch_rate !== null) {
    catchRate = input.career_catch_rate;
    log("CATCH_RATE", "CAREER_CATCH_RATE");
  } else {
    catchRate = CATCH_RATE_FIXED_FALLBACK;
    log("CATCH_RATE", "FIXED_0.68");
  }

  let yardsPerTarget: number;
  if (input.yards_per_target !== null) {
    yardsPerTarget = input.yards_per_target;
  } else if (input.career_yards_per_target !== null) {
    yardsPerTarget = input.career_yards_per_target;
    log("YARDS_PER_TARGET", "CAREER_YARDS_PER_TARGET");
  } else {
    yardsPerTarget = YPT_FIXED_FALLBACK;
    log("YARDS_PER_TARGET", "FIXED_7.20");
  }

  let yardsPerReception: number;
  if (input.yards_per_reception !== null) {
    yardsPerReception = input.yards_per_reception;
  } else if (input.career_yards_per_reception !== null) {
    yardsPerReception = input.career_yards_per_reception;
    log("YARDS_PER_RECEPTION", "CAREER_YARDS_PER_RECEPTION");
  } else {
    yardsPerReception = YPR_FIXED_FALLBACK;
    log("YARDS_PER_RECEPTION", "FIXED_10.60");
  }

  let yacPerReception: number;
  if (input.yac_per_reception !== null) {
    yacPerReception = input.yac_per_reception;
  } else if (input.career_yac_per_reception !== null) {
    yacPerReception = input.career_yac_per_reception;
    log("YAC_PER_RECEPTION", "CAREER_YAC_PER_RECEPTION");
  } else {
    yacPerReception = YAC_FIXED_FALLBACK;
    log("YAC_PER_RECEPTION", "FIXED_4.60");
  }

  let projectedTeamDropbacks: number;
  if (input.projected_team_dropbacks !== null) {
    projectedTeamDropbacks = input.projected_team_dropbacks;
  } else {
    const median = referenceMedian(reference.distributions.projected_team_dropbacks);
    if (median !== null) {
      projectedTeamDropbacks = median;
      log("PROJECTED_TEAM_DROPBACKS", "REFERENCE_MEDIAN");
    } else {
      projectedTeamDropbacks = DROPBACKS_FIXED_FALLBACK;
      log("PROJECTED_TEAM_DROPBACKS", "FIXED_34.00");
    }
  }

  let teamPointsPerDrive: number;
  if (input.team_points_per_drive !== null) {
    teamPointsPerDrive = input.team_points_per_drive;
  } else {
    const median = referenceMedian(reference.distributions.team_points_per_drive);
    if (median !== null) {
      teamPointsPerDrive = median;
      log("TEAM_POINTS_PER_DRIVE", "REFERENCE_MEDIAN");
    } else {
      teamPointsPerDrive = POINTS_PER_DRIVE_FIXED_FALLBACK;
      log("TEAM_POINTS_PER_DRIVE", "FIXED_1.90");
    }
  }

  let teamRedZoneTripsPerGame: number;
  if (input.team_red_zone_trips_per_game !== null) {
    teamRedZoneTripsPerGame = input.team_red_zone_trips_per_game;
  } else {
    const median = referenceMedian(reference.distributions.team_red_zone_trips_per_game);
    if (median !== null) {
      teamRedZoneTripsPerGame = median;
      log("TEAM_RED_ZONE_TRIPS_PER_GAME", "REFERENCE_MEDIAN");
    } else {
      teamRedZoneTripsPerGame = RED_ZONE_TRIPS_FIXED_FALLBACK;
      log("TEAM_RED_ZONE_TRIPS_PER_GAME", "FIXED_3.20");
    }
  }

  let competitionPressure: number;
  if (input.competition_pressure !== null) {
    competitionPressure = input.competition_pressure;
  } else {
    competitionPressure = COMPETITION_PRESSURE_FIXED_FALLBACK;
    log("COMPETITION_PRESSURE", "FIXED_0.50");
  }

  let contractSecurity: number;
  if (input.contract_security !== null) {
    contractSecurity = input.contract_security;
  } else {
    // Draft-round mapping handles undrafted/unknown (0.20); the fixed 0.35 final
    // fallback is therefore unreachable (see decisions log).
    const mapped = priors.contract_security_mapping;
    if (Number.isFinite(mapped)) {
      contractSecurity = mapped;
      log("CONTRACT_SECURITY", "DRAFT_ROUND_MAPPING");
    } else {
      contractSecurity = CONTRACT_SECURITY_FIXED_FALLBACK;
      log("CONTRACT_SECURITY", "DRAFT_ROUND_MAPPING");
    }
  }

  // Workload ramp (26.5.5): supplied → clamp without penalty; missing → status lookup.
  let workloadRampFactor: number;
  if (input.workload_ramp_factor !== null) {
    workloadRampFactor = clamp(input.workload_ramp_factor, 0, 1);
  } else {
    workloadRampFactor = workloadRampLookup(input);
    log("WORKLOAD_RAMP_FACTOR", "STATUS_PRACTICE_MAPPING");
  }

  const canonical: TECanonicalValues = {
    rp4,
    rp8,
    snap4,
    tprr,
    target_share: targetShare,
    average_depth_of_target: adot,
    red_zone_target_rate: redZoneTargetRate,
    end_zone_target_rate: endZoneTargetRate,
    catchable_target_rate: catchableTargetRate,
    catch_rate: catchRate,
    yards_per_target: yardsPerTarget,
    yards_per_reception: yardsPerReception,
    yac_per_reception: yacPerReception,
    projected_team_dropbacks: projectedTeamDropbacks,
    team_points_per_drive: teamPointsPerDrive,
    team_red_zone_trips_per_game: teamRedZoneTripsPerGame,
    qb_environment_score: qbEnvironmentScore,
    competition_pressure: competitionPressure,
    contract_security: contractSecurity,
    workload_ramp_factor: workloadRampFactor,
  };

  // Serialize entries in binding canonical-table order (Section 26.5.8).
  const entries: TEFallbackLogEntry[] = [];
  for (const field of FALLBACK_FIELD_ORDER) {
    const fallbackUsed = logged.get(field);
    if (fallbackUsed !== undefined) {
      entries.push({
        field,
        fallback_used: fallbackUsed,
        confidence_penalty: FALLBACK_PENALTIES[field],
      });
    }
  }

  return { canonical, shrunk_tprr: shrunkTprrValue, entries };
}

/** Status/practice workload-ramp lookup (Section 26.5.5). */
export function workloadRampLookup(input: TEMVPInput): number {
  const status = input.injury_status;
  if (INACTIVE_LIST_STATUSES.includes(status)) return RAMP_INACTIVE_LIST;
  switch (status) {
    case "HEALTHY":
      return RAMP_HEALTHY;
    case "QUESTIONABLE":
      switch (input.practice_status) {
        case "FULL":
          return RAMP_QUESTIONABLE_FULL;
        case "LIMITED":
          return RAMP_QUESTIONABLE_LIMITED;
        default:
          return RAMP_QUESTIONABLE_DNP_UNKNOWN;
      }
    case "DOUBTFUL":
      return RAMP_DOUBTFUL;
    default:
      return RAMP_UNKNOWN_STATUS;
  }
}
