// Serialization helpers for deterministic, byte-stable AIL output
// (SPEC §5.3 / §15.1–§15.2, REGISTRY §15).
//
// Phase 1 provides the primitive ordering/formatting helpers. The full report
// serializer (which orders fields by the engine input-interface declaration order,
// REGISTRY §20.F8) is assembled in a later phase from these primitives.

import { roundHalfAwayFromZero } from './numeric';
import { compareStrings } from './ordering';

/**
 * Round a numeric field value to its declared precision (REGISTRY §1.1) for
 * serialization. Returns a number; `JSON.stringify` renders it without trailing
 * zeros. Negative zero is normalized to zero by `roundHalfAwayFromZero`.
 */
export function toSerializedNumber(value: number, decimals: number): number {
  return roundHalfAwayFromZero(value, decimals);
}

/**
 * Produce an object with keys inserted in a fixed order (SPEC §15.1). Keys present
 * in `order` come first in that order; any remaining keys follow in ascending
 * ordinal order (defensive — the report envelope enumerates all keys explicitly).
 */
export function orderKeys<T extends Record<string, unknown>>(
  obj: T,
  order: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of order) {
    if (key in obj) out[key] = obj[key];
  }
  const remaining = Object.keys(obj)
    .filter((k) => !order.includes(k))
    .sort(compareStrings);
  for (const key of remaining) out[key] = obj[key];
  return out;
}

/** SPEC §15.1 — the fixed top-level key order of a per-player report envelope. */
export const REPORT_TOP_LEVEL_KEY_ORDER: readonly string[] = [
  'schema_version',
  'registry_version',
  'model_version',
  'player_id',
  'position',
  'as_of',
  'status',
  'readiness',
  'honesty_state',
  'fields',
  'sidecar',
];

/** SPEC §15.1 — the fixed key order within an InferredField. */
export const INFERRED_FIELD_KEY_ORDER: readonly string[] = [
  'field',
  'value',
  'status',
  'provenance',
  'confidence',
  'modelId',
  'modelVersion',
  'asOf',
  'effectiveFor',
  'expiresAfter',
  'inputsUsed',
  'assumptions',
  'limitations',
  'explanation',
];
