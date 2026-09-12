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
  /**
   * The source's own dataset version, verbatim, when it publishes one (DynastyProcess
   * stamps every row with the `scrape_date` that produced it). Distinct from
   * `sourceTimestamp`, which is that date as an instant: this keeps the source's own
   * spelling so a row can be traced back to the exact published artifact.
   */
  readonly sourceVersion: string | null;
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
  /** The source's own dataset version for this batch, verbatim (null when it publishes none). */
  readonly sourceVersion: string | null;
  readonly ingestedAt: string;
  readonly snapshots: readonly MarketSnapshot[];
  readonly rejections: readonly MarketRejection[];
}

/**
 * The data contract for comparing PlayerTicker's model against the market.
 *
 * WHY THERE IS NO VALUE DIFFERENCE HERE
 * The two sides are quoted on unrelated scales. A PlayerTicker dynasty composite is a 0–100
 * model score; a DynastyProcess Superflex value is a ~0–10,000 trade-currency number with its
 * own distribution. `(55.3 - 10256) / 10256` is arithmetic on incompatible units — it computes
 * cleanly and means nothing — and picking a multiplier to bridge them would be inventing a
 * conversion neither side published. So raw values are CARRIED (each labelled with its side)
 * and never subtracted.
 *
 * WHAT IS COMPARED INSTEAD
 * Order. Rank and percentile are scale-free: they ask "where does each side place this player
 * among the players it covers", which is a question both sides genuinely answer. A rank
 * difference of +7 is a real statement; a value difference of -10,200 is not.
 *
 * Every derived field is null unless BOTH sides supplied its inputs. A missing side is
 * missing — never zero, never last place.
 */
export interface ModelMarketComparison {
  readonly canonicalPlayerId: string;
  readonly format: MarketFormat;

  // ---- market side (external, carried verbatim) ----
  readonly marketValue: number | null;
  readonly marketRank: number | null;
  readonly marketPositionRank: number | null;
  readonly marketSource: string | null;
  readonly marketUpdatedAt: string | null;

  // ---- model side (PlayerTicker's own) ----
  readonly modelValue: number | null;
  readonly modelRank: number | null;
  readonly modelPositionRank: number | null;
  readonly modelVersion: string | null;
  readonly modelUpdatedAt: string | null;

  // ---- derived: order only, never raw-value arithmetic ----
  /**
   * `modelRank - marketRank`, computed only when both ranks exist.
   *
   * NEGATIVE means PlayerTicker ranks the player HIGHER than the market does (a smaller rank
   * number is a better rank). The sign convention is fixed here so no consumer has to guess.
   */
  readonly overallRankDifference: number | null;
  /** Same convention, within the player's own position. */
  readonly positionRankDifference: number | null;
  /**
   * Each side's position in its own distribution, 0–100, where 100 is the top. Percentile is
   * the honest way to compare two boards of DIFFERENT SIZE: rank 50 of 441 and rank 50 of 616
   * are not the same standing, and their percentiles say so.
   */
  readonly modelPercentile: number | null;
  readonly marketPercentile: number | null;
  /** `modelPercentile - marketPercentile`; positive means PlayerTicker is higher on the player. */
  readonly percentileDifference: number | null;
  /**
   * False whenever either side is absent, so a consumer never has to infer comparability
   * from a scatter of nulls. An uncovered player is a legitimate outcome, not an error.
   */
  readonly comparable: boolean;
}
