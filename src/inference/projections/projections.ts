// Projection framework (REGISTRY §2). One bound functional form per family;
// pure and deterministic; rounding only at the registered point. role_adj = 0 (§2.4).

import {
  DROPBACK_SHARE_STARTER,
  EXPECTED_PASS_ATTEMPTS_BY_ROLE,
  PROJECTION,
  PROJECTION_BOUNDS,
  QB_SHARE_ADJ_CLAMP,
  SHRINK_K,
} from '@/inference/registry/family';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';
import { shrink } from './shrink';

export interface ShareProjectionInput {
  readonly recent: number | null; // S_recent (l4 share)
  readonly career: number | null; // S_career (or prior-season share)
  readonly gamesObservedL4: number;
  readonly lo: number;
  readonly hi: number;
  readonly dp: number;
  /** §2.3 age additive nudge (ROS/1yr+ only; weekly = 0). */
  readonly ageAdj?: number;
}

export interface ProjectionResult {
  readonly value: number | null; // null → INSUFFICIENT_DATA
  readonly wRecent: number;
  readonly usedFallback: boolean; // recent unavailable → career/ prior used
}

/** §2.1 per-game share projection (target/carry/snap/route share). */
export function projectShare(input: ShareProjectionInput): ProjectionResult {
  const { recent, career } = input;
  if (recent === null && career === null) {
    return { value: null, wRecent: 0, usedFallback: true };
  }
  let wRecent: number;
  let blend: number;
  if (recent !== null && career !== null) {
    wRecent = clamp(input.gamesObservedL4 / PROJECTION.wRecentDenomGames, 0, 1);
    blend = wRecent * recent + (1 - wRecent) * career;
  } else if (recent !== null) {
    wRecent = 1;
    blend = recent;
  } else {
    wRecent = 0;
    blend = career as number;
  }
  const proj = clamp(blend + (input.ageAdj ?? 0), input.lo, input.hi);
  return { value: roundHalfAwayFromZero(proj, input.dp), wRecent, usedFallback: recent === null };
}

/** §2.3 rookie / no-usage share = 0.5·archetype ⊕ 0.5·league median, clamped. */
export function projectRookieShare(
  archetypePrior: number,
  leagueMedian: number,
  bounds: { lo: number; hi: number; dp: number },
): number {
  const w = PROJECTION.rookieShareBlendWeight;
  const blended = w * archetypePrior + (1 - w) * leagueMedian;
  return roundHalfAwayFromZero(clamp(blended, bounds.lo, bounds.hi), bounds.dp);
}

export interface TeamVolumeInput {
  readonly std: number | null; // season-to-date per-game value
  readonly teamGamesPlayedThisSeason: number;
  readonly leagueMedian: number;
  readonly priorSeasonPerGame: number | null;
  readonly priorSeasonGames: number;
  readonly lo: number;
  readonly hi: number;
  readonly dp: number;
}

/** §2.1 per-game team volume projection. */
export function projectTeamVolume(input: TeamVolumeInput): number {
  let v: number;
  if (input.teamGamesPlayedThisSeason > 0 && input.std !== null) {
    const wTeam = clamp(input.teamGamesPlayedThisSeason / PROJECTION.wTeamDenomGames, 0, 1);
    v = wTeam * input.std + (1 - wTeam) * input.leagueMedian;
  } else if (input.priorSeasonPerGame !== null) {
    const n = Math.min(input.priorSeasonGames, PROJECTION.priorSeasonMaxGames);
    v = shrink(input.priorSeasonPerGame, input.leagueMedian, PROJECTION.kTeamPreseason, n);
  } else {
    v = input.leagueMedian;
  }
  return roundHalfAwayFromZero(clamp(v, input.lo, input.hi), input.dp);
}

export interface RateProjectionInput {
  readonly observed: number | null;
  readonly careerOrPrior: number | null;
  readonly neutralPrior: number;
  readonly k: number;
  readonly sampleN: number;
  readonly lo: number;
  readonly hi: number;
  readonly dp: number;
}

/** §2.3 efficiency-rate projection: shrink observed toward its prior. */
export function projectRate(input: RateProjectionInput): ProjectionResult {
  if (input.observed === null && input.careerOrPrior === null) {
    return { value: null, wRecent: 0, usedFallback: true };
  }
  const prior = input.careerOrPrior ?? input.neutralPrior;
  const observed = input.observed ?? prior;
  const shrunk = shrink(observed, prior, input.k, input.sampleN);
  return {
    value: roundHalfAwayFromZero(clamp(shrunk, input.lo, input.hi), input.dp),
    wRecent: input.sampleN / (input.sampleN + input.k),
    usedFallback: input.observed === null,
  };
}

export interface QbPassAttemptsInput {
  readonly roleStatus: string;
  readonly recentPassAttempts: number;
  readonly recentStartsEst: number;
  readonly teamDropbackShare: number;
}

/** §2.7 QB expected active-game pass attempts. Sample n = recent_pass_attempts. */
export function expectedActiveGamePassAttempts(input: QbPassAttemptsInput): number {
  const base = EXPECTED_PASS_ATTEMPTS_BY_ROLE[input.roleStatus] ?? EXPECTED_PASS_ATTEMPTS_BY_ROLE.BACKUP;
  const attPerStart = input.recentPassAttempts / Math.max(input.recentStartsEst, 1);
  const recentAttPs = shrink(attPerStart, base, SHRINK_K.qbPassAtt, input.recentPassAttempts);
  const shareAdj = clamp(input.teamDropbackShare / DROPBACK_SHARE_STARTER, QB_SHARE_ADJ_CLAMP.lo, QB_SHARE_ADJ_CLAMP.hi);
  const b = PROJECTION_BOUNDS.expected_active_game_pass_attempts;
  return roundHalfAwayFromZero(clamp(recentAttPs * shareAdj, b.lo, b.hi), b.dp);
}

/** §2.7 QB per-start volume (designed rush / scrambles / goal-line). n = recent games. */
export function expectedPerStart(input: {
  readonly recentPerStart: number | null;
  readonly rolePrior: number;
  readonly recentGames: number;
  readonly lo: number;
  readonly hi: number;
  readonly dp: number;
}): number {
  const observed = input.recentPerStart ?? input.rolePrior;
  const v = shrink(observed, input.rolePrior, SHRINK_K.qbPassAtt / 3, input.recentGames);
  return roundHalfAwayFromZero(clamp(v, input.lo, input.hi), input.dp);
}
