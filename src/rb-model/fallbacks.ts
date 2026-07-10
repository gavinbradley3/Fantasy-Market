// §26.5 fallback resolution. Produces the resolved canonical value set consumed
// by every downstream formula, plus the fallback log and confidence-penalty tally.
//
// Semantics (§26.5.1):
//   - Every fallback resolves against the ORIGINAL input record, except where a
//     row explicitly names a previously canonicalized derived field (carry share,
//     route participation, target share, goal-line, red-zone all reference the
//     canonical Snap4/carry/route/TPRR values).
//   - Mutual Snap4 ↔ Snap8 fallbacks use ORIGINAL inputs (no circular behavior).
//   - Each canonical field is logged once and penalized once; downstream reuse
//     never repeats a penalty. Missing numbers never silently become zero.

import {
  CARRY_SHARE_FROM_SNAP,
  DRAFT_ROUND_SECURITY,
  FALLBACK_FINAL,
  FALLBACK_PENALTY,
  ROUTE_PART_FROM_SNAP,
  TARGET_SHARE_DERIVED,
  TPRR_PRIOR,
  WORKLOAD_RAMP_LOOKUP,
} from '@/rb-model/constants';
import { clamp, isFiniteNumber } from '@/rb-model/math';
import { referenceMedian } from '@/rb-model/percentiles';
import type {
  DraftRound,
  FallbackLogEntry,
  InjuryStatus,
  PracticeStatus,
  RBMVPInput,
  RBReferenceDistributions,
} from '@/rb-model/types';

export interface ResolvedInputs {
  snap4: number;
  snap8: number;
  carryShare: number;
  routeParticipation: number;
  tprr: number; // pre-shrinkage resolved TPRR
  targetShare: number;
  goalLineShare: number;
  redZoneShare: number;
  ypc: number; // pre-shrinkage resolved YPC
  successRate: number; // pre-shrinkage
  explosiveRate: number; // pre-shrinkage
  catchRate: number; // pre-shrinkage
  recYardsPerReception: number; // pre-shrinkage
  teamNonQbRush: number;
  teamDropbacks: number;
  pointsPerDrive: number;
  redZoneTrips: number;
  qbRushPressure: number;
  workloadRamp: number; // canonical workload_ramp_factor, clamped [0,1]
  contractSecurity: number;
  competitionPressure: number;
}

export interface FallbackResult {
  resolved: ResolvedInputs;
  log: FallbackLogEntry[];
  penalty: number;
}

export function draftRoundSecurity(round: DraftRound): number {
  return round === null ? DRAFT_ROUND_SECURITY.UDFA : DRAFT_ROUND_SECURITY[round];
}

export function draftRoundTPRRPrior(round: DraftRound): number {
  return round === null ? TPRR_PRIOR.UDFA : TPRR_PRIOR[round];
}

function workloadRampFromStatus(injury: InjuryStatus, practice: PracticeStatus): number {
  switch (injury) {
    case 'HEALTHY':
      return WORKLOAD_RAMP_LOOKUP.HEALTHY;
    case 'QUESTIONABLE':
      if (practice === 'FULL') return WORKLOAD_RAMP_LOOKUP.QUESTIONABLE_FULL;
      if (practice === 'LIMITED') return WORKLOAD_RAMP_LOOKUP.QUESTIONABLE_LIMITED;
      return WORKLOAD_RAMP_LOOKUP.QUESTIONABLE_DNP_UNKNOWN; // DNP or UNKNOWN
    case 'DOUBTFUL':
      return WORKLOAD_RAMP_LOOKUP.DOUBTFUL;
    case 'OUT':
    case 'IR':
    case 'PUP':
    case 'SUSPENDED':
      return WORKLOAD_RAMP_LOOKUP.UNAVAILABLE;
    case 'UNKNOWN':
      return WORKLOAD_RAMP_LOOKUP.UNKNOWN;
  }
}

export function resolveFallbacks(
  input: RBMVPInput,
  reference: RBReferenceDistributions,
): FallbackResult {
  const log: FallbackLogEntry[] = [];
  let penalty = 0;
  const record = (field: string, fallbackUsed: string, p: number) => {
    log.push({ field, fallback_used: fallbackUsed, confidence_penalty: p });
    penalty += p;
  };
  const has = (v: number | null | undefined): v is number => isFiniteNumber(v);

  // Original values (used for mutual Snap fallbacks and the goal-line "original
  // red-zone if present" branch).
  const oSnap4 = input.snap_share_last4;
  const oSnap8 = input.snap_share_last8;
  const oRedZone = input.red_zone_carry_share;

  // 1) Snap4 — original → original Snap8 → 0.45.
  let snap4: number;
  if (has(oSnap4)) snap4 = oSnap4;
  else if (has(oSnap8)) {
    snap4 = oSnap8;
    record('Snap4', 'original Snap8', FALLBACK_PENALTY.snap4);
  } else {
    snap4 = FALLBACK_FINAL.snap;
    record('Snap4', String(FALLBACK_FINAL.snap), FALLBACK_PENALTY.snap4);
  }

  // 2) Snap8 — original → original Snap4 → 0.45.
  let snap8: number;
  if (has(oSnap8)) snap8 = oSnap8;
  else if (has(oSnap4)) {
    snap8 = oSnap4;
    record('Snap8', 'original Snap4', FALLBACK_PENALTY.snap8);
  } else {
    snap8 = FALLBACK_FINAL.snap;
    record('Snap8', String(FALLBACK_FINAL.snap), FALLBACK_PENALTY.snap8);
  }

  // 3) Carry share — current → canonical Snap4 × 0.90 (cap 0.80) → 0.35.
  let carryShare: number;
  if (has(input.carry_share_last4)) carryShare = input.carry_share_last4;
  else {
    carryShare = Math.min(snap4 * CARRY_SHARE_FROM_SNAP.factor, CARRY_SHARE_FROM_SNAP.cap);
    record(
      'Carry share',
      `canonical Snap4 × ${CARRY_SHARE_FROM_SNAP.factor} (cap ${CARRY_SHARE_FROM_SNAP.cap})`,
      FALLBACK_PENALTY.carry_share,
    );
  }

  // 4) Route participation — current → canonical Snap4 × 0.60 → 0.25.
  let routeParticipation: number;
  if (has(input.route_participation_last4)) routeParticipation = input.route_participation_last4;
  else {
    routeParticipation = snap4 * ROUTE_PART_FROM_SNAP;
    record('Route participation', `canonical Snap4 × ${ROUTE_PART_FROM_SNAP}`, FALLBACK_PENALTY.route_participation);
  }

  // 5) TPRR — current → career TPRR → draft-round prior.
  let tprr: number;
  if (has(input.targets_per_route_run)) tprr = input.targets_per_route_run;
  else if (has(input.career_targets_per_route_run)) {
    tprr = input.career_targets_per_route_run;
    record('TPRR', 'career TPRR', FALLBACK_PENALTY.tprr);
  } else {
    tprr = draftRoundTPRRPrior(input.draft_round);
    record('TPRR', `draft-round prior (${input.draft_round ?? 'UDFA'})`, FALLBACK_PENALTY.tprr);
  }

  // 6) Target share — current → canonical route participation × canonical TPRR × 0.85 (cap 0.20) → 0.06.
  let targetShare: number;
  if (has(input.target_share)) targetShare = input.target_share;
  else {
    targetShare = Math.min(
      routeParticipation * tprr * TARGET_SHARE_DERIVED.factor,
      TARGET_SHARE_DERIVED.cap,
    );
    record(
      'Target share',
      `route × TPRR × ${TARGET_SHARE_DERIVED.factor} (cap ${TARGET_SHARE_DERIVED.cap})`,
      FALLBACK_PENALTY.target_share,
    );
  }

  // 8) Red-zone share — current → canonical carry share → 0.35.  (resolved before
  // goal-line so goal-line can reference the canonical red-zone value.)
  let redZoneShare: number;
  if (has(oRedZone)) redZoneShare = oRedZone;
  else {
    redZoneShare = carryShare;
    record('Red-zone share', 'canonical carry share', FALLBACK_PENALTY.red_zone_share);
  }

  // 7) Goal-line share — current → original red-zone if present else canonical
  // red-zone → canonical carry share.
  let goalLineShare: number;
  if (has(input.goal_line_carry_share)) goalLineShare = input.goal_line_carry_share;
  else if (has(oRedZone)) {
    goalLineShare = oRedZone;
    record('Goal-line share', 'original red-zone share', FALLBACK_PENALTY.goal_line_share);
  } else {
    // original red-zone absent → canonical red-zone share (first fallback path).
    goalLineShare = redZoneShare;
    record('Goal-line share', 'canonical red-zone share', FALLBACK_PENALTY.goal_line_share);
  }

  // 9) YPC — current → non-overlapping career YPC → 4.20.
  let ypc: number;
  if (has(input.yards_per_carry)) ypc = input.yards_per_carry;
  else if (has(input.career_yards_per_carry)) {
    ypc = input.career_yards_per_carry;
    record('YPC', 'non-overlapping career YPC', FALLBACK_PENALTY.ypc);
  } else {
    ypc = FALLBACK_FINAL.ypc;
    record('YPC', String(FALLBACK_FINAL.ypc), FALLBACK_PENALTY.ypc);
  }

  // 10) Success rate — current → 0.42 (no first fallback).
  let successRate: number;
  if (has(input.rushing_success_rate)) successRate = input.rushing_success_rate;
  else {
    successRate = FALLBACK_FINAL.success_rate;
    record('Success rate', String(FALLBACK_FINAL.success_rate), FALLBACK_PENALTY.success_rate);
  }

  // 11) Explosive rate — current → 0.10 (no first fallback).
  let explosiveRate: number;
  if (has(input.explosive_run_rate)) explosiveRate = input.explosive_run_rate;
  else {
    explosiveRate = FALLBACK_FINAL.explosive_rate;
    record('Explosive rate', String(FALLBACK_FINAL.explosive_rate), FALLBACK_PENALTY.explosive_rate);
  }

  // 12) Catch rate — current → non-overlapping career catch rate → 0.78.
  let catchRate: number;
  if (has(input.catch_rate)) catchRate = input.catch_rate;
  else if (has(input.career_catch_rate)) {
    catchRate = input.career_catch_rate;
    record('Catch rate', 'non-overlapping career catch rate', FALLBACK_PENALTY.catch_rate);
  } else {
    catchRate = FALLBACK_FINAL.catch_rate;
    record('Catch rate', String(FALLBACK_FINAL.catch_rate), FALLBACK_PENALTY.catch_rate);
  }

  // 13) Receiving yards/reception — current → non-overlapping career value → 7.50.
  let recYardsPerReception: number;
  if (has(input.receiving_yards_per_reception)) recYardsPerReception = input.receiving_yards_per_reception;
  else if (has(input.career_receiving_yards_per_reception)) {
    recYardsPerReception = input.career_receiving_yards_per_reception;
    record('Rec yards/reception', 'non-overlapping career value', FALLBACK_PENALTY.rec_yards_per_reception);
  } else {
    recYardsPerReception = FALLBACK_FINAL.rec_yards_per_reception;
    record('Rec yards/reception', String(FALLBACK_FINAL.rec_yards_per_reception), FALLBACK_PENALTY.rec_yards_per_reception);
  }

  // 14) Team non-QB rushes — projection → reference median → 24.0.
  const teamNonQbRush = resolveWithMedian(
    input.projected_team_non_qb_rush_attempts,
    'projected_team_non_qb_rush_attempts',
    FALLBACK_FINAL.team_non_qb_rushes,
    'Team non-QB rushes',
    FALLBACK_PENALTY.team_non_qb_rushes,
    reference,
    record,
    has,
  );

  // 15) Team dropbacks — projection → reference median → 34.0.
  const teamDropbacks = resolveWithMedian(
    input.projected_team_dropbacks,
    'projected_team_dropbacks',
    FALLBACK_FINAL.team_dropbacks,
    'Team dropbacks',
    FALLBACK_PENALTY.team_dropbacks,
    reference,
    record,
    has,
  );

  // 16) Points/drive — current → reference median → 1.90.
  const pointsPerDrive = resolveWithMedian(
    input.team_points_per_drive,
    'team_points_per_drive',
    FALLBACK_FINAL.points_per_drive,
    'Points/drive',
    FALLBACK_PENALTY.points_per_drive,
    reference,
    record,
    has,
  );

  // 17) Red-zone trips — current → reference median → 3.2.
  const redZoneTrips = resolveWithMedian(
    input.team_red_zone_trips_per_game,
    'team_red_zone_trips_per_game',
    FALLBACK_FINAL.red_zone_trips,
    'Red-zone trips',
    FALLBACK_PENALTY.red_zone_trips,
    reference,
    record,
    has,
  );

  // 18) QB rush pressure — current → 0.35 (no first fallback).
  let qbRushPressure: number;
  if (has(input.qb_rush_pressure)) qbRushPressure = input.qb_rush_pressure;
  else {
    qbRushPressure = FALLBACK_FINAL.qb_rush_pressure;
    record('QB rush pressure', String(FALLBACK_FINAL.qb_rush_pressure), FALLBACK_PENALTY.qb_rush_pressure);
  }

  // 19) Workload ramp — provided (clamp [0,1], no log) → status/practice lookup.
  let workloadRamp: number;
  if (has(input.workload_ramp_factor)) {
    workloadRamp = clamp(input.workload_ramp_factor, 0, 1);
  } else {
    workloadRamp = workloadRampFromStatus(input.injury_status, input.practice_status);
    record('Workload ramp', 'status/practice lookup', FALLBACK_PENALTY.workload_ramp);
  }

  // 20) Contract security — current → draft-round mapping → 0.35.
  let contractSecurity: number;
  if (has(input.contract_security)) contractSecurity = input.contract_security;
  else {
    contractSecurity = draftRoundSecurity(input.draft_round);
    record('Contract security', `draft-round mapping (${input.draft_round ?? 'UDFA'})`, FALLBACK_PENALTY.contract_security);
  }

  // 21) Competition pressure — current → 0.50 (no first fallback).
  let competitionPressure: number;
  if (has(input.competition_pressure)) competitionPressure = input.competition_pressure;
  else {
    competitionPressure = FALLBACK_FINAL.competition_pressure;
    record('Competition pressure', String(FALLBACK_FINAL.competition_pressure), FALLBACK_PENALTY.competition_pressure);
  }

  return {
    resolved: {
      snap4,
      snap8,
      carryShare,
      routeParticipation,
      tprr,
      targetShare,
      goalLineShare,
      redZoneShare,
      ypc,
      successRate,
      explosiveRate,
      catchRate,
      recYardsPerReception,
      teamNonQbRush,
      teamDropbacks,
      pointsPerDrive,
      redZoneTrips,
      qbRushPressure,
      workloadRamp,
      contractSecurity,
      competitionPressure,
    },
    log,
    penalty,
  };
}

// projection → reference median → hard final. The median and final rows share one
// penalty and one log entry (whichever the field actually falls back to).
function resolveWithMedian(
  value: number | null | undefined,
  refKey: Parameters<typeof referenceMedian>[0],
  finalValue: number,
  fieldLabel: string,
  fieldPenalty: number,
  reference: RBReferenceDistributions,
  record: (field: string, fallbackUsed: string, p: number) => void,
  has: (v: number | null | undefined) => v is number,
): number {
  if (has(value)) return value;
  const med = referenceMedian(refKey, reference);
  if (isFiniteNumber(med)) {
    record(fieldLabel, 'reference median', fieldPenalty);
    return med;
  }
  record(fieldLabel, String(finalValue), fieldPenalty);
  return finalValue;
}
