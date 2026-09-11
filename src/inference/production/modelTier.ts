// Model-tier selection (RB/TE accessible-data fallback).
//
// THE RULE
// The full model is always tried first, and it is never weakened to make it run. The
// accessible tier is attempted ONLY when the full model was blocked, and only when every
// field that blocked it is a PREMIUM input — one no free, legally usable source publishes.
// If the full model was blocked by something the pipeline ought to have supplied, that is a
// pipeline defect and must surface as NOT_READY rather than be quietly downgraded to a
// reduced-input valuation.
//
// This is what keeps the tier system honest in both directions: a reduced valuation can never
// masquerade as a full one (the tier is published per player), and a genuine ingestion
// regression can never hide behind the fallback.

import { evaluateAccessible } from '@/accessible';
import type { AccessibleAvailability, AccessibleInput, AccessibleResult } from '@/accessible';
import type { ObservedProduction } from '@/accessible/production';
import type { CanonicalPlayer } from '@/pipeline/types';
import { valueOf } from '@/pipeline/provenance';
import type { ModelTier } from '@/accessible';
import type { SupportedPosition } from '@/inference/types';

/**
 * Engine inputs the pipeline cannot supply for RB/TE, so their absence is not a pipeline fault.
 *
 * `career_routes` is the whole list for RB and TE today. Be precise about WHY, because the
 * obvious reading is wrong:
 *
 *   NOT because the underlying data stopped existing. nflverse still publishes the pass-play
 *   participation signal (`offense_players` + `time_to_throw` in the `pbp_participation`
 *   export) for seasons after 2023 — verified against the 2024 and 2025 exports, which carry
 *   it at the same ~43% of plays as 2023. PlayerTicker already consumes it: WR route exposure
 *   is estimated from exactly these columns (`@/inference/d1/routeExposure`, REGISTRY §8.1
 *   rungs 2/3), and the RB window proxy `rbRouteParticipationLast4` reads them too.
 *
 *   BUT because there is no APPROVED PROXY METHODOLOGY for turning per-play participation into
 *   the CAREER CUMULATIVE route count the frozen RB/TE engines take as `career_routes`. WR has
 *   a specified ladder for that conversion (with its own cap and penalty); RB and TE have none,
 *   so `computeCareerRoutes` reports UNAVAILABLE for them rather than inventing a number.
 *
 * So this is a modelling gap, not a data-availability gap, and closing it is a spec decision
 * (does a windowed participation proxy stand in for a career route total?) rather than an
 * ingestion change. Anything ELSE appearing in a blocker set means an ingestion problem.
 */
export const PREMIUM_ONLY_FIELDS: readonly string[] = ['career_routes'];

/** Positions the accessible tier serves. */
export const ACCESSIBLE_POSITIONS: readonly SupportedPosition[] = ['RB', 'TE'];

export function isAccessiblePosition(position: SupportedPosition): position is 'RB' | 'TE' {
  return position === 'RB' || position === 'TE';
}

/**
 * True when EVERY blocking field is premium-only. An empty blocker set returns false: a ready
 * player has no need of the fallback, and callers must not use this to bypass a full model
 * that actually ran.
 */
export function blockedOnlyByPremiumInputs(missing: readonly string[]): boolean {
  if (missing.length === 0) return false;
  return missing.every((f) => PREMIUM_ONLY_FIELDS.includes(f));
}

/** Map the canonical availability enum onto the accessible model's own. */
export function toAccessibleAvailability(
  status: CanonicalPlayer['status'],
  injuryDesignation: CanonicalPlayer['injury_designation'],
): AccessibleAvailability {
  if (!status.present) return 'UNKNOWN';
  switch (status.value) {
    case 'active':
      return 'HEALTHY';
    case 'suspended':
      return 'SUSPENDED';
    // 'inactive' carries two very different meanings in the provider's data: genuinely
    // inactive/out during a season, and simply not on an active roster (a free agent, a player
    // between contracts). Only an injury designation distinguishes them, so without one this
    // reports NOT_ROSTERED rather than claiming the player is injured.
    case 'inactive':
      return 'NOT_ROSTERED';
    case 'injured': {
      const d = (valueOf(injuryDesignation) ?? '').toLowerCase();
      if (d.includes('out')) return 'OUT';
      if (d.includes('doubt')) return 'DOUBTFUL';
      if (d.includes('quest')) return 'QUESTIONABLE';
      if (d.includes('ir')) return 'IR';
      if (d.includes('pup')) return 'PUP';
      return 'QUESTIONABLE';
    }
    default:
      return 'UNKNOWN';
  }
}

export interface TierDecision {
  readonly tier: ModelTier;
  readonly accessible: AccessibleResult | null;
  /** Why the accessible tier was not attempted, when it was not. */
  readonly notAttemptedReason: string | null;
}

/**
 * Decide the tier for one player.
 *
 * `fullModelRan` short-circuits to FULL — the accessible tier is a fallback, never a
 * competitor, and both are never computed for the same player.
 */
export function decideTier(args: {
  readonly position: SupportedPosition;
  readonly player: CanonicalPlayer;
  readonly asOf: string;
  readonly fullModelRan: boolean;
  readonly readinessMissing: readonly string[];
  readonly production: ObservedProduction | undefined;
  readonly expectedGamesRemaining: number | null;
}): TierDecision {
  if (args.fullModelRan) {
    return { tier: 'FULL', accessible: null, notAttemptedReason: null };
  }
  if (!isAccessiblePosition(args.position)) {
    return {
      tier: 'INSUFFICIENT',
      accessible: null,
      notAttemptedReason: `no accessible-data model exists for ${args.position}`,
    };
  }
  if (!blockedOnlyByPremiumInputs(args.readinessMissing)) {
    // Deliberately NOT downgraded: something the pipeline should supply is missing.
    return {
      tier: 'INSUFFICIENT',
      accessible: null,
      notAttemptedReason:
        'the full model was blocked by inputs that are not premium-only, which indicates missing ' +
        'pipeline data rather than an unavailable licensed source',
    };
  }
  if (!args.production) {
    return {
      tier: 'INSUFFICIENT',
      accessible: null,
      notAttemptedReason: 'no observed regular-season production exists for this player at the as-of',
    };
  }

  const canonicalId = args.player.identity?.canonical_id ?? '';
  const input: AccessibleInput = {
    canonicalId,
    position: args.position,
    asOf: args.asOf,
    age: numberOrNull(valueOf(args.player.age)),
    draftRound: numberOrNull(valueOf(args.player.draft_round)),
    seasonsCompleted: numberOrNull(valueOf(args.player.nfl_seasons_completed)),
    production: args.production,
    expectedGamesRemaining: args.expectedGamesRemaining,
    availability: toAccessibleAvailability(args.player.status, args.player.injury_designation),
    team: stringOrNull(valueOf(args.player.team)),
    teamChanged: null,
  };

  const result = evaluateAccessible(input);
  return {
    tier: result.tier === 'ACCESSIBLE' ? 'ACCESSIBLE' : 'INSUFFICIENT',
    accessible: result,
    notAttemptedReason: null,
  };
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}
