// Field ownership & precedence framework (REGISTRY §13).
//
// Determines, for a given position + engine-input field, which producer is
// responsible and how a dual-owned field resolves. This reuses the canonical
// field→stage map and metadata key lists from the existing readiness layer
// (`pipeline/readiness/metrics.ts`) rather than re-declaring them, so ownership can
// never drift from the pipeline. It changes no readiness behaviour (read-only use).
//
// Phase 1 provides the classification + a generic precedence merge. It does NOT
// produce any supplement values.

import {
  QB_METADATA_KEYS,
  RB_METADATA_KEYS,
  TE_METADATA_KEYS,
  WR_METADATA_KEYS,
  qbFieldStage,
  rbFieldStage,
  teFieldStage,
  wrFieldStage,
} from '@/pipeline/readiness/metrics';
import type { SupportedPosition } from '@/inference/types';

/**
 * Who supplies a field's value:
 *  - `metadata` : the canonical metadata pipeline (identity/team/age/status).
 *  - `facts`    : observed source facts (stats/snaps/participation stages).
 *  - `ail`      : the Automated Inference Layer (projections & context).
 *  - `engine`   : left to an engine-owned fallback (neither facts nor AIL supply).
 */
export type SupplementSource = 'metadata' | 'facts' | 'ail' | 'engine';

/**
 * REGISTRY §13.1 precedence, highest wins. Documentation of the layering used by
 * the merge below; facts (1–5) always beat AIL estimates (6). Engine-owned
 * fallbacks (7) apply inside the frozen engine, never at merge time.
 */
export const PRECEDENCE_ORDER: readonly SupplementSource[] = ['metadata', 'facts', 'ail', 'engine'];

// Engine-owned fields the AIL must NOT populate (REGISTRY §7.4 / §8.1): the TE
// route-participation windows are resolved by the frozen TE engine's own snap
// proxy, so the AIL leaves them absent.
const ENGINE_OWNED: Partial<Record<SupportedPosition, ReadonlySet<string>>> = {
  TE: new Set(['route_participation_last4', 'route_participation_last8']),
};

const METADATA_KEYS: Record<SupportedPosition, readonly string[]> = {
  WR: WR_METADATA_KEYS,
  RB: RB_METADATA_KEYS,
  TE: TE_METADATA_KEYS,
  QB: QB_METADATA_KEYS,
};

const STAGE_OF: Record<SupportedPosition, (field: string) => 'stats' | 'projections' | 'context'> = {
  WR: wrFieldStage,
  RB: rbFieldStage,
  TE: teFieldStage,
  QB: qbFieldStage,
};

/**
 * Classify the responsible source for a field (REGISTRY §13.3). Metadata keys →
 * `metadata`; engine-owned windows → `engine`; `stats`-stage fields → `facts`;
 * `projections`/`context`-stage fields → `ail`. When both a fact and an AIL
 * estimate exist for a field classified `facts` (e.g. charted `career_routes`), the
 * fact wins at merge time (see `mergeFactsOverAil`).
 */
export function fieldSource(position: SupportedPosition, field: string): SupplementSource {
  if (METADATA_KEYS[position].includes(field)) return 'metadata';
  if (ENGINE_OWNED[position]?.has(field)) return 'engine';
  const stage = STAGE_OF[position](field);
  return stage === 'stats' ? 'facts' : 'ail';
}
