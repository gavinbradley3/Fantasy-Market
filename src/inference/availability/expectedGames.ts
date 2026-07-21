// Expected games remaining (REGISTRY §7.2 + §20.F6 suspension carve-out). Pure.

import { AVAIL_PROB, EXPECTED_GAMES } from '@/inference/registry/family';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';

export interface SuspensionInfo {
  readonly suspended: boolean;
  /** known remaining suspended games; undefined when suspended but length unknown. */
  readonly remainingSuspendedGames?: number;
}

export interface ExpectedGamesInput {
  readonly gamesLeft: number;
  /** Table A availability probability for the player's (non-suspension) state. */
  readonly availProb: number;
  /** games_missed_rate over the last 16 team games (0 if no history). */
  readonly missedRateLast16: number;
  readonly suspension?: SuspensionInfo;
}

export interface ExpectedGamesResult {
  readonly expectedGamesRemaining: number;
  readonly durability: number;
  /** true when the unknown-length suspension rule forced 0.0 (§20.F6). */
  readonly suspensionUnknownLength: boolean;
}

/** §7.2 durability = clamp(1 − 0.5·missedRate, 0.85, 1.0). */
export function durabilityAdjustment(missedRateLast16: number): number {
  return clamp(
    1 - EXPECTED_GAMES.durabilityCoef * missedRateLast16,
    EXPECTED_GAMES.durabilityMin,
    EXPECTED_GAMES.durabilityMax,
  );
}

export function expectedGamesRemaining(input: ExpectedGamesInput): ExpectedGamesResult {
  const durability = durabilityAdjustment(input.missedRateLast16);
  const gamesLeft = Math.max(input.gamesLeft, 0);

  // §20.F6 suspension carve-out.
  if (input.suspension?.suspended) {
    if (input.suspension.remainingSuspendedGames === undefined) {
      return { expectedGamesRemaining: 0.0, durability, suspensionUnknownLength: true };
    }
    const remainingSuspended = Math.min(input.suspension.remainingSuspendedGames, gamesLeft);
    const playable = Math.max(gamesLeft - remainingSuspended, 0);
    const egr = roundHalfAwayFromZero(
      clamp(playable * AVAIL_PROB.SUSPENDED_KNOWN_REINSTATED * durability, 0, gamesLeft),
      1,
    );
    return { expectedGamesRemaining: egr, durability, suspensionUnknownLength: false };
  }

  // §7.2 standard uniform case.
  const egr = roundHalfAwayFromZero(
    clamp(gamesLeft * input.availProb * durability, 0, gamesLeft),
    1,
  );
  return { expectedGamesRemaining: egr, durability, suspensionUnknownLength: false };
}
