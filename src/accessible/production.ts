// The observed-production input contract for the accessible-data model tier.
//
// The MODEL owns the shape of its own input, so the ingestion layer that fills it imports
// these types rather than the model importing ingestion's. That keeps the dependency arrow
// pointing one way (ingestion → accessible, inference → accessible) and lets the model be
// unit-tested with no ingestion machinery at all.
//
// Every numeric column is `number | null`, and `null` always means UNOBSERVED — never zero.
// The distinction is load-bearing: a back who played and was never handed the ball has
// `carries: 0`, while a game whose carry column the provider omitted has `carries: null`. The
// models branch differently on the two.

/** A summed counting window. `games` is always known; every column may be null. */
export interface CountingWindow {
  /** Qualifying games in this window (a count, never null). */
  readonly games: number;
  readonly carries: number | null;
  readonly rushingYards: number | null;
  readonly rushingTds: number | null;
  readonly targets: number | null;
  readonly receptions: number | null;
  readonly receivingYards: number | null;
  readonly receivingTds: number | null;
}

/**
 * Player share of the team's own opportunity, computed from the SAME game rows on both sides
 * of the ratio so the denominator can never describe a different set of games than the
 * numerator.
 *
 * These are RECONSTRUCTED shares: the team total sums only the players the snapshot holds
 * rows for, making it a floor and the share an upper bound. That is recorded on the
 * provenance and reflected in confidence; it is never presented as a provider-published
 * team total.
 */
export interface TeamShares {
  /** Player carries ÷ reconstructed team carries; null when not derivable. */
  readonly carryShare: number | null;
  /** Player targets ÷ reconstructed team targets; null when not derivable. */
  readonly targetShare: number | null;
  /** Games the share was computed over (0 → both shares null). */
  readonly games: number;
}

export interface ObservedProduction {
  readonly career: CountingWindow;
  readonly recent: CountingWindow;
  /**
   * The window that defines the player's ROLE: the latest season when it holds at least
   * `ROLE_WINDOW_MIN_GAMES` games, otherwise the rolling recent window.
   *
   * Role is measured over a season rather than a rolling 8 games because a season is the unit
   * in which football roles actually exist. A rolling window is dominated by whatever happened
   * most recently, so a backup who filled in for an injured starter reads as a starter, and a
   * starter who missed the end of the year reads as a backup. Both were observed in the live
   * population before this window was introduced.
   */
  readonly roleWindow: CountingWindow;
  readonly latestSeason: CountingWindow | null;
  readonly priorSeason: CountingWindow | null;
  /**
   * Shares computed over `roleWindow`, so the share and the volume components describe the
   * same games. Null when no team-total evidence was supplied.
   */
  readonly teamShares: TeamShares | null;
  /** Distinct seasons the player has a qualifying game in. */
  readonly seasonsPlayed: number;
  /**
   * Kickoff of the newest qualifying game, used to detect stale production.
   *
   * Needed because `recent` is the last 8 games of the player's CAREER, not the last 8 team
   * games — so it is never empty for anyone with a game, and cannot detect a player whose last
   * appearance was two seasons ago.
   */
  readonly newestGameKickoff: string | null;
  /**
   * Team weeks the player was on a roster at or before the as-of, from the weekly-roster
   * export. This is the honest denominator for durability: `seasonsPlayed × 17` charges a
   * mid-season signing for games that happened before he was on the team, and charges a rookie
   * for his team's whole season. Null when no roster row attests any week.
   */
  readonly rosteredTeamWeeks: number | null;
}
