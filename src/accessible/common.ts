// Shared accessible-tier components: age curves, availability, trajectory, confidence.
//
// Every table below is declared with the football reasoning that justifies its shape, so a
// reviewer can challenge a specific number rather than an opaque parameter vector.

import { clamp, roundHalfAwayFromZero } from './numeric';
import type { CountingWindow, ObservedProduction } from './production';
import { rate, scaleFrom, score100, type Anchor } from './scale';
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

export function ageScore(position: AccessiblePosition, age: number | null): number | null {
  if (age === null) return null;
  return score100(scaleFrom(position === 'RB' ? RB_AGE_ANCHORS : TE_AGE_ANCHORS, age));
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
    case 'DOUBTFUL':
      return 35;
    case 'UNKNOWN':
      return 55;
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

/** Per-game rate over a window, or null when the column or the games are absent. */
export function perGame(window: CountingWindow, key: keyof CountingWindow): number | null {
  if (key === 'games') return null;
  const v = window[key];
  return rate(typeof v === 'number' ? v : null, window.games, 1);
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
 * Durability: the share of the team's games the player actually appeared in, over the
 * seasons observed. A 17-game season is assumed for the denominator, which is the current
 * schedule; the value is a floor for seasons that were shorter.
 */
export const DURABILITY_ANCHORS: readonly Anchor[] = [
  { at: 0.3, score: 12 },
  { at: 0.5, score: 32 },
  { at: 0.7, score: 55 },
  { at: 0.85, score: 78 },
  { at: 0.95, score: 92 },
  { at: 1.0, score: 100 },
];

const GAMES_PER_SEASON = 17;

export function durabilityScore(production: ObservedProduction): number | null {
  if (production.seasonsPlayed <= 0) return null;
  const possible = production.seasonsPlayed * GAMES_PER_SEASON;
  if (possible <= 0) return null;
  return score100(scaleFrom(DURABILITY_ANCHORS, clamp(production.career.games / possible, 0, 1)));
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

/** Product-facing names for the inputs this tier never has. */
export const TIER_WIDE_MISSING_INPUTS: readonly string[] = [
  'Route participation (no free per-player route data since 2023)',
  'Snap share (no snap-count feed ingested)',
  'Red-zone and goal-line usage (requires play-by-play)',
  'Team offensive context (pace, dropbacks, points per drive)',
  'Target quality (air yards, catchable-target rate)',
];
