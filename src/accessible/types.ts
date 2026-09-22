// Public contract for the accessible-data model tier.

import type { ObservedProduction } from './production';

/**
 * Which model produced a valuation. Published per player so no reduced-input valuation can
 * be mistaken for a full-model one.
 *
 *  FULL         — the frozen engine ran on its complete declared input set, including the
 *                 charted route history it requires.
 *  ACCESSIBLE   — the accessible-data model ran on the inputs the live pipeline can actually
 *                 acquire. Strictly fewer inputs, lower confidence ceiling, and it is a
 *                 different model — not the full model with defaults substituted.
 *  INSUFFICIENT — neither model had enough evidence. No value is published.
 */
export type ModelTier = 'FULL' | 'ACCESSIBLE' | 'INSUFFICIENT';

export type AccessiblePosition = 'RB' | 'TE' | 'WR';

/** Availability state, mapped from the same canonical status the frozen path uses. */
export type AccessibleAvailability =
  | 'HEALTHY'
  | 'QUESTIONABLE'
  | 'DOUBTFUL'
  | 'OUT'
  | 'IR'
  | 'PUP'
  | 'SUSPENDED'
  /** Not on an active roster, with no injury signal — distinct from being injured. */
  | 'NOT_ROSTERED'
  | 'UNKNOWN';

/**
 * Everything the accessible models consume. Every field is either an observed provider
 * aggregate or a point-in-time-resolved biographical fact. There is no route input of any
 * kind, and no field here is ever substituted when absent — `null` means unobserved and the
 * models treat it as unobserved.
 */
export interface AccessibleInput {
  readonly canonicalId: string;
  readonly position: AccessiblePosition;
  readonly asOf: string;
  /** Age in years at the as-of, derived from birth date. Null when no birth date exists. */
  readonly age: number | null;
  /** 1–7, or null when undrafted or unknown (the two are not distinguished upstream). */
  readonly draftRound: number | null;
  /** Seasons completed at the as-of, from the time-invariant rookie season. */
  readonly seasonsCompleted: number | null;
  readonly production: ObservedProduction;
  /** Remaining regular-season games on the player's team schedule after the as-of. */
  readonly expectedGamesRemaining: number | null;
  readonly availability: AccessibleAvailability;
  /** Point-in-time team at the as-of, or null when no source attests one. */
  readonly team: string | null;
  /** True when the as-of team differs from the prior season's team. Null when unknown. */
  readonly teamChanged: boolean | null;
}

export type ConfidenceLabel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AccessibleComposites {
  readonly weekly: number;
  readonly ros: number;
  readonly oneYear: number;
  readonly threeYear: number;
  readonly dynasty: number;
}

export interface AccessibleConfidence {
  readonly score: number;
  readonly label: ConfidenceLabel;
  /** Stable, sorted codes naming every confidence deduction that applied. */
  readonly penaltyCodes: readonly string[];
  /**
   * The sample term the score starts from, before any deduction: how much of this player's
   * valuation is carried by football we watched him play rather than by the league prior.
   * Published so a reader can separate "we barely have a sample" from "we have a sample and
   * something specific about him is unknown" — two very different reasons to be unsure.
   */
  readonly sampleScore: number;
  /** Career games the sample term was computed over. */
  readonly gamesObserved: number;
}

export interface AccessibleOutput {
  readonly tier: 'ACCESSIBLE';
  readonly modelVersion: string;
  readonly position: AccessiblePosition;
  readonly canonicalId: string;
  readonly asOf: string;
  /** Component scores, 0–100, keyed by the position's component codes. */
  readonly components: Readonly<Record<string, number>>;
  readonly composites: AccessibleComposites;
  /** The headline position value used for ranking (0–100). */
  readonly positionValue: number;
  readonly role: string;
  readonly confidence: AccessibleConfidence;
  /** One-sentence plain-language summary of what drove the valuation. */
  readonly explanation: string;
  readonly positiveFactors: readonly string[];
  readonly negativeFactors: readonly string[];
  /**
   * Inputs a full-model valuation would have used that were unavailable here, named in
   * product language rather than as registry keys.
   */
  readonly materialMissingInputs: readonly string[];
  readonly provenance: AccessibleProvenance;
}

export interface AccessibleProvenance {
  /** Regular-season games the valuation is computed from. */
  readonly gamesObserved: number;
  readonly seasonsObserved: number;
  /** True when team shares were derivable from reconstructed team totals. */
  readonly teamSharesDerived: boolean;
  /** Every field class the model consumed, for the provenance summary. */
  readonly observedFields: readonly string[];
  readonly derivedFields: readonly string[];
  readonly unavailableFields: readonly string[];
}

/** Why the accessible model declined to value a player. */
export interface AccessibleInsufficient {
  readonly tier: 'INSUFFICIENT';
  readonly position: AccessiblePosition;
  readonly canonicalId: string;
  /** Stable machine code. */
  readonly reasonCode: string;
  /** Product-facing sentence. */
  readonly reason: string;
}

export type AccessibleResult = AccessibleOutput | AccessibleInsufficient;
