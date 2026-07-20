// Small constructors and helpers for FieldState values. Centralizing them keeps
// provenance handling consistent and makes "never invent a value" enforceable:
// there is no code path that produces a present field without a provider and a
// source timestamp.

import type {
  FieldState,
  MissingField,
  MissingReason,
  PresentField,
  Provenance,
  ProviderId,
} from '@/pipeline/types';

export function present<T>(
  value: T,
  provider: ProviderId,
  sourceTimestamp: string,
  provenance: Provenance = 'DIRECT',
): PresentField<T> {
  return { present: true, value, provider, provenance, sourceTimestamp };
}

export function missing(reason: MissingReason, note?: string): MissingField {
  return note === undefined ? { present: false, reason } : { present: false, reason, note };
}

/** NOT_PROVIDED is the common case: no audited source carried the field. */
export function notProvided(note?: string): MissingField {
  return missing('NOT_PROVIDED', note);
}

export function isPresent<T>(field: FieldState<T>): field is PresentField<T> {
  return field.present;
}

/** Value when present, else `undefined`. Never coerces a missing state. */
export function valueOf<T>(field: FieldState<T>): T | undefined {
  return field.present ? field.value : undefined;
}

/**
 * Merge two candidate fields by precedence: `primary` wins when present; the
 * `fallback` fills in only when the primary is missing and is re-stamped as
 * FALLBACK provenance so the origin stays auditable.
 */
export function preferPrimary<T>(
  primary: FieldState<T>,
  fallback: FieldState<T>,
): FieldState<T> {
  if (primary.present) return primary;
  if (fallback.present) {
    return { ...fallback, provenance: 'FALLBACK' };
  }
  return primary; // both missing — keep the primary's reason
}
