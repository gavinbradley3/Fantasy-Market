// Roster / contract security (REGISTRY §5). Reduced model (default), QB
// organizational commitment, and true-contract override. Pure.

import {
  DRAFT_COMMITMENT_BY_ROUND,
  DRAFT_TIER_SECURITY,
  ORG_COMMITMENT_BLEND,
  ROLE_COMMITMENT_BY_QB_ROLE,
  ROSTER_SECURITY,
  ROSTER_SECURITY_CATEGORY_CUTS,
  experienceAdj,
} from '@/inference/registry/family';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';

export type NegativeTransaction = 'BENCH_OR_TRADE_BLOCK_OR_WAIVED' | 'IR_CHURN' | 'NONE';

export interface RosterSecurityInput {
  readonly draftRound: number | null; // 1..7 or null (UDFA)
  readonly age: number;
  readonly yearsWithTeam: number;
  readonly recentUsageShare: number | null; // null → 0
  readonly negativeTransaction: NegativeTransaction;
}

function draftTierSecurity(round: number | null): number {
  const key = round === null ? 'UDFA' : String(round);
  return DRAFT_TIER_SECURITY[key] ?? DRAFT_TIER_SECURITY.UDFA;
}

function negativeTxnPenalty(txn: NegativeTransaction): number {
  switch (txn) {
    case 'BENCH_OR_TRADE_BLOCK_OR_WAIVED':
      return ROSTER_SECURITY.negativeTxnBench;
    case 'IR_CHURN':
      return ROSTER_SECURITY.negativeTxnIrChurn;
    case 'NONE':
      return 0;
  }
}

/** §5.1 reduced roster-security model. Rounded to 4dp. */
export function rosterSecurity(input: RosterSecurityInput): number {
  const raw =
    draftTierSecurity(input.draftRound) +
    experienceAdj(input.age) +
    Math.min(ROSTER_SECURITY.yearsWithTeamCoef * input.yearsWithTeam, ROSTER_SECURITY.yearsWithTeamCap) +
    ROSTER_SECURITY.usageCoef * (input.recentUsageShare ?? 0) -
    negativeTxnPenalty(input.negativeTransaction);
  return roundHalfAwayFromZero(clamp(raw, ROSTER_SECURITY.clampMin, ROSTER_SECURITY.clampMax), 4);
}

export type SecurityCategory = 'LOW' | 'MEDIUM' | 'HIGH';

/** §5.3 categories (lower-inclusive; boundary → higher). */
export function securityCategory(value: number): SecurityCategory {
  if (value < ROSTER_SECURITY_CATEGORY_CUTS.medium) return 'LOW';
  if (value < ROSTER_SECURITY_CATEGORY_CUTS.high) return 'MEDIUM';
  return 'HIGH';
}

/** §5.2 QB organizational_commitment. Rounded to 4dp. */
export function organizationalCommitment(input: {
  readonly draftRound: number | null;
  readonly roleStatus: string;
}): number {
  const draftKey = input.draftRound === null ? 'UDFA' : String(input.draftRound);
  const draft = DRAFT_COMMITMENT_BY_ROUND[draftKey] ?? DRAFT_COMMITMENT_BY_ROUND.UDFA;
  const role = ROLE_COMMITMENT_BY_QB_ROLE[input.roleStatus] ?? ROLE_COMMITMENT_BY_QB_ROLE.BACKUP;
  const raw = ORG_COMMITMENT_BLEND.draft * draft + ORG_COMMITMENT_BLEND.role * role;
  return roundHalfAwayFromZero(clamp(raw, ROSTER_SECURITY.clampMin, ROSTER_SECURITY.clampMax), 4);
}
