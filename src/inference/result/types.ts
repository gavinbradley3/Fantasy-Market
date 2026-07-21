// Phase-2A intermediate result contract (Phase 2A requirement §9).
//
// A lean per-field result carrying only what Phase 2A produces. It deliberately
// omits the production-supplement envelope fields (effectiveFor, expiresAfter,
// inputsUsed, explanation) — those belong to later phases. It preserves enough for
// later phases to consume: value, status, provenance, confidence, evidence refs,
// limitations, source timestamps, as-of, and registry/model versions.

import { REGISTRY_VERSION } from '@/inference/registry/constants';
import { NULL_FIELD_CONFIDENCE } from '@/inference/registry/constants';
import { LIMITATION_CODES } from '@/inference/types';
import type {
  InferenceProvenance,
  InferenceStatus,
  LimitationCode,
} from '@/inference/types';

/** A minimal evidence reference (feature key + originating source timestamp). */
export interface EvidenceRef {
  readonly featureKey: string;
  readonly sourceTimestamp: string;
}

export interface IntermediateField<T> {
  readonly field: string;
  readonly value: T | null;
  readonly status: InferenceStatus;
  readonly provenance: InferenceProvenance | null;
  readonly confidence: number; // 0..1000
  readonly limitations: readonly LimitationCode[];
  readonly evidence: readonly EvidenceRef[];
  readonly asOf: string;
  readonly registryVersion: string;
  readonly modelId: string;
}

export interface FieldParams<T> {
  readonly field: string;
  readonly value: T | null;
  readonly status: InferenceStatus;
  readonly provenance: InferenceProvenance | null;
  readonly confidence: number;
  readonly modelId: string;
  readonly asOf: string;
  readonly limitations?: readonly LimitationCode[];
  readonly evidence?: readonly EvidenceRef[];
}

/** Construct an intermediate field, stamping the registry version. */
export function makeField<T>(params: FieldParams<T>): IntermediateField<T> {
  return {
    field: params.field,
    value: params.value,
    status: params.status,
    provenance: params.provenance,
    confidence: params.confidence,
    limitations: params.limitations ?? [],
    evidence: params.evidence ?? [],
    asOf: params.asOf,
    registryVersion: REGISTRY_VERSION,
    modelId: params.modelId,
  };
}

/**
 * A category-(c/d) neutral-member emission (REGISTRY §20.F3): present value =
 * neutral member, status LOW_CONFIDENCE, provenance MODEL_CLASSIFICATION,
 * confidence 400, limitation NEUTRAL_DEFAULT. Used when a role/flag classifier
 * fails its minimum-evidence gate.
 */
export function neutralField<T>(
  field: string,
  neutralValue: T,
  modelId: string,
  asOf: string,
  evidence?: readonly EvidenceRef[],
): IntermediateField<T> {
  return makeField({
    field,
    value: neutralValue,
    status: 'LOW_CONFIDENCE',
    provenance: 'MODEL_CLASSIFICATION',
    confidence: NULL_FIELD_CONFIDENCE.NEUTRAL_DEFAULT,
    modelId,
    asOf,
    limitations: [LIMITATION_CODES.NEUTRAL_DEFAULT],
    evidence,
  });
}
