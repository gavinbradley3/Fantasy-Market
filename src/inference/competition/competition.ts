// Competition pressure (REGISTRY §4). Pure teammate-sum model + QB role map + flags.

import { rosterStatusAvailProb } from '@/inference/availability/availability';
import {
  COMPETITION,
  COMPETITION_CATEGORY_CUTS,
  COMPETITION_FLAGS,
  COMPETITION_PRESSURE_BY_QB_ROLE,
  DRAFT_TIER_WEIGHT,
} from '@/inference/registry/family';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';
import type { RosterStatus } from '@/inference/features/types';

export type CompetitionPosition = 'WR' | 'RB' | 'TE';

/** One same-position teammate contributing pressure (REGISTRY §4.2). */
export interface CompetitionTeammate {
  readonly canonicalId: string;
  readonly draftRound: number | null; // 1..7 or null (UDFA)
  /** teammate recent usage share (target for WR/TE, carry for RB); null → 0. */
  readonly usageShare: number | null;
  readonly status: RosterStatus;
  /** acquired or returned ≤ 8 weeks ago (S9). */
  readonly recentlyAcquiredOrReturned: boolean;
}

function draftTierWeight(round: number | null): number {
  const key = round === null ? 'UDFA' : String(round);
  return DRAFT_TIER_WEIGHT[key] ?? DRAFT_TIER_WEIGHT.UDFA;
}

function logistic(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** §4.2 competition_pressure for WR/RB/TE. Rounded to 4dp. */
export function competitionPressure(
  position: CompetitionPosition,
  teammates: readonly CompetitionTeammate[],
): number {
  let raw = 0;
  for (const t of teammates) {
    const wdc = draftTierWeight(t.draftRound);
    const usage = t.usageShare ?? 0;
    const useEff = Math.max(usage, COMPETITION.useEffFloorFactor * wdc);
    const recency = t.recentlyAcquiredOrReturned ? COMPETITION.recencyMultiplier : 1.0;
    const health = rosterStatusAvailProb(t.status);
    raw += wdc * useEff * recency * health;
  }
  const posNorm = COMPETITION.posNorm[position];
  const squashed = logistic(COMPETITION.kSquash * (raw / posNorm - 1));
  return roundHalfAwayFromZero(clamp(squashed, COMPETITION.clampMin, COMPETITION.clampMax), 4);
}

/** §4.1 QB competition_pressure from role_status (ENGINE_PRECEDENT map). */
export function qbCompetitionPressure(roleStatus: string): number {
  return COMPETITION_PRESSURE_BY_QB_ROLE[roleStatus] ?? COMPETITION_PRESSURE_BY_QB_ROLE.BACKUP;
}

export type CompetitionCategory = 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';

/** §4.4 public categories (lower-inclusive; boundary → higher). */
export function competitionCategory(value: number): CompetitionCategory {
  if (value < COMPETITION_CATEGORY_CUTS.moderate) return 'LOW';
  if (value < COMPETITION_CATEGORY_CUTS.elevated) return 'MODERATE';
  if (value < COMPETITION_CATEGORY_CUTS.high) return 'ELEVATED';
  return 'HIGH';
}

// ===================== §4.3 flags =====================

/** teammate returned ≤8wk AND held prior usage ≥ 0.40 (RB/TE). */
export function teammateReturnFlag(
  teammates: readonly (CompetitionTeammate & { priorUsageShare: number | null })[],
): boolean {
  return teammates.some(
    (t) => t.recentlyAcquiredOrReturned && (t.priorUsageShare ?? 0) >= COMPETITION_FLAGS.returnPriorUsage,
  );
}

/** teammate acquired ≤8wk with w_dc ≥ 0.65 OR prior usage ≥ 0.40 (RB). */
export function incomingCompetitionFlag(
  teammates: readonly (CompetitionTeammate & { priorUsageShare: number | null })[],
): boolean {
  return teammates.some(
    (t) =>
      t.recentlyAcquiredOrReturned &&
      (draftTierWeight(t.draftRound) >= COMPETITION_FLAGS.incomingWdc ||
        (t.priorUsageShare ?? 0) >= COMPETITION_FLAGS.incomingPriorUsage),
  );
}

/** another team TE has route_part_l4 ≥ 0.50 (TE). */
export function anotherReceivingTeFlag(teammateRoutePartL4: readonly (number | null)[]): boolean {
  return teammateRoutePartL4.some((v) => v !== null && v >= COMPETITION_FLAGS.anotherReceivingTeRoute);
}
