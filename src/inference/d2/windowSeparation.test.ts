// Drift guard for REGISTRY §9.2.1 — the role window (17) and the engine window (8) are two
// different windows with two different consumers. Every past failure here came from someone
// collapsing them into one, so each half is asserted independently.

import { describe, expect, it } from 'vitest';
import { computeFunctionalStarts, type QbGameRow } from './functionalStarts';
import { D2_ROLE_WINDOW_GAMES, RECENT_GAME_WINDOW } from '@/ingestion/observedFacts';
import { validateInput } from '@/qb-model/validation';
import { baseInput } from '../../../tests/qb-model/helpers';

describe('§9.2.1 — the two windows are distinct constants', () => {
  it('the engine window is 8 and the role window is 17', () => {
    expect(RECENT_GAME_WINDOW).toBe(8);
    expect(D2_ROLE_WINDOW_GAMES).toBe(17);
  });

  it('neither is defined in terms of the other', () => {
    expect(RECENT_GAME_WINDOW).not.toBe(D2_ROLE_WINDOW_GAMES);
  });

  it('the engine accepts the engine window and rejects the role window', () => {
    // This is WHY the engine window is 8. Asserted against a complete, otherwise-valid
    // input, so if the engine ever widens its bound the constant is revisited deliberately
    // instead of drifting.
    const atEngineWindow = baseInput({ recent_games: RECENT_GAME_WINDOW, recent_starts: RECENT_GAME_WINDOW });
    expect(() => validateInput(atEngineWindow)).not.toThrow();

    const atRoleWindow = baseInput({ recent_games: D2_ROLE_WINDOW_GAMES, recent_starts: RECENT_GAME_WINDOW });
    expect(() => validateInput(atRoleWindow)).toThrow(/recent_games must be within/);
  });
});

const game = (i: number, start: boolean): QbGameRow => ({
  gameId: `g${String(i).padStart(2, '0')}`,
  kickoff: `2025-01-${String(i).padStart(2, '0')}T00:00:00.000Z`,
  seasonType: 'REG',
  season: 2025,
  team: 'BUF',
  qbSnapShare: start ? 0.9 : 0.1,
  passAttempts: start ? 30 : 2,
});

describe('§9.2.1 — official rung keeps the rate on the role window', () => {
  it('computes recent_start_rate from the role window, not the engine window', () => {
    const result = computeFunctionalStarts({
      asOf: '2026-01-01T00:00:00.000Z',
      official: {
        careerStarts: 17,
        // Engine window: 8 games, 8 starts.
        recentStarts: 8,
        recentGames: 8,
        // Role window: 17 games, only 9 starts → a materially different rate.
        roleWindowStarts: 9,
        roleWindowGames: 17,
        provenance: 'DERIVED',
      },
    });

    // Engine inputs come from the engine window and satisfy the engine's bound.
    expect(result.recentGames).toBe(8);
    expect(result.recentStarts).toBe(8);
    expect(result.recentGames).toBeLessThanOrEqual(RECENT_GAME_WINDOW);
    expect(result.recentStarts!).toBeLessThanOrEqual(result.recentGames);

    // The rate is 9/17, NOT 8/8 — proving the windows did not collapse.
    expect(result.recentStartRate).toBe(0.5294);
    expect(result.recentStartRate).not.toBe(1);
  });
});

describe('§9.2.1 — inferred rung keeps the rate on the role window', () => {
  it('counts engine inputs over 8 games and the rate over 17', () => {
    // 17 games: the 8 most recent are starts, the 9 older ones are not.
    const games = Array.from({ length: 17 }, (_, i) => game(17 - i, i < 8));
    const ids = games.map((g) => g.gameId);

    const result = computeFunctionalStarts({
      asOf: '2026-01-01T00:00:00.000Z',
      games,
      last17TeamGameIds: ids,
      engineWindowTeamGameIds: ids.slice(0, 8),
    });

    expect(result.recentGames).toBe(8);
    expect(result.recentStarts).toBe(8);
    // 8 starts across 17 role-window games.
    expect(result.recentStartRate).toBe(0.4706);
  });

  it('falls back to the role window only when no engine window is supplied', () => {
    // Preserves the behaviour of a caller that passes a single set of ids.
    const games = Array.from({ length: 4 }, (_, i) => game(4 - i, true));
    const ids = games.map((g) => g.gameId);
    const result = computeFunctionalStarts({ asOf: '2026-01-01T00:00:00.000Z', games, last17TeamGameIds: ids });
    expect(result.recentGames).toBe(4);
    expect(result.recentStartRate).toBe(1);
  });
});
