// PlayerTicker durable persistence (Phase 6) — public surface. NODE-ONLY.
//
// This barrel transitively imports `node:sqlite` and MUST NOT be imported by browser
// code. It persists the artifacts the verified Phase 4/5 pipeline produced and gates
// visibility behind an explicit publication + a singleton current pointer:
//
//   Phase 5 refresh result → persistRefreshResult() → store.publish() →
//   getCurrentPublication() → replay of persisted raw envelopes (no network)
//
// It never recomputes identities, normalizes provider data, or reruns valuation formulas.

export * from './types';
export * from './errors';
export { PersistenceStore } from './store';
export type { NewNormalizedInputMeta, NewInferenceOutput, PublishBoardParams, NowFn } from './store';
export {
  persistRefreshResult,
  type PersistRefreshParams,
  type PersistRefreshOutcome,
  type PersistedInferenceRef,
} from './persistRefreshResult';
export { migrate, LATEST_MIGRATION_VERSION } from './migrations';
export { openDatabase, transaction, type Database } from './sqlite/db';
export {
  recomputeSnapshotId,
  verifyRawEnvelopeIntegrity,
  verifySnapshotIntegrity,
  verifyNormalizedInputIntegrity,
  verifyOutputIntegrity,
  computeBoardIdentity,
  orderBoardEntries,
  type BoardEntryInput,
  type BoardIdentity,
} from './canonical';
