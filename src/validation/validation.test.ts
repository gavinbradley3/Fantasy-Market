import { describe, expect, it } from 'vitest';
import { pairwiseAccuracy, precisionAtN, ranks, rng, spearman } from './metrics';
import { horizonSeasons, outcomeFor, seasonTotals } from './outcomes';
import { computeBaselines } from './baselines';
import { decisionDate, scheduleRows } from './calendar';
import { parseCsv } from './csv';
import type { Dataset, PlayerGame, Pos } from './data';
import { lastOutcomeSeasonFor, periodOf } from './evaluate';
import type { ExperimentConfig } from './config';

const HOUR = 3_600_000;

function game(gsis: string, season: number, week: number, points: number, extra: Partial<PlayerGame> = {}): PlayerGame {
  return {
    gsis, name: gsis, position: 'RB', season, week, team: 'AAA', gameId: `${season}_${week}`,
    availableAt: Date.UTC(season, 8, 7 * week) + 5 * HOUR, points, attempts: 0, carries: 10, targets: 2, ...extra,
  };
}

function dataset(games: PlayerGame[]): Dataset {
  const teamSchedule = new Map<string, number[]>();
  for (const s of [2018, 2019, 2020, 2021]) {
    teamSchedule.set(`${s}|AAA`, Array.from({ length: 17 }, (_, i) => Date.UTC(s, 8, 7 * (i + 1)) + 5 * HOUR));
  }
  return { games, bios: new Map(), draft: [], teamSchedule };
}

describe('metrics', () => {
  it('ranks ties with the mean rank', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });
  it('spearman is 1 for monotone and -1 for reversed', () => {
    expect(spearman([1, 2, 3, 4], [10, 40, 90, 160])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
  it('pairwise accuracy ignores pairs closer than the gap and halves predicted ties', () => {
    const r = pairwiseAccuracy([3, 2, 2], [100, 50, 0], 25);
    expect(r.pairs).toBe(3);
    expect(r.acc).toBeCloseTo((1 + 1 + 0.5) / 3);
    expect(pairwiseAccuracy([1, 2], [10, 20], 25).pairs).toBe(0);
  });
  it('precision@N counts overlap of top sets', () => {
    expect(precisionAtN([5, 4, 3, 2], [1, 9, 8, 0], 2)).toBe(0.5);
  });
  it('rng is deterministic per seed', () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('outcomes', () => {
  it('uses the season ahead for OFFSEASON and the next full seasons in-season', () => {
    expect(horizonSeasons(2020, 'OFFSEASON')).toEqual([2020, 2021]);
    expect(horizonSeasons(2020, 'W8')).toEqual([2021, 2022]);
  });
  it('scores a player with no games as zero and nulls an incomplete horizon', () => {
    const t = seasonTotals([game('a', 2020, 1, 30), game('b', 2020, 1, 10)], [2020, 2021]);
    const a = outcomeFor(t, 'a', 'RB', 2020, 'OFFSEASON')!;
    expect(a.T1).toBe(30);
    expect(a.T2).toBe(30); // 2021: no games => 0
    expect(outcomeFor(t, 'a', 'RB', 2021, 'OFFSEASON')!.T2).toBeNull();
    expect(outcomeFor(t, 'a', 'RB', 2022, 'OFFSEASON')).toBeNull();
  });
});

describe('baselines', () => {
  it('never use a game that was not final at the decision instant', () => {
    const before = [game('a', 2019, 1, 20), game('a', 2020, 1, 10)];
    const leak = game('a', 2020, 2, 500);
    const asOf = leak.availableAt - 1;
    const pop = new Map<string, Pos>([['a', 'RB']]);
    const run = (games: PlayerGame[]) =>
      computeBaselines({ ds: dataset(games), asOfMs: asOf, decisionSeason: 2020, checkpoint: 'W1', population: pop, positionOf: () => 'RB' });
    const without = run(before);
    const withLeak = run([...before, leak]);
    for (const id of ['A_prev_season', 'B_recency', 'C_age_adjusted', 'D_opportunity'] as const) {
      expect(withLeak[id].T1.get('a')).toBe(without[id].T1.get('a'));
    }
  });
  it('A is the last completed season total', () => {
    const r = computeBaselines({
      ds: dataset([game('a', 2019, 1, 20), game('a', 2019, 2, 5), game('a', 2018, 1, 99)]),
      asOfMs: Date.UTC(2020, 7, 1), decisionSeason: 2020, checkpoint: 'OFFSEASON',
      population: new Map([['a', 'RB' as Pos]]), positionOf: () => 'RB',
    });
    expect(r.A_prev_season.T1.get('a')).toBe(25);
  });
});

describe('calendar', () => {
  const schedule = scheduleRows(
    parseCsv(['season,week,game_type,gameday,gametime', '2022,1,REG,2022-09-08,20:20', '2022,1,REG,2022-09-12,20:15', '2022,4,REG,2022-10-03,20:15'].join('\n')),
  );
  it('OFFSEASON is seven days before the first kickoff', () => {
    expect(decisionDate(schedule, 2022, 'OFFSEASON').asOf).toBe('2022-09-02T00:20:00.000Z');
  });
  it('a week checkpoint is twelve hours after the last kickoff of that week', () => {
    expect(decisionDate(schedule, 2022, 'W4').asOf).toBe('2022-10-04T12:15:00.000Z');
  });
});

describe('sealing', () => {
  const config = { periods: { development: [2019], validation: [2022], test: [2024, 2025] } } as unknown as ExperimentConfig;
  it('reads no outcome season inside the test period unless unsealed', () => {
    expect(lastOutcomeSeasonFor(config)).toBe(2023);
    expect(lastOutcomeSeasonFor(config, 'final report')).toBe(2025);
  });
  it('assigns periods by decision season', () => {
    expect(periodOf(config, 2019)).toBe('development');
    expect(periodOf(config, 2024)).toBe('test');
    expect(periodOf(config, 2018)).toBeNull();
  });
});
