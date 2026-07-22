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

// Phase 2B — projections, D1/D2, explanations, complete confidence.
export * from './projections';
export * from './d1';
export * from './d2';
export * from './explanations';

// Phase 3 — production integration (final emission, merge, readiness, engine
// invocation, engine-confidence, serialization) + the production runInference().
export * from './production';
