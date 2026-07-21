// Automated Inference Layer — public entry surface.
//
// PHASE 1 (foundation & core infrastructure) is implemented: types, utilities,
// registry + canonical environment reference, the confidence aggregation framework,
// and the merge/ownership + readiness-integration frameworks.
//
// The football INFERENCE (projections, roles, competition, roster security,
// environment scoring, availability, D1 routes, D2 QB starts, explanation
// generation, supplement production, player scoring) is deferred to later phases.
// `runInference` below is the reserved orchestrator boundary; it throws until a
// later phase implements it.

export * from './types';
export * from './util';
export * from './registry';
export * from './confidence';
export * from './supplement';
export * from './readiness/integration';

// Phase 2A — automatically inferable facts & classification families.
export * from './features';
export * from './roles';
export * from './competition';
export * from './security';
export * from './environment';
export * from './availability';
export * from './result';

import type { InferencePlayerReport, ReproducibilityId, SupportedPosition } from './types';

/** Reserved orchestrator input (SPEC §25.1 / §32.2). Shape only in Phase 1. */
export interface InferenceRunInput {
  readonly asOf: string;
  readonly snapshotIds: readonly string[];
  readonly positions?: readonly SupportedPosition[];
}

/** Reserved orchestrator output (SPEC §25.1 step 13). Shape only in Phase 1. */
export interface InferenceRun {
  readonly reproducibility: ReproducibilityId;
  readonly reports: readonly InferencePlayerReport[];
}

/**
 * Phase-2 boundary. The Phase-1 deliverable is infrastructure only; the inference
 * pipeline (SPEC §25.1 steps 4–13) is not implemented here. This stub marks the
 * boundary explicitly and fails loudly rather than returning a placeholder result.
 */
export function runInference(input: InferenceRunInput): InferenceRun {
  void input;
  throw new Error(
    'AutomatedInferenceLayer.runInference is not implemented in Phase 1 (foundation only). ' +
      'Inference models are delivered in a later phase.',
  );
}
