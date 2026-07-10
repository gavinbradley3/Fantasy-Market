// §26.5 fallback resolution. Produces the resolved value set consumed by every
// downstream formula, plus the fallback log and the confidence-penalty tally.
// Fallbacks are applied in the exact table order; each is logged once and each
// penalty is applied once (Decision 4 handles the mutual RP4/RP8 case). Missing
// numbers never silently become zero — every one takes a documented fallback.

import {
  DRAFT_ROUND_SECURITY,
  FALLBACK_FINAL,
  FALLBACK_PENALTY,
  TARGET_SHARE_DERIVED_CAP,
} from '@/wr-model/constants';
import { isFiniteNumber } from '@/wr-model/math';
import { referenceMedian } from '@/wr-model/percentiles';
import type { DraftRound, FallbackLogEntry, WRMVPInput, WRReferenceDistributions } from '@/wr-model/types';

export interface ResolvedInputs {
  rp4: number;
  rp8: number;
  tprr: number; // pre-shrinkage resolved TPRR
  targetShare: number;
  xfpPerTarget: number;
  croe: number; // pre-shrinkage resolved CROE
  depthAdjYpt: number; // pre-shrinkage resolved depth-adjusted Y/T
  adot: number;
  xtdPerTarget: number;
  teamDropbacks: number;
  qbEnvironment: number;
  pointsPerDrive: number;
  contractSecurity: number;
  competitionPressure: number;
}

export interface FallbackResult {
  resolved: ResolvedInputs;
  log: FallbackLogEntry[];
  penalty: number;
}

function draftRoundSecurity(round: DraftRound): number {
  if (round === null) return DRAFT_ROUND_SECURITY.UDFA;
  return DRAFT_ROUND_SECURITY[round];
}

export function resolveFallbacks(
  input: WRMVPInput,
  reference: WRReferenceDistributions,
): FallbackResult {
  const log: FallbackLogEntry[] = [];
  let penalty = 0;
  const record = (field: string, fallbackUsed: string, p: number) => {
    log.push({ field, fallback_used: fallbackUsed, confidence_penalty: p });
    penalty += p;
  };
  const has = (v: number | null | undefined): v is number => isFiniteNumber(v);

  // RP4 / RP8 — resolved independently against the ORIGINAL inputs (Decision 4).
  let rp4: number;
  if (has(input.route_participation_last4)) {
    rp4 = input.route_participation_last4;
  } else if (has(input.route_participation_last8)) {
    rp4 = input.route_participation_last8;
    record('RP4', 'route_participation_last8', FALLBACK_PENALTY.RP4);
  } else {
    rp4 = FALLBACK_FINAL.RP;
    record('RP4', String(FALLBACK_FINAL.RP), FALLBACK_PENALTY.RP4);
  }

  let rp8: number;
  if (has(input.route_participation_last8)) {
    rp8 = input.route_participation_last8;
  } else if (has(input.route_participation_last4)) {
    rp8 = input.route_participation_last4;
    record('RP8', 'route_participation_last4', FALLBACK_PENALTY.RP8);
  } else {
    rp8 = FALLBACK_FINAL.RP;
    record('RP8', String(FALLBACK_FINAL.RP), FALLBACK_PENALTY.RP8);
  }

  // TPRR — current → career TPRR → 0.18.
  let tprr: number;
  if (has(input.targets_per_route_run)) {
    tprr = input.targets_per_route_run;
  } else if (has(input.career_targets_per_route_run)) {
    tprr = input.career_targets_per_route_run;
    record('TPRR', 'career_targets_per_route_run', FALLBACK_PENALTY.TPRR);
  } else {
    tprr = FALLBACK_FINAL.TPRR;
    record('TPRR', String(FALLBACK_FINAL.TPRR), FALLBACK_PENALTY.TPRR);
  }

  // Target share — current → RP4×TPRR (cap 0.35) → 0.12. Uses the resolved RP4/TPRR.
  let targetShare: number;
  if (has(input.target_share)) {
    targetShare = input.target_share;
  } else {
    const derived = Math.min(rp4 * tprr, TARGET_SHARE_DERIVED_CAP);
    targetShare = derived;
    record('Target share', `RP4×TPRR capped ${TARGET_SHARE_DERIVED_CAP}`, FALLBACK_PENALTY.target_share);
  }

  // xFP/target — current → career → reference median.
  let xfpPerTarget: number;
  if (has(input.expected_fantasy_points_per_target)) {
    xfpPerTarget = input.expected_fantasy_points_per_target;
  } else if (has(input.career_expected_fantasy_points_per_target)) {
    xfpPerTarget = input.career_expected_fantasy_points_per_target;
    record('xFP/target', 'career_expected_fantasy_points_per_target', FALLBACK_PENALTY.xFP_per_target);
  } else {
    xfpPerTarget = referenceMedian('expected_fantasy_points_per_target', reference);
    record('xFP/target', 'reference median', FALLBACK_PENALTY.xFP_per_target);
  }

  // CROE — current → 0.00.
  let croe: number;
  if (has(input.catch_rate_over_expected)) {
    croe = input.catch_rate_over_expected;
  } else {
    croe = FALLBACK_FINAL.CROE;
    record('CROE', String(FALLBACK_FINAL.CROE), FALLBACK_PENALTY.CROE);
  }

  // Depth-adjusted Y/T — current → reference median.
  let depthAdjYpt: number;
  if (has(input.depth_adjusted_yards_per_target)) {
    depthAdjYpt = input.depth_adjusted_yards_per_target;
  } else {
    depthAdjYpt = referenceMedian('depth_adjusted_yards_per_target', reference);
    record('Depth-adjusted Y/T', 'reference median', FALLBACK_PENALTY.depth_adjusted_yards_per_target);
  }

  // aDOT — current → 10.0.
  let adot: number;
  if (has(input.average_depth_of_target)) {
    adot = input.average_depth_of_target;
  } else {
    adot = FALLBACK_FINAL.aDOT;
    record('aDOT', String(FALLBACK_FINAL.aDOT), FALLBACK_PENALTY.aDOT);
  }

  // xTD/target — current → 0.05.
  let xtdPerTarget: number;
  if (has(input.expected_td_rate_per_target)) {
    xtdPerTarget = input.expected_td_rate_per_target;
  } else {
    xtdPerTarget = FALLBACK_FINAL.xTD_per_target;
    record('xTD/target', String(FALLBACK_FINAL.xTD_per_target), FALLBACK_PENALTY.xTD_per_target);
  }

  // Team dropbacks — projection → reference median → 34.0.
  let teamDropbacks: number;
  if (has(input.projected_team_dropbacks)) {
    teamDropbacks = input.projected_team_dropbacks;
  } else {
    const med = referenceMedian('projected_team_dropbacks', reference);
    if (isFiniteNumber(med)) {
      teamDropbacks = med;
      record('Team dropbacks', 'reference median', FALLBACK_PENALTY.team_dropbacks);
    } else {
      teamDropbacks = FALLBACK_FINAL.team_dropbacks;
      record('Team dropbacks', String(FALLBACK_FINAL.team_dropbacks), FALLBACK_PENALTY.team_dropbacks);
    }
  }

  // QB environment — current → neutral 50.
  let qbEnvironment: number;
  if (has(input.qb_environment_score)) {
    qbEnvironment = input.qb_environment_score;
  } else {
    qbEnvironment = FALLBACK_FINAL.qb_environment;
    record('QB environment', String(FALLBACK_FINAL.qb_environment), FALLBACK_PENALTY.qb_environment);
  }

  // Points/drive — current → reference median → 1.90.
  let pointsPerDrive: number;
  if (has(input.team_points_per_drive)) {
    pointsPerDrive = input.team_points_per_drive;
  } else {
    const med = referenceMedian('team_points_per_drive', reference);
    if (isFiniteNumber(med)) {
      pointsPerDrive = med;
      record('Points/drive', 'reference median', FALLBACK_PENALTY.points_per_drive);
    } else {
      pointsPerDrive = FALLBACK_FINAL.points_per_drive;
      record('Points/drive', String(FALLBACK_FINAL.points_per_drive), FALLBACK_PENALTY.points_per_drive);
    }
  }

  // Contract security — current → draft-round mapping → 0.40.
  let contractSecurity: number;
  if (has(input.contract_security)) {
    contractSecurity = input.contract_security;
  } else {
    contractSecurity = draftRoundSecurity(input.draft_round);
    record('Contract security', `draft-round mapping (${input.draft_round ?? 'UDFA'})`, FALLBACK_PENALTY.contract_security);
  }

  // Competition pressure — current → neutral 0.50.
  let competitionPressure: number;
  if (has(input.competition_pressure)) {
    competitionPressure = input.competition_pressure;
  } else {
    competitionPressure = FALLBACK_FINAL.competition_pressure;
    record('Competition pressure', String(FALLBACK_FINAL.competition_pressure), FALLBACK_PENALTY.competition_pressure);
  }

  return {
    resolved: {
      rp4,
      rp8,
      tprr,
      targetShare,
      xfpPerTarget,
      croe,
      depthAdjYpt,
      adot,
      xtdPerTarget,
      teamDropbacks,
      qbEnvironment,
      pointsPerDrive,
      contractSecurity,
      competitionPressure,
    },
    log,
    penalty,
  };
}
