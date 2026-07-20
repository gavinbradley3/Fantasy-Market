import { describe, expect, it } from 'vitest';
import { aggregateWindows } from '@/pipeline/stats/aggregate';
import type { WeeklyStatRecord } from '@/pipeline/stats/types';

function rec(season: number, week: number, over: Partial<WeeklyStatRecord> = {}): WeeklyStatRecord {
  return {
    gsis: 'g1',
    position: 'WR',
    season,
    week,
    seasonType: 'REG',
    completions: 0,
    attempts: 0,
    passingYards: 0,
    passingTds: 0,
    interceptions: 0,
    sacks: 0,
    sackYards: 0,
    carries: 0,
    rushingYards: 0,
    rushingTds: 0,
    receptions: 0,
    targets: 0,
    receivingYards: 0,
    receivingTds: 0,
    receivingAirYards: null,
    receivingYardsAfterCatch: null,
    targetShare: null,
    ...over,
  };
}

describe('aggregateWindows', () => {
  const rows = [
    rec(2024, 1, { targets: 5, receptions: 3, receivingYards: 40 }),
    rec(2024, 2, { targets: 7, receptions: 5, receivingYards: 60 }),
    rec(2025, 1, { targets: 8, receptions: 6, receivingYards: 70 }),
    rec(2025, 2, { targets: 10, receptions: 7, receivingYards: 95 }),
    rec(2025, 3, { targets: 9, receptions: 6, receivingYards: 80 }),
  ];
  const w = aggregateWindows(rows, { currentSeason: 2025 });

  it('counts games and splits current vs previous season', () => {
    expect(w.CAREER.games).toBe(5);
    expect(w.CURRENT_SEASON.games).toBe(3);
    expect(w.PREVIOUS_SEASON.games).toBe(2);
    expect(w.CURRENT_SEASON.targets).toBe(27); // 8+10+9
    expect(w.PREVIOUS_SEASON.targets).toBe(12); // 5+7
  });

  it('computes trailing windows newest-first across seasons', () => {
    expect(w.LAST_4.games).toBe(4); // 2025 wk3,2,1 + 2024 wk2
    expect(w.LAST_8.games).toBe(5); // only 5 rows exist
    expect(w.LAST_4.targets).toBe(9 + 10 + 8 + 7);
  });

  it('is order-independent (shuffled rows → identical aggregate)', () => {
    const shuffled = [rows[3], rows[0], rows[4], rows[1], rows[2]];
    const w2 = aggregateWindows(shuffled, { currentSeason: 2025 });
    expect(JSON.stringify(w2)).toBe(JSON.stringify(w));
  });

  it('aggregates a traded player across teams into one line', () => {
    const traded = [
      rec(2025, 1, { team: 'CAR', targets: 8, receptions: 5, receivingYards: 60 }),
      rec(2025, 2, { team: 'BAL', targets: 4, receptions: 3, receivingYards: 31 }),
    ];
    const t = aggregateWindows(traded, { currentSeason: 2025 });
    expect(t.CURRENT_SEASON.games).toBe(2);
    expect(t.CURRENT_SEASON.targets).toBe(12);
  });

  it('handles missed games (non-contiguous weeks) as simply fewer games', () => {
    const gappy = [rec(2025, 1, { targets: 5 }), rec(2025, 5, { targets: 6 }), rec(2025, 9, { targets: 7 })];
    const g = aggregateWindows(gappy, { currentSeason: 2025 });
    expect(g.CURRENT_SEASON.games).toBe(3);
    expect(g.LAST_4.games).toBe(3);
  });

  it('reconstructs team targets only from weeks with a positive share', () => {
    const shared = [
      rec(2025, 1, { targets: 10, targetShare: 0.25 }), // team 40
      rec(2025, 2, { targets: 6, targetShare: null }), // no share → excluded
    ];
    const s = aggregateWindows(shared, { currentSeason: 2025 });
    expect(s.CURRENT_SEASON.teamTargetsRecon).toBeCloseTo(40, 6);
    expect(s.CURRENT_SEASON.targetShareWeeks).toBe(1);
  });

  it('excludes seasons after the current season from trailing windows', () => {
    const future = [rec(2025, 1, { targets: 5 }), rec(2026, 1, { targets: 9 })];
    const f = aggregateWindows(future, { currentSeason: 2025 });
    expect(f.LAST_4.games).toBe(1); // 2026 row excluded from "up to current"
    expect(f.CAREER.games).toBe(2); // career still counts everything
  });
});
