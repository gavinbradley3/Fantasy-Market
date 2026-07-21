// Confidence structures (SPEC §15, REGISTRY §11).
//
// Phase 1: the reusable shapes only. The per-field confidence PENALTIES (p_recency,
// p_sample, p_provenance, …) are inference-family logic and are NOT implemented in
// this phase.

/** A single field's contribution to a player-level aggregate. */
export interface ConfidenceEntry {
  /** Stable field key (for determinism / debugging; not used in the math). */
  readonly field: string;
  /** Field confidence, integer 0..1000 (SPEC §15.1). */
  readonly confidence: number;
  /** Importance weight (REGISTRY §11.2 tier value). */
  readonly weight: number;
  /** Whether this field is in the position's CRITICAL set (REGISTRY §11.2). */
  readonly critical: boolean;
}

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PlayerConfidenceResult {
  /** Aggregate player confidence, integer 0..1000 (REGISTRY §11.1). */
  readonly score: number;
  readonly band: ConfidenceBand;
  /** Weighted geometric mean before the weakest-critical cap (rounded). */
  readonly wgm: number;
  /** Minimum confidence across present CRITICAL fields (or null if none). */
  readonly weakestCritical: number | null;
}
