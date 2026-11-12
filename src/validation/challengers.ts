// Research challengers scored beside the frozen PlayerTicker model and baselines A-D.
// Nothing here is read by production. No constant is authored: every number below is either
// an archived BASELINE_CONSTANTS value or fitted, per decision date, on seasons completed
// before that date.
//
//   F  two-part projection
//        season points = seasonGames x expected games share x expected points per game played
//      Inputs are the two factors of baseline B (B = seasonGames x gamesShare x ptsPerGamePlayed,
//      exactly). Each factor is forecast separately, one and two seasons ahead:
//        1. a straight line fitted by least squares on historical (window -> later season) pairs
//           at the position. A player who did not play the later season has games share 0 and is
//           in the games-share fit. The rate fit can only use players who played, because a rate
//           needs a game; the games-share term carries the risk of not playing.
//        2. an age multiplier: realised over line-predicted, by whole year of age, pooled with
//           neighbouring ages to ageCurve.minPairs and clamped to ageCurve.clamp (the procedure
//           of fitAgeCurve, applied to the residual).
//
//   E value-layer variants: the incumbent's position ranks, UNCHANGED, with only the
//   cross-position conversion replaced. Their within-position scores equal E's by construction.
//        E_curve_value    rank r is worth the mean realised season points of the r-th best
//                         player at the position over the last historySeasons completed seasons;
//                         value = 2 x max(0, curve(r) - curve(replacement rank)).
//        E_matched_value  rank r takes baseline C's r-th best two-season prediction at the
//                         position on that date, then C's own conversion. It differs from C in
//                         player ordering only, so (C - E_matched) isolates ordering and
//                         (E_matched - E) isolates conversion.

import { ageAt, type Dataset, type PlayerGame, type Pos, POSITIONS } from './data';
import { availableHistory, BASELINE_CONSTANTS, latestSeasonWithGames, recencyRate, type BaselineContext, type BaselineScores } from './baselines';
import { REPLACEMENT_RANK } from './outcomes';

export type ChallengerId = 'F_two_part';
/**
 * Value-layer-only variants. Each keeps one model's within-position ordering and changes only
 * how that ordering becomes a cross-position value.
 *   C_season_value / F_two_part   per-season rule: sum over the two horizon seasons of
 *                                 max(0, season prediction - that season's k-th best prediction).
 *   C_age_adjusted / F_harness_value   archived harness rule: max(0, T2 - 2 x k-th best T1).
 * The two rules are identical when T2 = 2 x T1 (baselines A, B, D). They differ for C and F,
 * whose second season is predicted separately.
 */
export type ValueVariantId = 'E_curve_value' | 'E_matched_value' | 'C_season_value' | 'F_harness_value';

interface Line {
  readonly a: number;
  readonly b: number;
  readonly n: number;
}

/** Least squares y = a + b x. With no spread in x the line is the mean of y. */
export function fitLine(xs: readonly number[], ys: readonly number[]): Line {
  const n = xs.length;
  if (n === 0) return { a: 0, b: 1, n: 0 };
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b, n };
}

/** Realised over predicted by whole year of age, pooled and clamped as fitAgeCurve does. */
function residualAgeCurve(rows: readonly { age: number | null; predicted: number; actual: number }[]) {
  const byAge = new Map<number, { p: number; a: number; n: number }>();
  for (const r of rows) {
    if (r.age === null) continue;
    const k = Math.floor(r.age);
    const c = byAge.get(k) ?? { p: 0, a: 0, n: 0 };
    c.p += r.predicted;
    c.a += r.actual;
    c.n += 1;
    byAge.set(k, c);
  }
  const [lo, hi] = BASELINE_CONSTANTS.ageCurve.clamp;
  return (age: number | null): number => {
    if (age === null) return 1;
    const k = Math.floor(age);
    let p = 0;
    let a = 0;
    let n = 0;
    for (let r = 0; r <= 6 && n < BASELINE_CONSTANTS.ageCurve.minPairs; r++) {
      for (const kk of r === 0 ? [k] : [k - r, k + r]) {
        const c = byAge.get(kk);
        if (c) {
          p += c.p;
          a += c.a;
          n += c.n;
        }
      }
    }
    if (n === 0 || p <= 0) return 1;
    return Math.min(hi, Math.max(lo, a / p));
  };
}

interface PartFit {
  readonly line: Line;
  readonly age: (age: number | null) => number;
}

export interface TwoPartFit {
  /** Index 0 = one season ahead, 1 = two seasons ahead. */
  readonly share: readonly [PartFit, PartFit];
  readonly rate: readonly [PartFit, PartFit];
}

interface SeasonIndex {
  /** gsis -> season -> games (regular season). */
  readonly byPlayer: Map<string, Map<number, PlayerGame[]>>;
  readonly firstSeason: number;
}

const seasonIndexCache = new WeakMap<Dataset, SeasonIndex>();
function seasonIndex(ds: Dataset): SeasonIndex {
  let idx = seasonIndexCache.get(ds);
  if (idx) return idx;
  const byPlayer = new Map<string, Map<number, PlayerGame[]>>();
  let firstSeason = Infinity;
  for (const g of ds.games) {
    const m = byPlayer.get(g.gsis) ?? new Map<number, PlayerGame[]>();
    const l = m.get(g.season) ?? [];
    l.push(g);
    m.set(g.season, l);
    byPlayer.set(g.gsis, m);
    if (g.season < firstSeason) firstSeason = g.season;
  }
  idx = { byPlayer, firstSeason };
  seasonIndexCache.set(ds, idx);
  return idx;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Fit the two parts for one position using only seasons at or before `lastCompleted`.
 * A training row is a player with a game in the window ending at season e (e - history + 1 .. e)
 * and the realised season e + h, for every e with e + h <= lastCompleted.
 */
export function fitTwoPart(ds: Dataset, lastCompleted: number, pos: Pos, positionOf: (gsis: string) => Pos | null): TwoPartFit {
  const { byPlayer, firstSeason } = seasonIndex(ds);
  const H = BASELINE_CONSTANTS.historySeasons;
  const part = (h: 1 | 2) => {
    const shareRows: { x: number; y: number; age: number | null }[] = [];
    const rateRows: { x: number; y: number; age: number | null }[] = [];
    for (let e = firstSeason; e + h <= lastCompleted; e++) {
      const windowEnd = Date.UTC(e + 1, 2, 1); // every game of season e is final by March
      for (const [gsis, seasons] of byPlayer) {
        if (positionOf(gsis) !== pos) continue;
        const window = new Map<number, PlayerGame[]>();
        for (let s = e - H + 1; s <= e; s++) {
          const g = seasons.get(s);
          if (g) window.set(s, g);
        }
        if (window.size === 0) continue;
        const r = recencyRate(window, ds, windowEnd, e, pos);
        const age = ageAt(ds.bios.get(gsis)?.birthDate ?? null, Date.UTC(e, 8, 1));
        const later = seasons.get(e + h) ?? [];
        let share = 0;
        if (later.length > 0) {
          const sched = (ds.teamSchedule.get(`${e + h}|${later[later.length - 1].team}`) ?? []).length;
          share = later.length / Math.max(sched, later.length);
          rateRows.push({ x: r.ptsPerGamePlayed, y: later.reduce((s, g) => s + g.points, 0) / later.length, age });
        }
        shareRows.push({ x: r.gamesShare, y: share, age });
      }
    }
    const one = (rows: typeof shareRows): PartFit => {
      const line = fitLine(rows.map((r) => r.x), rows.map((r) => r.y));
      const age = residualAgeCurve(rows.map((r) => ({ age: r.age, predicted: Math.max(0, line.a + line.b * r.x), actual: r.y })));
      return { line, age };
    };
    return { share: one(shareRows), rate: one(rateRows) };
  };
  const h1 = part(1);
  const h2 = part(2);
  return { share: [h1.share, h2.share], rate: [h1.rate, h2.rate] };
}

/** Everything challenger F computes for one player: its two inputs and both horizon seasons' factors. */
export interface TwoPartDetail {
  /** Inputs: recency-weighted games played over team games scheduled, and points per game played. */
  readonly gamesShare: number;
  readonly ptsPerGamePlayed: number;
  /** Raw inputs behind them (unweighted totals over the window), for display. */
  readonly pointsInWindow: number;
  readonly age: number | null;
  /** Forecast games share and points per game played, index 0 = first horizon season. */
  readonly share: readonly [number, number];
  readonly rate: readonly [number, number];
  readonly T1: number;
  readonly T2: number;
}

/** Challenger F with its intermediate quantities. Players with no available games are absent. */
export function twoPartDetail(ctx: BaselineContext): Map<string, TwoPartDetail> {
  const { ds, asOfMs, decisionSeason, checkpoint, population, positionOf } = ctx;
  const history = availableHistory(ds, asOfMs, decisionSeason);
  const latest = latestSeasonWithGames(ds, asOfMs);
  const lastCompleted = decisionSeason - 1;
  const baseSeason = checkpoint === 'OFFSEASON' ? decisionSeason - 1 : decisionSeason;
  const G = BASELINE_CONSTANTS.seasonGames;
  const fits = new Map<Pos, TwoPartFit>();
  for (const pos of POSITIONS) fits.set(pos, fitTwoPart(ds, lastCompleted, pos, positionOf));

  const out = new Map<string, TwoPartDetail>();
  for (const [gsis, pos] of population) {
    const seasons = history.get(gsis);
    if (!seasons || seasons.size === 0) continue;
    const r = recencyRate(seasons, ds, asOfMs, latest, pos);
    const age = ageAt(ds.bios.get(gsis)?.birthDate ?? null, Date.UTC(baseSeason, 8, 1));
    const fit = fits.get(pos)!;
    const share = (i: 0 | 1) => clamp01((fit.share[i].line.a + fit.share[i].line.b * r.gamesShare) * fit.share[i].age(age));
    const rate = (i: 0 | 1) => Math.max(0, (fit.rate[i].line.a + fit.rate[i].line.b * r.ptsPerGamePlayed) * fit.rate[i].age(age));
    const sh: [number, number] = [share(0), share(1)];
    const rt: [number, number] = [rate(0), rate(1)];
    const s1 = G * sh[0] * rt[0];
    out.set(gsis, { gamesShare: r.gamesShare, ptsPerGamePlayed: r.ptsPerGamePlayed, pointsInWindow: r.pts, age, share: sh, rate: rt, T1: s1, T2: s1 + G * sh[1] * rt[1] });
  }
  return out;
}

/** Challenger F for every player in the population. Players with no available games score 0. */
export function computeTwoPart(ctx: BaselineContext): BaselineScores {
  const detail = twoPartDetail(ctx);
  const T1 = new Map<string, number>();
  const T2 = new Map<string, number>();
  for (const gsis of ctx.population.keys()) {
    const d = detail.get(gsis);
    T1.set(gsis, d ? d.T1 : 0);
    T2.set(gsis, d ? d.T2 : 0);
  }
  return { T1, T2 };
}

/**
 * Mean realised season points of the r-th best player at each position over the last
 * historySeasons seasons completed before the decision. Index 0 = rank 1.
 */
export function realisedRankCurve(ds: Dataset, lastCompleted: number): Record<Pos, number[]> {
  const H = BASELINE_CONSTANTS.historySeasons;
  const { byPlayer } = seasonIndex(ds);
  const out = { QB: [], RB: [], WR: [], TE: [] } as Record<Pos, number[]>;
  const counts = { QB: [], RB: [], WR: [], TE: [] } as Record<Pos, number[]>;
  for (let s = lastCompleted - H + 1; s <= lastCompleted; s++) {
    const pts = { QB: [], RB: [], WR: [], TE: [] } as Record<Pos, number[]>;
    for (const seasons of byPlayer.values()) {
      const games = seasons.get(s);
      if (!games) continue;
      // The player's main stats position IN THAT SEASON, as outcomes.ts measures replacement.
      const pc = new Map<string, number>();
      for (const g of games) pc.set(g.position, (pc.get(g.position) ?? 0) + 1);
      const main = [...pc.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if ((POSITIONS as readonly string[]).includes(main)) pts[main as Pos].push(games.reduce((t, g) => t + g.points, 0));
    }
    for (const pos of POSITIONS) {
      pts[pos].sort((a, b) => b - a);
      pts[pos].forEach((p, i) => {
        out[pos][i] = (out[pos][i] ?? 0) + p;
        counts[pos][i] = (counts[pos][i] ?? 0) + 1;
      });
    }
  }
  for (const pos of POSITIONS) out[pos] = out[pos].map((t, i) => t / counts[pos][i]);
  return out;
}

/** Two-season value of position rank r on a realised rank curve; null rank is worth 0. */
export function curveValue(curve: readonly number[], rank: number | null, pos: Pos): number {
  if (rank === null || rank < 1) return 0;
  const at = (r: number) => curve[Math.min(r, curve.length) - 1] ?? 0;
  const points = rank > curve.length ? 0 : at(rank);
  return 2 * Math.max(0, points - at(REPLACEMENT_RANK[pos]));
}
