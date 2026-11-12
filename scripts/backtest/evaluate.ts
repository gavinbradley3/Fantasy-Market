// Evaluate frozen PlayerTicker predictions against baselines A-D.
//
//   npm run backtest:evaluate -- --config experiments/phase2-baseline-v1/config.json
//   ... --unseal-test "reason"   (evaluates the sealed test period; the reason is archived)
//
// Writes experiments/<name>/results/{results.json,tables.md}. Output is deterministic: no
// timestamps, fixed bootstrap seed, sorted keys; results.json carries its own SHA-256.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ExperimentConfig } from '@/validation/config';
import {
  buildRows, byCheckpoint, calibratedMae, configureModels, crossPositionMix, largestMisses, evaluateCells, loadForEvaluation, MODELS, PAIRS, periodOf, rookiePopulation, sampleSizes, stability, subgroups,
  type CellResult,
} from '@/validation/evaluate';
import { BASELINE_CONSTANTS } from '@/validation/baselines';
import { fitTwoPart } from '@/validation/challengers';
import { POSITIONS, type Pos } from '@/validation/data';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const configPath = arg('--config');
if (!configPath) throw new Error('--config is required');
const unsealTest = arg('--unseal-test');
if (args.includes('--unseal-test') && !unsealTest) throw new Error('--unseal-test needs a reason');
const reps = Number(arg('--reps') ?? NaN);

const root = process.cwd();
const config = JSON.parse(readFileSync(resolve(configPath), 'utf8')) as ExperimentConfig;
configureModels(config);
const { ds, last } = loadForEvaluation(config, root, unsealTest);
const { rows, manifests, skipped, reclass } = buildRows({ config, root, unsealTest }, ds, last);
const bootReps = Number.isFinite(reps) ? reps : config.bootstrap.reps;
const cells = evaluateCells(rows, bootReps, config.bootstrap.seed);

const results = {
  experiment: config.name,
  sealed: !unsealTest,
  unsealReason: unsealTest ?? null,
  lastOutcomeSeasonRead: last,
  bootstrap: { reps: bootReps, seed: config.bootstrap.seed },
  baselineConstants: BASELINE_CONSTANTS,
  predictionManifests: manifests.map((m) => ({ id: m.id, asOf: m.asOf, codeSha: m.codeSha, valuationChecksum: m.valuationChecksum })),
  skipped,
  positionReclassification: {
    playerDecisions: reclass.length,
    examples: reclass.slice(0, 15),
  },
  sampleSizes: sampleSizes(rows),
  cells,
  stability: stability(rows),
  subgroups: subgroups(rows),
  availability: subgroups(rows, (r) => r.availability),
  byCheckpoint: byCheckpoint(rows),
  largestMisses: { development: largestMisses(rows, 'development'), validation: largestMisses(rows, 'validation') },
  calibratedMae: calibratedMae(rows),
  crossPositionMix: crossPositionMix(rows),
  rookies: rookiePopulation({ config, root, unsealTest }, ds, last),
  ...(config.challengers ? { challengers: { models: MODELS, pairs: PAIRS, predictionsFrom: config.predictionsFrom ?? config.name, twoPartFits: twoPartFits() } } : {}),
};

/** The fitted lines behind challenger F at each decision season, archived so a number can be traced. */
function twoPartFits() {
  const statPos = new Map<string, Map<string, number>>();
  for (const g of ds.games) {
    const m = statPos.get(g.gsis) ?? new Map<string, number>();
    m.set(g.position, (m.get(g.position) ?? 0) + 1);
    statPos.set(g.gsis, m);
  }
  const main = new Map<string, Pos>();
  for (const [g, m] of statPos) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if ((POSITIONS as readonly string[]).includes(top)) main.set(g, top as Pos);
  }
  const out: { fittedThroughSeason: number; pos: Pos; part: string; seasonsAhead: number; intercept: number; slope: number; pairs: number }[] = [];
  const seasons = [...new Set(config.decisions.map((d) => d.season))].filter((s) => {
    const p = periodOf(config, s);
    return p !== null && (p !== 'test' || !!unsealTest);
  });
  for (const season of seasons.sort()) {
    for (const pos of POSITIONS) {
      const fit = fitTwoPart(ds, season - 1, pos, (g) => main.get(g) ?? null);
      for (const [part, fits] of [['gamesShare', fit.share], ['pointsPerGamePlayed', fit.rate]] as const) {
        fits.forEach((f, i) => out.push({ fittedThroughSeason: season - 1, pos, part, seasonsAhead: i + 1, intercept: f.line.a, slope: f.line.b, pairs: f.line.n }));
      }
    }
  }
  return out;
}

const round = (_k: string, v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null) : v);
const body = JSON.stringify(results, round, 1);
const sha = createHash('sha256').update(body).digest('hex');
if (config.frozenResultsSha256) {
  // Frozen: verify, never write.
  const ok = sha === config.frozenResultsSha256 && !unsealTest;
  console.log(`rows ${rows.length}, cells ${cells.length}, results sha256 ${sha}`);
  console.log(ok ? `FROZEN: reproduces ${config.frozenResultsSha256}; nothing written` : `FROZEN: does NOT reproduce ${config.frozenResultsSha256}${unsealTest ? ' (unsealing a frozen experiment is refused)' : ''}; nothing written`);
  process.exit(ok ? 0 : 1);
}
const outDir = join(root, 'experiments', config.name, 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'results.json'), JSON.stringify({ sha256: sha, ...JSON.parse(body) }, null, 1) + '\n');
writeFileSync(join(outDir, 'tables.md'), renderTables(results.cells, results));
console.log(`rows ${rows.length}, cells ${cells.length}, results sha256 ${sha}`);

function f(x: number | null | undefined, d = 3) {
  return x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : x.toFixed(d);
}

function renderTables(cells: CellResult[], r: typeof results): string {
  const L: string[] = [];
  L.push(`# ${config.name}: results`, '', `Sealed test period: ${r.sealed ? 'yes' : `NO (${r.unsealReason})`}. Outcome seasons read: through ${r.lastOutcomeSeasonRead}. Bootstrap: ${r.bootstrap.reps} player-cluster resamples, seed ${r.bootstrap.seed}. results.json sha256 \`${sha}\`.`, '');
  L.push('Spearman = mean over decision dates of within-position rank correlation with the realised outcome; 95% CI from the player-cluster bootstrap. P@N = share of the realised top N (replacement rank) also in the predicted top N. Pairwise = ordering accuracy over pairs whose outcomes differ by 25+ points.', '');
  for (const period of ['development', 'validation', 'test'] as const) {
    const pc = cells.filter((c) => c.period === period);
    if (!pc.length) continue;
    L.push(`## ${period}`, '');
    const label = { all: 'every board player at the position', history: 'players with NFL scoring history at the decision', relevant: 'players any model ranks in its top 2N (decision-relevant)' };
    for (const pop of ['relevant', 'history', 'all'] as const) {
      L.push(`### Population: ${label[pop]}`, '');
      L.push('| Pos | Target | Dates | Player-dates | Model | Spearman [95% CI] | P@N [95% CI] | Pairwise |', '|---|---|---|---|---|---|---|---|');
      for (const c of pc.filter((c) => c.population === pop)) {
        for (const m of MODELS) {
          const x = c.model[m];
          L.push(`| ${c.pos} | ${c.target} | ${c.decisions} | ${c.playerDecisions} | ${m}${m === c.bestBaseline ? ' (best baseline)' : ''} | ${f(x.spearman)} [${f(x.ci[0])}, ${f(x.ci[1])}] | ${f(x.precisionAtN)} [${f(x.pCi[0])}, ${f(x.pCi[1])}] | ${f(x.pairwise)} |`);
        }
        L.push(`| ${c.pos} | ${c.target} | | | **PT − best** | **${f(c.ptMinusBest.spearman)} [${f(c.ptMinusBest.ci[0])}, ${f(c.ptMinusBest.ci[1])}]** | | |`);
      }
      L.push('');
    }
  }
  if (PAIRS.length) {
    L.push('## Paired differences (first minus second, same bootstrap resamples)', '', 'A value variant shares its parent model\'s within-position ordering, so it differs from the parent only on VOR2.', '', '| Period | Population | Pos | Target | Pair | Δ Spearman [95% CI] | Δ P@N [95% CI] |', '|---|---|---|---|---|---|---|');
    for (const c of cells) {
      for (const x of c.paired ?? []) {
        // A value variant shares its parent's within-position scores: skip pairs that are zero or duplicated there.
        const sameOrdering = (m: string) => m.replace('E_curve_value', 'E').replace('E_matched_value', 'E').replace('E_playerticker', 'E').replace('C_season_value', 'C').replace('C_age_adjusted', 'C').replace('F_harness_value', 'F').replace('F_two_part', 'F');
        if (c.target !== 'VOR2' && (sameOrdering(x.a) === sameOrdering(x.b) || x.a === 'F_harness_value' || x.b === 'E_matched_value')) continue;
        L.push(`| ${c.period} | ${c.population} | ${c.pos} | ${c.target} | ${x.a} − ${x.b} | ${f(x.spearman)} [${f(x.ci[0])}, ${f(x.ci[1])}] | ${f(x.precisionAtN)} [${f(x.pCi[0])}, ${f(x.pCi[1])}] |`);
      }
    }
    L.push('');
  }
  L.push('## Rank stability between consecutive checkpoints (Spearman of T2 scores)', '', '| Period | Pos | ' + MODELS.join(' | ') + ' |', '|---|---|' + MODELS.map(() => '---').join('|') + '|');
  const st = r.stability;
  for (const key of [...new Set(st.map((s) => `${s.period}|${s.pos}`))]) {
    const [period, pos] = key.split('|');
    L.push(`| ${period} | ${pos} | ` + MODELS.map((m) => f(st.find((s) => s.period === period && s.pos === pos && s.model === m)?.meanSpearman)).join(' | ') + ' |');
  }
  L.push('', '## Spearman (T1) by experience', '', '| Period | Pos | Experience | Player-dates | ' + MODELS.join(' | ') + ' |', '|---|---|---|---|' + MODELS.map(() => '---').join('|') + '|');
  for (const s of r.subgroups) L.push(`| ${s.period} | ${s.pos} | ${s.experience} | ${s.playerDecisions} | ` + MODELS.map((m) => f(s.model[m])).join(' | ') + ' |');
  L.push('', '## Spearman (T1) by last-season availability (all board players)', '', '| Period | Pos | Availability | Player-dates | ' + MODELS.join(' | ') + ' |', '|---|---|---|---|' + MODELS.map(() => '---').join('|') + '|');
  for (const s of r.availability) L.push(`| ${s.period} | ${s.pos} | ${s.experience} | ${s.playerDecisions} | ` + MODELS.map((m) => f(s.model[m])).join(' | ') + ' |');
  L.push('', '## Spearman (T1) by checkpoint (decision-relevant tier)', '', '| Period | Pos | Checkpoint | Dates | ' + MODELS.join(' | ') + ' |', '|---|---|---|---|' + MODELS.map(() => '---').join('|') + '|');
  for (const s of r.byCheckpoint) L.push(`| ${s.period} | ${s.pos} | ${s.checkpoint} | ${s.decisions} | ` + MODELS.map((m) => f(s.model[m])).join(' | ') + ' |');
  for (const period of ['development', 'validation'] as const) {
    L.push('', `## Largest PlayerTicker misses relative to baseline C, ${period} (decision-relevant tier, T2 rank)`, '', '| Pos | Date | Player | PT rank | C rank | Realised rank | Realised T2 |', '|---|---|---|---|---|---|---|');
    for (const x of r.largestMisses[period]) L.push(`| ${x.pos} | ${x.decision} | ${x.name} | ${x.ptRank} | ${x.bestBaselineRank} | ${x.realisedRank} | ${f(x.T2, 1)} |`);
  }
  L.push('', '## Calibrated MAE, T1 season points (decile map fitted on development, applied to validation)', '', '| Pos | Rows | ' + MODELS.join(' | ') + ' |', '|---|---|' + MODELS.map(() => '---').join('|') + '|');
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    const xs = r.calibratedMae.filter((x) => x.pos === pos);
    if (xs.length) L.push(`| ${pos} | ${xs[0].validationRows} | ` + MODELS.map((m) => f(xs.find((x) => x.model === m)?.mae, 1)).join(' | ') + ' |');
  }
  L.push('', '## Position mix of the top 120 by cross-position value (mean per date; realised = two-season VOR)', '', '| Period | Source | QB | RB | WR | TE |', '|---|---|---|---|---|---|');
  for (const x of r.crossPositionMix) L.push(`| ${x.period} | ${x.source} | ${f(x.mix.QB, 1)} | ${f(x.mix.RB, 1)} | ${f(x.mix.WR, 1)} | ${f(x.mix.TE, 1)} |`);
  L.push('', '## Rookies without NFL games (OFFSEASON, drafted that spring)', '', '| Decision | Pos | Drafted | On PT board | PT-ranked | With T2 | Draft-pick ρ (T2) | PT ρ on ranked | Draft-pick ρ on same ranked |', '|---|---|---|---|---|---|---|---|---|');
  for (const x of r.rookies) L.push(`| ${x.decision} | ${x.pos} | ${x.draftees} | ${x.onBoard} | ${x.ranked} | ${x.withT2} | ${f(x.draftPickSpearmanT2)} | ${f(x.ptSpearmanT2OnRanked)} | ${f(x.draftPickSpearmanOnRanked)} |`);
  L.push('', '## Sample sizes', '', '```json', JSON.stringify(r.sampleSizes, null, 1), '```', '');
  L.push(`Position reclassification (board position differs from main stats position): ${r.positionReclassification.playerDecisions} player-dates.`, '');
  return L.join('\n');
}
