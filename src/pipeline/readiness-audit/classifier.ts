// Field-availability classifier for the readiness-frontier audit.
//
// Every blocking field a readiness assessment can report is classified by HOW it
// could realistically be supplied. This is what turns raw stage gap-counts into
// an honest strategy: a `context`-stage field that is actually an authored
// judgment is very different from one derivable from free team stats, and a
// `stats`-stage field that is a route count (paid, post-2023) is different from a
// counting stat (free).
//
// Classes are judgment calls grounded in the prior stages' audits (weekly-stat,
// snap, participation) and the model specs; they are documented in
// docs/READINESS_FRONTIER_AUDIT.md and are data, not engine behavior.

import type { SupportedPosition } from '@/pipeline/types';

export type AvailabilityClass =
  | 'DIRECT_FREE' // observable now from a free source (metadata, injury/practice, depth chart)
  | 'DERIVABLE_FREE' // computable from free data (counting stats, team-context rates, projections model)
  | 'AUTHORED_FACT' // a real fact needing manual entry (role classification, flags)
  | 'AUTHORED_ESTIMATE' // a subjective 0–1 judgment (contract security, competition pressure)
  | 'PAID_ONLY' // no free source (post-2023 routes, official starts)
  | 'SPEC_CHANGE_REQUIRED' // only satisfiable by revising the engine contract
  | 'UNKNOWN';

export type ReadinessStage = 'metadata' | 'stats' | 'projections' | 'context';

export interface FieldClassification {
  readonly availability: AvailabilityClass;
  /** Achievable from free data with no spec change (DIRECT_FREE/DERIVABLE_FREE). */
  readonly freeSolvable: boolean;
  /** A free proxy exists but only if the engine contract is revised to accept it. */
  readonly specFallback: boolean;
  readonly note?: string;
}

// Route COUNT and official-start fields: free per-player route feeds ended 2023
// (WR §175); official starts have no free feed. Both have a possible spec
// fallback (a snap-derived proxy / a games-played proxy) but are PAID_ONLY today.
const ROUTE_COUNT_FIELDS = new Set(['career_routes']);
const START_FIELDS = new Set(['career_starts', 'recent_starts']);

// Context fields that are subjective 0–1 judgments.
const AUTHORED_ESTIMATE_FIELDS = new Set([
  'contract_security',
  'competition_pressure',
  'organizational_commitment',
]);

// Context fields freely observable now (injury/availability, depth chart, team).
const CONTEXT_DIRECT_FREE = new Set(['practice_status', 'depth_chart_role', 'depth_chart_status']);

// Context fields derivable from free team data.
const CONTEXT_DERIVABLE_FREE = new Set([
  'qb_environment_score',
  'offensive_environment_score',
  'protection_context_score',
  'team_points_per_drive',
  'team_red_zone_trips_per_game',
]);

function ctx(av: AvailabilityClass, note?: string): FieldClassification {
  const freeSolvable = av === 'DIRECT_FREE' || av === 'DERIVABLE_FREE';
  return { availability: av, freeSolvable, specFallback: false, note };
}

export function classifyField(
  position: SupportedPosition,
  stage: ReadinessStage,
  field: string,
): FieldClassification {
  void position;
  if (stage === 'metadata') return ctx('DIRECT_FREE');

  if (stage === 'stats') {
    if (ROUTE_COUNT_FIELDS.has(field)) {
      return {
        availability: 'PAID_ONLY',
        freeSolvable: false,
        specFallback: true,
        note: 'per-player route counts ended 2023 (WR §175); spec fallback: snap-derived proxy count',
      };
    }
    if (START_FIELDS.has(field)) {
      return {
        availability: 'PAID_ONLY',
        freeSolvable: false,
        specFallback: true,
        note: 'no free official-starts feed; spec fallback: games-played / attempts-threshold proxy',
      };
    }
    return ctx('DERIVABLE_FREE', 'free nflverse weekly counting/efficiency');
  }

  if (stage === 'projections') {
    return ctx('DERIVABLE_FREE', 'buildable from free data via a projection model');
  }

  // context
  if (AUTHORED_ESTIMATE_FIELDS.has(field)) return ctx('AUTHORED_ESTIMATE');
  if (CONTEXT_DIRECT_FREE.has(field)) return ctx('DIRECT_FREE', 'freely observable (injury/depth-chart feeds)');
  if (CONTEXT_DERIVABLE_FREE.has(field)) return ctx('DERIVABLE_FREE', 'derivable from free team stats');
  return ctx('AUTHORED_FACT', 'observable but needs manual authoring (role/flags)');
}
