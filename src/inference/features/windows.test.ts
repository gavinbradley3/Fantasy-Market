import { describe, expect, it } from 'vitest';
import { coveredGamesCount, regularSeasonOnly, rollingWindow } from '@/inference/features/windows';
import type { PlayerGameUsage } from '@/inference/features/types';

function usage(p: Partial<PlayerGameUsage> & { canonicalId: string; gameId: string; kickoff: string }): PlayerGameUsage {
  return {
    team: 'AAA',
    season: 2025,
    seasonType: 'REG',
    sourceTimestamp: p.kickoff,
    targetShare: null,
    carryShare: null,
    snapShare: null,
    routeParticipation: null,
    goalLineCarryShare: null,
    adot: null,
    tprr: null,
    touches: null,
    participationCovered: false,
    ...p,
  };
}

const asOf = '2025-10-01T00:00:00.000Z';

describe('windows (REGISTRY §20.F11)', () => {
  it('postseason exclusion', () => {
    const rows = [
      usage({ canonicalId: 'p', gameId: 'reg', kickoff: '2025-09-10T00:00:00.000Z', seasonType: 'REG' }),
      usage({ canonicalId: 'p', gameId: 'post', kickoff: '2025-09-20T00:00:00.000Z', seasonType: 'POST' }),
    ];
    expect(regularSeasonOnly(rows).map((r) => r.gameId)).toEqual(['reg']);
  });

  it('rolling window returns the most recent n games (kickoff < asOf), newest first', () => {
    const rows = [1, 2, 3, 4, 5].map((w) =>
      usage({ canonicalId: 'p', gameId: `w${w}`, kickoff: `2025-09-0${w}T00:00:00.000Z` }),
    );
    const w = rollingWindow(rows, 'p', asOf, 4);
    expect(w.map((r) => r.gameId)).toEqual(['w5', 'w4', 'w3', 'w2']);
  });

  it('rolling window excludes games at/after asOf and other players', () => {
    const rows = [
      usage({ canonicalId: 'p', gameId: 'past', kickoff: '2025-09-01T00:00:00.000Z' }),
      usage({ canonicalId: 'p', gameId: 'future', kickoff: '2025-10-05T00:00:00.000Z' }),
      usage({ canonicalId: 'q', gameId: 'other', kickoff: '2025-09-02T00:00:00.000Z' }),
    ];
    expect(rollingWindow(rows, 'p', asOf, 4).map((r) => r.gameId)).toEqual(['past']);
  });

  it('covered games counts participation-covered regular-season games', () => {
    const rows = [
      usage({ canonicalId: 'p', gameId: 'c1', kickoff: '2025-09-01T00:00:00.000Z', participationCovered: true }),
      usage({ canonicalId: 'p', gameId: 'u1', kickoff: '2025-09-08T00:00:00.000Z', participationCovered: false }),
      usage({ canonicalId: 'p', gameId: 'c2', kickoff: '2025-09-15T00:00:00.000Z', participationCovered: true }),
    ];
    expect(coveredGamesCount(rows, 'p', asOf)).toBe(2);
  });
});
