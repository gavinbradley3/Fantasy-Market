// Production serialization (Phase 3 §6; REGISTRY §15; Cold-audit M2/M3).
// Deterministic, byte-stable.
//
//  • normalizedInputChecksum (M2) — digest of the canonical NORMALIZED INPUT, never
//    of the merged output; excludes all generated output.
//  • the serialized envelope (M3) — the COMPLETE production result: top-level status,
//    versions, both checksums' inputs, readiness + reasons, engine status/result,
//    confidences, honesty, complete InferredField structures, diagnostics, sidecar,
//    facts, ail + merged supplements.
//  • outputChecksum (M2/M3) — digest of the complete serialized envelope.
//
// Field values within nested data records are key-sorted so the bytes never depend on
// input construction order; the `fields` array is in engine-interface declaration
// order (§20.F8); arrays are otherwise preserved (semantic order).

import { digest, sortKeysDeep, stableStringify } from '@/inference/util/checksum';
import type { ReproducibilityId, SupportedPosition } from '@/inference/types';
import type { IntermediateField } from '@/inference/result/types';
import { declarationOrder, SUPPLEMENT_SPEC } from './fieldKinds';
import type { SerializedInferredField } from './types';

/**
 * Order the merged supplement's present fields by the position's declaration order
 * (supplement keys only; metadata excluded from `fields`). A key present in the
 * merged record but absent from the spec is appended in ascending order (defensive).
 */
export function orderSupplementFields(
  position: SupportedPosition,
  merged: Readonly<Record<string, unknown>>,
): { field: string; value: unknown }[] {
  const spec = SUPPLEMENT_SPEC[position];
  const specOrder = Object.keys(spec).filter((k) => k in merged);
  const extras = Object.keys(merged)
    .filter((k) => !(k in spec))
    .sort();
  return [...specOrder, ...extras].map((field) => ({ field, value: merged[field] }));
}

/**
 * Build the ordered, complete InferredField structures for the emitted supplement
 * fields (Cold-audit M3): declaration order; each carries value/status/provenance/
 * confidence/limitations/evidence/asOf/registryVersion/modelId. A supplement key
 * present in the merged record but with no inferred field (a pure observed fact)
 * is serialized with `status: "DIRECT_FACT"` so null/omitted/neutral/fact stay
 * distinguishable.
 */
export function buildInferredFieldStructures(
  position: SupportedPosition,
  merged: Readonly<Record<string, unknown>>,
  inferredByField: ReadonlyMap<string, IntermediateField<unknown>>,
): SerializedInferredField[] {
  return orderSupplementFields(position, merged).map(({ field, value }) => {
    const inf = inferredByField.get(field);
    if (!inf) {
      return {
        field,
        value: value === undefined ? null : (sortKeysDeep(value) as unknown),
        status: 'DIRECT_FACT',
        provenance: 'DIRECT',
        confidence: 1000,
        limitations: [],
        evidence: [],
        asOf: '',
        registryVersion: '',
        modelId: '',
      };
    }
    return {
      field,
      value: value === undefined ? null : (sortKeysDeep(value) as unknown),
      status: inf.status,
      provenance: inf.provenance,
      confidence: inf.confidence,
      limitations: [...inf.limitations],
      evidence: inf.evidence.map((e) => ({ featureKey: e.featureKey, sourceTimestamp: e.sourceTimestamp })),
      asOf: inf.asOf,
      registryVersion: inf.registryVersion,
      modelId: inf.modelId,
    };
  });
}

/** M2 — digest of the canonical NORMALIZED INPUT (never the merged output). */
export function normalizedInputDigest(canonicalInput: unknown): string {
  return digest(stableStringify(canonicalInput));
}

export interface EnvelopeParts {
  readonly schema_version: string;
  readonly registry_version: string;
  readonly model_version: string;
  readonly env_reference_version: string;
  readonly player_id: string;
  readonly position: SupportedPosition;
  readonly as_of: string;
  readonly normalized_input_checksum: string;
  readonly reproducibility: ReproducibilityId;
  readonly status: string;
  readonly readiness: string;
  readonly readiness_missing: readonly string[];
  readonly honesty_state: string;
  readonly engine_invoked: boolean;
  readonly engine_error: string | null;
  readonly engine_output: unknown;
  readonly player_confidence: unknown;
  readonly engine_confidence_01: number | null;
  readonly public_confidence: unknown;
  readonly public_confidence_label: string | null;
  readonly fields: readonly SerializedInferredField[];
  readonly facts: Readonly<Record<string, unknown>>;
  readonly ail_supplement: Readonly<Record<string, unknown>>;
  readonly merged_supplement: Readonly<Record<string, unknown>>;
  readonly explanations: readonly unknown[];
  readonly limitations: readonly string[];
  readonly diagnostics: unknown;
  readonly sidecar: unknown;
}

export interface SerializedProduction {
  readonly serialized: string;
  readonly outputChecksum: string;
}

/**
 * Build the complete serialized envelope (Cold-audit M3) + its output checksum
 * (Cold-audit M2). Top-level key order is fixed here (SPEC §15.1 shape); nested data
 * records are key-sorted so bytes never depend on input construction order.
 */
export function serializeProductionEnvelope(parts: EnvelopeParts): SerializedProduction {
  const envelope = {
    schema_version: parts.schema_version,
    registry_version: parts.registry_version,
    model_version: parts.model_version,
    env_reference_version: parts.env_reference_version,
    player_id: parts.player_id,
    position: parts.position,
    as_of: parts.as_of,
    normalized_input_checksum: parts.normalized_input_checksum,
    reproducibility: sortKeysDeep(parts.reproducibility),
    status: parts.status,
    readiness: parts.readiness,
    readiness_missing: [...parts.readiness_missing],
    honesty_state: parts.honesty_state,
    engine_invoked: parts.engine_invoked,
    engine_error: parts.engine_error,
    engine_output: sortKeysDeep(parts.engine_output),
    player_confidence: sortKeysDeep(parts.player_confidence),
    engine_confidence_01: parts.engine_confidence_01,
    public_confidence: sortKeysDeep(parts.public_confidence),
    public_confidence_label: parts.public_confidence_label,
    fields: parts.fields.map((f) => ({
      field: f.field,
      value: f.value,
      status: f.status,
      provenance: f.provenance,
      confidence: f.confidence,
      limitations: [...f.limitations],
      evidence: f.evidence.map((e) => ({ featureKey: e.featureKey, sourceTimestamp: e.sourceTimestamp })),
      asOf: f.asOf,
      registryVersion: f.registryVersion,
      modelId: f.modelId,
    })),
    facts: sortKeysDeep(parts.facts),
    ail_supplement: sortKeysDeep(parts.ail_supplement),
    merged_supplement: sortKeysDeep(parts.merged_supplement),
    explanations: parts.explanations,
    limitations: [...parts.limitations],
    diagnostics: sortKeysDeep(parts.diagnostics),
    sidecar: sortKeysDeep(parts.sidecar),
  };
  const serialized = JSON.stringify(envelope);
  const outputChecksum = digest(serialized);
  return { serialized, outputChecksum };
}

/** Declaration order is exported for tests asserting engine-interface field order. */
export { declarationOrder };
