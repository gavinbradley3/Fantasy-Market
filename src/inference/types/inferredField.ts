// Automated Inference Layer — the canonical field-level output structure and the
// run/serialization/replay envelopes.
//
// SPEC §5.1 (InferredField), §18.2 (reproducibility id), §16/§20 (sidecar).
// Phase 1 defines these structures; nothing here PRODUCES a value (that is
// inference logic, deferred).

import type { InferenceStatus } from './status';
import type { InferenceProvenance } from './provenance';
import type { InputEvidence, ExplanationFragment } from './evidence';
import type { LimitationCode } from './limitations';

/** SPEC §5.1 — the binding field-level output. `value: null` iff not estimated. */
export interface InferredField<T> {
  readonly field: string;
  readonly value: T | null;
  readonly status: InferenceStatus;
  /** SPEC §5.1: null iff value is null. */
  readonly provenance: InferenceProvenance | null;
  /** Integer 0..1000 (SPEC §5.3 / §15). */
  readonly confidence: number;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly asOf: string;
  readonly effectiveFor: string;
  readonly expiresAfter: string;
  readonly inputsUsed: readonly InputEvidence[];
  readonly assumptions: readonly string[];
  readonly limitations: readonly LimitationCode[];
  readonly explanation: readonly ExplanationFragment[];
}

/**
 * SPEC §18.2 / §32.13 — the tuple that reproduces a production output
 * byte-for-byte. REGISTRY §1 adds `registryVersion`.
 */
export interface ReproducibilityId {
  readonly snapshotIds: readonly string[];
  readonly normalizedInputChecksum: string;
  readonly registryVersion: string;
  readonly inferenceLayerVersion: string;
  readonly asOf: string;
  readonly engineVersion: string;
}

export type SupportedPosition = 'QB' | 'RB' | 'WR' | 'TE';

/**
 * SPEC §16 / §20 — the per-player provenance/confidence sidecar. Phase 1 fixes the
 * shape; the composer that fills it is deferred.
 */
export interface InferenceSidecar {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  /** Field key → provenance actually used (null iff value null). */
  readonly provenanceByField: Readonly<Record<string, InferenceProvenance | null>>;
  /** Field key → field confidence (0..1000). */
  readonly confidenceByField: Readonly<Record<string, number>>;
  /** Fraction of required engine inputs that were DIRECT/DERIVED (0..1). */
  readonly verifiedShare: number;
  /** Aggregate player confidence (0..1000). */
  readonly playerConfidence: number;
}

/** Honesty state (SPEC §20). Declared here; assignment is deferred to reporting. */
export type HonestyState =
  | 'VERIFIED'
  | 'ESTIMATED_HIGH_CONFIDENCE'
  | 'ESTIMATED'
  | 'LIMITED'
  | 'UNAVAILABLE';

/**
 * The serialized per-player envelope (SPEC §15.1 top-level key order). Phase 1
 * defines the shape; serialization ordering helpers live in `util/serialization`.
 */
export interface InferencePlayerReport {
  readonly schema_version: string;
  readonly registry_version: string;
  readonly model_version: string;
  readonly player_id: string;
  readonly position: SupportedPosition;
  readonly as_of: string;
  readonly status: 'OK' | 'PARTIAL';
  readonly readiness: string;
  readonly honesty_state: HonestyState;
  readonly fields: readonly InferredField<unknown>[];
  readonly sidecar: InferenceSidecar;
}
