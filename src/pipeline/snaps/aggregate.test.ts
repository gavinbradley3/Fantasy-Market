import { describe, expect, it } from 'vitest';
import { aggregateSnapWindows, snapShare } from '@/pipeline/snaps/aggregate';
import type { SnapRecord } from '@/pipeline/snaps/types';

function rec(season: number, week: number, snaps: number, pct: number | null, team = 'ATL'): SnapRecord {
  return { gsis: 'g', position: 'RB', team, season, week, seasonType: 'REG', offenseSnaps: snaps, offensePct: pct };
}

describe('snap aggregation', () => {
  it('computes snap share as Σ snaps ÷ Σ reconstructed team snaps', () => {
    // week1: 50 snaps @ .5 → team 100; week2: 60 @ .6 → team 100. share = 110/200 = 0.55
    const w = aggregateSnapWindows([rec(2025, 1, 50, 0.5), rec(2025, 2, 60, 0.6)], { currentSeason: 2025 });
    expect(snapShare(w.CURRENT_SEASON)).toBeCloseTo(0.55, 10);
  });

  it('splits current vs previous season and trailing windows', () => {
    const rows = [rec(2024, 16, 40, 0.5), rec(2025, 1, 50, 0.5), rec(2025, 2, 60, 0.6)];
    const w = aggregateSnapWindows(rows, { currentSeason: 2025 });
    expect(w.CURRENT_SEASON.games).toBe(2);
    expect(w.PREVIOUS_SEASON.games).toBe(1);
    expect(w.LAST_4.games).toBe(3);
  });

  it('is order-independent (shuffled → identical)', () => {
    const rows = [rec(2024, 16, 40, 0.5), rec(2025, 1, 50, 0.5), rec(2025, 2, 60, 0.6)];
    const a = aggregateSnapWindows(rows, { currentSeason: 2025 });
    const b = aggregateSnapWindows([rows[2], rows[0], rows[1]], { currentSeason: 2025 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('aggregates a traded player across teams', () => {
    const w = aggregateSnapWindows(
      [rec(2025, 1, 40, 0.5, 'CAR'), rec(2025, 2, 30, 0.5, 'BAL')],
      { currentSeason: 2025 },
    );
    expect(w.CURRENT_SEASON.games).toBe(2);
    expect(snapShare(w.CURRENT_SEASON)).toBeCloseTo(0.5, 10);
  });

  it('handles missed games and returns null share below minimum sample', () => {
    const w = aggregateSnapWindows([rec(2025, 1, 0, null)], { currentSeason: 2025 });
    expect(w.CURRENT_SEASON.games).toBe(1);
    expect(snapShare(w.CURRENT_SEASON)).toBeNull(); // no positive-share week → null, not 0/NaN
  });

  it('excludes seasons after current from trailing windows', () => {
    const w = aggregateSnapWindows([rec(2025, 1, 50, 0.5), rec(2026, 1, 60, 0.6)], { currentSeason: 2025 });
    expect(w.LAST_4.games).toBe(1);
  });

  it('never yields NaN or Infinity', () => {
    const w = aggregateSnapWindows([rec(2025, 1, 10, 0)], { currentSeason: 2025 });
    const v = snapShare(w.CURRENT_SEASON);
    expect(v === null || Number.isFinite(v)).toBe(true);
  });
});
