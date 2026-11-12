import { describe, expect, it } from 'vitest';
import type { Dataset, PlayerGame } from './data';
import { buildUsageRows, ols, predict, type TeamGame } from './usage';

const H = 3_600_000;
const kick = (w: number) => Date.UTC(2021, 8, 7 * w);
const game = (gsis: string, w: number, points: number, carries = 10, targets = 2): PlayerGame => ({
  gsis, name: gsis, position: 'RB', season: 2021, week: w, team: 'AAA', gameId: `g${w}`, availableAt: kick(w) + 5 * H, points, attempts: 0, carries, targets,
});
const teamGames: TeamGame[] = Array.from({ length: 12 }, (_, i) => ({ gameId: `g${i + 1}`, season: 2021, week: i + 1, team: 'AAA', kickoff: kick(i + 1), availableAt: kick(i + 1) + 5 * H }));
function inputs(games: PlayerGame[]) {
  const ds: Dataset = { games, bios: new Map(), draft: [], teamSchedule: new Map([['2021|AAA', teamGames.map((t) => t.availableAt)]]) };
  return {
    ds,
    teamGames: new Map([['AAA|2021', teamGames]]),
    teamTotals: new Map(teamGames.map((t) => [`AAA|${t.gameId}`, { carries: 25, targets: 30 }])),
    snapShare: new Map(games.map((g) => [`${g.gsis}|${g.gameId}`, 0.5])),
    positionOf: () => 'RB' as const,
  };
}
const asOf = kick(6) + 12 * H;

describe('usage rows', () => {
  it('reads no game after the decision instant into a feature', () => {
    const past = [1, 2, 3, 4, 5, 6].map((w) => game('a', w, 10));
    const a = buildUsageRows(inputs(past), 2021, 6, asOf, [3])[0];
    const b = buildUsageRows(inputs([...past, game('a', 7, 99, 40, 15)]), 2021, 6, asOf, [3])[0];
    expect(b.f).toEqual(a.f);
  });
  it('counts a missed future game as zero', () => {
    const games = [1, 2, 3, 4, 5, 6].map((w) => game('a', w, 10)).concat([game('a', 7, 12), game('a', 9, 6)]);
    const r = buildUsageRows(inputs(games), 2021, 6, asOf, [3])[0];
    expect(r.y[3].gamesPlayed).toBe(2);
    expect(r.y[3].points).toBeCloseTo((12 + 0 + 6) / 3, 10);
  });
  it('measures carry share against the team total', () => {
    const r = buildUsageRows(inputs([1, 2, 3, 4, 5, 6].map((w) => game('a', w, 10, 10))), 2021, 6, asOf, [3])[0];
    expect(r.f.carry_lvl).toBeCloseTo(10 / 25, 10);
    expect(r.f.carry_chg).toBeCloseTo(0, 10);
  });
});

describe('ols', () => {
  it('recovers an exact linear relation', () => {
    const X = [[1, 0], [0, 1], [2, 3], [4, 1], [3, 3]];
    const y = X.map(([a, b]) => 1 + 2 * a - 0.5 * b);
    const beta = ols(X, y);
    expect(beta[0]).toBeCloseTo(1, 9);
    expect(predict(beta, [5, 2])).toBeCloseTo(1 + 10 - 1, 9);
  });
});
