// Readiness-integration interfaces (SPEC §21, REGISTRY §12 / §20.F3).
//
// Phase 1 provides ONLY the interfaces and the pure emission-decision table that a
// later phase will use to turn inferred fields into a supplement the existing
// readiness layer consumes. It does NOT change readiness behaviour: the existing
// `assessReadiness`/`mergeSupplements` are re-exported unchanged and never modified.

import type { InferenceStatus } from '@/inference/types';
import type {
  EngineReadiness,
  MetricsSupplements,
  ReadinessSummary,
} from '@/pipeline/readiness/engineReadiness';

// `MetricsSupplements` is re-exported from `@/inference/supplement/merge` (the
// supplement module) to avoid a duplicate star re-export at the package root.
export type { EngineReadiness, ReadinessSummary };

/**
 * Field kind for the emission matrix (REGISTRY §20.F3):
 *  - `nullable`           : nullable numeric/string engine input.
 *  - `nonNullableNumeric` : non-nullable numeric/string (blocking) input.
 *  - `enumNeutral`        : non-nullable enum with an authorized neutral member.
 *  - `boolDefault`        : boolean with an authorized safe default.
 */
export type FieldKind = 'nullable' | 'nonNullableNumeric' | 'enumNeutral' | 'boolDefault';

/** How a field is emitted into the supplement (REGISTRY §20.F3). */
export type EmissionDecision = 'present-value' | 'present-null' | 'omit';

/**
 * The binding status × field-kind emission matrix (REGISTRY §20.F3). Pure lookup;
 * no inference logic. `present-value` for kinds c/d under the bottom three statuses
 * means "emit the authorized neutral member/default" (the caller supplies it).
 */
export function emissionDecision(status: InferenceStatus, kind: FieldKind): EmissionDecision {
  if (status === 'AVAILABLE' || status === 'LOW_CONFIDENCE') {
    return 'present-value';
  }
  // INSUFFICIENT_DATA | UNAVAILABLE | NOT_APPLICABLE
  if (kind === 'nullable') return 'present-null';
  if (kind === 'nonNullableNumeric') return 'omit';
  // enumNeutral | boolDefault → the authorized neutral member/default
  return 'present-value';
}

/**
 * The inputs a future phase will assemble to drive readiness for one player. The
 * AIL supplement is merged UNDER the facts supplement (facts win — REGISTRY §13.2),
 * then handed to the existing `assessReadiness`. Declared here as the integration
 * contract; the assembly itself is deferred.
 */
export interface AilReadinessContribution {
  readonly ailSupplement: MetricsSupplements;
  readonly factsSupplement: MetricsSupplements;
  readonly asOf: string;
}
