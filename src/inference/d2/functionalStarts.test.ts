import { describe, expect, it } from 'vitest';
import {
  computeFunctionalStarts,
  isFunctionalStart,
  type QbGameRow,
} from '@/inference/d2/functionalStarts';
import { LIMITATION_CODES } from '@/inference/types';

const asOf = '2025-12-01T00:00:00.000Z';

function game(p: Partial<QbGameRow> & { gameId: string }): QbGameRow {
  return { kickoff: '2025-09-10T00:00:00.000Z', seasonType: 'REG', season: 2025, team: 'AAA', qbSnapShare: 0.9, passAttempts: 25, ...p };
}

describe('D2 functional QB starts (REGISTRY §9)', () => {
  it('functional_start = majority snaps AND ≥ T_START attempts', () => {
    expect(isFunctionalStart(game({ gameId: 'g', qbSnapShare: 0.5, passAttempts: 10 }))).toBe(true);
    expect(isFunctionalStart(game({ gameId: 'g', qbSnapShare: 0.5, passAttempts: 9 }))).toBe(false);
    expect(isFunctionalStart(game({ gameId: 'g', qbSnapShare: 0.49, passAttempts: 10 }))).toBe(false);
  });

  it('DIRECT official starts are official and unpenalized', () => {
    const r = computeFunctionalStarts({ asOf, official: { careerStarts: 60, recentStarts: 16, recentGames: 17, provenance: 'DIRECT' } });
    expect(r.provenance).toBe('DIRECT');
    expect(r.startsOfficial).toBe(true);
    expect(r.recentStartRate).toBe(0.9412);
    expect(r.startInferencePenalty).toBe(0);
  });

  it('DERIVED official starts are also official', () => {
    const r = computeFunctionalStarts({ asOf, official: { careerStarts: 50, recentStarts: 10, recentGames: 12, provenance: 'DERIVED' } });
    expect(r.startsOfficial).toBe(true);
  });

  it('inferred functional starts are MODEL_ESTIMATE, not official, penalized 120', () => {
    const games = [
      game({ gameId: 'g1', qbSnapShare: 0.9, passAttempts: 25 }), // start
      game({ gameId: 'g2', qbSnapShare: 0.3, passAttempts: 25 }), // not majority
      game({ gameId: 'g3', qbSnapShare: 0.6, passAttempts: 8 }), // < T_START
    ];
    const r = computeFunctionalStarts({ asOf, games, last17TeamGameIds: ['g1', 'g2', 'g3'] });
    expect(r.provenance).toBe('MODEL_ESTIMATE');
    expect(r.startsOfficial).toBe(false);
    expect(r.careerStarts).toBe(1);
    expect(r.recentStarts).toBe(1);
    expect(r.recentGames).toBe(3);
    expect(r.recentStartRate).toBe(0.3333);
    expect(r.limitations).toContain(LIMITATION_CODES.INFERRED_START_NOT_OFFICIAL);
    expect(r.startInferencePenalty).toBe(120);
  });

  it('career aggregates across teams (multi-team season); postseason & future excluded', () => {
    const games = [
      game({ gameId: 'a', team: 'AAA' }),
      game({ gameId: 'b', team: 'BBB' }),
      game({ gameId: 'post', seasonType: 'POST' }), // excluded
      game({ gameId: 'future', kickoff: '2026-01-05T00:00:00.000Z' }), // > asOf excluded
    ];
    const r = computeFunctionalStarts({ asOf, games, last17TeamGameIds: ['a', 'b'] });
    expect(r.careerStarts).toBe(2); // AAA + BBB only
  });

  it('recent window boundary: only last-17 team games count toward recent', () => {
    const games = [game({ gameId: 'in' }), game({ gameId: 'out' })];
    const r = computeFunctionalStarts({ asOf, games, last17TeamGameIds: ['in'] });
    expect(r.recentGames).toBe(1);
    expect(r.recentStarts).toBe(1);
  });

  it('no covered games and no official → UNAVAILABLE', () => {
    const r = computeFunctionalStarts({ asOf, games: [] });
    expect(r.careerStatus).toBe('UNAVAILABLE');
    expect(r.careerStarts).toBeNull();
  });

  it('recent_games 0 → recent NOT_APPLICABLE', () => {
    const r = computeFunctionalStarts({ asOf, games: [game({ gameId: 'g1' })], last17TeamGameIds: [] });
    expect(r.recentStatus).toBe('NOT_APPLICABLE');
    expect(r.recentStarts).toBeNull();
  });
});
