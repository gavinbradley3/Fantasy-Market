// Build typed, PARTIAL stats supplements from window aggregates — plus an
// honest per-field availability report. This is where the free-source reality
// is encoded: nflverse weekly stats supply counting stats, target share, air-
// yard-derived aDOT, and efficiency, but NOT routes (paid post-2023), snap/
// carry shares (snap-counts/pbp), red-zone/goal-line/success/explosive (pbp),
// expected/model metrics (xFP/CROE/CPOE), or QB starts.
//
// Field policy (never fabricate):
//   • COMPUTABLE   → real value from the aggregate (DIRECT counting / DERIVED rate).
//   • NULLABLE-UNAVAILABLE → key set to null (the engines' defined "unknown" for
//     that nullable field), reported UNAVAILABLE. The engine runs its fallback.
//   • NONNULL-UNAVAILABLE  → OMITTED entirely, reported UNAVAILABLE. The player
//     stays NOT_READY on that field — exactly the honest outcome for routes/starts.

import {
  adjustedYardsPerAttempt,
  averageDepthOfTarget,
  catchRate,
  interceptionRate,
  targetShare,
  yacPerReception,
  yardsPerCarry,
  yardsPerReception,
  yardsPerTarget,
} from '@/pipeline/stats/derive';
import type {
  PlayerStatAggregate,
  StatWindow,
  WindowAggregate,
} from '@/pipeline/stats/types';
import type { SupportedPosition } from '@/pipeline/types';

export type StatFieldOrigin = 'DIRECT' | 'DERIVED';
export type StatAvailability = 'SUPPLIED' | 'UNAVAILABLE';

export interface StatFieldReport {
  readonly field: string;
  readonly availability: StatAvailability;
  readonly window?: StatWindow;
  readonly origin?: StatFieldOrigin;
  readonly value?: number | null;
  /** Why an owned field is unavailable, and what would supply it. */
  readonly reason?: string;
}

export interface BuiltStatsSupplement {
  readonly canonicalId: string;
  readonly position: SupportedPosition;
  /** Partial supplement: only stats-owned fields this stage can legitimately set. */
  readonly supplement: Record<string, number | null>;
  readonly fields: readonly StatFieldReport[];
  /** Field names OMITTED because they are non-null and unavailable (blockers). */
  readonly blockingUnavailable: readonly string[];
}

const ROUTES_REASON =
  'per-player route feeds ended 2023; requires a paid charting source or the snap-based route proxy (next sub-stage)';
const PBP_REASON = 'requires nflverse play-by-play (red-zone/goal-line/success/explosive) — not this dataset';
const SNAPS_REASON = 'requires the nflverse snap-counts dataset — not this dataset';
const MODEL_REASON = 'an expected/model metric (xFP/CROE/CPOE) with no free provider — out of scope';
const STARTS_REASON = 'games-started is not in the weekly player-stats feed — needs a starts/snap source';

// A small builder that accumulates supplement values + field reports.
class SupplementBuilder {
  readonly supplement: Record<string, number | null> = {};
  readonly fields: StatFieldReport[] = [];
  readonly blocking: string[] = [];

  value(field: string, window: StatWindow, origin: StatFieldOrigin, v: number | null): void {
    if (v === null) {
      // Computable in principle but insufficient sample this window → engine unknown.
      this.supplement[field] = null;
      this.fields.push({ field, availability: 'UNAVAILABLE', window, origin, value: null, reason: 'insufficient sample in window' });
      return;
    }
    this.supplement[field] = v;
    this.fields.push({ field, availability: 'SUPPLIED', window, origin, value: v });
  }

  /** Nullable engine field with no free source: set null, report UNAVAILABLE. */
  nullableUnavailable(field: string, reason: string): void {
    this.supplement[field] = null;
    this.fields.push({ field, availability: 'UNAVAILABLE', value: null, reason });
  }

  /** Non-null engine field with no free source: OMIT, report UNAVAILABLE (blocks). */
  nonNullUnavailable(field: string, reason: string): void {
    this.fields.push({ field, availability: 'UNAVAILABLE', reason });
    this.blocking.push(field);
  }
}

function pick(a: PlayerStatAggregate, w: StatWindow): WindowAggregate {
  return a.windows[w];
}

function buildWR(a: PlayerStatAggregate, b: SupplementBuilder): void {
  const cur = pick(a, 'CURRENT_SEASON');
  b.nonNullUnavailable('career_routes', ROUTES_REASON);
  b.value('target_share', 'CURRENT_SEASON', 'DERIVED', targetShare(cur));
  b.value('average_depth_of_target', 'CURRENT_SEASON', 'DERIVED', averageDepthOfTarget(cur));
  b.nullableUnavailable('route_participation_last4', ROUTES_REASON);
  b.nullableUnavailable('route_participation_last8', ROUTES_REASON);
  b.nullableUnavailable('targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('previous_route_participation', ROUTES_REASON);
  b.nullableUnavailable('previous_targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('career_targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('expected_fantasy_points_per_target', MODEL_REASON);
  b.nullableUnavailable('catch_rate_over_expected', MODEL_REASON);
  b.nullableUnavailable('depth_adjusted_yards_per_target', MODEL_REASON);
  b.nullableUnavailable('expected_td_rate_per_target', MODEL_REASON);
  b.nullableUnavailable('career_expected_fantasy_points_per_target', MODEL_REASON);
}

function buildTE(a: PlayerStatAggregate, b: SupplementBuilder): void {
  const cur = pick(a, 'CURRENT_SEASON');
  const car = pick(a, 'CAREER');
  b.nonNullUnavailable('career_routes', ROUTES_REASON);
  b.value('career_targets', 'CAREER', 'DIRECT', car.targets);
  b.value('target_share', 'CURRENT_SEASON', 'DERIVED', targetShare(cur));
  b.value('average_depth_of_target', 'CURRENT_SEASON', 'DERIVED', averageDepthOfTarget(cur));
  b.value('catch_rate', 'CURRENT_SEASON', 'DERIVED', catchRate(cur));
  b.value('yards_per_target', 'CURRENT_SEASON', 'DERIVED', yardsPerTarget(cur));
  b.value('yards_per_reception', 'CURRENT_SEASON', 'DERIVED', yardsPerReception(cur));
  b.value('yac_per_reception', 'CURRENT_SEASON', 'DERIVED', yacPerReception(cur));
  b.value('career_catch_rate', 'CAREER', 'DERIVED', catchRate(car));
  b.value('career_yards_per_target', 'CAREER', 'DERIVED', yardsPerTarget(car));
  b.value('career_yards_per_reception', 'CAREER', 'DERIVED', yardsPerReception(car));
  b.value('career_yac_per_reception', 'CAREER', 'DERIVED', yacPerReception(car));
  b.nullableUnavailable('route_participation_last4', ROUTES_REASON);
  b.nullableUnavailable('route_participation_last8', ROUTES_REASON);
  b.nullableUnavailable('targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('previous_route_participation', ROUTES_REASON);
  b.nullableUnavailable('previous_targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('career_targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('snap_share_last4', SNAPS_REASON);
  b.nullableUnavailable('red_zone_target_rate', PBP_REASON);
  b.nullableUnavailable('end_zone_target_rate', PBP_REASON);
  b.nullableUnavailable('catchable_target_rate', MODEL_REASON);
  b.nullableUnavailable('career_red_zone_target_rate', PBP_REASON);
  b.nullableUnavailable('career_end_zone_target_rate', PBP_REASON);
}

function buildRB(a: PlayerStatAggregate, b: SupplementBuilder): void {
  const cur = pick(a, 'CURRENT_SEASON');
  const car = pick(a, 'CAREER');
  b.value('career_carries', 'CAREER', 'DIRECT', car.carries);
  b.value('career_touches', 'CAREER', 'DIRECT', car.carries + car.receptions);
  b.nonNullUnavailable('career_routes', ROUTES_REASON);
  b.value('target_share', 'CURRENT_SEASON', 'DERIVED', targetShare(cur));
  b.value('yards_per_carry', 'CURRENT_SEASON', 'DERIVED', yardsPerCarry(cur));
  b.value('catch_rate', 'CURRENT_SEASON', 'DERIVED', catchRate(cur));
  b.value('receiving_yards_per_reception', 'CURRENT_SEASON', 'DERIVED', yardsPerReception(cur));
  b.value('career_yards_per_carry', 'CAREER', 'DERIVED', yardsPerCarry(car));
  b.value('career_catch_rate', 'CAREER', 'DERIVED', catchRate(car));
  b.value('career_receiving_yards_per_reception', 'CAREER', 'DERIVED', yardsPerReception(car));
  b.nullableUnavailable('route_participation_last4', ROUTES_REASON);
  b.nullableUnavailable('targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('previous_route_participation', ROUTES_REASON);
  b.nullableUnavailable('career_targets_per_route_run', ROUTES_REASON);
  b.nullableUnavailable('snap_share_last4', SNAPS_REASON);
  b.nullableUnavailable('snap_share_last8', SNAPS_REASON);
  b.nullableUnavailable('carry_share_last4', SNAPS_REASON);
  b.nullableUnavailable('previous_snap_share', SNAPS_REASON);
  b.nullableUnavailable('previous_carry_share', SNAPS_REASON);
  b.nullableUnavailable('goal_line_carry_share', PBP_REASON);
  b.nullableUnavailable('red_zone_carry_share', PBP_REASON);
  b.nullableUnavailable('rushing_success_rate', PBP_REASON);
  b.nullableUnavailable('explosive_run_rate', PBP_REASON);
}

function buildQB(a: PlayerStatAggregate, b: SupplementBuilder): void {
  const cur = pick(a, 'CURRENT_SEASON');
  const car = pick(a, 'CAREER');
  const prev = pick(a, 'PREVIOUS_SEASON');
  // Career counting.
  b.value('career_games_played', 'CAREER', 'DIRECT', car.games);
  b.value('career_pass_attempts', 'CAREER', 'DIRECT', car.attempts);
  b.value('career_rush_attempts', 'CAREER', 'DIRECT', car.carries);
  b.nonNullUnavailable('career_starts', STARTS_REASON);
  // Recent (current season) counting.
  b.value('recent_games', 'CURRENT_SEASON', 'DIRECT', cur.games);
  b.nonNullUnavailable('recent_starts', STARTS_REASON);
  b.value('recent_pass_attempts', 'CURRENT_SEASON', 'DIRECT', cur.attempts);
  b.value('recent_completions', 'CURRENT_SEASON', 'DIRECT', cur.completions);
  b.value('recent_passing_yards', 'CURRENT_SEASON', 'DIRECT', cur.passingYards);
  b.value('recent_passing_tds', 'CURRENT_SEASON', 'DIRECT', cur.passingTds);
  b.value('recent_interceptions', 'CURRENT_SEASON', 'DIRECT', cur.interceptions);
  b.value('recent_sacks', 'CURRENT_SEASON', 'DIRECT', cur.sacks);
  b.value('recent_rush_attempts', 'CURRENT_SEASON', 'DIRECT', cur.carries);
  b.value('recent_rushing_yards', 'CURRENT_SEASON', 'DIRECT', cur.rushingYards);
  b.value('recent_rushing_tds', 'CURRENT_SEASON', 'DIRECT', cur.rushingTds);
  // Efficiency (nullable).
  b.value('adjusted_yards_per_attempt', 'CURRENT_SEASON', 'DERIVED', adjustedYardsPerAttempt(cur));
  b.value('prior_recent_pass_attempts', 'PREVIOUS_SEASON', 'DIRECT', prev.games > 0 ? prev.attempts : null);
  b.value('prior_adjusted_yards_per_attempt', 'PREVIOUS_SEASON', 'DERIVED', adjustedYardsPerAttempt(prev));
  b.value('prior_interception_rate', 'PREVIOUS_SEASON', 'DERIVED', interceptionRate(prev));
  // Unavailable nullable.
  b.nullableUnavailable('designed_rush_attempts', PBP_REASON);
  b.nullableUnavailable('scrambles', PBP_REASON);
  b.nullableUnavailable('goal_line_rush_attempts', PBP_REASON);
  b.nullableUnavailable('completion_percentage_over_expected', MODEL_REASON);
  b.nullableUnavailable('explosive_pass_rate', PBP_REASON);
  b.nullableUnavailable('prior_rush_attempts_per_start', STARTS_REASON);
}

const BUILDERS: Record<SupportedPosition, (a: PlayerStatAggregate, b: SupplementBuilder) => void> = {
  WR: buildWR,
  TE: buildTE,
  RB: buildRB,
  QB: buildQB,
};

export function buildStatsSupplement(a: PlayerStatAggregate): BuiltStatsSupplement {
  const b = new SupplementBuilder();
  BUILDERS[a.position](a, b);
  b.fields.sort((x, y) => x.field.localeCompare(y.field));
  return {
    canonicalId: a.canonicalId,
    position: a.position,
    supplement: b.supplement,
    fields: b.fields,
    blockingUnavailable: [...b.blocking].sort(),
  };
}
