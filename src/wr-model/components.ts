// §26.8 component construction. Eight bounded [0,100] scores. Every formula is
// printed in §26.8 and reproduced here exactly; sub-weights come from constants.

import {
  AD_AGE_BANDS,
  AD_YEAR2_3_BONUS,
  AV_VALUES,
  EF_LOW_SAMPLE_CLAMP,
  EF_LOW_SAMPLE_ROUTES,
  EF_WEIGHTS,
  RD_AGE_SECURITY,
  RD_BASE,
  RD_COMPETITION_COEF,
  RD_CONTRACT_COEF,
  RD_ROLE_CHANGE,
  RR_WEIGHTS,
  TC_WEIGHTS,
  TE_WEIGHTS,
  TQ_CAP,
  TQ_GATE,
} from '@/wr-model/constants';
import { clamp } from '@/wr-model/math';
import { pct, type PercentileContext } from '@/wr-model/percentiles';
import type {
  ComponentScores,
  InjuryStatus,
  PracticeStatus,
  RouteRoleChange,
  WRMVPInput,
} from '@/wr-model/types';
import type { ResolvedInputs } from '@/wr-model/fallbacks';

// ---- Route Role (RR) ----
export function routeRole(
  rp4: number,
  rp8: number,
  routeTrendScore: number,
  ctx: PercentileContext,
): number {
  return clamp(
    RR_WEIGHTS.rp4 * pct(rp4, 'route_participation', ctx) +
      RR_WEIGHTS.rp8 * pct(rp8, 'route_participation', ctx) +
      RR_WEIGHTS.trend * routeTrendScore,
    0,
    100,
  );
}

// ---- Target Earning (TE) ----
export function targetEarning(
  shrunkTPRR: number,
  targetShare: number,
  tprrTrendScore: number,
  ctx: PercentileContext,
): number {
  return clamp(
    TE_WEIGHTS.tprr * pct(shrunkTPRR, 'targets_per_route_run', ctx) +
      TE_WEIGHTS.target_share * pct(targetShare, 'target_share', ctx) +
      TE_WEIGHTS.trend * tprrTrendScore,
    0,
    100,
  );
}

// ---- Target Quality (TQ), with the deep-target reliability cap ----
export function targetQuality(
  xfpPerTarget: number,
  adot: number,
  shrunkTPRR: number,
  croe: number,
  ctx: PercentileContext,
): number {
  const raw = pct(xfpPerTarget, 'expected_fantasy_points_per_target', ctx);
  const gateTriggered = adot >= TQ_GATE.aDOT && shrunkTPRR < TQ_GATE.shrunkTPRR && croe < TQ_GATE.croe;
  return gateTriggered ? Math.min(raw, TQ_CAP) : raw;
}

// ---- Efficiency (EF) ----
export function efficiency(
  shrunkCROE: number,
  shrunkDepthAdjYpt: number,
  careerRoutes: number,
  ctx: PercentileContext,
): number {
  const raw =
    EF_WEIGHTS.croe * pct(shrunkCROE, 'catch_rate_over_expected', ctx) +
    EF_WEIGHTS.dypt * pct(shrunkDepthAdjYpt, 'depth_adjusted_yards_per_target', ctx);
  const [lo, hi] = careerRoutes < EF_LOW_SAMPLE_ROUTES ? EF_LOW_SAMPLE_CLAMP : [0, 100];
  return clamp(raw, lo, hi);
}

// ---- Team Context (TC) ----  (qb_environment_score is already 0–100, not percentiled)
export function teamContext(
  teamDropbacks: number,
  qbEnvironment: number,
  pointsPerDrive: number,
  ctx: PercentileContext,
): number {
  return clamp(
    TC_WEIGHTS.dropbacks * pct(teamDropbacks, 'projected_team_dropbacks', ctx) +
      TC_WEIGHTS.qbenv * qbEnvironment +
      TC_WEIGHTS.ppd * pct(pointsPerDrive, 'team_points_per_drive', ctx),
    0,
    100,
  );
}

// ---- Role Durability (RD) ----
function ageSecurityAdjustment(age: number): number {
  if (age <= 25) return RD_AGE_SECURITY.young;
  if (age <= 28) return RD_AGE_SECURITY.prime;
  if (age <= 30) return RD_AGE_SECURITY.older;
  return RD_AGE_SECURITY.oldest;
}

export function roleDurability(
  contractSecurity: number,
  competitionPressure: number,
  routeRoleChange: RouteRoleChange,
  age: number,
): number {
  return clamp(
    RD_BASE +
      RD_CONTRACT_COEF * contractSecurity -
      RD_COMPETITION_COEF * competitionPressure +
      RD_ROLE_CHANGE[routeRoleChange] +
      ageSecurityAdjustment(age),
    0,
    100,
  );
}

// ---- Age & Development (AD) ----
export function ageDevelopment(age: number, nflSeasonsCompleted: number): number {
  const band = AD_AGE_BANDS.find((b) => age >= b.minAge && age <= b.maxAge);
  const base = band ? band.base : AD_AGE_BANDS[AD_AGE_BANDS.length - 1].base;
  const bonus = nflSeasonsCompleted === 1 || nflSeasonsCompleted === 2 ? AD_YEAR2_3_BONUS : 0;
  return clamp(base + bonus, 0, 100);
}

// ---- Availability (AV) ----  injury_status is primary; practice refines QUESTIONABLE only
export function availability(injury: InjuryStatus, practice: PracticeStatus): number {
  switch (injury) {
    case 'HEALTHY':
      return AV_VALUES.HEALTHY;
    case 'QUESTIONABLE':
      if (practice === 'FULL') return AV_VALUES.QUESTIONABLE_FULL;
      if (practice === 'LIMITED') return AV_VALUES.QUESTIONABLE_LIMITED;
      return AV_VALUES.QUESTIONABLE_DNP_UNKNOWN; // DNP or UNKNOWN
    case 'DOUBTFUL':
      return AV_VALUES.DOUBTFUL;
    case 'OUT':
    case 'IR':
    case 'PUP':
    case 'SUSPENDED':
      return AV_VALUES.UNAVAILABLE;
    case 'UNKNOWN':
      return AV_VALUES.UNKNOWN;
  }
}

// Assemble all eight, given the resolved + shrunk intermediate values.
export interface ComponentInputs {
  resolved: ResolvedInputs;
  shrunkTPRR: number;
  shrunkCROE: number;
  shrunkDepthAdjYpt: number;
  routeTrendScore: number;
  tprrTrendScore: number;
  input: WRMVPInput;
}

export function computeComponents(ci: ComponentInputs, ctx: PercentileContext): ComponentScores {
  const { resolved: r, input } = ci;
  return {
    RR: routeRole(r.rp4, r.rp8, ci.routeTrendScore, ctx),
    TE: targetEarning(ci.shrunkTPRR, r.targetShare, ci.tprrTrendScore, ctx),
    TQ: targetQuality(r.xfpPerTarget, r.adot, ci.shrunkTPRR, r.croe, ctx),
    EF: efficiency(ci.shrunkCROE, ci.shrunkDepthAdjYpt, input.career_routes, ctx),
    TC: teamContext(r.teamDropbacks, r.qbEnvironment, r.pointsPerDrive, ctx),
    RD: roleDurability(r.contractSecurity, r.competitionPressure, input.route_role_change, input.age),
    AD: ageDevelopment(input.age, input.nfl_seasons_completed),
    AV: availability(input.injury_status, input.practice_status),
  };
}
