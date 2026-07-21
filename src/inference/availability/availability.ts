// Availability classification & probabilities (REGISTRY §7.1, §7.3, §7.4).
// Pure lookups over the registered Table A and engine-precedent maps.

import {
  ACTIVE_PROBABILITY_BY_INJURY,
  AVAIL_PROB,
  WORKLOAD_RAMP,
} from '@/inference/registry/family';
import type { RosterStatus } from '@/inference/features/types';

export type InjuryStatus =
  | 'HEALTHY'
  | 'QUESTIONABLE'
  | 'DOUBTFUL'
  | 'OUT'
  | 'IR'
  | 'PUP'
  | 'SUSPENDED'
  | 'UNKNOWN';

export type PracticeStatus = 'FULL' | 'LIMITED' | 'DNP' | 'UNKNOWN';

export interface AvailabilityState {
  readonly injuryStatus: InjuryStatus;
  readonly practiceStatus: PracticeStatus;
  readonly recentlyActivated: boolean;
  readonly freeAgent: boolean;
  readonly practiceSquad: boolean;
}

/**
 * Table A per-remaining-game availability probability (REGISTRY §7.1). Overlapping
 * precedence: SUSPENDED > IR > PUP > OUT > DOUBTFUL > QUESTIONABLE(+practice) >
 * recently-activated > HEALTHY; practice status modifies QUESTIONABLE only.
 * SUSPENDED here returns the unknown-length value (0.0); the known-length carve-out
 * lives in expected-games (REGISTRY §20.F6). FREE_AGENT/PRACTICE_SQUAD apply when no
 * active injury state dominates.
 */
export function availabilityProbability(state: AvailabilityState): number {
  switch (state.injuryStatus) {
    case 'SUSPENDED':
      return AVAIL_PROB.SUSPENDED_UNKNOWN;
    case 'IR':
      return AVAIL_PROB.IR;
    case 'PUP':
      return AVAIL_PROB.PUP;
    case 'OUT':
      return AVAIL_PROB.OUT;
    case 'DOUBTFUL':
      return AVAIL_PROB.DOUBTFUL;
    case 'QUESTIONABLE':
      return questionableProb(state.practiceStatus);
    case 'HEALTHY':
    case 'UNKNOWN':
      break;
  }
  if (state.recentlyActivated) return AVAIL_PROB.RECENTLY_ACTIVATED;
  if (state.freeAgent) return AVAIL_PROB.FREE_AGENT;
  if (state.practiceSquad) return AVAIL_PROB.PRACTICE_SQUAD;
  return AVAIL_PROB.HEALTHY;
}

function questionableProb(practice: PracticeStatus): number {
  switch (practice) {
    case 'FULL':
      return AVAIL_PROB.QUESTIONABLE_FULL;
    case 'LIMITED':
      return AVAIL_PROB.QUESTIONABLE_LIMITED;
    case 'DNP':
    case 'UNKNOWN':
      return AVAIL_PROB.QUESTIONABLE_DNP_UNKNOWN;
  }
}

/** §7.3 probability_active (QB field). Unknown status maps to HEALTHY's 0.99 basis. */
export function probabilityActive(injuryStatus: InjuryStatus): number {
  return ACTIVE_PROBABILITY_BY_INJURY[injuryStatus] ?? ACTIVE_PROBABILITY_BY_INJURY.HEALTHY;
}

/** §7.4 workload_ramp_factor (RB). TE defers to the engine (handled by the caller). */
export function workloadRampFactor(state: AvailabilityState): number {
  switch (state.injuryStatus) {
    case 'OUT':
    case 'IR':
    case 'PUP':
    case 'SUSPENDED':
      return WORKLOAD_RAMP.INACTIVE_LIST;
    case 'DOUBTFUL':
      return WORKLOAD_RAMP.DOUBTFUL;
    case 'QUESTIONABLE':
      switch (state.practiceStatus) {
        case 'FULL':
          return WORKLOAD_RAMP.QUESTIONABLE_FULL;
        case 'LIMITED':
          return WORKLOAD_RAMP.QUESTIONABLE_LIMITED;
        default:
          return WORKLOAD_RAMP.QUESTIONABLE_DNP_UNKNOWN;
      }
    case 'HEALTHY':
      return WORKLOAD_RAMP.HEALTHY;
    case 'UNKNOWN':
      return WORKLOAD_RAMP.UNKNOWN_STATUS;
  }
}

/** Availability probability for a teammate known only by roster status (§4.2 health). */
export function rosterStatusAvailProb(status: RosterStatus): number {
  switch (status) {
    case 'ACTIVE':
      return AVAIL_PROB.HEALTHY;
    case 'PRACTICE_SQUAD':
      return AVAIL_PROB.PRACTICE_SQUAD;
    case 'IR':
      return AVAIL_PROB.IR;
    case 'PUP':
    case 'NFI':
    case 'RESERVE':
      return AVAIL_PROB.PUP;
    case 'SUSPENDED':
      return AVAIL_PROB.SUSPENDED_UNKNOWN;
    case 'FREE_AGENT':
      return AVAIL_PROB.FREE_AGENT;
  }
}
