// Provider-neutral dynasty MARKET records.
//
// This is the market counterpart to the pipeline's canonical player record: no provider
// defines PlayerTicker's schema, so a DynastyProcess row, a KeepTradeCut row and a
// hand-maintained value all land in the same shape and are told apart by `source` and
// `provenance` rather than by which table they live in.
//
// MARKET IS NOT MODEL. A MarketSnapshot is what the market says a player is worth. The
// valuation engines' output is what PlayerTicker's model says. They are stored separately and
// compared explicitly (see ModelMarketComparison below) so a reader can always tell which
// number came from where.

/**
 * The lens a value is quoted in. Never inferred: a 1QB value and a Superflex value are
 * different numbers for the same player, and quietly treating one as the other would
 * misprice every quarterback.
 */
export type MarketFormat = 'dynasty_superflex' | 'dynasty_1qb';

/** Where a market number came from. */
export type MarketProvenance =
  /** Published by an external market source, carried verbatim. */
  | 'external'
  /** Computed by PlayerTicker from external values (e.g. rank by ordering). */
  | 'derived'
  /** Maintained by hand. */
  | 'manual';

/** How current a snapshot is relative to its source's own publication stamp. */
export type MarketFreshness = 'fresh' | 'stale' | 'unknown';

/**
 * One player's market value, in one format, from one source, at one instant.
 *
 * Snapshots are APPEND-ONLY. Yesterday's row is never updated in place, because movement
 * (1d/7d/30d) and historical charts are reconstructed by reading successive snapshots.
 */
export interface MarketSnapshot {
  /** PlayerTicker canonical id — resolved through the SAME resolver the pipeline uses. */
  readonly canonicalPlayerId: string;
  /** Stable source key, e.g. 'dynastyprocess'. */
  readonly source: string;
  readonly format: MarketFormat;
  /**
   * The market's value for this player, on the source's own scale. Null when the source
   * covers the player but published no value — never 0, which is a real value.
   */
  readonly value: number | null;
  /**
   * Integer rank over the snapshot batch. DERIVED by ordering on `value`, because the
   * sources we can use publish a fractional consensus rank rather than a dense integer one.
   */
  readonly overallRank: number | null;
  readonly positionRank: number | null;
  /**
   * The source's own published rank, verbatim, when it has one. Often FRACTIONAL (an
   * average of expert ballots, e.g. 11.2) — which is exactly why it is kept separate from
   * the integer `overallRank` above rather than being rounded into it.
   */
  readonly sourceConsensusRank: number | null;
  /** The id this player carried in the source's own namespace, for audit. */
  readonly sourcePlayerId: string | null;
  /** Position as the SOURCE stated it, retained to cross-check the identity join. */
  readonly sourcePosition: string | null;
  /** Team as the SOURCE stated it, retained to cross-check the identity join. */
  readonly sourceTeam: string | null;
  /** The instant the SOURCE says its data is for (its own stamp). */
  readonly sourceTimestamp: string;
  /** The instant PlayerTicker captured it. */
  readonly ingestedAt: string;
  readonly freshness: MarketFreshness;
  readonly provenance: MarketProvenance;
}

/** A source row that could not be turned into a snapshot, and why. */
export interface MarketRejection {
  readonly reason:
    | 'UNRESOLVED_IDENTITY'
    | 'NO_SOURCE_ID'
    | 'INVALID_VALUE'
    | 'POSITION_MISMATCH'
    | 'DUPLICATE';
  readonly detail: string;
  readonly sourcePlayerId: string | null;
  readonly sourceName: string | null;
}

/**
 * The result of adapting one source payload.
 *
 * Rejections are returned, never swallowed: a market batch that silently dropped a third of
 * its players would look identical to a healthy one.
 */
export interface MarketBatch {
  readonly source: string;
  readonly format: MarketFormat;
  readonly sourceTimestamp: string;
  readonly ingestedAt: string;
  readonly snapshots: readonly MarketSnapshot[];
  readonly rejections: readonly MarketRejection[];
}

/**
 * The data contract for comparing PlayerTicker's model against the market.
 *
 * Defined here, unused by the UI for now, so that when the comparison is built it cannot
 * quietly blend the two sides: every field names which side it came from, and the derived
 * fields are marked derived.
 */
export interface ModelMarketComparison {
  readonly canonicalPlayerId: string;
  readonly format: MarketFormat;
  /** External. */
  readonly marketValue: number | null;
  readonly marketRank: number | null;
  readonly marketSource: string;
  readonly marketUpdatedAt: string | null;
  /** PlayerTicker's own model. */
  readonly modelValue: number | null;
  readonly modelRank: number | null;
  readonly modelVersion: string | null;
  readonly modelUpdatedAt: string | null;
  /** Derived, only when BOTH sides are present — never computed against a missing side. */
  readonly absoluteDifference: number | null;
  readonly percentageDifference: number | null;
  readonly rankDifference: number | null;
  /**
   * Interpretation slot. Deliberately left as an opaque string the comparison layer fills
   * in; this task does not define or change signal vocabulary.
   */
  readonly interpretation: string | null;
}
