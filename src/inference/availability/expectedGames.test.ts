import { describe, expect, it } from 'vitest';
import {
  durabilityAdjustment,
  expectedGamesRemaining,
} from '@/inference/availability/expectedGames';

describe('expected games remaining (REGISTRY §7.2 + §20.F6)', () => {
  it('standard healthy uniform case', () => {
    // 10 * 0.97 * 1.0 = 9.7
    expect(
      expectedGamesRemaining({ gamesLeft: 10, availProb: 0.97, missedRateLast16: 0 }).expectedGamesRemaining,
    ).toBe(9.7);
  });

  it('durability applies within [0.85, 1.0]', () => {
    expect(durabilityAdjustment(0)).toBe(1.0);
    expect(durabilityAdjustment(0.5)).toBe(0.85); // 1 - 0.25 = 0.75 → clamped to 0.85
    // 10 * 0.97 * 0.85 = 8.245 → 8.2
    expect(
      expectedGamesRemaining({ gamesLeft: 10, availProb: 0.97, missedRateLast16: 0.5 }).expectedGamesRemaining,
    ).toBe(8.2);
  });

  it('Fx6: known two-game suspension with more games left removes only those games', () => {
    // playable = 9 - 2 = 7; 7 * 0.97 * 1.0 = 6.79 → 6.8
    const r = expectedGamesRemaining({
      gamesLeft: 9,
      availProb: 0.97,
      missedRateLast16: 0,
      suspension: { suspended: true, remainingSuspendedGames: 2 },
    });
    expect(r.expectedGamesRemaining).toBe(6.8);
    expect(r.suspensionUnknownLength).toBe(false);
  });

  it('suspension longer than remaining schedule → 0.0', () => {
    const r = expectedGamesRemaining({
      gamesLeft: 3,
      availProb: 0.97,
      missedRateLast16: 0,
      suspension: { suspended: true, remainingSuspendedGames: 5 },
    });
    expect(r.expectedGamesRemaining).toBe(0.0);
  });

  it('unknown suspension length → 0.0 with flag', () => {
    const r = expectedGamesRemaining({
      gamesLeft: 8,
      availProb: 0.97,
      missedRateLast16: 0,
      suspension: { suspended: true },
    });
    expect(r.expectedGamesRemaining).toBe(0.0);
    expect(r.suspensionUnknownLength).toBe(true);
  });

  it('zero games remaining → 0.0', () => {
    expect(
      expectedGamesRemaining({ gamesLeft: 0, availProb: 0.97, missedRateLast16: 0 }).expectedGamesRemaining,
    ).toBe(0.0);
  });
});
