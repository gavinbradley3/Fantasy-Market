// Production serialization (Phase 3 §6; REGISTRY §15). Deterministic, byte-stable.
// Supplement fields are ordered by the engine-interface declaration order; metadata
// is not in `fields`. The checksum uses the canonical merged-supplement form.

import { digest, stableStringify } from '@/inference/util/checksum';
import type { SupportedPosition } from '@/inference/types';
import { declarationOrder, SUPPLEMENT_SPEC } from './fieldKinds';

export interface SerializedProduction {
  readonly serialized: string;
  readonly checksum: string;
}

interface EnvelopeInput {
  readonly schema_version: string;
  readonly registry_version: string;
  readonly model_version: string;
  readonly player_id: string;
  readonly position: SupportedPosition;
  readonly as_of: string;
  readonly readiness: string;
  readonly honesty_state: string;
  readonly mergedSupplement: Readonly<Record<string, unknown>>;
}

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

/** Build the canonical serialized envelope + checksum (byte-stable). */
export function serializeProduction(input: EnvelopeInput): SerializedProduction {
  const fields = orderSupplementFields(input.position, input.mergedSupplement);
  // Insertion order is fixed here; a stable serializer is used for the checksum.
  const envelope = {
    schema_version: input.schema_version,
    registry_version: input.registry_version,
    model_version: input.model_version,
    player_id: input.player_id,
    position: input.position,
    as_of: input.as_of,
    readiness: input.readiness,
    honesty_state: input.honesty_state,
    fields,
  };
  const serialized = JSON.stringify(envelope);
  // Checksum over the canonical (key-sorted) merged supplement (§15.3).
  const checksum = digest(stableStringify(input.mergedSupplement));
  return { serialized, checksum };
}

/** Declaration order is exported for tests asserting engine-interface field order. */
export { declarationOrder };
