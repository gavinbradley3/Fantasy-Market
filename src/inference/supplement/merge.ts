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
import type { SupportedPosition } from '@/inference/types';

export { mergeSupplements };
export type { MetricsSupplements };

/**
 * Canonical AIL-under-facts merge for a SINGLE player's flat supplement record
 * (Cold-audit m2). Routes through the repository's `mergeSupplements` so there is
 * exactly ONE merge contract: the flat records are wrapped as `MetricsSupplements`
 * under the player's position, merged (facts overlay AIL — facts win, AIL-only fields
 * survive, observed-null wins), then unwrapped. No second merge semantics is created.
 */
export function mergeFactsOverAilFlat(
  position: SupportedPosition,
  ailSupplement: Readonly<Record<string, unknown>>,
  factsSupplement: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const key = position.toLowerCase() as 'wr' | 'rb' | 'te' | 'qb';
  const wrap = (rec: Readonly<Record<string, unknown>>): MetricsSupplements =>
    ({ [key]: { __player__: { ...rec } } }) as unknown as MetricsSupplements;
  const merged = mergeFactsOverAil(wrap(ailSupplement), wrap(factsSupplement));
  const positionBucket = (merged as unknown as Record<string, Record<string, Record<string, unknown>>>)[key];
  return positionBucket.__player__ ?? {};
}

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
