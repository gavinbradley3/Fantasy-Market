import { describe, expect, it } from 'vitest';
import { aggregateWindows } from '@/pipeline/stats/aggregate';
import { buildStatsSupplement } from '@/pipeline/stats/supplements';
import type { PlayerStatAggregate, SeasonType, WeeklyStatRecord } from '@/pipeline/stats/types';
import type { SupportedPosition } from '@/pipeline/types';

function row(season: number, week: number, over: Partial<WeeklyStatRecord>): WeeklyStatRecord {
  return {
    gsis: 'g', position: 'WR', season, week, seasonType: 'REG' as SeasonType,
    completions: 0, attempts: 0, passingYards: 0, passingTds: 0, interceptions: 0, sacks: 0, sackYards: 0,
    carries: 0, rushingYards: 0, rushingTds: 0,
    receptions: 0, targets: 0, receivingYards: 0, receivingTds: 0,
    receivingAirYards: null, receivingYardsAfterCatch: null, targetShare: null,
    ...over,
  };
}

function aggregate(position: SupportedPosition, rows: WeeklyStatRecord[]): PlayerStatAggregate {
  return { canonicalId: 'pt_x', position, gsis: 'g', windows: aggregateWindows(rows, { currentSeason: 2025 }) };
}

describe('buildStatsSupplement', () => {
  it('WR: supplies target share + aDOT but marks routes UNAVAILABLE and blocking', () => {
    const built = buildStatsSupplement(
      aggregate('WR', [
        row(2025, 1, { targets: 10, receptions: 7, receivingYards: 100, receivingAirYards: 120, targetShare: 0.25 }),
      ]),
    );
    expect(built.supplement.target_share).toBeCloseTo(0.25, 6);
    expect(built.supplement.average_depth_of_target).toBeCloseTo(12, 6);
    // career_routes is non-null and unavailable → OMITTED (a blocker).
    expect('career_routes' in built.supplement).toBe(false);
    expect(built.blockingUnavailable).toContain('career_routes');
    const routes = built.fields.find((f) => f.field === 'route_participation_last4');
    expect(routes?.availability).toBe('UNAVAILABLE'); // nullable route field → null + unavailable
    expect(built.supplement.route_participation_last4).toBeNull();
  });

  it('QB: supplies counting stats + AY/A, marks starts UNAVAILABLE (blocking), no fabrication', () => {
    const built = buildStatsSupplement(
      aggregate('QB', [
        row(2024, 1, { attempts: 30, completions: 20, passingYards: 240, passingTds: 2, interceptions: 1, carries: 6, rushingYards: 30 }),
        row(2025, 1, { attempts: 33, completions: 22, passingYards: 270, passingTds: 2, interceptions: 0, carries: 7, rushingYards: 40 }),
      ]),
    );
    expect(built.supplement.career_pass_attempts).toBe(63);
    expect(built.supplement.recent_pass_attempts).toBe(33); // current season only
    expect(built.supplement.career_games_played).toBe(2);
    expect(typeof built.supplement.adjusted_yards_per_attempt).toBe('number');
    // Starts cannot come from the weekly feed → omitted, blocking.
    expect('career_starts' in built.supplement).toBe(false);
    expect('recent_starts' in built.supplement).toBe(false);
    expect(built.blockingUnavailable).toEqual(expect.arrayContaining(['career_starts', 'recent_starts']));
  });

  it('QB: historical volume is recent/career counting, never an expected-workload projection', () => {
    const built = buildStatsSupplement(
      aggregate('QB', [row(2025, 1, { attempts: 33, completions: 22, passingYards: 270 })]),
    );
    // The stats stage never sets projection-owned fields.
    expect('expected_active_game_pass_attempts' in built.supplement).toBe(false);
    expect('team_dropback_share' in built.supplement).toBe(false);
  });

  it('RB: supplies career touches/carries + efficiency, routes remain the blocker', () => {
    const built = buildStatsSupplement(
      aggregate('RB', [
        row(2025, 1, { carries: 18, rushingYards: 90, receptions: 4, targets: 5, receivingYards: 35, targetShare: 0.1 }),
      ]),
    );
    expect(built.supplement.career_carries).toBe(18);
    expect(built.supplement.career_touches).toBe(22); // carries + receptions
    expect(built.supplement.yards_per_carry).toBeCloseTo(5, 6);
    expect(built.blockingUnavailable).toContain('career_routes');
  });

  it('TE: supplies career targets + receiving efficiency, routes remain the blocker', () => {
    const built = buildStatsSupplement(
      aggregate('TE', [
        row(2025, 1, { targets: 7, receptions: 5, receivingYards: 58, receivingAirYards: 42, receivingYardsAfterCatch: 33, targetShare: 0.18 }),
      ]),
    );
    expect(built.supplement.career_targets).toBe(7);
    expect(typeof built.supplement.yac_per_reception).toBe('number');
    expect(built.blockingUnavailable).toContain('career_routes');
  });

  it('never emits NaN or Infinity for a zero-sample player', () => {
    const built = buildStatsSupplement(aggregate('WR', [row(2025, 1, {})])); // all-zero line
    for (const v of Object.values(built.supplement)) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});
