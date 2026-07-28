import { describe, expect, it } from 'vitest';
import { evaluateAccessibleRB, evaluateAccessibleTE } from '@/accessible';
import type { AccessibleOutput } from '@/accessible';

const AS_OF = '2026-02-15T00:00:00.000Z';
const w = (games: number, per: Record<string, number>) => {
  const o: Record<string, number | null> = { games, carries: null, rushingYards: null, rushingTds: null, targets: null, receptions: null, receivingYards: null, receivingTds: null };
  for (const [k, v] of Object.entries(per)) o[k] = v * games;
  return o as never;
};
const inp = (position: 'RB' | 'TE', career: never, over: Record<string, unknown> = {}) => ({
  canonicalId: 'x', position, asOf: AS_OF, age: 25, draftRound: 2, seasonsCompleted: 3,
  expectedGamesRemaining: 8, availability: 'HEALTHY' as const, team: 'KC', teamChanged: null,
  production: { career, recent: career, roleWindow: career, latestSeason: null, priorSeason: null,
    teamShares: null, seasonsPlayed: 1, newestGameKickoff: '2026-01-04T18:00:00.000Z',
    rosteredTeamWeeks: (career as unknown as {games:number}).games },
  ...over,
} as never);
const val = (r: { tier: string }) => (r as AccessibleOutput);

describe('headline positionValue monotonicity', () => {
  it('RB: rises with carries per game', () => {
    let prev = -1;
    for (const c of [0.5, 2, 5, 9, 13, 17, 21, 25]) {
      const v = val(evaluateAccessibleRB(inp('RB', w(17, { carries: c, rushingYards: c * 4.3 }))));
      expect(v.positionValue).toBeGreaterThanOrEqual(prev);
      prev = v.positionValue;
    }
  });
  it('RB: rises with targets per game', () => {
    let prev = -1;
    for (const t of [0, 1, 2, 3.5, 5, 7]) {
      const v = val(evaluateAccessibleRB(inp('RB', w(17, { carries: 10, rushingYards: 43, targets: t, receptions: t * 0.75, receivingYards: t * 0.75 * 8 }))));
      expect(v.positionValue).toBeGreaterThanOrEqual(prev);
      prev = v.positionValue;
    }
  });
  it('RB: falls monotonically with age past the peak', () => {
    let prev = 101;
    for (const age of [23, 25, 27, 29, 31, 33]) {
      const v = val(evaluateAccessibleRB(inp('RB', w(17, { carries: 15, rushingYards: 65, targets: 3, receptions: 2.3, receivingYards: 18 }), { age })));
      expect(v.positionValue).toBeLessThanOrEqual(prev);
      prev = v.positionValue;
    }
  });
  it('TE: rises with targets per game', () => {
    let prev = -1;
    for (const t of [0.5, 1.5, 2.5, 4, 5.5, 7, 9]) {
      const v = val(evaluateAccessibleTE(inp('TE', w(17, { targets: t, receptions: t * 0.68, receivingYards: t * 0.68 * 10.8 }))));
      expect(v.positionValue).toBeGreaterThanOrEqual(prev);
      prev = v.positionValue;
    }
  });
  it('TE: falls monotonically with age past the peak', () => {
    let prev = 101;
    for (const age of [26, 29, 31, 33, 35, 37]) {
      const v = val(evaluateAccessibleTE(inp('TE', w(17, { targets: 5, receptions: 3.4, receivingYards: 38 }), { age })));
      expect(v.positionValue).toBeLessThanOrEqual(prev);
      prev = v.positionValue;
    }
  });
});
