// Career rates for the QB engine.
//
// The defect these close: a quarterback's career was invisible to Passing Quality and Rushing
// Value, so 1,680 career attempts counted for exactly as much as 94. The assertions that
// matter are that a career is measured over the WHOLE ingested history, that it uses the
// engine's own AY/A definition, and that an absent sample yields nothing rather than a zero.

import { describe, expect, it } from 'vitest';
import { observedCareerRates } from './observedCareerRates';
import type { GameStatRecord } from './types';

let seq = 0;
function game(over: Partial<GameStatRecord> = {}): GameStatRecord {
  seq += 1;
  return {
    canonicalId: 'pt-qb',
    providerRef: { key: 'gsis', value: '00-QB' },
    freshness: { provider: 'nflverse', effectiveDate: '2026-01-01T00:00:00.000Z', fetchedAt: '2026-01-01T00:00:00.000Z', lastUpdated: null, sourceVersion: 'v1' },
    sourceTimestamp: '2026-01-01T00:00:00.000Z',
    gameId: `g${seq}`,
    kickoff: `2025-09-${String((seq % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    season: 2025,
    seasonType: 'REG',
    team: 'KC',
    passAttempts: 30,
    carries: 4,
    targets: null,
    snaps: null,
    teamSnaps: null,
    qbSnapShare: null,
    completions: 20,
    passingYards: 240,
    passingTds: 2,
    interceptions: 1,
    sacks: 2,
    rushingYards: 20,
    rushingTds: 0,
    receptions: null,
    receivingYards: null,
    receivingTds: null,
    receivingAirYards: null,
    targetShare: null,
    ...over,
  } as GameStatRecord;
}

describe('career adjusted yards per attempt', () => {
  it('uses the engine’s own AY/A definition so career and recent are the same quantity', () => {
    seq = 0;
    // One game: (240 + 20·2 − 45·1) / 30 = 235/30.
    expect(observedCareerRates([game()], 1).career_adjusted_yards_per_attempt).toBeCloseTo(235 / 30, 10);
  });

  it('spans the WHOLE ingested history, not one season', () => {
    seq = 0;
    const old = Array.from({ length: 16 }, () => game({ season: 2018, passAttempts: 35, passingYards: 300, passingTds: 3, interceptions: 0 }));
    const now = Array.from({ length: 8 }, () => game({ season: 2025, passAttempts: 30, passingYards: 180, passingTds: 1, interceptions: 2 }));
    const rates = observedCareerRates([...old, ...now], 24);
    // Weighted by attempts across both eras, not the latest season alone.
    const expected = (16 * 300 + 8 * 180 + 20 * (16 * 3 + 8 * 1) - 45 * (16 * 0 + 8 * 2)) / (16 * 35 + 8 * 30);
    expect(rates.career_adjusted_yards_per_attempt).toBeCloseTo(expected, 10);
  });

  it('separates a large established career from a short hot streak — the whole point', () => {
    seq = 0;
    const veteran = observedCareerRates(
      Array.from({ length: 100 }, () => game({ passAttempts: 35, passingYards: 260, passingTds: 2, interceptions: 1 })),
      100,
    );
    seq = 0;
    const backup = observedCareerRates(
      Array.from({ length: 3 }, () => game({ passAttempts: 25, passingYards: 330, passingTds: 2, interceptions: 0 })),
      3,
    );
    // Both are real observations; the engine, not this module, decides how much each is worth.
    expect(backup.career_adjusted_yards_per_attempt).toBeGreaterThan(veteran.career_adjusted_yards_per_attempt!);
  });

  it('handles a negative career AY/A, which is arithmetically reachable', () => {
    seq = 0;
    const r = observedCareerRates([game({ passAttempts: 10, passingYards: 20, passingTds: 0, interceptions: 5 })], 1);
    expect(r.career_adjusted_yards_per_attempt).toBeCloseTo((20 - 225) / 10, 10);
  });

  it('excludes the postseason', () => {
    seq = 0;
    const reg = Array.from({ length: 8 }, () => game());
    const post = Array.from({ length: 3 }, () => game({ seasonType: 'POST', passingYards: 900, passAttempts: 30 }));
    expect(observedCareerRates([...reg, ...post], 8).career_adjusted_yards_per_attempt)
      .toBeCloseTo(235 / 30, 10);
  });

  it('reports nothing when the provider supplied no attempts', () => {
    seq = 0;
    expect(observedCareerRates([game({ passAttempts: null })], 1).career_adjusted_yards_per_attempt).toBeUndefined();
  });
});

describe('career rushing yards per start', () => {
  it('divides career rushing yards by career STARTS, not appearances', () => {
    seq = 0;
    // 10 games × 20 yards over 5 starts = 40 per start.
    expect(observedCareerRates(Array.from({ length: 10 }, () => game()), 5).career_rushing_yards_per_start)
      .toBeCloseTo(40, 10);
  });

  it('keeps a NEGATIVE career rushing rate — kneel-downs and sacks make it real', () => {
    // Mike White and Matt Barkley both carry one on the live board; treating it as invalid
    // cost them their valuation entirely.
    seq = 0;
    expect(observedCareerRates([game({ rushingYards: -12 })], 2).career_rushing_yards_per_start)
      .toBeCloseTo(-6, 10);
  });

  it('reports nothing without a start sample rather than dividing by zero', () => {
    seq = 0;
    expect(observedCareerRates([game()], 0).career_rushing_yards_per_start).toBeUndefined();
    seq = 0;
    expect(observedCareerRates([game()], null).career_rushing_yards_per_start).toBeUndefined();
  });

  it('is independent of the passing rate — one absent does not suppress the other', () => {
    seq = 0;
    const r = observedCareerRates([game({ passAttempts: null })], 4);
    expect(r.career_adjusted_yards_per_attempt).toBeUndefined();
    expect(r.career_rushing_yards_per_start).toBeCloseTo(5, 10);
  });
});

describe('windowing', () => {
  it('is order-independent', () => {
    seq = 0;
    const games = Array.from({ length: 10 }, (_, i) => game({ season: 2018 + i }));
    expect(observedCareerRates([...games].reverse(), 10)).toEqual(observedCareerRates(games, 10));
  });

  it('returns nothing at all for a player with no games', () => {
    expect(observedCareerRates([], 5)).toEqual({});
  });
});
