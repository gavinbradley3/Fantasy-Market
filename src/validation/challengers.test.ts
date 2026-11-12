import { afterEach, describe, expect, it } from 'vitest';
import { computeBaselines, recencyRate, BASELINE_CONSTANTS } from './baselines';
import { computeTwoPart, curveValue, fitLine, fitTwoPart, realisedRankCurve } from './challengers';
import type { Dataset, PlayerGame, Pos } from './data';
import { configureModels, MODELS, PAIRS } from './evaluate';
import { REPLACEMENT_RANK } from './outcomes';

const HOUR = 3_600_000;
const SEASONS = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021];

function game(gsis: string, season: number, week: number, points: number, extra: Partial<PlayerGame> = {}): PlayerGame {
  return {
    gsis, name: gsis, position: 'RB', season, week, team: 'AAA', gameId: `${season}_${week}`,
    availableAt: Date.UTC(season, 8, 7 * week) + 5 * HOUR, points, attempts: 0, carries: 10, targets: 2, ...extra,
  };
}

function dataset(games: PlayerGame[]): Dataset {
  const teamSchedule = new Map<string, number[]>();
  for (const s of SEASONS) teamSchedule.set(`${s}|AAA`, Array.from({ length: 17 }, (_, i) => Date.UTC(s, 8, 7 * (i + 1)) + 5 * HOUR));
  return { games, bios: new Map(), draft: [], teamSchedule };
}

/** A league of RBs with different workloads and availability, so the fits have spread. */
function league(): PlayerGame[] {
  const games: PlayerGame[] = [];
  for (let p = 0; p < 12; p++) {
    for (const s of SEASONS) {
      const played = 5 + ((p * 7 + s) % 13); // 5..17 games
      for (let w = 1; w <= played; w++) games.push(game(`p${p}`, s, w, 4 + p + ((w + s) % 3)));
    }
  }
  return games;
}

describe('challenger F', () => {
  it('its two inputs multiply back to baseline B exactly', () => {
    const ds = dataset(league());
    const asOf = Date.UTC(2020, 7, 1);
    const pop = new Map<string, Pos>([['p3', 'RB']]);
    const b = computeBaselines({ ds, asOfMs: asOf, decisionSeason: 2020, checkpoint: 'OFFSEASON', population: pop, positionOf: () => 'RB' }).B_recency.T1.get('p3')!;
    const seasons = new Map<number, PlayerGame[]>();
    for (const g of ds.games) if (g.gsis === 'p3' && g.season >= 2017 && g.season <= 2019) seasons.set(g.season, [...(seasons.get(g.season) ?? []), g]);
    const r = recencyRate(seasons, ds, asOf, 2019, 'RB');
    expect(BASELINE_CONSTANTS.seasonGames * r.gamesShare * r.ptsPerGamePlayed).toBeCloseTo(b, 9);
  });

  it('never uses a game that was not final at the decision instant', () => {
    const base = league().filter((g) => g.season <= 2019 || (g.season === 2020 && g.week <= 4));
    const asOf = game('x', 2020, 4, 0).availableAt + 1;
    const future = league()
      .filter((g) => g.season > 2020 || (g.season === 2020 && g.week > 4))
      .map((g) => ({ ...g, points: g.points * 50 }));
    const pop = new Map<string, Pos>(Array.from({ length: 12 }, (_, p) => [`p${p}`, 'RB' as Pos]));
    const run = (games: PlayerGame[]) => computeTwoPart({ ds: dataset(games), asOfMs: asOf, decisionSeason: 2020, checkpoint: 'W4', population: pop, positionOf: () => 'RB' });
    const without = run(base);
    const withFuture = run([...base, ...future]);
    for (const g of pop.keys()) {
      expect(withFuture.T1.get(g)).toBe(without.T1.get(g));
      expect(withFuture.T2.get(g)).toBe(without.T2.get(g));
    }
  });

  it('fits only on seasons completed before the decision', () => {
    const upTo2019 = fitTwoPart(dataset(league().filter((g) => g.season <= 2019)), 2019, 'RB', () => 'RB');
    const withLater = fitTwoPart(dataset(league().map((g) => (g.season > 2019 ? { ...g, points: 999 } : g))), 2019, 'RB', () => 'RB');
    expect(withLater.share[0].line).toEqual(upTo2019.share[0].line);
    expect(withLater.rate[1].line).toEqual(upTo2019.rate[1].line);
  });

  it('counts a player who did not play the later season as games share zero', () => {
    // One player retires after 2016; the others keep playing every game.
    const games: PlayerGame[] = [];
    for (const s of SEASONS) for (let w = 1; w <= 17; w++) for (const p of ['a', 'b', 'c']) if (p !== 'c' || s <= 2016) games.push(game(p, s, w, 10));
    const fit = fitTwoPart(dataset(games), 2019, 'RB', () => 'RB');
    // 'c' contributes (share 1 -> 0) rows for 2017 and 2018 (his window still holds games), so the mean of y is below 1.
    expect(fit.share[0].line.n).toBeGreaterThan(0);
    expect(fit.share[0].line.a + fit.share[0].line.b * 1).toBeLessThan(1);
    // The rate fit has no row for a season he did not play.
    expect(fit.rate[0].line.n).toBeLessThan(fit.share[0].line.n);
  });

  it('scores a player with no available games as zero', () => {
    const r = computeTwoPart({ ds: dataset(league()), asOfMs: Date.UTC(2020, 7, 1), decisionSeason: 2020, checkpoint: 'OFFSEASON', population: new Map([['nobody', 'RB' as Pos]]), positionOf: () => 'RB' });
    expect(r.T1.get('nobody')).toBe(0);
    expect(r.T2.get('nobody')).toBe(0);
  });

  it('fitLine recovers a straight line', () => {
    const line = fitLine([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(line.a).toBeCloseTo(1, 9);
    expect(line.b).toBeCloseTo(2, 9);
  });
});

describe('value-layer-only variants of the incumbent', () => {
  it('the realised rank curve reads only seasons completed before the decision', () => {
    const a = realisedRankCurve(dataset(league().filter((g) => g.season <= 2019)), 2019);
    const b = realisedRankCurve(dataset(league().map((g) => (g.season > 2019 ? { ...g, points: 999 } : g))), 2019);
    expect(b.RB).toEqual(a.RB);
  });

  it('a better position rank is never worth less, and replacement rank is worth zero', () => {
    const curve = Array.from({ length: 80 }, (_, i) => 300 - 3 * i);
    let prev = Infinity;
    for (let r = 1; r <= 80; r++) {
      const v = curveValue(curve, r, 'RB');
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(curveValue(curve, REPLACEMENT_RANK.RB, 'RB')).toBe(0);
    expect(curveValue(curve, null, 'RB')).toBe(0);
    expect(curveValue(curve, 500, 'RB')).toBe(0);
  });
});

describe('challengers are opt-in', () => {
  afterEach(() => configureModels({}));
  it('scores the original five models unless the experiment asks for challengers', () => {
    configureModels({});
    expect(MODELS).toEqual(['E_playerticker', 'A_prev_season', 'B_recency', 'C_age_adjusted', 'D_opportunity']);
    expect(PAIRS).toEqual([]);
    configureModels({ challengers: true });
    expect(MODELS).toContain('F_two_part');
    expect(MODELS).toContain('E_curve_value');
  });
});
