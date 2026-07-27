// Final supplement emission (REGISTRY §12 / §20.F3). Converts the intermediate
// inference fields into the repository's supplement record, applying the binding
// status × field-kind emission matrix. Metadata is never emitted here (it stays in
// the report envelope). Fields not in the position's supplement spec (internal
// diagnostics such as a role class) are ignored.

import { emissionDecision } from '@/inference/readiness/integration';
import type { IntermediateField } from '@/inference/result/types';
import { LIMITATION_CODES, type LimitationCode, type SupportedPosition } from '@/inference/types';
import { SUPPLEMENT_SPEC } from './fieldKinds';

export interface FieldEmission {
  readonly field: string;
  readonly decision: 'present-value' | 'present-null' | 'omit';
  readonly value: unknown;
}

export interface EmitResult {
  /** Partial supplement record (typed as unknown values; cast at the engine boundary). */
  readonly supplement: Readonly<Record<string, unknown>>;
  /** Supplement fields that were omitted (non-nullable numeric that could not estimate). */
  readonly omitted: readonly string[];
  readonly emissions: readonly FieldEmission[];
}

export function emitSupplement(
  position: SupportedPosition,
  fields: readonly IntermediateField<unknown>[],
): EmitResult {
  const spec = SUPPLEMENT_SPEC[position];
  const supplement: Record<string, unknown> = {};
  const omitted: string[] = [];
  const emissions: FieldEmission[] = [];
  const decided = new Set<string>();

  for (const f of fields) {
    const fieldSpec = spec[f.field];
    if (!fieldSpec) continue; // not a supplement field (diagnostic / internal)
    decided.add(f.field);

    const decision = emissionDecision(f.status, fieldSpec.kind);
    if (decision === 'omit') {
      omitted.push(f.field);
      emissions.push({ field: f.field, decision, value: undefined });
      continue;
    }
    if (decision === 'present-null') {
      supplement[f.field] = null;
      emissions.push({ field: f.field, decision, value: null });
      continue;
    }
    // present-value: neutral member for a neutral-default emission, else the value.
    const isNeutralDefault =
      (fieldSpec.kind === 'enumNeutral' || fieldSpec.kind === 'boolDefault') &&
      f.status !== 'AVAILABLE' &&
      f.status !== 'LOW_CONFIDENCE'
        ? true
        : false;
    // A neutral enum/bool whose status is LOW_CONFIDENCE with NEUTRAL_DEFAULT
    // limitation also carries its neutral member as the value already.
    const value = isNeutralDefault ? fieldSpec.neutral : f.value;
    supplement[f.field] = value;
    emissions.push({ field: f.field, decision, value });
  }

  // COMPLETE THE DECISION (REGISTRY §20.F3).
  //
  // The matrix above is binding for EVERY supplement field, not only for fields an
  // inference family happened to produce. A field that no family covers and no evidence
  // reached is genuinely `UNAVAILABLE`, and the matrix already says what that means:
  //
  //   nullable           → present-null      (the engine's DEFINED unknown; it falls back)
  //   enumNeutral/bool   → the AUTHORIZED neutral member (§20.F3.1)
  //   nonNullableNumeric → omit              (still blocking — still NOT_READY)
  //
  // Leaving such a field out entirely was the defect: it made "nobody produced a decision"
  // indistinguishable from "the decision is unknown", so readiness reported a missing field
  // where the specification defines an outcome. This LOOSENS NOTHING — every non-nullable
  // numeric still omits and still blocks — and it is deliberately visible: each field below
  // enters the result as an UNAVAILABLE inferred field, so it is serialized in the envelope
  // and counted against confidence.
  //
  // Iteration is over the spec's declaration order, so the output is deterministic and
  // cannot depend on the order fields arrived in.
  for (const field of Object.keys(spec)) {
    if (decided.has(field)) continue;
    const fieldSpec = spec[field];
    const decision = emissionDecision('UNAVAILABLE', fieldSpec.kind);
    if (decision === 'omit') {
      omitted.push(field);
      emissions.push({ field, decision, value: undefined });
    } else if (decision === 'present-null') {
      supplement[field] = null;
      emissions.push({ field, decision, value: null });
    } else {
      supplement[field] = fieldSpec.neutral;
      emissions.push({ field, decision, value: fieldSpec.neutral });
    }
  }

  return { supplement, omitted, emissions };
}

/**
 * The `UNAVAILABLE` inferred fields corresponding to spec fields no inference family
 * produced. They carry no value and no evidence — their entire content is the honest
 * statement "no authorized source supplied this" — and they exist so that the envelope
 * serializes a complete supplement and the confidence model sees the gap.
 */
export function unavailableFieldsFor(
  position: SupportedPosition,
  fields: readonly IntermediateField<unknown>[],
  asOf: string,
  registryVersion: string,
): IntermediateField<unknown>[] {
  const spec = SUPPLEMENT_SPEC[position];
  const produced = new Set(fields.map((f) => f.field));
  return Object.keys(spec)
    .filter((field) => !produced.has(field))
    .map((field) => {
      const kind = spec[field].kind;
      // Only codes already in the authorized vocabulary are used. NEUTRAL_DEFAULT is the
      // §20.F3 code for an enum/bool carried as its neutral member; a nullable field needs
      // no code because `status: UNAVAILABLE` with a null value is already the complete
      // statement, and it is serialized in the envelope.
      const limitations: LimitationCode[] =
        kind === 'enumNeutral' || kind === 'boolDefault' ? [LIMITATION_CODES.NEUTRAL_DEFAULT] : [];
      return {
        field,
        value: null,
        status: 'UNAVAILABLE' as const,
        provenance: null,
        confidence: 0,
        limitations,
        evidence: [],
        asOf,
        registryVersion,
        modelId: '',
      };
    });
}
