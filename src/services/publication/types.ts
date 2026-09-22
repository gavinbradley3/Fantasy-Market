// The frontend's model of a published market (Phase 10).
//
// This is what every component downstream of the API boundary consumes. It is intentionally
// NOT `PlayerRow`/`PlayerMarketSnapshot` (the Demo Market's shape): those carry ~20 fields the
// backend does not publish — market price, mispricing, 1/7/30-day movement, asset class,
// tags, signals, sparklines — and filling them in would mean inventing them. This model
// carries exactly what a publication contains, with `null` wherever the backend published
// nothing, so a component can render "not published" instead of a plausible-looking zero.

import type { Position } from '@/types/market';

/** The composite horizon a board is valued on. */
export type PublishedHorizon = 'weekly' | 'ros' | 'oneYear' | 'threeYear' | 'dynasty';

export interface PublishedComposites {
  readonly weekly: number | null;
  readonly ros: number | null;
  readonly oneYear: number | null;
  readonly threeYear: number | null;
  readonly dynasty: number | null;
}

/**
 * Which model produced a player's published value — the field the UI branches on to show a
 * full valuation, a clearly-labelled reduced one, or an honest "not enough data".
 */
export type PublishedModelTier = 'FULL' | 'ACCESSIBLE' | 'INSUFFICIENT';
export type PublishedDynastyContract = 'canonical' | 'legacy';

export interface PublishedPlayer {
  /** Explicitly distinguishes a current canonical publication from the supported legacy shape. */
  readonly dynastyContract: PublishedDynastyContract;
  /**
   * PlayerTicker's CROSS-POSITION dynasty value, 0–100 on its own scale, and what the board
   * ranks on. Null when the backend published none — an older board, or a player the engines
   * never valued.
   *
   * Distinct from `value`, which is the player's position-internal composite for the selected
   * horizon. The two are not interchangeable and never were: a composite is anchored inside its
   * own position, and every position spec forbids publishing it as a universal value.
   */
  readonly dynastyValue: number | null;
  /** Marginal utility above positional replacement, 0–1, before normalization. */
  readonly dynastySurplus: number | null;
  /** The bounded below-replacement optionality term, same units. */
  readonly dynastyDepth: number | null;
  /** Which term produced the value: ABOVE_REPLACEMENT, DEPTH, BOTH or NONE. */
  readonly dynastyValueSource: string | null;
  /** The league format the value was computed for. A value means nothing without one. */
  readonly leagueSchemaId: string | null;
  /** The measured production reference the value was scored against. */
  readonly productionCurveVersion: string | null;
  /** The backend's canonical id, preserved verbatim — the stable identity for keys and links. */
  readonly playerId: string;
  readonly position: Position;
  readonly name: string | null;
  readonly team: string | null;
  readonly age: number | null;
  /**
   * The published composite for the board's horizon. `null` means the inference layer
   * published no valuation for this player (it was not READY) — it never means zero.
   */
  readonly value: number | null;
  readonly composites: PublishedComposites | null;
  /** Backend canonical overall rank (legacy boards retain their historical composite rank). */
  readonly overallRank: number | null;
  /** Backend canonical dynasty positional rank (legacy boards retain their historical rank). */
  readonly positionRank: number | null;
  readonly confidenceScore: number | null;
  readonly confidenceLabel: string | null;
  readonly publicConfidenceLabel: string | null;
  readonly volatilityScore: number | null;
  readonly volatilityLabel: string | null;
  /** The inference layer's own honesty verdict, e.g. "UNAVAILABLE". */
  readonly honestyState: string | null;
  readonly readiness: string | null;
  readonly outputStatus: string | null;
  readonly readinessMissingCount: number | null;
  readonly limitations: readonly string[];
  readonly asOf: string | null;
  readonly outputChecksum: string;

  // ---- model tier ----
  readonly modelTier: PublishedModelTier;
  readonly modelVersion: string | null;
  /** The backend's own 0–100 headline value for the position (accessible tier). */
  readonly positionValue: number | null;
  /** The backend's own positional rank. Distinct from `positionRank`, which this adapter derives from the board's chosen horizon. */
  readonly publishedPositionalRank: number | null;
  readonly role: string | null;
  readonly explanation: string | null;
  readonly positiveFactors: readonly string[];
  readonly negativeFactors: readonly string[];
  readonly materialMissingInputs: readonly string[];
  /**
   * Engine inputs that were substituted rather than supplied — a COVERAGE count, not a
   * confidence deduction. See `PublishedPlayerProjection.inputsSubstituted`.
   */
  readonly inputsSubstituted: number | null;
  readonly insufficientReason: string | null;
  readonly provenance: PublishedProvenance | null;
}

export interface PublishedProvenance {
  readonly gamesObserved: number | null;
  readonly seasonsObserved: number | null;
  readonly teamSharesDerived: boolean;
  readonly observedFields: readonly string[];
  readonly derivedFields: readonly string[];
  readonly unavailableFields: readonly string[];
}

/** Why one record from the response could not be admitted to the market. */
export interface RejectedRecord {
  readonly canonicalId: string | null;
  readonly reason: 'missingId' | 'unknownPosition' | 'duplicateId' | 'invalidValue';
  readonly detail: string;
}

export interface PublishedMarket {
  readonly dynastyContract: PublishedDynastyContract;
  readonly publicationId: string;
  readonly runId: string;
  readonly publishedAt: string;
  readonly boardChecksum: string;
  /** Entry count the backend declared for this board (may exceed `players.length`). */
  readonly entryCount: number;
  readonly horizon: PublishedHorizon;
  /** Admitted players, ordered by rank (valued first), then by id. */
  readonly players: readonly PublishedPlayer[];
  /** How many admitted players carry the board's displayed value. */
  readonly valuedCount: number;
  /** Records the adapter refused. Surfaced, never swallowed. */
  readonly rejected: readonly RejectedRecord[];
}
