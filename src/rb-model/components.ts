// §26.8 component construction. Eight bounded [0,100] scores. Every formula is
// printed in §26.8 and reproduced here exactly; sub-weights come from constants.

import {
  AD_AGE_BANDS,
  AD_WORKLOAD_WEAR,
  AD_YEAR2_3_BONUS,
  AV_VALUES,
  OQ_TOUCH_GATE,
  OQ_WEIGHTS,
  RD_BASE,
  RD_COACHING,
  RD_COMPETITION_COEF,
  RD_CONTRACT_COEF,
  RD_INCOMING_COMPETITION,
  RD_ROLE_CHANGE,
  RD_TEAMMATE_RETURN,
  RD_WORKLOAD_WEAR,
  RE_EXPLOSIVE_BAND,
  RE_SAMPLE_CLAMP,
  RE_WEIGHTS,
  RE_WITHOUT_EXPLOSIVE_BONUS,
  RU_WEIGHTS,
  TC_WEIGHTS,
  WRK_WEIGHTS,
} from '@/rb-model/constants';
import { clamp } from '@/rb-model/math';
import { pct, type PercentileContext } from '@/rb-model/percentiles';
import type {
  CoachingContinuity,
  ComponentScores,
  InjuryStatus,
  PracticeStatus,
  RBMVPInput,
  RoleChange,
} from '@/rb-model/types';
import type { ResolvedInputs } from '@/rb-model/fallbacks';

// §26.8.1 — shared pre-component derived values (exclude weekly availability and
// workload ramp; use base carries before QB adjustment and ramp).
export interface SharedDerived {
  baseExpectedCarries: number;
  baseExpectedRoutes: number;
  baseExpectedTargets: number;
  projectedTouchesForOQ: number;
}

export function computeSharedDerived(r: ResolvedInputs, shrunkTPRR: number): SharedDerived {
  const baseExpectedCarries = r.teamNonQbRush * r.carryShare;
  const baseExpectedRoutes = r.teamDropbacks * r.routeParticipation;
  const baseExpectedTargets = baseExpectedRoutes * shrunkTPRR;
  return {
    baseExpectedCarries,
    baseExpectedRoutes,
    baseExpectedTargets,
    projectedTouchesForOQ: baseExpectedCarries + baseExpectedTargets,
  };
}

// §26.8.2 — Workload Role.
export function workloadRole(
  r: ResolvedInputs,
  workloadTrendScore: number,
  ctx: PercentileContext,
): number {
  return clamp(
    WRK_WEIGHTS.snap4 * pct(r.snap4, 'snap_share', ctx) +
      WRK_WEIGHTS.carry * pct(r.carryShare, 'carry_share', ctx) +
      WRK_WEIGHTS.route * pct(r.routeParticipation, 'route_participation', ctx) +
      WRK_WEIGHTS.snap8 * pct(r.snap8, 'snap_share', ctx) +
      WRK_WEIGHTS.trend * workloadTrendScore,
    0,
    100,
  );
}

// §26.8.3 — Opportunity Quality with the low-touch cap.
export function opportunityQuality(
  r: ResolvedInputs,
  derived: SharedDerived,
  ctx: PercentileContext,
): number {
  const raw =
    OQ_WEIGHTS.goal_line * pct(r.goalLineShare, 'goal_line_carry_share', ctx) +
    OQ_WEIGHTS.red_zone * pct(r.redZoneShare, 'red_zone_carry_share', ctx) +
    OQ_WEIGHTS.targets * pct(derived.baseExpectedTargets, 'expected_targets_per_game', ctx) +
    OQ_WEIGHTS.ppd * pct(r.pointsPerDrive, 'team_points_per_drive', ctx);
  const gated =
    derived.projectedTouchesForOQ < OQ_TOUCH_GATE.threshold ? Math.min(raw, OQ_TOUCH_GATE.cap) : raw;
  return clamp(gated, 0, 100);
}

// §26.8.4 — Rushing Efficiency with the explosive band and sample clamps.
export function rushingEfficiency(
  shrunkYPC: number,
  shrunkSuccessRate: number,
  shrunkExplosiveRate: number,
  careerCarries: number,
  ctx: PercentileContext,
): number {
  const reBase =
    RE_WEIGHTS.ypc * pct(shrunkYPC, 'yards_per_carry', ctx) +
    RE_WEIGHTS.success * pct(shrunkSuccessRate, 'rushing_success_rate', ctx);
  const explosiveTerm = RE_WEIGHTS.explosive * pct(shrunkExplosiveRate, 'explosive_run_rate', ctx);
  const reRaw = reBase + explosiveTerm;
  const reWithoutExplosive = reBase + RE_WITHOUT_EXPLOSIVE_BONUS;
  let re = clamp(reRaw, reWithoutExplosive - RE_EXPLOSIVE_BAND, reWithoutExplosive + RE_EXPLOSIVE_BAND);

  if (careerCarries < RE_SAMPLE_CLAMP.veryLow.maxCarries) {
    const [lo, hi] = RE_SAMPLE_CLAMP.veryLow.range;
    re = clamp(re, lo, hi);
  } else if (careerCarries < RE_SAMPLE_CLAMP.low.maxCarries) {
    const [lo, hi] = RE_SAMPLE_CLAMP.low.range;
    re = clamp(re, lo, hi);
  } else {
    const [lo, hi] = RE_SAMPLE_CLAMP.full;
    re = clamp(re, lo, hi);
  }
  return re;
}

// §26.8.5 — Receiving Utility.
export function receivingUtility(
  r: ResolvedInputs,
  shrunkTPRR: number,
  shrunkCatchRate: number,
  shrunkRecYardsPerReception: number,
  ctx: PercentileContext,
): number {
  return clamp(
    RU_WEIGHTS.route * pct(r.routeParticipation, 'route_participation', ctx) +
      RU_WEIGHTS.tprr * pct(shrunkTPRR, 'targets_per_route_run', ctx) +
      RU_WEIGHTS.target_share * pct(r.targetShare, 'target_share', ctx) +
      RU_WEIGHTS.catch * pct(shrunkCatchRate, 'catch_rate', ctx) +
      RU_WEIGHTS.rypr * pct(shrunkRecYardsPerReception, 'receiving_yards_per_reception', ctx),
    0,
    100,
  );
}

// §26.8.6 — Team Context. QB rush pressure enters directly (not percentiled).
export function teamContext(r: ResolvedInputs, ctx: PercentileContext): number {
  return clamp(
    TC_WEIGHTS.non_qb_rush * pct(r.teamNonQbRush, 'projected_team_non_qb_rush_attempts', ctx) +
      TC_WEIGHTS.dropbacks * pct(r.teamDropbacks, 'projected_team_dropbacks', ctx) +
      TC_WEIGHTS.ppd * pct(r.pointsPerDrive, 'team_points_per_drive', ctx) +
      TC_WEIGHTS.rz_trips * pct(r.redZoneTrips, 'team_red_zone_trips_per_game', ctx) +
      TC_WEIGHTS.qb * (100 - 100 * r.qbRushPressure),
    0,
    100,
  );
}

// §26.8.7 — Role Durability.
function ageSecurityAdjustment(age: number): number {
  if (age <= 24) return 5;
  if (age <= 26) return 0; // 25–26
  if (age === 27) return -5;
  if (age === 28) return -10;
  return -15; // >= 29
}

export function roleDurability(
  r: ResolvedInputs,
  roleChange: RoleChange,
  coaching: CoachingContinuity,
  age: number,
  teammateReturn: boolean,
  incomingCompetition: boolean,
  highRecentWorkload: boolean,
): number {
  return clamp(
    RD_BASE +
      RD_CONTRACT_COEF * r.contractSecurity -
      RD_COMPETITION_COEF * r.competitionPressure +
      RD_ROLE_CHANGE[roleChange] +
      RD_COACHING[coaching] +
      ageSecurityAdjustment(age) +
      (highRecentWorkload ? -RD_WORKLOAD_WEAR : 0) -
      (teammateReturn ? RD_TEAMMATE_RETURN : 0) -
      (incomingCompetition ? RD_INCOMING_COMPETITION : 0),
    0,
    100,
  );
}

// §26.8.8 — Age & Development.
export function ageDevelopment(
  age: number,
  nflSeasonsCompleted: number,
  highRecentWorkload: boolean,
): number {
  const band = AD_AGE_BANDS.find((b) => age >= b.minAge && age <= b.maxAge);
  const base = band ? band.base : AD_AGE_BANDS[AD_AGE_BANDS.length - 1].base;
  const yearBonus = nflSeasonsCompleted === 1 || nflSeasonsCompleted === 2 ? AD_YEAR2_3_BONUS : 0;
  const wear = highRecentWorkload && age >= AD_WORKLOAD_WEAR.minAge ? AD_WORKLOAD_WEAR.penalty : 0;
  return clamp(base + yearBonus - wear, 0, 100);
}

// §26.8.9 — Availability.
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

export interface ShrunkValues {
  shrunkTPRR: number;
  shrunkYPC: number;
  shrunkSuccessRate: number;
  shrunkExplosiveRate: number;
  shrunkCatchRate: number;
  shrunkRecYardsPerReception: number;
}

export interface ComponentResult {
  components: ComponentScores;
  derived: SharedDerived;
}

export function computeComponents(
  input: RBMVPInput,
  r: ResolvedInputs,
  shrunk: ShrunkValues,
  workloadTrendScore: number,
  ctx: PercentileContext,
): ComponentResult {
  const derived = computeSharedDerived(r, shrunk.shrunkTPRR);
  const components: ComponentScores = {
    WRK: workloadRole(r, workloadTrendScore, ctx),
    OQ: opportunityQuality(r, derived, ctx),
    RE: rushingEfficiency(
      shrunk.shrunkYPC,
      shrunk.shrunkSuccessRate,
      shrunk.shrunkExplosiveRate,
      input.career_carries,
      ctx,
    ),
    RU: receivingUtility(
      r,
      shrunk.shrunkTPRR,
      shrunk.shrunkCatchRate,
      shrunk.shrunkRecYardsPerReception,
      ctx,
    ),
    TC: teamContext(r, ctx),
    RD: roleDurability(
      r,
      input.role_change,
      input.coaching_continuity,
      input.age,
      input.teammate_return_flag,
      input.incoming_competition_flag,
      input.high_recent_workload_flag,
    ),
    AD: ageDevelopment(input.age, input.nfl_seasons_completed, input.high_recent_workload_flag),
    AV: availability(input.injury_status, input.practice_status),
  };
  return { components, derived };
}
