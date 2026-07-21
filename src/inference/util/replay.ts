// Historical-replay helpers (SPEC §25.1 step 2, §18.2; constitution P25).
//
// The as-of cutoff drops every fact with `sourceTimestamp > asOf` so no future
// information can enter a computation. Pure functions over supplied timestamps; no
// wall clock is ever read.

import type { ReproducibilityId } from '@/inference/types';

/** Anything carrying an ISO source timestamp. */
export interface Timestamped {
  readonly sourceTimestamp: string;
}

/** True iff `sourceTimestamp` is on or before `asOf` (inclusive). */
export function withinAsOf(asOf: string, sourceTimestamp: string): boolean {
  const a = Date.parse(asOf);
  const s = Date.parse(sourceTimestamp);
  if (Number.isNaN(a) || Number.isNaN(s)) {
    throw new Error(`withinAsOf: unparseable timestamp (asOf=${asOf}, source=${sourceTimestamp})`);
  }
  return s <= a;
}

/**
 * Retain only facts available on or before `asOf`. Preserves input order; callers
 * apply their own deterministic sort afterwards (SPEC §25.2).
 */
export function enforceAsOf<T extends Timestamped>(items: readonly T[], asOf: string): T[] {
  return items.filter((item) => withinAsOf(asOf, item.sourceTimestamp));
}

/** Assemble the reproducibility identifier (SPEC §18.2 / §32.13, REGISTRY §1). */
export function buildReproducibilityId(input: {
  snapshotIds: readonly string[];
  normalizedInputChecksum: string;
  registryVersion: string;
  inferenceLayerVersion: string;
  asOf: string;
  engineVersion: string;
}): ReproducibilityId {
  return {
    snapshotIds: [...input.snapshotIds].sort(),
    normalizedInputChecksum: input.normalizedInputChecksum,
    registryVersion: input.registryVersion,
    inferenceLayerVersion: input.inferenceLayerVersion,
    asOf: input.asOf,
    engineVersion: input.engineVersion,
  };
}
