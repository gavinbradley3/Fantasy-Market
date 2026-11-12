// Phase 3: do usage changes predict the next few games beyond recent fantasy production?
// Design: experiments/phase3-usage-signals/config.json (pre-registered).
//
// Point-in-time: every feature reads only games whose final box score was available at the
// decision instant (availableAt <= asOf). Outcomes read only games after it, within the same
// season. Seasons 2024 and 2025 are never loaded.

import type { Dataset, PlayerGame, Pos } from './data';
import { availableHistory, latestSeasonWithGames, recencyRate } from './baselines';

export type UsagePos = Extract<Pos, 'RB' | 'WR' | 'TE'>;
export const USAGE_POSITIONS: readonly UsagePos[] = ['RB', 'WR', 'TE'];

export interface TeamGame {
  readonly gameId: string;
  readonly season: number;
  readonly week: number;
  readonly team: string;
  readonly kickoff: number;
  /** Instant the final box score may be used. */
  readonly availableAt: number;
}

export interface UsageInputs {
  readonly ds: Dataset;
  /** team|season -> regular-season games in kickoff order. */
  readonly teamGames: ReadonlyMap<string, readonly TeamGame[]>;
  /** team|gameId -> provider team totals. */
  readonly teamTotals: ReadonlyMap<string, { carries: number; targets: number }>;
  /** gsis|gameId -> offensive snap share (0-1), provider-reported. */
  readonly snapShare: ReadonlyMap<string, number>;
  readonly positionOf: (gsis: string) => Pos | null;
}

export interface UsageRow {
  readonly decision: string;
  readonly season: number;
  readonly week: number;
  readonly gsis: string;
  readonly name: string;
  readonly pos: UsagePos;
  readonly team: string;
  readonly f: Record<string, number | null>;
  /** H -> { points, opportunities } per team game over the next H team games. */
  readonly y: Record<number, { points: number; opportunities: number; gamesPlayed: number }>;
}

interface Share {
  num: number;
  den: number;
}
const ratio = (s: Share) => (s.den > 0 ? s.num / s.den : null);

/** Build every row for one decision instant. */
export function buildUsageRows(inp: UsageInputs, season: number, week: number, asOfMs: number, horizons: readonly number[]): UsageRow[] {
  const { ds, teamGames, teamTotals, snapShare, positionOf } = inp;
  // Current-season games final at the instant, by player, in week order.
  const bySeason = new Map<string, PlayerGame[]>();
  for (const g of ds.games) {
    if (g.season !== season || g.availableAt > asOfMs) continue;
    const l = bySeason.get(g.gsis) ?? [];
    l.push(g);
    bySeason.set(g.gsis, l);
  }
  const history = availableHistory(ds, asOfMs, season);
  const latest = latestSeasonWithGames(ds, asOfMs);
  // Future games by player for outcomes (same season, after the instant).
  const future = new Map<string, Map<string, PlayerGame>>();
  for (const g of ds.games) {
    if (g.season !== season || g.availableAt <= asOfMs) continue;
    const m = future.get(g.gsis) ?? new Map<string, PlayerGame>();
    m.set(`${g.week}`, g);
    future.set(g.gsis, m);
  }

  const rows: UsageRow[] = [];
  for (const [gsis, games0] of bySeason) {
    const pos = positionOf(gsis);
    if (pos !== 'RB' && pos !== 'WR' && pos !== 'TE') continue;
    if (games0.length < 3) continue;
    const games = [...games0].sort((a, b) => a.week - b.week);
    const team = games[games.length - 1].team;
    const sched = teamGames.get(`${team}|${season}`) ?? [];
    const past = sched.filter((t) => t.availableAt <= asOfMs);
    const next = sched.filter((t) => t.availableAt > asOfMs);
    if (past.length < 4 || next.length < Math.max(...horizons)) continue;

    const byWeek = new Map(games.map((g) => [g.week, g]));
    const last4 = past.slice(-4);
    const ptsL4 = last4.reduce((s, t) => s + (byWeek.get(t.week)?.points ?? 0), 0) / 4;
    const oppL4 = last4.reduce((s, t) => s + ((byWeek.get(t.week)?.carries ?? 0) + (byWeek.get(t.week)?.targets ?? 0)), 0) / 4;
    const ptsStd = games.reduce((s, g) => s + g.points, 0) / past.length;
    const fRate = recencyRate(history.get(gsis) ?? new Map(), ds, asOfMs, latest, pos).ptsPerGame;

    // Shares over sets of games PLAYED.
    const shares = (set: readonly PlayerGame[]) => {
      const carry: Share = { num: 0, den: 0 };
      const target: Share = { num: 0, den: 0 };
      let snapSum = 0;
      let snapN = 0;
      let snapMissing = 0;
      for (const g of set) {
        const t = teamTotals.get(`${g.team}|${g.gameId}`);
        if (t) {
          carry.num += g.carries;
          carry.den += t.carries;
          target.num += g.targets;
          target.den += t.targets;
        }
        const s = snapShare.get(`${gsis}|${g.gameId}`);
        if (s === undefined) snapMissing++;
        else {
          snapSum += s;
          snapN++;
        }
      }
      return { carry: ratio(carry), target: ratio(target), snap: snapN ? snapSum / snapN : null, snapMissing };
    };
    const lvl = shares(games.slice(-4));
    const recent = shares(games.slice(-2));
    const prior = shares(games.slice(-6, -2));
    const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

    const y: UsageRow['y'] = {};
    const fut = future.get(gsis) ?? new Map<string, PlayerGame>();
    for (const H of horizons) {
      const window = next.slice(0, H);
      let p = 0;
      let o = 0;
      let n = 0;
      for (const t of window) {
        const g = fut.get(`${t.week}`);
        if (!g) continue;
        p += g.points;
        o += g.carries + g.targets;
        n++;
      }
      y[H] = { points: p / H, opportunities: o / H, gamesPlayed: n };
    }

    rows.push({
      decision: `${season}-W${week}`, season, week, gsis, name: games[games.length - 1].name, pos, team,
      f: {
        P_L4: ptsL4, P_STD: ptsStd, F_RATE: fRate, VOL_L4: oppL4,
        snap_lvl: lvl.snapMissing ? null : lvl.snap,
        snap_chg: recent.snapMissing || prior.snapMissing ? null : diff(recent.snap, prior.snap),
        carry_lvl: lvl.carry, carry_chg: diff(recent.carry, prior.carry),
        target_lvl: lvl.target, target_chg: diff(recent.target, prior.target),
      },
      y,
    });
  }
  return rows;
}

/** Ordinary least squares with an intercept. Returns [intercept, ...coefficients]. */
export function ols(X: readonly (readonly number[])[], y: readonly number[]): number[] {
  const k = (X[0]?.length ?? 0) + 1;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    const row = [1, ...X[i]];
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += row[a] * row[b];
      A[a][k] += row[a] * y[i];
    }
  }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('singular design matrix');
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const m = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= m * A[c][j];
    }
  }
  return A.map((row, i) => row[k] / A[i][i]);
}

export const predict = (beta: readonly number[], x: readonly number[]) => beta[0] + x.reduce((s, v, i) => s + v * beta[i + 1], 0);
