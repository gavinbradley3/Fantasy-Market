// Realised outcomes: what the backtest predicts.
//
// For a decision date in season S:
//   OFFSEASON  horizon = seasons S and S+1     (the season about to start, then the next)
//   in-season  horizon = seasons S+1 and S+2   (the next full seasons; the rest of S is redraft)
// Targets, all regular season, full PPR (the site's declared format):
//   T1    fantasy points in the first horizon season
//   T2    fantasy points across both horizon seasons
//   VOR1  max(0, T1 - replacement) at the player's position in that season
//   VOR2  VOR1 + max(0, second-season points - replacement)
// Replacement = the realised points of the k-th best player at the position that season, with k
// the league's replacement rank (12-team Superflex: QB 24, RB 35, WR 47, TE 14). It is measured
// from the outcome season itself, not from the model's production curve.
// A player with no games in a horizon season scored 0 that season: retirement, release and
// season-long injury are real losses of dynasty value, so they are outcomes, not missing data.

import type { Pos, PlayerGame } from './data';

export const REPLACEMENT_RANK: Readonly<Record<Pos, number>> = { QB: 24, RB: 35, WR: 47, TE: 14 };

export interface SeasonTotals {
  /** gsis -> season -> { points, games } */
  readonly byPlayer: ReadonlyMap<string, ReadonlyMap<number, { points: number; games: number }>>;
  /** `${season}|${pos}` -> replacement points */
  readonly replacement: ReadonlyMap<string, number>;
  readonly completeSeasons: ReadonlySet<number>;
}

export function seasonTotals(games: readonly PlayerGame[], completeSeasons: readonly number[]): SeasonTotals {
  const byPlayer = new Map<string, Map<number, { points: number; games: number }>>();
  const posBySeason = new Map<string, Map<string, number>>(); // `${gsis}|${season}` -> pos counts
  for (const g of games) {
    const m = byPlayer.get(g.gsis) ?? new Map();
    const t = m.get(g.season) ?? { points: 0, games: 0 };
    t.points += g.points;
    t.games += 1;
    m.set(g.season, t);
    byPlayer.set(g.gsis, m);
    const k = `${g.gsis}|${g.season}`;
    const pc = posBySeason.get(k) ?? new Map();
    pc.set(g.position, (pc.get(g.position) ?? 0) + 1);
    posBySeason.set(k, pc);
  }
  const replacement = new Map<string, number>();
  for (const season of completeSeasons) {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as Pos[]) {
      const pts: number[] = [];
      for (const [gsis, m] of byPlayer) {
        const pc = posBySeason.get(`${gsis}|${season}`);
        if (!pc) continue;
        const main = [...pc.entries()].sort((a, b) => b[1] - a[1])[0][0];
        if (main === pos) pts.push(m.get(season)!.points);
      }
      pts.sort((a, b) => b - a);
      const k = REPLACEMENT_RANK[pos];
      replacement.set(`${season}|${pos}`, pts[Math.min(k, pts.length) - 1] ?? 0);
    }
  }
  return { byPlayer, replacement, completeSeasons: new Set(completeSeasons) };
}

export interface Outcome {
  readonly T1: number;
  readonly T2: number | null;
  readonly VOR1: number;
  readonly VOR2: number | null;
  readonly gamesH1: number;
}

export function horizonSeasons(season: number, checkpoint: string): [number, number] {
  return checkpoint === 'OFFSEASON' ? [season, season + 1] : [season + 1, season + 2];
}

/** Null when the first horizon season is not complete in the data. */
export function outcomeFor(totals: SeasonTotals, gsis: string, pos: Pos, season: number, checkpoint: string): Outcome | null {
  const [h1, h2] = horizonSeasons(season, checkpoint);
  if (!totals.completeSeasons.has(h1)) return null;
  const pts = (s: number) => totals.byPlayer.get(gsis)?.get(s)?.points ?? 0;
  const vor = (s: number) => Math.max(0, pts(s) - (totals.replacement.get(`${s}|${pos}`) ?? 0));
  const h2ok = totals.completeSeasons.has(h2);
  return {
    T1: pts(h1),
    T2: h2ok ? pts(h1) + pts(h2) : null,
    VOR1: vor(h1),
    VOR2: h2ok ? vor(h1) + vor(h2) : null,
    gamesH1: totals.byPlayer.get(gsis)?.get(h1)?.games ?? 0,
  };
}
