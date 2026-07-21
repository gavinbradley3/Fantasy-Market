// Automated Inference Layer — provenance vocabulary.
//
// SPEC §5.1 / §32.7: the AIL emits only the five provenance values below. `DIRECT`
// is reserved for source adapters and is NEVER emitted by the AIL. The repository
// pipeline taxonomy (`src/pipeline/types.ts Provenance`) is `DIRECT | DERIVED |
// FALLBACK`; the AIL extends it with MODEL_ESTIMATE / MODEL_CLASSIFICATION / PROXY.
//
// A present value has exactly one provenance; a null value has provenance `null`
// (SPEC §5.1: "null iff value is null").

/** Provenance the AIL is permitted to stamp on a present value. */
export type InferenceProvenance =
  | 'DERIVED'
  | 'MODEL_ESTIMATE'
  | 'MODEL_CLASSIFICATION'
  | 'PROXY'
  | 'FALLBACK';

export const INFERENCE_PROVENANCES: readonly InferenceProvenance[] = [
  'DERIVED',
  'MODEL_ESTIMATE',
  'MODEL_CLASSIFICATION',
  'PROXY',
  'FALLBACK',
];

export function isInferenceProvenance(value: string): value is InferenceProvenance {
  return (INFERENCE_PROVENANCES as readonly string[]).includes(value);
}

/**
 * REGISTRY §20.D2 — the "official starts" predicate operates on the pipeline
 * provenance taxonomy (a source fact is `DIRECT`; a count derived from official
 * game-level starter flags is `DERIVED`). Inferred functional starts are
 * `MODEL_ESTIMATE` and are NOT official. This is a pure classification helper over
 * a provenance string; it embeds no start-inference logic (deferred to Phase D2).
 */
export type SourceOrInferenceProvenance = 'DIRECT' | InferenceProvenance;

export function isOfficialProvenance(provenance: SourceOrInferenceProvenance): boolean {
  return provenance === 'DIRECT' || provenance === 'DERIVED';
}
