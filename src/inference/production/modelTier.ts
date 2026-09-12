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
export const ACCESSIBLE_POSITIONS: readonly SupportedPosition[] = ['RB', 'TE', 'WR'];

export function isAccessiblePosition(position: SupportedPosition): position is 'RB' | 'TE' | 'WR' {
  return position === 'RB' || position === 'TE' || position === 'WR';
}

/**
 * The premium evidence the WR FULL engine needs before it is running as the model it IS.
 *
 * WR is the one position where readiness passing is not the same question as the full model
 * being genuinely satisfied, because WR alone has an approved PROXY LADDER for career routes
 * (REGISTRY §8.1 rungs 2/3). The ladder lets readiness pass on an estimate, so the engine runs
 * — but it runs with a route participation of 0.5, a targets-per-route-run of 0.18, a
 * reference-median expectation and a catch rate over expected of exactly 0.0 for every receiver
 * in the league, because nothing else supplies those four inputs. Components built on identical
 * constants cannot order players, and the engine's own confidence says so: every WR it valued
 * came out at or below 10.
 *
 * So the gate is not "did the engine run" but "was the engine given the evidence that
 * distinguishes it from the accessible model". These four fields are that evidence:
 *
 *   career_routes                       the exposure denominator for every per-route rate
 *   targets_per_route_run               target earning per opportunity — the engine's core signal
 *   expected_fantasy_points_per_target  target quality
 *   catch_rate_over_expected            hands against expectation
 *
 * PROVIDER-NEUTRAL BY CONSTRUCTION. These are the engine's own declared input names. Any source
 * that fills them — a charting vendor, a future licensed feed, a manual load — satisfies the
 * gate, and no vendor's field names appear here or anywhere in the model contract. Nothing about
 * this gate needs to change to adopt one.
 */
export const WR_FULL_REQUIRED_EVIDENCE: readonly string[] = [
  'career_routes',
  'targets_per_route_run',
  'expected_fantasy_points_per_target',
  'catch_rate_over_expected',
];

/** Provenances that count as REAL evidence rather than an estimate standing in for it. */
const DIRECT_PROVENANCES: readonly string[] = ['DIRECT', 'DERIVED'];

/**
 * True when every field in `WR_FULL_REQUIRED_EVIDENCE` was genuinely supplied.
 *
 * A field counts when it is an observed FACT (facts are measurements by definition) or when the
 * inference layer emitted it with DIRECT or DERIVED provenance. A PROXY or MODEL_ESTIMATE does
 * NOT count — that is precisely the case this gate exists to catch, and admitting it would let a
 * capped estimate keep the FULL badge on a valuation built from constants.
 *
 * The rule reads only provenance and presence. It cannot consult a player's name, his market
 * rank, or any hand-picked list, because it is not given any of those.
 */
export function wrPremiumEvidenceSatisfied(args: {
  readonly supplement: Readonly<Record<string, unknown>>;
  readonly factKeys: readonly string[];
  readonly provenanceByField: Readonly<Record<string, string | null>>;
}): boolean {
  const facts = new Set(args.factKeys);
  return WR_FULL_REQUIRED_EVIDENCE.every((field) => {
    if (facts.has(field)) return args.supplement[field] !== null && args.supplement[field] !== undefined;
    const value = args.supplement[field];
    if (value === null || value === undefined) return false;
    const provenance = args.provenanceByField[field] ?? null;
    return provenance !== null && DIRECT_PROVENANCES.includes(provenance);
  });
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
  /**
   * WR only — whether the premium evidence that makes the FULL engine itself was supplied.
   * `true` for every other position, which have no proxy ladder and so cannot run on estimates.
   */
  readonly premiumEvidenceSatisfied?: boolean;
}): TierDecision {
  // A full model that ran on genuinely supplied evidence is the answer, and it is never
  // weakened. A WR full model that ran only because a capped route ESTIMATE let readiness pass
  // is a different matter: it is the premium engine without the premium inputs, so it is
  // deliberately stood down in favour of a model whose every input was observed. The badge the
  // user sees then reports the model that actually produced the number.
  const evidenceSatisfied = args.premiumEvidenceSatisfied ?? true;
  if (args.fullModelRan && evidenceSatisfied) {
    return { tier: 'FULL', accessible: null, notAttemptedReason: null };
  }
  if (!isAccessiblePosition(args.position)) {
    return {
      tier: 'INSUFFICIENT',
      accessible: null,
      notAttemptedReason: `no accessible-data model exists for ${args.position}`,
    };
  }
  // The premium-input check applies to a full model that was BLOCKED. A WR full model that ran
  // but was stood down for want of real route evidence has an empty blocker set by definition,
  // and must not be failed by a test about blockers.
  if (!args.fullModelRan && !blockedOnlyByPremiumInputs(args.readinessMissing)) {
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
