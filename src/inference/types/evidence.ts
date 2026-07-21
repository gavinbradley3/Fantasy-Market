// Automated Inference Layer — evidence and explanation fragment structures.
//
// SPEC §5.1: the shapes carried by every InferredField. Phase 1 defines the
// structures only; the composer that RANKS and RENDERS fragments (SPEC §17,
// REGISTRY §14/§20.F12) is deferred to a later phase.

/** SPEC §5.1 — one feature that contributed to an inferred value. */
export interface InputEvidence {
  readonly featureKey: string;
  /** Originating provider(s), joined & sorted. */
  readonly provider: string;
  readonly sourceTimestamp: string;
  readonly usedProxy: boolean;
  /** 0..1 relative contribution (rounded per REGISTRY §1.1). */
  readonly weight: number;
}

export type ExplanationPolarity = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

/** SPEC §5.1 / §17 — a structured, deterministic explanation fragment. */
export interface ExplanationFragment {
  readonly code: string;
  readonly polarity: ExplanationPolarity;
  /** Fixed template id (rendered from args, never free text). */
  readonly template: string;
  readonly args: Readonly<Record<string, string | number>>;
}
