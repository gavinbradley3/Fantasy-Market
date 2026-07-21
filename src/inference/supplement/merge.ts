// Supplement merge framework (REGISTRY §13.2).
//
// Precedence rule: observed FACTS win over AIL ESTIMATES for any dual-owned field.
// This is realized with the repository's existing overlay-wins merge semantics
// (`pipeline/readiness/engineReadiness.mergeSupplements(base, overlay)` — overlay
// wins), by placing the AIL supplement as BASE and the facts supplement as OVERLAY.
//
// Phase 1 provides the generic, pure merge primitive and the binding call shape. It
// does NOT produce supplement values (that is inference generation, deferred). The
// existing readiness merge is imported and re-exported unchanged; its behaviour is
// not modified.

import { mergeSupplements, type MetricsSupplements } from '@/pipeline/readiness/engineReadiness';

export { mergeSupplements };
export type { MetricsSupplements };

/**
 * Generic per-field precedence merge (overlay wins) over two flat records. Mirrors
 * the field-level semantics of `mergeSupplements` for a single position/player and
 * is used by tests and future supplement wiring. Pure; inputs are not mutated.
 */
export function mergeByPrecedence<T extends object>(
  base: Partial<T>,
  overlay: Partial<T>,
): Partial<T> {
  return { ...base, ...overlay };
}

/**
 * Binding merge order for AIL + facts (REGISTRY §13.2): AIL is base, facts are
 * overlay, so facts override AIL estimates for stats-owned fields while AIL-only
 * fields (projections/context) pass through untouched.
 */
export function mergeFactsOverAil(
  ailSupplement: MetricsSupplements,
  factsSupplement: MetricsSupplements,
): MetricsSupplements {
  return mergeSupplements(ailSupplement, factsSupplement);
}
