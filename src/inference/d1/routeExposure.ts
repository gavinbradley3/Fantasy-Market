// D1 — effective route exposure (REGISTRY §8). Pure. Enforces every §8 guardrail:
// WR 0.97 is WR-only, RB 0.42 is RB-only (window field), TE never computes routes,
// estimated career_routes is capped at the tier ceiling (WR 299 / TE 399) so an
// estimate can only ADD uncertainty, and the route-tier penalty uses the CAPPED value.

import { D1, ROUTE_TIER_PENALTY } from '@/inference/registry/family';
import { clamp, roundHalfAwayFromZero } from '@/inference/util/numeric';
import { LIMITATION_CODES, type LimitationCode } from '@/inference/types';

export type RoutePosition = 'WR' | 'RB' | 'TE';

export interface CareerRoutesInput {
  readonly position: RoutePosition;
  /** Rung 1 — direct charted career routes (licensed source), or null. */
  readonly chartedCareerRoutes: number | null;
  /** WR only — rung 2 covered (≤2023) qualifying pass-play participations, per game. */
  readonly wrCoveredPassPlayParticipations?: readonly number[];
  /** WR only — rung 3 uncovered/post-2023 pbp pass-play snaps, per game. */
  readonly wrUncoveredPassPlaySnaps?: readonly number[];
}

export interface CareerRoutesResult {
  /** value emitted to the engine (capped for estimates); null → UNAVAILABLE (omit). */
  readonly emittedValue: number | null;
  /** uncapped estimate retained in the sidecar only (§8.4); null when not estimated. */
  readonly uncappedEstimate: number | null;
  readonly provenance: 'DERIVED' | 'PROXY' | 'MODEL_ESTIMATE' | null;
  readonly status: 'AVAILABLE' | 'UNAVAILABLE';
  readonly limitations: readonly LimitationCode[];
  /** §8.2 ROUTE_PROXY_PENALTY (120) for PROXY/MODEL_ESTIMATE, else 0. */
  readonly routeProxyPenalty: number;
  /** §8.2 consuming-engine tier penalty, computed on the CAPPED emitted value. */
  readonly tierPenalty: number;
}

/** §8.2 consuming-engine career-route tier penalty (WR/TE), on the capped value. */
export function routeTierPenalty(position: 'WR' | 'TE', value: number): number {
  for (const tier of ROUTE_TIER_PENALTY[position]) {
    if (value < tier.maxExclusive) return tier.penalty;
  }
  return 0;
}

export function computeCareerRoutes(input: CareerRoutesInput): CareerRoutesResult {
  // Rung 1 — direct charted routes → DERIVED (only rung allowed to exceed the ceiling).
  if (input.chartedCareerRoutes !== null) {
    const v = Math.max(0, Math.trunc(input.chartedCareerRoutes));
    return {
      emittedValue: v,
      uncappedEstimate: null,
      provenance: 'DERIVED',
      status: 'AVAILABLE',
      limitations: [],
      routeProxyPenalty: 0,
      tierPenalty: input.position === 'RB' ? 0 : routeTierPenalty(input.position, v),
    };
  }

  // RB and TE: career_routes is UNAVAILABLE unless charted (§8.1 rungs 4/5).
  if (input.position !== 'WR') {
    return unavailable();
  }

  // WR rungs 2/3 — covered participations (×0.97) + uncovered pbp snaps (×0.97).
  const covered = input.wrCoveredPassPlayParticipations ?? [];
  const uncovered = input.wrUncoveredPassPlaySnaps ?? [];
  const coveredGames = covered.length + uncovered.length;
  if (coveredGames < D1.minCoveredGames) {
    return unavailable();
  }
  const coveredRoutes = covered.reduce((s, p) => s + p * D1.wrRouteFactor, 0);
  const uncoveredRoutes = uncovered.reduce((s, p) => s + p * D1.wrRouteFactor, 0);
  const uncapped = Math.max(0, Math.round(coveredRoutes + uncoveredRoutes));
  const provenance: 'PROXY' | 'MODEL_ESTIMATE' = uncovered.length > 0 ? 'MODEL_ESTIMATE' : 'PROXY';
  const emitted = Math.min(uncapped, D1.tierCeiling.WR); // §8.4 cap
  return {
    emittedValue: emitted,
    uncappedEstimate: uncapped,
    provenance,
    status: 'AVAILABLE',
    limitations: [LIMITATION_CODES.ROUTE_PROXY],
    routeProxyPenalty: D1.routeProxyPenalty,
    tierPenalty: routeTierPenalty('WR', emitted), // §20.F7 — capped value
  };
}

/**
 * §8.1 rung 4 — RB `route_participation_last4` window proxy (RB-only). Never uses the
 * WR 0.97 factor. Returns 4dp share, or null when inputs are missing/zero-denominator.
 */
export function rbRouteParticipationLast4(
  rbPassPlaySnaps: number | null,
  teamDropbacks: number | null,
): number | null {
  if (rbPassPlaySnaps === null || teamDropbacks === null || teamDropbacks <= 0) return null;
  return roundHalfAwayFromZero(clamp(D1.rbSnapRouteFactor * (rbPassPlaySnaps / teamDropbacks), 0, 1), 4);
}

function unavailable(): CareerRoutesResult {
  return {
    emittedValue: null,
    uncappedEstimate: null,
    provenance: null,
    status: 'UNAVAILABLE',
    limitations: [],
    routeProxyPenalty: 0,
    tierPenalty: 0,
  };
}
