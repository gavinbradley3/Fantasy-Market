// Final supplement emission (REGISTRY §12 / §20.F3). Converts the intermediate
// inference fields into the repository's supplement record, applying the binding
// status × field-kind emission matrix. Metadata is never emitted here (it stays in
// the report envelope). Fields not in the position's supplement spec (internal
// diagnostics such as a role class) are ignored.

import { emissionDecision } from '@/inference/readiness/integration';
import type { IntermediateField } from '@/inference/result/types';
import type { SupportedPosition } from '@/inference/types';
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

  for (const f of fields) {
    const fieldSpec = spec[f.field];
    if (!fieldSpec) continue; // not a supplement field (diagnostic / internal)

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

  return { supplement, omitted, emissions };
}
