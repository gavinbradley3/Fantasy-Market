// Shared accessible-tier components: age curves, availability, trajectory, confidence.
//
// Every table below is declared with the football reasoning that justifies its shape, so a
// reviewer can challenge a specific number rather than an opaque parameter vector.

import { clamp, roundHalfAwayFromZero } from './numeric';
import type { CountingWindow, ObservedProduction } from './production';
import { rate, scaleFrom, score100, shrink, type Anchor } from './scale';
import type {
  AccessibleAvailability,
  AccessibleConfidence,
  AccessiblePosition,
  ConfidenceLabel,
} from './types';

/**
 * RB age curve.
 *
 * Running back decline is the steepest and best-documented age effect at any fantasy
 * position: the workload is collision-heavy, the skill is largely athletic rather than
 * technical, and teams replace backs cheaply through the draft. The curve peaks early
 * (23–25), erodes from 27, and falls hard from 29 — which is why a 30-year-old back with
 * strong current production still carries a poor multi-year outlook.
 */
export const RB_AGE_ANCHORS: readonly Anchor[] = [
  { at: 21, score: 92 },
  { at: 23, score: 100 },
  { at: 25, score: 96 },
  { at: 26, score: 88 },
  { at: 27, score: 77 },
  { at: 28, score: 64 },
  { at: 29, score: 50 },
  { at: 30, score: 36 },
  { at: 31, score: 24 },
  { at: 33, score: 12 },
];

/**
 * TE age curve.
 *
 * Tight end is the latest-developing skill position: the role demands blocking technique and
 * option-route feel that rookies rarely have, breakouts commonly arrive in years 3–4, and
 * production holds into the early thirties far better than at running back. The curve
 * therefore peaks later (25–29) and declines gently.
 */
export const TE_AGE_ANCHORS: readonly Anchor[] = [
  { at: 22, score: 80 },
  { at: 24, score: 92 },
  { at: 26, score: 100 },
  { at: 29, score: 96 },
  { at: 30, score: 88 },
  { at: 31, score: 78 },
  { at: 32, score: 66 },
  { at: 34, score: 44 },
  { at: 36, score: 24 },
];

/**
 * WR age curve.
 *
 * Receiver is the position where the fantasy-relevant skill is most technical and least
 * collision-dependent, so the prime is broad and the decline sits between the running back's
 * and the tight end's. The curve plateaus across 24–26, holds through 28, and falls from 30.
 *
 * Declared here alongside the other two so all three curves can be compared in one place; the
 * WR model re-exports it.
 */
export const WR_AGE_ANCHORS: readonly Anchor[] = [
  { at: 21, score: 88 },
  { at: 23, score: 97 },
  { at: 24, score: 100 },
  { at: 26, score: 100 },
  { at: 27, score: 96 },
  { at: 28, score: 90 },
  { at: 29, score: 80 },
  { at: 30, score: 68 },
  { at: 31, score: 55 },
  { at: 32, score: 42 },
  { at: 34, score: 22 },
  { at: 36, score: 10 },
];


const AGE_ANCHORS_BY_POSITION: Readonly<Record<AccessiblePosition, readonly Anchor[]>> = {
  RB: RB_AGE_ANCHORS,
  TE: TE_AGE_ANCHORS,
  WR: WR_AGE_ANCHORS,
};


export function ageScore(position: AccessiblePosition, age: number | null): number | null {
  if (age === null) return null;
  return score100(scaleFrom(AGE_ANCHORS_BY_POSITION[position], age));
}

/**
 * Availability score from the point-in-time roster/injury state.
 *
 * This is a weekly-resolution roster signal, not a game-day designation — nflverse publishes
 * no injury feed — so the scale is deliberately coarse. UNKNOWN is scored as a mild penalty
 * rather than as neutral: a player whose status no source attests at the as-of is materially
 * more likely to be off a roster than a player confirmed active.
 */
export function availabilityScore(availability: AccessibleAvailability): number {
  switch (availability) {
    case 'HEALTHY':
      return 100;
    case 'QUESTIONABLE':
      return 70;
    case 'UNKNOWN':
      return 55;
    // Not on an active roster, with NO injury signal. Measured at an offseason as-of this
    // describes 45% of the RB/TE population — free agents and players between contracts — so
    // scoring it as OUT claimed that nearly half the league was injured. It is a real negative
    // for the near-term outlook and nothing stronger.
    case 'NOT_ROSTERED':
      return 40;
    case 'DOUBTFUL':
      return 35;
    case 'OUT':
    case 'IR':
    case 'PUP':
      return 5;
    case 'SUSPENDED':
      return 0;
  }
}

/** True when the state means "not expected to play in the near term". */
export function isUnavailable(availability: AccessibleAvailability): boolean {
  return availability === 'OUT' || availability === 'IR' || availability === 'PUP' || availability === 'SUSPENDED';
}

/** True when the player is not on a roster, which is reported differently from an injury. */
export function isNotRostered(availability: AccessibleAvailability): boolean {
  return availability === 'NOT_ROSTERED';
}

/** Per-game rate over a window, or null when the column or the games are absent. */
export function perGame(window: CountingWindow, key: keyof CountingWindow): number | null {
  if (key === 'games') return null;
  const v = window[key];
  return rate(typeof v === 'number' ? v : null, window.games, 1);
}

// ---------------------------------------------------------------------------
// Volume shrinkage
// ---------------------------------------------------------------------------

/**
 * Pseudo-games for VOLUME shrinkage: the number of games at which observed usage and the
 * league prior carry equal weight.
 *
 * The efficiency components have always been shrunk (yards per carry by career carries, catch
 * rate by career targets — §3 of the model spec), but the volume components were not: they
 * read a raw per-game rate straight off the role window. That made a one-game sample
 * arithmetically indistinguishable from a proven workload. A back with a single 25-carry
 * appearance scored a saturated `RV` of 100, exactly like a back who had carried 25 times a
 * game for a full season, and could out-rank an established bell cow on the headline value.
 * Confidence reported the thin sample honestly, but the VALUE did not, so the protection was
 * incidental rather than structural.
 *
 * The estimator is the same conjugate-prior posterior mean the efficiency components use:
 *
 *   shrunk = (n · observed + k · prior) / (n + k)
 *
 * with `n` the games the rate was measured over and `k = 3`. Written as a convex combination,
 * the weight on observation is `n / (n + k)` — a smooth rational function of sample size with
 * no threshold, no branch and no discontinuity anywhere on `n ≥ 0`:
 *
 *   n = 1  →  25% observed     a single game barely moves the estimate off the prior
 *   n = 3  →  50% observed     the declared equal-weight point
 *   n = 8  →  73% observed
 *   n = 17 →  85% observed     a full season is read essentially as measured
 *
 * WHY THREE GAMES. It is the shortest run over which a coaching staff is itself described as
 * having handed a back the job: one game is an injury fill-in or a blowout, two is a pattern
 * nobody commits to, three consecutive games at a workload is a role. It is also the same
 * order of magnitude as the existing efficiency pseudo-counts once those are expressed in
 * games (130 pseudo-carries ≈ 8 games at a lead-back load), so the two families of shrinkage
 * are calibrated on a comparable scale rather than one dominating the other.
 *
 * The denominator is GAMES because the quantity being regressed is a per-game rate: games are
 * the exposure count for "how often does this player do X in a game", exactly as carries are
 * the exposure count for yards per carry. It is football-meaningful (the number of separate
 * opportunities we watched the player take a role) and it is observed, never assumed.
 */
export const VOLUME_PSEUDO_GAMES = 3;

/**
 * A per-game volume rate regressed toward its league prior by the games observed.
 *
 * Returns `null` when the column is unobserved, so an absent statistic is still DROPPED and
 * its horizon weight renormalized — shrinkage must never turn "we did not see this" into the
 * prior, which would manufacture usage for a player the provider recorded nothing for. Only a
 * rate we actually measured is regressed.
 *
 * An observed ZERO is regressed like any other observation, and that is deliberate: a player
 * who did not carry once in his only appearance has shown far less than one who did not carry
 * in seventeen, and `n / (n + k)` is exactly the function that separates them. The raw rate is
 * what the explanations quote, so nothing the user reads claims usage that did not happen.
 */
export function shrunkPerGameRate(total: number | null, games: number, prior: number): number | null {
  const observed = rate(total, games, 1);
  if (observed === null) return null;
  return shrink(observed, games, prior, VOLUME_PSEUDO_GAMES);
}

/**
 * Trajectory: the newest season's per-game production against the prior season's, scored
 * around 50 (flat). Requires BOTH seasons with a usable sample, so a rookie and a player
 * with one ingested season are reported null rather than scored as declining.
 *
 * The ratio is capped at 2.0 before scoring: beyond a doubling the signal is dominated by a
 * tiny prior-season denominator rather than by genuine improvement.
 */
export const TRAJECTORY_ANCHORS: readonly Anchor[] = [
  { at: 0.4, score: 8 },
  { at: 0.7, score: 28 },
  { at: 0.9, score: 43 },
  { at: 1.0, score: 50 },
  { at: 1.15, score: 62 },
  { at: 1.4, score: 78 },
  { at: 1.8, score: 92 },
  { at: 2.0, score: 96 },
];

export function trajectoryScore(
  latest: CountingWindow | null,
  prior: CountingWindow | null,
  valueOf: (w: CountingWindow) => number | null,
  minGamesEachSeason = 4,
): number | null {
  if (!latest || !prior) return null;
  if (latest.games < minGamesEachSeason || prior.games < minGamesEachSeason) return null;
  const a = valueOf(latest);
  const b = valueOf(prior);
  if (a === null || b === null) return null;
  const latestPerGame = a / latest.games;
  const priorPerGame = b / prior.games;
  if (priorPerGame <= 0) return null;
  return score100(scaleFrom(TRAJECTORY_ANCHORS, clamp(latestPerGame / priorPerGame, 0, 2)));
}

/**
 * Durability: the share of the games available to him that the player actually appeared in.
 *
 * The denominator is the number of TEAM WEEKS he was on a roster, not `seasons × 17`. The
 * earlier formulation charged a mid-season signing for games played before he joined and
 * charged every rookie for his team's entire season — a player signed in week 10 who then
 * played all eight remaining games scored 29/100. Roster weeks come from the weekly-roster
 * export and measure the opportunity that actually existed.
 *
 * When no roster week is attested the component is DROPPED rather than guessed, and the
 * horizon weights renormalize.
 */
export const DURABILITY_ANCHORS: readonly Anchor[] = [
  { at: 0.3, score: 12 },
  { at: 0.5, score: 32 },
  { at: 0.7, score: 55 },
  { at: 0.85, score: 78 },
  { at: 0.95, score: 92 },
  { at: 1.0, score: 100 },
];

export function durabilityScore(production: ObservedProduction): number | null {
  const possible = production.rosteredTeamWeeks;
  if (possible === null || possible <= 0) return null;
  // Appearances can exceed rostered weeks when a roster week is missing from the export, so the
  // ratio is clamped rather than allowed to claim better-than-perfect availability.
  return score100(scaleFrom(DURABILITY_ANCHORS, clamp(production.career.games / possible, 0, 1)));
}

/**
 * Days after which production is treated as stale. One year: at any as-of, a player with no
 * game in the preceding 365 days has missed a full season, and every rate the model computes
 * describes a role he no longer demonstrably holds.
 */
export const STALE_PRODUCTION_DAYS = 365;

/** True when the newest observed game predates the as-of by more than a season. */
export function isStaleProduction(production: ObservedProduction, asOf: string): boolean {
  const newest = production.newestGameKickoff;
  if (newest === null) return true;
  const gap = Date.parse(asOf) - Date.parse(newest);
  if (!Number.isFinite(gap)) return false;
  return gap > STALE_PRODUCTION_DAYS * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/**
 * The accessible tier's confidence CEILING.
 *
 * A reduced-input valuation can never be HIGH confidence, no matter how clean the box score
 * is, because the inputs that would confirm a role — snap share, route participation,
 * red-zone usage, target quality — are absent for every player in this tier. Capping at 74
 * keeps the tier strictly inside MEDIUM.
 */
export const ACCESSIBLE_CONFIDENCE_CEILING = 74;

export const CONFIDENCE_PENALTY = {
  /** No route or snap participation data exists for any accessible-tier player. */
  NO_PARTICIPATION_DATA: 10,
  /** Red-zone / goal-line usage is unavailable (needs play-by-play). */
  NO_HIGH_VALUE_USAGE_DATA: 6,
  /** Team offensive context (dropbacks, points per drive) is unavailable. */
  NO_TEAM_CONTEXT: 5,
  /** Fewer than 8 career games observed. */
  SPARSE_CAREER_SAMPLE: 14,
  /** Fewer than 4 career games observed — barely a sample at all. */
  MINIMAL_CAREER_SAMPLE: 12,
  /** Only one season observed, so no trajectory could be computed. */
  NO_TRAJECTORY: 6,
  /** Team shares could not be reconstructed. */
  NO_TEAM_SHARES: 4,
  /** Age unknown, so the age curve could not be applied. */
  AGE_UNKNOWN: 12,
  /** Roster status not attested at the as-of. */
  STATUS_UNATTESTED: 6,
  /** The player has not appeared in the most recent ingested season. */
  STALE_PRODUCTION: 8,
  /** Air yards were never published for the role window, so target depth is unknown. */
  NO_TARGET_DEPTH: 5,
  /** No draft round is attested, and upstream does not distinguish undrafted from unknown. */
  DRAFT_ROUND_UNKNOWN: 4,
} as const;

export type ConfidencePenaltyCode = keyof typeof CONFIDENCE_PENALTY;

export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

/**
 * Assemble confidence from the ceiling minus every applicable penalty. Deterministic and
 * order-independent: codes are sorted, and the arithmetic is a plain sum.
 */
export function buildConfidence(codes: readonly ConfidencePenaltyCode[]): AccessibleConfidence {
  const unique = [...new Set(codes)].sort();
  const total = unique.reduce((sum, c) => sum + CONFIDENCE_PENALTY[c], 0);
  const score = roundHalfAwayFromZero(clamp(ACCESSIBLE_CONFIDENCE_CEILING - total, 0, 100), 0);
  return { score, label: confidenceLabel(score), penaltyCodes: unique };
}

/**
 * The penalty codes every accessible-tier valuation carries, because these inputs are
 * unavailable for the entire tier by construction rather than per player.
 */
export const TIER_WIDE_PENALTIES: readonly ConfidencePenaltyCode[] = [
  'NO_PARTICIPATION_DATA',
  'NO_HIGH_VALUE_USAGE_DATA',
  'NO_TEAM_CONTEXT',
];

/**
 * Product-facing names for the inputs this tier never has.
 *
 * The route line states the real reason. The participation data still exists — nflverse
 * publishes it for seasons after 2023 and the WR model already estimates routes from it —
 * what RB/TE lack is an approved way to convert it into a career route total. Saying "no
 * data since 2023" would be a factual claim we know to be wrong.
 */
export const TIER_WIDE_MISSING_INPUTS: readonly string[] = [
  'Route participation (no approved RB/TE method for converting it to career routes)',
  'Snap share (no snap-count feed ingested)',
  'Red-zone and goal-line usage (requires play-by-play)',
  'Team offensive context (pace, dropbacks, points per drive)',
  'Target quality (air yards, catchable-target rate)',
];
