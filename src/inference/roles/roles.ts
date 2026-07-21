// Role classification (REGISTRY §3 + §20.F4). Ordered first-match ladders; a
// predicate referencing a null signal evaluates FALSE (§20.F4 general rule); when a
// position's primary routing signal is null the reduced ladder governs. Pure.

import {
  QB_ROLE,
  RB_ROLE,
  TE_PROSPECT,
  TE_ROLE,
  TE_ROLE_REDUCED,
  WR_ROLE,
  WR_ROLE_REDUCED,
} from '@/inference/registry/family';
import { isOfficialProvenance, type SourceOrInferenceProvenance } from '@/inference/types';

// Null-safe comparators (a null comparand makes the predicate false — §20.F4).
const ge = (a: number | null, b: number): boolean => a !== null && a >= b;
const le = (a: number | null, b: number): boolean => a !== null && a <= b;
const lt = (a: number | null, b: number): boolean => a !== null && a < b;

export interface RoleResult<C extends string> {
  readonly klass: C;
  /** assigned at the catch-all rung (§3 → +P_CLASS_CATCHALL). */
  readonly catchall: boolean;
  /** assigned from a reduced-signal ladder (§20.F4 → +P_CLASS_REDUCED). */
  readonly reduced: boolean;
  /** false when the minimum-evidence gate failed (§3). */
  readonly minEvidenceMet: boolean;
}

export interface RoleEvidence {
  readonly gamesObservedL4: number;
  readonly preseasonPriorAvailable: boolean;
}

function minEvidenceMet(e: RoleEvidence): boolean {
  return e.gamesObservedL4 >= 2 || e.preseasonPriorAvailable;
}

// ===================== WR (§3.1 / §20.F4) =====================

export type WRRoleClass =
  | 'alpha_x'
  | 'high_volume_primary'
  | 'slot_specialist'
  | 'field_stretcher'
  | 'secondary_starter'
  | 'rotational'
  | 'reserve_developmental'
  | 'uncertain';

export interface WRRoleSignals extends RoleEvidence {
  readonly routePartL4: number | null;
  readonly targetShare: number | null;
  readonly adot: number | null;
}

export function classifyWRRole(s: WRRoleSignals): RoleResult<WRRoleClass> {
  if (!minEvidenceMet(s)) {
    return { klass: 'uncertain', catchall: true, reduced: false, minEvidenceMet: false };
  }
  if (s.routePartL4 === null) {
    // §20.F4 reduced ladder (target_share only).
    if (ge(s.targetShare, WR_ROLE_REDUCED.highVolTargetShare)) {
      return r('high_volume_primary', false, true);
    }
    if (ge(s.targetShare, WR_ROLE_REDUCED.secondaryTargetShare)) return r('secondary_starter', false, true);
    if (ge(s.targetShare, WR_ROLE_REDUCED.rotationalTargetShare)) return r('rotational', false, true);
    return r('uncertain', true, true);
  }
  const rp = s.routePartL4;
  if (ge(rp, WR_ROLE.alphaRoute) && ge(s.targetShare, WR_ROLE.alphaTargetShare)) return r('alpha_x', false, false);
  if (ge(s.targetShare, WR_ROLE.highVolTargetShare) && ge(rp, WR_ROLE.highVolRoute)) return r('high_volume_primary', false, false);
  if (ge(rp, WR_ROLE.slotRoute) && le(s.adot, WR_ROLE.slotAdotMax)) return r('slot_specialist', false, false);
  if (ge(rp, WR_ROLE.stretchRoute) && ge(s.adot, WR_ROLE.stretchAdotMin)) return r('field_stretcher', false, false);
  if (ge(rp, WR_ROLE.secondaryRoute)) return r('secondary_starter', false, false);
  if (ge(rp, WR_ROLE.rotationalRoute)) return r('rotational', false, false);
  return r('reserve_developmental', true, false);
}

// ===================== RB (§3.2 / §20.F4) =====================

export type RBRoleClass =
  | 'lead_back'
  | 'committee_leader'
  | 'receiving_back'
  | 'goal_line_specialist'
  | 'early_down'
  | 'committee_member'
  | 'reserve'
  | 'uncertain';

export interface RBRoleSignals extends RoleEvidence {
  readonly snapShareL4: number | null;
  readonly carryShareL4: number | null;
  readonly routePartL4: number | null;
  readonly goalLineCarryShare: number | null;
}

export function classifyRBRole(s: RBRoleSignals): RoleResult<RBRoleClass> {
  if (!minEvidenceMet(s)) {
    return { klass: 'uncertain', catchall: true, reduced: false, minEvidenceMet: false };
  }
  const reduced = s.routePartL4 === null; // §20.F4: rule 3 (receiving_back) skipped
  if (ge(s.snapShareL4, RB_ROLE.leadSnap) && ge(s.carryShareL4, RB_ROLE.leadCarry)) return r('lead_back', false, reduced);
  if (ge(s.carryShareL4, RB_ROLE.committeeLeaderCarry)) return r('committee_leader', false, reduced);
  if (!reduced && ge(s.routePartL4, RB_ROLE.receivingRoute) && lt(s.carryShareL4, RB_ROLE.receivingCarryMax)) {
    return r('receiving_back', false, false);
  }
  if (ge(s.goalLineCarryShare, RB_ROLE.goalLineShare) && lt(s.snapShareL4, RB_ROLE.goalLineSnapMax)) return r('goal_line_specialist', false, reduced);
  if (ge(s.carryShareL4, RB_ROLE.earlyDownCarry) && lt(s.snapShareL4, RB_ROLE.earlyDownSnapMax)) return r('early_down', false, reduced);
  if (ge(s.snapShareL4, RB_ROLE.committeeSnap) || ge(s.carryShareL4, RB_ROLE.committeeCarry)) return r('committee_member', false, reduced);
  if (reduced && s.carryShareL4 === null) return r('uncertain', true, true);
  return r('reserve', true, reduced);
}

// ===================== TE (§3.3 / §20.F4) =====================

export type TERoleClass =
  | 'primary_receiving'
  | 'every_down_starter'
  | 'route_first_specialist'
  | 'blocking_heavy_starter'
  | 'committee'
  | 'reserve'
  | 'uncertain';

export interface TERoleSignals extends RoleEvidence {
  readonly routePartL4: number | null;
  readonly snapShareL4: number | null;
  readonly targetShare: number | null;
}

export function classifyTERole(s: TERoleSignals): RoleResult<TERoleClass> {
  if (!minEvidenceMet(s)) {
    return { klass: 'uncertain', catchall: true, reduced: false, minEvidenceMet: false };
  }
  if (s.routePartL4 === null) {
    if (ge(s.snapShareL4, TE_ROLE_REDUCED.everyDownSnap) && ge(s.targetShare, TE_ROLE_REDUCED.everyDownTargetShare)) {
      return r('every_down_starter', false, true);
    }
    if (ge(s.targetShare, TE_ROLE_REDUCED.primaryTargetShare)) return r('primary_receiving', false, true);
    if (ge(s.snapShareL4, TE_ROLE_REDUCED.blockingHeavySnap)) return r('blocking_heavy_starter', false, true);
    if (ge(s.snapShareL4, TE_ROLE_REDUCED.committeeSnap)) return r('committee', false, true);
    return r('uncertain', true, true);
  }
  const rp = s.routePartL4;
  const snap = s.snapShareL4;
  if (ge(rp, TE_ROLE.primaryRoute) && ge(s.targetShare, TE_ROLE.primaryTargetShare)) return r('primary_receiving', false, false);
  if (ge(rp, TE_ROLE.everyDownRoute) && ge(snap, TE_ROLE.everyDownSnap)) return r('every_down_starter', false, false);
  if (ge(rp, TE_ROLE.routeFirstRoute) && snap !== null && snap - rp <= TE_ROLE.routeFirstBlockingGapMax) {
    return r('route_first_specialist', false, false);
  }
  if (ge(snap, TE_ROLE.blockingHeavySnap) && lt(rp, TE_ROLE.blockingHeavyRouteMax)) return r('blocking_heavy_starter', false, false);
  if (ge(snap, TE_ROLE.committeeSnap)) return r('committee', false, false);
  return r('reserve', true, false);
}

export type TEDepthChartRole = 'TE1' | 'TE2' | 'TE3_OR_DEPTH' | 'UNKNOWN';

/** §3.3 depth_chart_role: rank team TEs by snap_share_l4 desc. */
export function classifyTEDepthChartRole(
  subjectSnapShareL4: number | null,
  teammateSnapShares: readonly (number | null)[],
): TEDepthChartRole {
  if (subjectSnapShareL4 === null) return 'UNKNOWN';
  const rank =
    1 + teammateSnapShares.filter((v) => v !== null && v > subjectSnapShareL4).length;
  if (rank === 1) return 'TE1';
  if (rank === 2) return 'TE2';
  return 'TE3_OR_DEPTH';
}

export type TEProspectType = 'RECEIVING' | 'BALANCED' | 'BLOCKING_FIRST' | 'UNKNOWN';

/** §3.3 prospect_type (veteran ≥100 career routes; else UNKNOWN). */
export function classifyTEProspectType(input: {
  readonly careerRoutes: number | null;
  readonly snapShareL4: number | null;
  readonly routePartL4: number | null;
  readonly tprr: number | null;
}): TEProspectType {
  if (input.careerRoutes === null || input.careerRoutes < TE_PROSPECT.veteranMinCareerRoutes) {
    return 'UNKNOWN';
  }
  if (input.snapShareL4 === null || input.routePartL4 === null) return 'UNKNOWN';
  const blockingGap = input.snapShareL4 - input.routePartL4;
  if (blockingGap <= TE_PROSPECT.receivingBlockingGapMax && ge(input.tprr, TE_PROSPECT.receivingTprrMin)) {
    return 'RECEIVING';
  }
  if (blockingGap >= TE_PROSPECT.blockingFirstBlockingGapMin || input.routePartL4 < TE_PROSPECT.blockingFirstRouteMax) {
    return 'BLOCKING_FIRST';
  }
  return 'BALANCED';
}

// ===================== QB (§3.4) =====================

export type QBDepthChartStatus = 'STARTER' | 'CO_STARTER' | 'BACKUP' | 'PRACTICE_SQUAD' | 'FREE_AGENT';

export function classifyQBDepthChartStatus(input: {
  readonly hasTeam: boolean;
  readonly practiceSquad: boolean;
  readonly lastGameSnapShare: number | null;
  readonly secondQbSnapShare: number | null;
}): QBDepthChartStatus {
  if (!input.hasTeam) return 'FREE_AGENT';
  if (input.practiceSquad) return 'PRACTICE_SQUAD';
  if (input.lastGameSnapShare !== null && input.lastGameSnapShare > 0.5) return 'STARTER';
  if (
    ge(input.lastGameSnapShare, QB_ROLE.coStarterSnapShare) &&
    ge(input.secondQbSnapShare, QB_ROLE.coStarterSnapShare)
  ) {
    return 'CO_STARTER';
  }
  return 'BACKUP';
}

export type QBRoleStatus =
  | 'ESTABLISHED_STARTER'
  | 'YOUNG_COMMITTED_STARTER'
  | 'ROOKIE_EXPECTED_STARTER'
  | 'BRIDGE_STARTER'
  | 'TEMPORARY_INJURY_REPLACEMENT'
  | 'COMPETITION'
  | 'RECENTLY_BENCHED'
  | 'BACKUP';

export interface QBRoleSignals {
  readonly benchedWithin4Weeks: boolean;
  readonly temporaryInjuryReplacement: boolean; // confirmed starter injury & prior BACKUP
  readonly recentStartRate: number | null;
  readonly careerStarts: number | null;
  readonly startsProvenance: SourceOrInferenceProvenance;
  readonly nflSeasonsCompleted: number;
  readonly depthChartStatus: QBDepthChartStatus;
  readonly veteranBridgeSigned: boolean; // signed this offseason as expected starter
  readonly twoQbStartSignal: boolean;
}

/** §3.4 role_status ladder. Rule 3 requires official-provenance starts (§9.3 / §20.D2). */
export function classifyQBRoleStatus(s: QBRoleSignals): QBRoleStatus {
  if (s.benchedWithin4Weeks) return 'RECENTLY_BENCHED';
  if (s.temporaryInjuryReplacement) return 'TEMPORARY_INJURY_REPLACEMENT';
  if (
    ge(s.recentStartRate, QB_ROLE.establishedStartRate) &&
    ge(s.careerStarts, QB_ROLE.establishedCareerStarts) &&
    isOfficialProvenance(s.startsProvenance)
  ) {
    return 'ESTABLISHED_STARTER';
  }
  if (ge(s.recentStartRate, QB_ROLE.youngStartRate) && s.nflSeasonsCompleted <= QB_ROLE.youngMaxSeasons) {
    return 'YOUNG_COMMITTED_STARTER';
  }
  if (
    s.nflSeasonsCompleted === 0 &&
    (s.depthChartStatus === 'STARTER' || s.depthChartStatus === 'CO_STARTER')
  ) {
    return 'ROOKIE_EXPECTED_STARTER';
  }
  if (s.veteranBridgeSigned && s.nflSeasonsCompleted >= QB_ROLE.bridgeMinSeasons) return 'BRIDGE_STARTER';
  if (s.depthChartStatus === 'CO_STARTER' || s.twoQbStartSignal) return 'COMPETITION';
  return 'BACKUP';
}

function r<C extends string>(klass: C, catchall: boolean, reduced: boolean): RoleResult<C> {
  return { klass, catchall, reduced, minEvidenceMet: true };
}
