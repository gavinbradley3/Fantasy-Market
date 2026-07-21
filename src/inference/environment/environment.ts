// Offensive / QB environment scoring (REGISTRY §6.2 + §20.F1). Uses ONLY the
// canonical, checksum-verified AIL environment reference (air-env-ref-1.0.0) via the
// mid-rank percentile — never a WR/RB/TE/QB engine reference distribution. Results
// are position-independent per component (§20.F1). Pure.

import { ENV_ROOKIE_STARTER_STABILITY_PRIOR, ENV_WEIGHTS } from '@/inference/registry/family';
import { loadEnvReference, type EnvReferenceComponent } from '@/inference/registry/envReference';
import { clamp, pct, roundHalfAwayFromZero } from '@/inference/util/numeric';

// Load + checksum-verify once at module init (deterministic; no wall clock).
const ENV = loadEnvReference();

/**
 * Mid-rank percentile of a value against the canonical reference for a component.
 * Position-independent by construction (§20.F1).
 */
export function componentPercentile(component: EnvReferenceComponent, value: number): number {
  return pct(value, ENV.components[component]);
}

interface WeightedComponent {
  readonly percentile: number | null; // null → component input missing
  readonly weight: number;
}

/** §6.2 weighted blend: drop missing components and renormalize; all missing → null. */
function blend(components: readonly WeightedComponent[]): number | null {
  const present = components.filter((c) => c.percentile !== null) as {
    percentile: number;
    weight: number;
  }[];
  if (present.length === 0) return null;
  const weightSum = present.reduce((s, c) => s + c.weight, 0);
  const score = present.reduce((s, c) => s + (c.weight / weightSum) * c.percentile, 0);
  return roundHalfAwayFromZero(clamp(score, 0, 100), 0);
}

export interface OffensiveEnvironmentInput {
  readonly teamPointsPerDrive: number | null;
  readonly projectedTeamDropbacks: number | null;
  readonly teamRedZoneTripsPerGame: number | null;
}

/** §6.2 offensive_environment_score (0..100 integer) or null when all inputs missing. */
export function offensiveEnvironmentScore(input: OffensiveEnvironmentInput): number | null {
  return blend([
    {
      percentile:
        input.teamPointsPerDrive === null
          ? null
          : componentPercentile('team_points_per_drive', input.teamPointsPerDrive),
      weight: ENV_WEIGHTS.offensive.team_points_per_drive,
    },
    {
      percentile:
        input.projectedTeamDropbacks === null
          ? null
          : componentPercentile('projected_team_dropbacks', input.projectedTeamDropbacks),
      weight: ENV_WEIGHTS.offensive.projected_team_dropbacks,
    },
    {
      percentile:
        input.teamRedZoneTripsPerGame === null
          ? null
          : componentPercentile('team_red_zone_trips_per_game', input.teamRedZoneTripsPerGame),
      weight: ENV_WEIGHTS.offensive.team_red_zone_trips_per_game,
    },
  ]);
}

export interface QbEnvironmentInput {
  readonly adjustedYardsPerAttempt: number | null;
  readonly projectedTeamDropbacks: number | null;
  readonly sackRate: number | null;
  /** projected starter recent_start_rate (0..1); rookie prior applied by caller. */
  readonly recentStartRate: number | null;
  readonly rookieStarter?: boolean;
}

/** §6.2 qb_environment_score (0..100 integer) or null when all inputs missing. */
export function qbEnvironmentScore(input: QbEnvironmentInput): number | null {
  const stability =
    input.rookieStarter === true
      ? ENV_ROOKIE_STARTER_STABILITY_PRIOR
      : input.recentStartRate === null
        ? null
        : clamp(100 * input.recentStartRate, 0, 100);
  return blend([
    {
      percentile:
        input.adjustedYardsPerAttempt === null
          ? null
          : componentPercentile('adjusted_yards_per_attempt', input.adjustedYardsPerAttempt),
      weight: ENV_WEIGHTS.qb.adjusted_yards_per_attempt,
    },
    {
      percentile:
        input.projectedTeamDropbacks === null
          ? null
          : componentPercentile('projected_team_dropbacks', input.projectedTeamDropbacks),
      weight: ENV_WEIGHTS.qb.projected_team_dropbacks,
    },
    {
      percentile: input.sackRate === null ? null : 100 - componentPercentile('sack_rate', input.sackRate),
      weight: ENV_WEIGHTS.qb.sack_rate_inverse,
    },
    { percentile: stability, weight: ENV_WEIGHTS.qb.starter_stability },
  ]);
}

/** §6.2 protection_context_score = 100 − pct(sack_rate); null if sack_rate absent. */
export function protectionContextScore(sackRate: number | null): number | null {
  if (sackRate === null) return null;
  return roundHalfAwayFromZero(clamp(100 - componentPercentile('sack_rate', sackRate), 0, 100), 0);
}
