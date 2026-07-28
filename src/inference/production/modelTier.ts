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
 * Engine inputs that no free, legally usable provider publishes, so their absence is a data
 * reality rather than a pipeline fault.
 *
 * `career_routes` is the whole list for RB and TE today: per-player route counts stopped being
 * freely published after 2023, and the frozen route model (`@/inference/d1/routeExposure`,
 * REGISTRY §8.1 rungs 4/5) correctly reports it UNAVAILABLE for these positions rather than
 * manufacturing one. Anything else appearing in a blocker set means an ingestion problem.
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
    case 'inactive':
      return 'OUT';
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
