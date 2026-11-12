// The evaluation: frozen PlayerTicker predictions against baselines A-D on realised outcomes.
//
// SEALING: the test period is never evaluated unless `unsealTest` carries a reason. While sealed,
// no stats file for a test-period season is even read, so no test-period outcome can leak into
// development or validation results. Consequence: validation decisions whose horizon reaches the
// test seasons have no outcome for that target and are skipped for it (reported as counts).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ExperimentConfig } from './config';
import { loadDataset, type Dataset, type PlayerGame, type Pos, POSITIONS } from './data';
import { BASELINES, computeBaselines, type BaselineId } from './baselines';
import { outcomeFor, REPLACEMENT_RANK, seasonTotals, type Outcome } from './outcomes';
import { pairwiseAccuracy, precisionAtN, quantile, rng, spearman } from './metrics';
import { computeTwoPart, curveValue, realisedRankCurve, type ChallengerId, type ValueVariantId } from './challengers';

export type ModelId = 'E_playerticker' | BaselineId | ChallengerId | ValueVariantId;
const BASE_MODELS: readonly ModelId[] = ['E_playerticker', ...BASELINES];
const CHALLENGER_MODELS: readonly ModelId[] = ['E_playerticker', 'E_curve_value', 'E_matched_value', ...BASELINES, 'C_season_value', 'F_two_part', 'F_harness_value'];
/** Models scored in this run. Five by default; configureModels adds the challengers. */
export let MODELS: readonly ModelId[] = BASE_MODELS;
/** Paired differences reported per cell (first minus second), same bootstrap resamples. */
export let PAIRS: readonly (readonly [ModelId, ModelId])[] = [];
const CHALLENGER_PAIRS: readonly (readonly [ModelId, ModelId])[] = [
  ['E_curve_value', 'E_playerticker'], // conversion only (realised rank curve)
  ['E_matched_value', 'E_playerticker'], // conversion only (C's conversion)
  ['C_age_adjusted', 'E_matched_value'], // ordering only, under C's conversion
  ['C_age_adjusted', 'E_playerticker'],
  ['F_two_part', 'E_playerticker'],
  ['F_two_part', 'C_season_value'], // F against C, both under the per-season value rule
  ['F_harness_value', 'C_age_adjusted'], // F against C, both under the archived harness rule
  ['C_season_value', 'C_age_adjusted'], // value rule only, C's ordering
  ['F_two_part', 'F_harness_value'], // value rule only, F's ordering
  ['F_two_part', 'E_curve_value'], // F against the incumbent's ordering with a revised conversion
  ['C_season_value', 'E_curve_value'],
];
export function configureModels(config: Pick<ExperimentConfig, 'challengers'>): void {
  MODELS = config.challengers ? CHALLENGER_MODELS : BASE_MODELS;
  PAIRS = config.challengers ? CHALLENGER_PAIRS : [];
}
export type Target = 'T1' | 'T2';
export const TARGETS: readonly Target[] = ['T1', 'T2'];
export type Period = 'development' | 'validation' | 'test';
const PAIR_GAP = 25;

export interface PredictionFile {
  manifest: { id: string; asOf: string; codeSha: string; valuationChecksum: string; publicationId: string };
  players: { gsis: string; position: string; dynastyValue: number | null; dynastyComposite: number | null; positionRank: number | null; overallRank: number | null; modelTier: string }[];
}

export interface Row {
  readonly decision: string;
  readonly season: number;
  readonly checkpoint: string;
  readonly period: Period;
  readonly gsis: string;
  readonly pos: Pos;
  readonly experience: string;
  readonly ptTier: string;
  /** Share of the team's regular-season games played in the last completed season, bucketed. */
  readonly availability: string;
  readonly name: string;
  /** Within-position scores (higher = better) per model and target. */
  readonly score: Record<ModelId, Record<Target, number>>;
  /** Cross-position value prediction per model (two-season value above replacement). */
  readonly value: Record<ModelId, number>;
  readonly outcome: Outcome | null;
}

function experienceBucket(rookieSeason: number | null, season: number, checkpoint: string): string {
  if (rookieSeason === null) return 'unknown';
  // Completed NFL seasons before the decision.
  void checkpoint;
  const done = season - rookieSeason;
  if (done <= 0) return 'rookie (year 1)';
  if (done === 1) return 'year 2';
  if (done <= 3) return 'years 3-4';
  return 'year 5+';
}

export interface EvaluationInput {
  readonly config: ExperimentConfig;
  readonly root: string;
  readonly unsealTest?: string;
}

export function periodOf(config: ExperimentConfig, season: number): Period | null {
  if (config.periods.development.includes(season)) return 'development';
  if (config.periods.validation.includes(season)) return 'validation';
  if (config.periods.test.includes(season)) return 'test';
  return null;
}

export function buildRows(input: EvaluationInput, ds: Dataset, lastOutcomeSeason: number) {
  const { config, root } = input;
  const totals = seasonTotals(ds.games, range(2012, lastOutcomeSeason));
  const statPos = mainPositions(ds);
  const positionOf = (g: string) => statPos.get(g) ?? null;
  const rows: Row[] = [];
  const manifests: PredictionFile['manifest'][] = [];
  const skipped: string[] = [];
  const names = new Map<string, string>();
  for (const g of ds.games) names.set(g.gsis, g.name);
  const reclass: { decision: string; boardPos: string; statPos: string; gsis: string }[] = [];

  for (const d of config.decisions) {
    const period = periodOf(config, d.season);
    if (period === null) continue;
    if (period === 'test' && !input.unsealTest) continue;
    const id = `${d.season}-${d.checkpoint}`;
    const file = join(root, 'experiments', config.predictionsFrom ?? config.name, 'predictions', `${id}.json`);
    if (!existsSync(file)) {
      skipped.push(`${id}: no prediction file`);
      continue;
    }
    const pred = JSON.parse(readFileSync(file, 'utf8')) as PredictionFile;
    manifests.push(pred.manifest);
    const asOfMs = Date.parse(pred.manifest.asOf);
    const population = new Map<string, Pos>();
    const pt = new Map<string, PredictionFile['players'][number]>();
    for (const p of pred.players) {
      if (!(POSITIONS as readonly string[]).includes(p.position)) continue;
      population.set(p.gsis, p.position as Pos);
      pt.set(p.gsis, p);
      const sp = statPos.get(p.gsis);
      if (sp && sp !== p.position) reclass.push({ decision: id, boardPos: p.position, statPos: sp, gsis: p.gsis });
    }
    const ctx = { ds, asOfMs, decisionSeason: d.season, checkpoint: d.checkpoint, population, positionOf };
    const base = computeBaselines(ctx);
    const withChallengers = MODELS.includes('F_two_part');
    const twoPart = withChallengers ? computeTwoPart(ctx) : null;
    const rankCurve = withChallengers ? realisedRankCurve(ds, d.season - 1) : null;
    // Baseline C's two-season predictions at each position, best first: the scale the
    // matched value variant hands out by the incumbent's position rank.
    const cSorted = new Map<Pos, number[]>();
    if (withChallengers) {
      for (const pos of POSITIONS) {
        cSorted.set(pos, [...population].filter(([, p]) => p === pos).map(([g]) => base.C_age_adjusted.T2.get(g) ?? 0).sort((x, y) => y - x));
      }
    }

    // Each baseline's implied replacement level: its own k-th best T1 at the position.
    const rep = new Map<string, number>();
    const pointModels: Record<string, { T1: ReadonlyMap<string, number>; T2: ReadonlyMap<string, number> }> = { ...base };
    if (twoPart) pointModels.F_two_part = twoPart;
    for (const b of Object.keys(pointModels)) {
      for (const pos of POSITIONS) {
        const vals = [...population].filter(([, p]) => p === pos).map(([g]) => pointModels[b].T1.get(g) ?? 0).sort((x, y) => y - x);
        rep.set(`${b}|${pos}`, vals[Math.min(REPLACEMENT_RANK[pos], vals.length) - 1] ?? 0);
      }
    }

    // Second-season replacement level for the per-season value rule: the k-th best
    // second-season prediction (T2 - T1) at the position.
    const rep2 = new Map<string, number>();
    if (withChallengers) {
      for (const b of ['C_age_adjusted', 'F_two_part']) {
        for (const pos of POSITIONS) {
          const vals = [...population].filter(([, p]) => p === pos).map(([g]) => (pointModels[b].T2.get(g) ?? 0) - (pointModels[b].T1.get(g) ?? 0)).sort((x, y) => y - x);
          rep2.set(`${b}|${pos}`, vals[Math.min(REPLACEMENT_RANK[pos], vals.length) - 1] ?? 0);
        }
      }
    }

    for (const [gsis, pos] of population) {
      const p = pt.get(gsis)!;
      const ptScore = p.positionRank === null ? -1e9 : -p.positionRank;
      const score = { E_playerticker: { T1: ptScore, T2: ptScore } } as Record<ModelId, Record<Target, number>>;
      const value = { E_playerticker: p.dynastyValue ?? 0 } as Record<ModelId, number>;
      for (const b of Object.keys(pointModels) as (BaselineId | ChallengerId)[]) {
        score[b] = { T1: pointModels[b].T1.get(gsis) ?? 0, T2: pointModels[b].T2.get(gsis) ?? 0 };
        value[b] = Math.max(0, (pointModels[b].T2.get(gsis) ?? 0) - 2 * rep.get(`${b}|${pos}`)!);
      }
      if (withChallengers) {
        // Value-layer-only variants: the incumbent's ordering, a different conversion.
        score.E_curve_value = score.E_playerticker;
        score.E_matched_value = score.E_playerticker;
        value.E_curve_value = curveValue(rankCurve![pos], p.positionRank, pos);
        const cs = cSorted.get(pos)!;
        const matched = p.positionRank === null || p.positionRank > cs.length ? 0 : cs[p.positionRank - 1];
        value.E_matched_value = Math.max(0, matched - 2 * rep.get(`C_age_adjusted|${pos}`)!);
        // Per-season rule. Season 1 = T1, season 2 = T2 - T1, each against its own k-th best.
        const perSeason = (m: 'C_age_adjusted' | 'F_two_part') =>
          Math.max(0, score[m].T1 - rep.get(`${m}|${pos}`)!) + Math.max(0, score[m].T2 - score[m].T1 - rep2.get(`${m}|${pos}`)!);
        score.C_season_value = score.C_age_adjusted;
        value.C_season_value = perSeason('C_age_adjusted');
        score.F_harness_value = score.F_two_part;
        value.F_harness_value = value.F_two_part;
        value.F_two_part = perSeason('F_two_part');
      }
      rows.push({
        decision: id, season: d.season, checkpoint: d.checkpoint, period, gsis, pos,
        experience: experienceBucket(ds.bios.get(gsis)?.rookieSeason ?? null, d.season, d.checkpoint),
        ptTier: p.modelTier, score, value,
        availability: availabilityBucket(ds, gsis, d.season - 1, asOfMs),
        name: names.get(gsis) ?? gsis,
        outcome: outcomeFor(totals, gsis, pos, d.season, d.checkpoint),
      });
    }
  }
  return { rows, manifests, skipped, reclass, totals };
}

const gamesIndex = new WeakMap<Dataset, Map<string, PlayerGame[]>>();
function gamesOf(ds: Dataset, gsis: string, season: number): PlayerGame[] {
  let idx = gamesIndex.get(ds);
  if (!idx) {
    idx = new Map();
    for (const g of ds.games) {
      const k = `${g.gsis}|${g.season}`;
      const l = idx.get(k) ?? [];
      l.push(g);
      idx.set(k, l);
    }
    gamesIndex.set(ds, idx);
  }
  return idx.get(`${gsis}|${season}`) ?? [];
}

function availabilityBucket(ds: Dataset, gsis: string, season: number, asOfMs: number): string {
  const games = gamesOf(ds, gsis, season).filter((g) => g.availableAt <= asOfMs);
  if (games.length === 0) return 'no games last season';
  const team = games[games.length - 1].team;
  const sched = (ds.teamSchedule.get(`${season}|${team}`) ?? []).filter((t) => t <= asOfMs).length || 17;
  const share = games.length / sched;
  return share >= 0.75 ? 'played 75%+' : share >= 0.4 ? 'played 40-75%' : 'played <40%';
}

function range(a: number, b: number) {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Most frequent stats position across all loaded games. */
export function mainPositions(ds: Dataset): Map<string, Pos> {
  const counts = new Map<string, Map<string, number>>();
  for (const g of ds.games) {
    const m = counts.get(g.gsis) ?? new Map<string, number>();
    m.set(g.position, (m.get(g.position) ?? 0) + 1);
    counts.set(g.gsis, m);
  }
  const out = new Map<string, Pos>();
  for (const [g, m] of counts) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if ((POSITIONS as readonly string[]).includes(top)) out.set(g, top as Pos);
  }
  return out;
}

const outcomeValue = (o: Outcome, t: Target | 'VOR2'): number | null => (t === 'T1' ? o.T1 : t === 'T2' ? o.T2 : o.VOR2);

/**
 * all       every board player at the position
 * history   players with at least one scoring game available at the decision (baselines can rank them)
 * relevant  players any model places in its top 2N at the position (decision-relevant tier)
 */
export type Population = 'all' | 'history' | 'relevant';
export const POPULATIONS: readonly Population[] = ['all', 'history', 'relevant'];

export interface CellResult {
  period: Period;
  population: Population;
  pos: Pos | 'ALL';
  target: Target | 'VOR2';
  decisions: number;
  playerDecisions: number;
  uniquePlayers: number;
  model: Record<ModelId, { spearman: number; ci: [number, number]; pairwise: number; pairs: number; precisionAtN: number; pCi: [number, number] }>;
  bestBaseline: BaselineId;
  ptMinusBest: { spearman: number; ci: [number, number] };
  /** Present only when challengers are scored: first minus second, paired bootstrap. */
  paired?: { a: ModelId; b: ModelId; spearman: number; ci: [number, number]; precisionAtN: number; pCi: [number, number] }[];
}

/** Rows grouped by decision, filtered to those with the target observed. */
function groupByDecision(rows: readonly Row[], target: Target | 'VOR2') {
  const g = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.outcome || outcomeValue(r.outcome, target) === null) continue;
    const list = g.get(r.decision) ?? [];
    list.push(r);
    g.set(r.decision, list);
  }
  return g;
}

const predOf = (r: Row, m: ModelId, target: Target | 'VOR2') => (target === 'VOR2' ? r.value[m] : r.score[m][target]);

function metricsFor(groups: Map<string, Row[]>, target: Target | 'VOR2', n: number, weights?: Map<string, number>) {
  const res = {} as Record<ModelId, { s: number; p: number }>;
  for (const m of MODELS) {
    let s = 0;
    let p = 0;
    let k = 0;
    for (const list of groups.values()) {
      const pred: number[] = [];
      const act: number[] = [];
      for (const r of list) {
        const w = weights ? weights.get(r.gsis) ?? 0 : 1;
        for (let i = 0; i < w; i++) {
          pred.push(predOf(r, m, target));
          act.push(outcomeValue(r.outcome!, target)!);
        }
      }
      if (pred.length < 5) continue;
      const rho = spearman(pred, act);
      if (!Number.isFinite(rho)) continue;
      s += rho;
      p += precisionAtN(pred, act, n);
      k++;
    }
    res[m] = { s: k ? s / k : NaN, p: k ? p / k : NaN };
  }
  return res;
}

/** Restrict a decision's rows to players some model places in its top 2N at the position. */
function relevant(list: readonly Row[], target: Target, n: number): Row[] {
  const keep = new Set<string>();
  for (const m of MODELS) {
    [...list].sort((a, b) => predOf(b, m, target) - predOf(a, m, target)).slice(0, 2 * n).forEach((r) => keep.add(r.gsis));
  }
  return list.filter((r) => keep.has(r.gsis));
}

export function evaluateCells(rows: readonly Row[], reps: number, seed: number): CellResult[] {
  const out: CellResult[] = [];
  const periods = [...new Set(rows.map((r) => r.period))];
  const crossN = POSITIONS.reduce((s, p) => s + REPLACEMENT_RANK[p], 0);
  for (const period of periods) {
    const cells: { pos: Pos | 'ALL'; target: Target | 'VOR2'; population: Population }[] = [];
    for (const pos of POSITIONS) for (const target of TARGETS) for (const population of POPULATIONS) cells.push({ pos, target, population });
    for (const population of POPULATIONS) cells.push({ pos: 'ALL', target: 'VOR2', population });
    for (const c of cells) {
      const sub = rows.filter((r) => r.period === period && (c.pos === 'ALL' || r.pos === c.pos));
      let groups = groupByDecision(sub, c.target);
      const n = c.pos === 'ALL' ? crossN : REPLACEMENT_RANK[c.pos];
      if (c.population === 'relevant') {
        groups = new Map([...groups].map(([k, v]) => [k, relevant(v, c.target === 'VOR2' ? 'T2' : c.target, n)]));
      } else if (c.population === 'history') {
        groups = new Map([...groups].map(([k, v]) => [k, v.filter((r) => r.score.B_recency.T1 > 0)]));
      }
      if (groups.size === 0) continue;
      const point = metricsFor(groups, c.target, n);
      const players = [...new Set([...groups.values()].flat().map((r) => r.gsis))];
      const rand = rng(seed);
      const boots = {} as Record<ModelId, { s: number[]; p: number[] }>;
      for (const m of MODELS) boots[m] = { s: [], p: [] };
      const diffs: number[] = [];
      const pairDiffs = PAIRS.map(() => ({ s: [] as number[], p: [] as number[] }));
      let best: BaselineId = BASELINES[0];
      for (const b of BASELINES) if (point[b].s > point[best].s) best = b;
      for (let rep = 0; rep < reps; rep++) {
        const w = new Map<string, number>();
        for (let i = 0; i < players.length; i++) {
          const g = players[Math.floor(rand() * players.length)];
          w.set(g, (w.get(g) ?? 0) + 1);
        }
        const r = metricsFor(groups, c.target, n, w);
        for (const m of MODELS) {
          boots[m].s.push(r[m].s);
          boots[m].p.push(r[m].p);
        }
        diffs.push(r.E_playerticker.s - r[best].s);
        PAIRS.forEach(([a, b], i) => {
          pairDiffs[i].s.push(r[a].s - r[b].s);
          pairDiffs[i].p.push(r[a].p - r[b].p);
        });
      }
      const ci = (xs: number[]): [number, number] => {
        const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
        return [quantile(s, 0.025), quantile(s, 0.975)];
      };
      const model = {} as CellResult['model'];
      for (const m of MODELS) {
        let acc = 0;
        let pairs = 0;
        let k = 0;
        if (c.pos !== 'ALL') {
          for (const list of groups.values()) {
            const pw = pairwiseAccuracy(list.map((r) => predOf(r, m, c.target)), list.map((r) => outcomeValue(r.outcome!, c.target)!), PAIR_GAP);
            if (pw.pairs === 0) continue;
            acc += pw.acc;
            pairs += pw.pairs;
            k++;
          }
        }
        model[m] = { spearman: point[m].s, ci: ci(boots[m].s), pairwise: k ? acc / k : NaN, pairs, precisionAtN: point[m].p, pCi: ci(boots[m].p) };
      }
      out.push({
        period, population: c.population, pos: c.pos, target: c.target,
        decisions: groups.size,
        playerDecisions: [...groups.values()].reduce((s, l) => s + l.length, 0),
        uniquePlayers: players.length,
        model, bestBaseline: best,
        ptMinusBest: { spearman: point.E_playerticker.s - point[best].s, ci: ci(diffs) },
        ...(PAIRS.length
          ? { paired: PAIRS.map(([a, b], i) => ({ a, b, spearman: point[a].s - point[b].s, ci: ci(pairDiffs[i].s), precisionAtN: point[a].p - point[b].p, pCi: ci(pairDiffs[i].p) })) }
          : {}),
      });
    }
  }
  return out;
}

/** Rank stability: Spearman between a model's scores at consecutive checkpoints of one season. */
export function stability(rows: readonly Row[]) {
  const order = ['OFFSEASON', 'W4', 'W8', 'W12'];
  const out: { period: Period; pos: Pos; model: ModelId; transitions: number; meanSpearman: number }[] = [];
  const by = new Map<string, Map<string, Row>>();
  for (const r of rows) {
    const k = `${r.season}|${r.checkpoint}|${r.pos}`;
    const m = by.get(k) ?? new Map<string, Row>();
    m.set(r.gsis, r);
    by.set(k, m);
  }
  const periods = [...new Set(rows.map((r) => r.period))];
  for (const period of periods) {
    const seasons = [...new Set(rows.filter((r) => r.period === period).map((r) => r.season))];
    for (const pos of POSITIONS) {
      for (const model of MODELS) {
        let s = 0;
        let k = 0;
        for (const season of seasons) {
          for (let i = 0; i + 1 < order.length; i++) {
            const a = by.get(`${season}|${order[i]}|${pos}`);
            const b = by.get(`${season}|${order[i + 1]}|${pos}`);
            if (!a || !b) continue;
            const x: number[] = [];
            const y: number[] = [];
            for (const [g, ra] of a) {
              const rb = b.get(g);
              if (!rb) continue;
              x.push(ra.score[model].T2);
              y.push(rb.score[model].T2);
            }
            const rho = spearman(x, y);
            if (Number.isFinite(rho)) {
              s += rho;
              k++;
            }
          }
        }
        if (k) out.push({ period, pos, model, transitions: k, meanSpearman: s / k });
      }
    }
  }
  return out;
}

/** Spearman (T1) by experience bucket, pooled per decision then averaged. */
export function subgroups(rows: readonly Row[], by: (r: Row) => string = (r) => r.experience) {
  const out: { period: Period; pos: Pos; experience: string; playerDecisions: number; model: Record<ModelId, number> }[] = [];
  const keys = new Set(rows.map((r) => `${r.period}|${r.pos}|${by(r)}`));
  for (const key of [...keys].sort()) {
    const [period, pos, experience] = key.split('|');
    const sub = rows.filter((r) => r.period === period && r.pos === pos && by(r) === experience);
    const groups = groupByDecision(sub, 'T1');
    const pd = [...groups.values()].reduce((s, l) => s + l.length, 0);
    if (pd < 30) continue;
    const m = metricsFor(groups, 'T1', REPLACEMENT_RANK[pos as Pos]);
    out.push({ period: period as Period, pos: pos as Pos, experience, playerDecisions: pd, model: Object.fromEntries(MODELS.map((x) => [x, m[x].s])) as Record<ModelId, number> });
  }
  return out;
}

/**
 * Calibrated error for T1 (season points). Each model's within-position score is mapped to
 * points by score decile, fitted on development decisions only, then applied to validation.
 */
export function calibratedMae(rows: readonly Row[]) {
  const out: { pos: Pos; model: ModelId; validationRows: number; mae: number }[] = [];
  for (const pos of POSITIONS) {
    for (const model of MODELS) {
      const fit = rows.filter((r) => r.period === 'development' && r.pos === pos && r.outcome);
      const test = rows.filter((r) => r.period === 'validation' && r.pos === pos && r.outcome);
      if (fit.length < 50 || test.length === 0) continue;
      // Decile edges on the per-decision percentile of the score, so scales compare across dates.
      const pct = (list: readonly Row[]) => {
        const by = new Map<string, Row[]>();
        for (const r of list) by.set(r.decision, [...(by.get(r.decision) ?? []), r]);
        const res = new Map<Row, number>();
        for (const l of by.values()) {
          const sorted = [...l].sort((a, b) => a.score[model].T1 - b.score[model].T1);
          sorted.forEach((r, i) => res.set(r, Math.min(9, Math.floor((10 * i) / sorted.length))));
        }
        return res;
      };
      const fp = pct(fit);
      const sum = new Array(10).fill(0);
      const cnt = new Array(10).fill(0);
      for (const r of fit) {
        const d = fp.get(r)!;
        sum[d] += r.outcome!.T1;
        cnt[d]++;
      }
      const mean = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
      const tp = pct(test);
      let err = 0;
      for (const r of test) err += Math.abs(mean[tp.get(r)!] - r.outcome!.T1);
      out.push({ pos, model, validationRows: test.length, mae: err / test.length });
    }
  }
  return out;
}

/** Rookies without NFL games at an OFFSEASON decision: players drafted that spring. */
export function rookiePopulation(input: EvaluationInput, ds: Dataset, lastOutcomeSeason: number) {
  const { config, root } = input;
  const totals = seasonTotals(ds.games, range(2012, lastOutcomeSeason));
  const out: { decision: string; period: Period; pos: Pos; draftees: number; onBoard: number; ranked: number; withT2: number; draftPickSpearmanT2: number; ptSpearmanT2OnRanked: number; draftPickSpearmanOnRanked: number }[] = [];
  for (const d of config.decisions) {
    if (d.checkpoint !== 'OFFSEASON') continue;
    const period = periodOf(config, d.season);
    if (!period || (period === 'test' && !input.unsealTest)) continue;
    const file = join(root, 'experiments', config.predictionsFrom ?? config.name, 'predictions', `${d.season}-OFFSEASON.json`);
    if (!existsSync(file)) continue;
    const pred = JSON.parse(readFileSync(file, 'utf8')) as PredictionFile;
    const board = new Map(pred.players.map((p) => [p.gsis, p]));
    for (const pos of POSITIONS) {
      const picks = ds.draft.filter((p) => p.season === d.season && p.position === pos && p.gsis);
      const withOut = picks
        .map((p) => ({ p, o: outcomeFor(totals, p.gsis!, pos, d.season, 'OFFSEASON'), b: board.get(p.gsis!) }))
        .filter((x) => x.o && x.o.T2 !== null);
      const ranked = withOut.filter((x) => x.b && x.b.positionRank !== null);
      out.push({
        decision: `${d.season}-OFFSEASON`, period, pos,
        draftees: picks.length,
        onBoard: picks.filter((p) => board.has(p.gsis!)).length,
        ranked: picks.filter((p) => board.get(p.gsis!)?.positionRank != null).length,
        withT2: withOut.length,
        draftPickSpearmanT2: spearman(withOut.map((x) => -x.p.pick), withOut.map((x) => x.o!.T2!)),
        ptSpearmanT2OnRanked: spearman(ranked.map((x) => -x.b!.positionRank!), ranked.map((x) => x.o!.T2!)),
        draftPickSpearmanOnRanked: spearman(ranked.map((x) => -x.p.pick), ranked.map((x) => x.o!.T2!)),
      });
    }
  }
  return out;
}

export function sampleSizes(rows: readonly Row[]) {
  const count = (key: (r: Row) => string, withOutcome = false) => {
    const m = new Map<string, number>();
    for (const r of rows) if (!withOutcome || r.outcome) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return Object.fromEntries([...m].sort());
  };
  return {
    bySeasonPosition: count((r) => `${r.season} ${r.pos}`),
    byExperiencePosition: count((r) => `${r.pos} ${r.experience}`),
    withT1Outcome: count((r) => `${r.period} ${r.pos}`, true),
    withT2Outcome: (() => {
      const m = new Map<string, number>();
      for (const r of rows) if (r.outcome?.T2 != null) m.set(`${r.period} ${r.pos}`, (m.get(`${r.period} ${r.pos}`) ?? 0) + 1);
      return Object.fromEntries([...m].sort());
    })(),
    ptTiers: count((r) => `${r.period} ${r.pos} ${r.ptTier}`),
  };
}

export function lastOutcomeSeasonFor(config: ExperimentConfig, unsealTest?: string): number {
  return unsealTest ? Math.max(...config.periods.test) : Math.min(...config.periods.test) - 1;
}

export function loadForEvaluation(config: ExperimentConfig, root: string, unsealTest?: string) {
  const last = lastOutcomeSeasonFor(config, unsealTest);
  return { ds: loadDataset(join(root, config.dataDir), range(2012, last)), last };
}

/**
 * Position mix of the top N by cross-position value (N = sum of replacement ranks = 120), per
 * model, against the realised top N by two-season value above replacement. Averaged over dates.
 */
export function crossPositionMix(rows: readonly Row[]) {
  const N = POSITIONS.reduce((s, p) => s + REPLACEMENT_RANK[p], 0);
  const out: { period: Period; source: ModelId | 'realised'; decisions: number; mix: Record<Pos, number> }[] = [];
  for (const period of [...new Set(rows.map((r) => r.period))]) {
    const groups = groupByDecision(rows.filter((r) => r.period === period), 'VOR2');
    const sources: (ModelId | 'realised')[] = ['realised', ...MODELS];
    for (const source of sources) {
      const mix = { QB: 0, RB: 0, WR: 0, TE: 0 } as Record<Pos, number>;
      for (const list of groups.values()) {
        const key = (r: Row) => (source === 'realised' ? r.outcome!.VOR2! : r.value[source]);
        for (const r of [...list].sort((a, b) => key(b) - key(a)).slice(0, N)) mix[r.pos] += 1 / groups.size;
      }
      out.push({ period, source, decisions: groups.size, mix });
    }
  }
  return out;
}

/** Largest disagreements between PlayerTicker's position rank and the realised T2 rank (decision-relevant tier). */
export function largestMisses(rows: readonly Row[], period: Period, perPos = 8) {
  const out: { pos: Pos; decision: string; name: string; ptRank: number; realisedRank: number; bestBaselineRank: number; T2: number }[] = [];
  const groups = groupByDecision(rows.filter((r) => r.period === period), 'T2');
  for (const pos of POSITIONS) {
    const misses: typeof out = [];
    for (const list0 of groups.values()) {
      const list = relevant(list0.filter((r) => r.pos === pos), 'T2', REPLACEMENT_RANK[pos]);
      const rankBy = (key: (r: Row) => number) => {
        const sorted = [...list].sort((a, b) => key(b) - key(a));
        return new Map(sorted.map((r, i) => [r.gsis, i + 1]));
      };
      const pt = rankBy((r) => r.score.E_playerticker.T2);
      const re = rankBy((r) => r.outcome!.T2!);
      const c = rankBy((r) => r.score.C_age_adjusted.T2);
      for (const r of list) {
        misses.push({ pos, decision: r.decision, name: r.name, ptRank: pt.get(r.gsis)!, realisedRank: re.get(r.gsis)!, bestBaselineRank: c.get(r.gsis)!, T2: r.outcome!.T2! });
      }
    }
    // Rank by how much worse PT is than the age-adjusted baseline on this player.
    misses.sort((a, b) => Math.abs(b.ptRank - b.realisedRank) - Math.abs(b.bestBaselineRank - b.realisedRank) - (Math.abs(a.ptRank - a.realisedRank) - Math.abs(a.bestBaselineRank - a.realisedRank)));
    out.push(...misses.slice(0, perPos));
  }
  return out;
}

/** Spearman by checkpoint (relevant tier, T1), to test whether in-season dates lag. */
export function byCheckpoint(rows: readonly Row[]) {
  const out: { period: Period; pos: Pos; checkpoint: string; decisions: number; model: Record<ModelId, number> }[] = [];
  for (const period of [...new Set(rows.map((r) => r.period))]) {
    for (const pos of POSITIONS) {
      for (const checkpoint of ['OFFSEASON', 'W4', 'W8', 'W12']) {
        const g0 = groupByDecision(rows.filter((r) => r.period === period && r.pos === pos && r.checkpoint === checkpoint), 'T1');
        const groups = new Map([...g0].map(([k, v]) => [k, relevant(v, 'T1', REPLACEMENT_RANK[pos])]));
        if (!groups.size) continue;
        const m = metricsFor(groups, 'T1', REPLACEMENT_RANK[pos]);
        out.push({ period, pos, checkpoint, decisions: groups.size, model: Object.fromEntries(MODELS.map((x) => [x, m[x].s])) as Record<ModelId, number> });
      }
    }
  }
  return out;
}
