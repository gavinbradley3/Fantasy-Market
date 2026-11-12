// Baselines the frozen PlayerTicker model must beat. Every input is filtered to games whose final
// box score was available at the decision instant (availableAt <= asOf). Constants are fixed a
// priori in this file and archived with the results; none is fitted to backtest outcomes.
//
//   A  previous-season production   total PPR points in the last COMPLETED season
//   B  recency-weighted production   points per scheduled team game over the last 3 seasons,
//                                     season weight 0.5^age (age 0 = most recent season with
//                                     available games), weighted by scheduled games so a partial
//                                     season counts in proportion; x17 for a season scale
//   C  age-adjusted production       B x expected change for the player's age, fitted at each
//                                     decision only on season pairs completed before it
//   D  opportunity and efficiency    recency-weighted opportunities per scheduled game x the
//                                     player's points per opportunity shrunk toward the league
//                                     rate (prior strength 100 opportunities)
//
// Players with no available games score 0 on every baseline (they tie at the bottom).

import { ageAt, type Dataset, type PlayerGame, type Pos } from './data';

export const BASELINE_CONSTANTS = Object.freeze({
  historySeasons: 3,
  recencyHalfLifeSeasons: 1,
  seasonGames: 17,
  ageCurve: { minBaselinePoints: 50, minPairs: 25, clamp: [0.5, 1.5] as const },
  efficiencyPriorOpportunities: 100,
});

export type BaselineId = 'A_prev_season' | 'B_recency' | 'C_age_adjusted' | 'D_opportunity';
export const BASELINES: readonly BaselineId[] = ['A_prev_season', 'B_recency', 'C_age_adjusted', 'D_opportunity'];

export interface BaselineScores {
  /** Season-scale points for the first horizon season. */
  readonly T1: ReadonlyMap<string, number>;
  /** Season-scale points across both horizon seasons. */
  readonly T2: ReadonlyMap<string, number>;
}

const opportunities = (g: PlayerGame, pos: Pos) =>
  pos === 'QB' ? g.attempts + g.carries : pos === 'RB' ? g.carries + g.targets : g.targets;

/** Games by player and season available at the instant, restricted to the history window. */
export function availableHistory(ds: Dataset, asOfMs: number, decisionSeason: number) {
  const first = decisionSeason - BASELINE_CONSTANTS.historySeasons;
  const byPlayer = new Map<string, Map<number, PlayerGame[]>>();
  for (const g of ds.games) {
    if (g.availableAt > asOfMs || g.season < first || g.season > decisionSeason) continue;
    const m = byPlayer.get(g.gsis) ?? new Map<number, PlayerGame[]>();
    const list = m.get(g.season) ?? [];
    list.push(g);
    m.set(g.season, list);
    byPlayer.set(g.gsis, m);
  }
  return byPlayer;
}

/** Regular-season games the team had played, final by the instant. */
function scheduledGames(ds: Dataset, season: number, team: string, asOfMs: number): number {
  const list = ds.teamSchedule.get(`${season}|${team}`) ?? [];
  let n = 0;
  for (const t of list) if (t <= asOfMs) n++;
  return n;
}

function latestSeasonWithGames(ds: Dataset, asOfMs: number): number {
  let latest = -Infinity;
  for (const g of ds.games) if (g.availableAt <= asOfMs && g.season > latest) latest = g.season;
  return latest;
}

interface Rate {
  ptsPerGame: number;
  oppPerGame: number;
  pts: number;
  opp: number;
}

function recencyRate(seasons: Map<number, PlayerGame[]>, ds: Dataset, asOfMs: number, latest: number, pos: Pos): Rate {
  let wPts = 0;
  let wOpp = 0;
  let wGames = 0;
  let pts = 0;
  let opp = 0;
  for (const [season, games] of seasons) {
    const w = Math.pow(0.5, (latest - season) / BASELINE_CONSTANTS.recencyHalfLifeSeasons);
    const team = games[games.length - 1].team;
    const sched = Math.max(scheduledGames(ds, season, team, asOfMs), games.length);
    const sp = games.reduce((s, g) => s + g.points, 0);
    const so = games.reduce((s, g) => s + opportunities(g, pos), 0);
    wPts += w * sp;
    wOpp += w * so;
    wGames += w * sched;
    pts += sp;
    opp += so;
  }
  return wGames > 0 ? { ptsPerGame: wPts / wGames, oppPerGame: wOpp / wGames, pts, opp } : { ptsPerGame: 0, oppPerGame: 0, pts: 0, opp: 0 };
}

/**
 * Year-over-year change in season points by position and age, from pairs (s, s+1) with s+1 at
 * or before the last completed season. Ratio of means among players with >= 50 points in s,
 * pooled with neighbouring ages until 25 pairs, clamped to [0.5, 1.5].
 */
export function fitAgeCurve(ds: Dataset, lastCompleted: number, pos: Pos, positionOf: (gsis: string) => Pos | null) {
  const totals = new Map<string, Map<number, number>>();
  for (const g of ds.games) {
    if (g.season > lastCompleted) continue;
    const m = totals.get(g.gsis) ?? new Map<number, number>();
    m.set(g.season, (m.get(g.season) ?? 0) + g.points);
    totals.set(g.gsis, m);
  }
  const byAge = new Map<number, { a: number; b: number; n: number }>();
  for (const [gsis, m] of totals) {
    if (positionOf(gsis) !== pos) continue;
    const bio = ds.bios.get(gsis);
    for (const [s, p] of m) {
      if (s + 1 > lastCompleted || p < BASELINE_CONSTANTS.ageCurve.minBaselinePoints) continue;
      const age = ageAt(bio?.birthDate ?? null, Date.UTC(s, 8, 1));
      if (age === null) continue;
      const k = Math.floor(age);
      const cell = byAge.get(k) ?? { a: 0, b: 0, n: 0 };
      cell.a += p;
      cell.b += m.get(s + 1) ?? 0;
      cell.n += 1;
      byAge.set(k, cell);
    }
  }
  const [lo, hi] = BASELINE_CONSTANTS.ageCurve.clamp;
  return (age: number): number => {
    const k = Math.floor(age);
    let a = 0;
    let b = 0;
    let n = 0;
    for (let r = 0; r <= 6 && n < BASELINE_CONSTANTS.ageCurve.minPairs; r++) {
      for (const kk of r === 0 ? [k] : [k - r, k + r]) {
        const c = byAge.get(kk);
        if (c) {
          a += c.a;
          b += c.b;
          n += c.n;
        }
      }
    }
    if (n === 0 || a === 0) return 1;
    return Math.min(hi, Math.max(lo, b / a));
  };
}

/** League points per opportunity at the position over completed seasons in the history window. */
function leaguePpo(history: Map<string, Map<number, PlayerGame[]>>, lastCompleted: number, positionOf: (g: string) => Pos | null, pos: Pos) {
  let pts = 0;
  let opp = 0;
  for (const [gsis, seasons] of history) {
    if (positionOf(gsis) !== pos) continue;
    for (const [s, games] of seasons) {
      if (s > lastCompleted) continue;
      for (const g of games) {
        pts += g.points;
        opp += opportunities(g, pos);
      }
    }
  }
  return opp > 0 ? pts / opp : 0;
}

export interface BaselineContext {
  readonly ds: Dataset;
  readonly asOfMs: number;
  readonly decisionSeason: number;
  readonly checkpoint: string;
  /** Population and positions (from the frozen board at that date). */
  readonly population: ReadonlyMap<string, Pos>;
  /** Position lookup for curve fitting, covering players beyond the population. */
  readonly positionOf: (gsis: string) => Pos | null;
}

export function computeBaselines(ctx: BaselineContext): Record<BaselineId, BaselineScores> {
  const { ds, asOfMs, decisionSeason, checkpoint, population, positionOf } = ctx;
  const history = availableHistory(ds, asOfMs, decisionSeason);
  const latest = latestSeasonWithGames(ds, asOfMs);
  const lastCompleted = decisionSeason - 1; // OFFSEASON and W4-W12 alike: S-1 is the last complete season
  const baseSeason = checkpoint === 'OFFSEASON' ? decisionSeason - 1 : decisionSeason;
  const G = BASELINE_CONSTANTS.seasonGames;

  const curves = new Map<Pos, (age: number) => number>();
  const ppo = new Map<Pos, number>();
  for (const pos of ['QB', 'RB', 'WR', 'TE'] as Pos[]) {
    curves.set(pos, fitAgeCurve(ds, lastCompleted, pos, positionOf));
    ppo.set(pos, leaguePpo(history, lastCompleted, positionOf, pos));
  }

  const out = {} as Record<BaselineId, { T1: Map<string, number>; T2: Map<string, number> }>;
  for (const id of BASELINES) out[id] = { T1: new Map(), T2: new Map() };

  for (const [gsis, pos] of population) {
    const seasons = history.get(gsis) ?? new Map<number, PlayerGame[]>();
    const prev = (seasons.get(lastCompleted) ?? []).reduce((s, g) => s + g.points, 0);
    out.A_prev_season.T1.set(gsis, prev);
    out.A_prev_season.T2.set(gsis, 2 * prev);

    const rate = recencyRate(seasons, ds, asOfMs, latest, pos);
    const b = rate.ptsPerGame * G;
    out.B_recency.T1.set(gsis, b);
    out.B_recency.T2.set(gsis, 2 * b);

    const age = ageAt(ds.bios.get(gsis)?.birthDate ?? null, Date.UTC(baseSeason, 8, 1));
    const curve = curves.get(pos)!;
    const m1 = age === null ? 1 : curve(age);
    const m2 = age === null ? 1 : m1 * curve(age + 1);
    out.C_age_adjusted.T1.set(gsis, b * m1);
    out.C_age_adjusted.T2.set(gsis, b * (m1 + m2));

    const league = ppo.get(pos)!;
    const k = BASELINE_CONSTANTS.efficiencyPriorOpportunities;
    const eff = (rate.pts + k * league) / (rate.opp + k);
    const d = rate.oppPerGame * eff * G;
    out.D_opportunity.T1.set(gsis, d);
    out.D_opportunity.T2.set(gsis, 2 * d);
  }
  return out;
}
