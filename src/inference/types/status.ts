// Automated Inference Layer — inference status values.
//
// Phase 1 (infrastructure): the status vocabulary only. The rules that DECIDE a
// status (sample gates, availability, etc.) are inference logic and belong to
// later phases. Semantics are fixed by SPEC §5.2 and REGISTRY §20.F2/F3.

/** SPEC §5.2 — the five inference statuses. */
export type InferenceStatus =
  | 'AVAILABLE'
  | 'LOW_CONFIDENCE'
  | 'INSUFFICIENT_DATA'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE';

export const INFERENCE_STATUSES: readonly InferenceStatus[] = [
  'AVAILABLE',
  'LOW_CONFIDENCE',
  'INSUFFICIENT_DATA',
  'UNAVAILABLE',
  'NOT_APPLICABLE',
];

export function isInferenceStatus(value: string): value is InferenceStatus {
  return (INFERENCE_STATUSES as readonly string[]).includes(value);
}
