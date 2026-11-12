// Phase 3 usage-signal experiment. Design is fixed in experiments/phase3-usage-signals/config.json.
//
//   npm run backtest:usage -- --config experiments/phase3-usage-signals/config.json
//
// Writes results/results.json (deterministic, carries its own SHA-256), results/tables.md, and a
// per-row dump to .local/ (not committed). Reads no season after 2023.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCsv, num } from '@/validation/csv';
import { decisionDate, scheduleRows, type Checkpoint } from '@/validation/calendar';
import { loadDataset } from '@/validation/data';
import { mainPositions } from '@/validation/evaluate';
import { quantile, rng, spearman } from '@/validation/metrics';
import { GAME_FINAL_AFTER_MS } from '@/ingestion/weekTiming';
import { buildUsageRows, ols, predict, USAGE_POSITIONS, type TeamGame, type UsagePos, type UsageRow } from '@/validation/usage';

const argv = process.argv.slice(2);
const cfgPath = resolve(argv[argv.indexOf('--config') + 1]);
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
  name: string; dataDir: string; usageDataDir: string;
  periods: { fit: number[]; holdout: number[]; sealed: number[] };
  horizonsTeamGames: number[]; primaryHorizon: number; bootstrap: { reps: number; seed: number };
};
const seasons = [...cfg.periods.fit, ...cfg.periods.holdout];
const lastSeason = Math.max(...seasons);
if (seasons.some((s) => cfg.periods.sealed.includes(s))) throw new Error('a sealed season is in the fit or holdout period');
const dataDir = resolve(cfg.dataDir);
const udir = resolve(cfg.usageDataDir);
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

// ---------- inputs ----------
const ds = loadDataset(dataDir, Array.from({ length: lastSeason - 2012 + 1 }, (_, i) => 2012 + i));
const gamesRows = parseCsv(readFileSync(join(dataDir, 'games.csv'), 'utf8'));
const schedule = scheduleRows(gamesRows);
const teamGames = new Map<string, TeamGame[]>();
schedule.forEach((g, i) => {
  const r = gamesRows[i];
  if (g.gameType !== 'REG' || !g.kickoff || g.season > lastSeason) return;
  const k = Date.parse(g.kickoff);
  for (const team of [r.home_team, r.away_team]) {
    const key = `${team}|${g.season}`;
    const l = teamGames.get(key) ?? [];
    l.push({ gameId: r.game_id, season: g.season, week: g.week, team, kickoff: k, availableAt: k + GAME_FINAL_AFTER_MS });
    teamGames.set(key, l);
  }
});
for (const l of teamGames.values()) l.sort((a, b) => a.kickoff - b.kickoff);

const teamTotals = new Map<string, { carries: number; targets: number }>();
for (const s of seasons) {
  for (const r of parseCsv(readFileSync(join(udir, `stats_team_week_${s}.csv`), 'utf8'))) {
    if (r.season_type === 'REG') teamTotals.set(`${r.team}|${r.game_id}`, { carries: num(r.carries) ?? 0, targets: num(r.targets) ?? 0 });
  }
}
// Cross-check the provider's team totals against the sum of player rows.
const sums = new Map<string, { carries: number; targets: number }>();
for (const g of ds.games) {
  if (!seasons.includes(g.season)) continue;
  const k = `${g.team}|${g.gameId}`;
  const t = sums.get(k) ?? { carries: 0, targets: 0 };
  t.carries += g.carries;
  t.targets += g.targets;
  sums.set(k, t);
}
let totalsMismatch = 0;
for (const [k, t] of sums) {
  const p = teamTotals.get(k);
  if (!p || p.carries !== t.carries || p.targets !== t.targets) totalsMismatch++;
}

const pfrToGsis = new Map<string, string>();
for (const p of parseCsv(readFileSync(join(dataDir, 'players.csv'), 'utf8'))) if (p.pfr_id && p.gsis_id) pfrToGsis.set(p.pfr_id, p.gsis_id);
const snapShare = new Map<string, number>();
let snapRows = 0;
let snapUnmapped = 0;
for (const s of seasons) {
  for (const r of parseCsv(readFileSync(join(udir, `snap_counts_${s}.csv`), 'utf8'))) {
    if (r.game_type !== 'REG') continue;
    snapRows++;
    const g = pfrToGsis.get(r.pfr_player_id);
    const v = num(r.offense_pct);
    if (!g) {
      snapUnmapped++;
      continue;
    }
    if (v !== null) snapShare.set(`${g}|${r.game_id}`, v);
  }
}
const statPos = mainPositions(ds);

// ---------- rows ----------
const H = cfg.horizonsTeamGames;
const all: UsageRow[] = [];
const decisions: { id: string; asOf: string }[] = [];
for (const s of seasons) {
  const lastWeek = Math.max(...schedule.filter((g) => g.season === s && g.gameType === 'REG').map((g) => g.week));
  for (let w = 4; w <= lastWeek - 4; w++) {
    const d = decisionDate(schedule, s, `W${w}` as Checkpoint);
    decisions.push({ id: d.id, asOf: d.asOf });
    all.push(...buildUsageRows({ ds, teamGames, teamTotals, snapShare, positionOf: (g) => statPos.get(g) ?? null }, s, w, Date.parse(d.asOf), H));
  }
}

// ---------- models ----------
const PROD = ['P_L4', 'P_STD', 'F_RATE'];
const usageFor = (pos: UsagePos) => (pos === 'RB' ? ['snap', 'carry', 'target'] : ['snap', 'target']);
function modelsFor(pos: UsagePos): Record<string, string[]> {
  const m: Record<string, string[]> = { M0: PROD };
  for (const u of usageFor(pos)) {
    m[`M0+${u}_lvl`] = [...PROD, `${u}_lvl`];
    m[`M0+${u}_chg`] = [...PROD, `${u}_chg`];
    m[`M0+${u}_lvl+chg`] = [...PROD, `${u}_lvl`, `${u}_chg`];
  }
  m['M0+volume'] = [...PROD, 'VOL_L4'];
  const shares = usageFor(pos).flatMap((u) => [`${u}_lvl`, `${u}_chg`]);
  m['M0+all_shares'] = [...PROD, ...shares];
  m['M0+all_shares+volume'] = [...PROD, ...shares, 'VOL_L4'];
  return m;
}

const isFit = (r: UsageRow) => cfg.periods.fit.includes(r.season);
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const cells: unknown[] = [];
const residualTables: unknown[] = [];
const coefficients: unknown[] = [];
const sample: unknown[] = [];
const dump: unknown[] = [];

for (const pos of USAGE_POSITIONS) {
  const rowsPos = all.filter((r) => r.pos === pos);
  const need = [...PROD, 'VOL_L4', ...usageFor(pos).flatMap((u) => [`${u}_lvl`, `${u}_chg`])];
  const rows = rowsPos.filter((r) => need.every((k) => r.f[k] !== null && Number.isFinite(r.f[k] as number)));
  const fit = rows.filter(isFit);
  const hold = rows.filter((r) => !isFit(r));
  const missedShare = (rs: UsageRow[], h: number) => rs.reduce((s, r) => s + (h - r.y[h].gamesPlayed), 0) / (rs.length * h);
  sample.push({
    pos, rowsBuilt: rowsPos.length, rowsComplete: rows.length, excludedMissingFeature: rowsPos.length - rows.length,
    fitRows: fit.length, fitPlayers: new Set(fit.map((r) => r.gsis)).size, holdoutRows: hold.length, holdoutPlayers: new Set(hold.map((r) => r.gsis)).size,
    holdoutDecisions: new Set(hold.map((r) => r.decision)).size,
    holdoutShareOfFutureGamesMissed: Object.fromEntries(H.map((h) => [h, r4(missedShare(hold, h))])),
  });
  const models = modelsFor(pos);
  for (const target of ['points', 'opportunities'] as const) {
    for (const h of H) {
      const yv = (r: UsageRow) => r.y[h][target];
      const preds: Record<string, number[]> = {};
      for (const [name, feats] of Object.entries(models)) {
        const beta = ols(fit.map((r) => feats.map((k) => r.f[k] as number)), fit.map(yv));
        preds[name] = hold.map((r) => predict(beta, feats.map((k) => r.f[k] as number)));
        if (target === 'points' && h === cfg.primaryHorizon) coefficients.push({ pos, model: name, intercept: r4(beta[0]), coef: Object.fromEntries(feats.map((k, i) => [k, r4(beta[i + 1])])) });
      }
      const actual = hold.map(yv);
      const mean = actual.reduce((a, b) => a + b, 0) / actual.length;
      const sst = actual.reduce((s, a) => s + (a - mean) ** 2, 0);
      // Per-player sums of absolute error, for the cluster bootstrap.
      const players = [...new Set(hold.map((r) => r.gsis))];
      const idx = new Map(players.map((p, i) => [p, i]));
      const perPlayer = (name: string) => {
        const a = new Array(players.length).fill(0);
        const n = new Array(players.length).fill(0);
        hold.forEach((r, i) => {
          const j = idx.get(r.gsis)!;
          a[j] += Math.abs(preds[name][i] - actual[i]);
          n[j]++;
        });
        return { a, n };
      };
      const base = perPlayer('M0');
      const draws: number[][] = [];
      const rand = rng(cfg.bootstrap.seed);
      for (let b = 0; b < cfg.bootstrap.reps; b++) draws.push(players.map(() => Math.floor(rand() * players.length)));
      for (const name of Object.keys(models)) {
        const p = preds[name];
        const mae = p.reduce((s, v, i) => s + Math.abs(v - actual[i]), 0) / p.length;
        const rmse = Math.sqrt(p.reduce((s, v, i) => s + (v - actual[i]) ** 2, 0) / p.length);
        const sse = p.reduce((s, v, i) => s + (v - actual[i]) ** 2, 0);
        const pp = perPlayer(name);
        const diffs = draws.map((d) => {
          let ea = 0, eb = 0, n = 0;
          for (const j of d) {
            ea += pp.a[j];
            eb += base.a[j];
            n += pp.n[j];
          }
          return (ea - eb) / n;
        });
        diffs.sort((a, b) => a - b);
        const baseMae = base.a.reduce((x, y) => x + y, 0) / hold.length;
        cells.push({
          pos, target, horizon: h, model: name, holdoutRows: hold.length, meanOutcome: r4(mean),
          mae: r4(mae), rmse: r4(rmse), r2: r4(1 - sse / sst),
          maeMinusM0: r4(mae - baseMae), maeMinusM0Pct: r4((100 * (mae - baseMae)) / baseMae), ci95: [r4(quantile(diffs, 0.025)), r4(quantile(diffs, 0.975))],
        });
      }
      if (target === 'points' && h === cfg.primaryHorizon) {
        // Does M0 miss systematically on players whose usage just changed most?
        for (const u of usageFor(pos)) {
          const key = `${u}_chg`;
          const cut = fit.map((r) => r.f[key] as number).sort((a, b) => a - b);
          const lo = quantile(cut, 0.1);
          const hi = quantile(cut, 0.9);
          for (const [band, sel] of [['bottom decile (usage fell)', (v: number) => v <= lo], ['top decile (usage rose)', (v: number) => v >= hi]] as const) {
            const ii = hold.map((r, i) => (sel(r.f[key] as number) ? i : -1)).filter((i) => i >= 0);
            const resid = (name: string) => ii.map((i) => actual[i] - preds[name][i]);
            const boot = (xs: number[]) => {
              const pl = [...new Set(ii.map((i) => hold[i].gsis))];
              const by = new Map(pl.map((p) => [p, [] as number[]]));
              ii.forEach((i, k) => by.get(hold[i].gsis)!.push(xs[k]));
              const rnd = rng(cfg.bootstrap.seed);
              const means: number[] = [];
              for (let b = 0; b < cfg.bootstrap.reps; b++) {
                let s = 0, n = 0;
                for (let t = 0; t < pl.length; t++) for (const v of by.get(pl[Math.floor(rnd() * pl.length)])!) { s += v; n++; }
                means.push(s / n);
              }
              means.sort((a, b) => a - b);
              return [r4(quantile(means, 0.025)), r4(quantile(means, 0.975))];
            };
            const m0 = resid('M0');
            const mu = resid(`M0+${u}_lvl+chg`);
            const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
            residualTables.push({
              pos, feature: key, band, cutPoint: r4(band.startsWith('bottom') ? lo : hi), holdoutRows: ii.length,
              meanActualMinusM0: r4(avg(m0)), ci95M0: boot(m0),
              meanActualMinusWithFeature: r4(avg(mu)), ci95WithFeature: boot(mu),
            });
          }
        }
        hold.forEach((r, i) => dump.push({ ...r, actual: actual[i], predM0: preds.M0[i], predAll: preds['M0+all_shares'][i], predVolume: preds['M0+volume'][i], predSnap: preds['M0+snap_lvl+chg'][i] }));
      }
    }
  }
}

// Change-feature persistence: does a usage change at the decision carry into the next H games?
const persistence = USAGE_POSITIONS.flatMap((pos) =>
  usageFor(pos).map((u) => {
    const rs = all.filter((r) => r.pos === pos && !isFit(r) && r.f[`${u}_chg`] !== null);
    const x = rs.map((r) => r.f[`${u}_chg`] as number);
    const yy = rs.map((r) => r.y[cfg.primaryHorizon].opportunities - (r.f.VOL_L4 as number));
    return { pos, feature: `${u}_chg`, holdoutRows: rs.length, spearmanWithNextOpportunityChange: r4(spearman(x, yy)) };
  }),
);

const files: Record<string, string> = {};
for (const s of seasons) {
  files[`snap_counts_${s}.csv`] = sha(join(udir, `snap_counts_${s}.csv`));
  files[`stats_team_week_${s}.csv`] = sha(join(udir, `stats_team_week_${s}.csv`));
}
for (const s of Array.from({ length: lastSeason - 2012 + 1 }, (_, i) => 2012 + i)) files[`stats_player_week_${s}.csv`] = sha(join(dataDir, `stats_player_week_${s}.csv`));
for (const f of ['games.csv', 'players.csv']) files[f] = sha(join(dataDir, f));

const results = {
  experiment: cfg.name,
  seasonsRead: `2012-${lastSeason}`,
  decisions: decisions.length,
  dataChecks: { teamGamesCrossChecked: sums.size, teamTotalsMismatches: totalsMismatch, snapRows, snapRowsWithoutGsis: snapUnmapped },
  releaseStamps: readFileSync(join(udir, 'release-stamps.txt'), 'utf8').trim().split('\n'),
  inputSha256: files,
  sample, cells, residualTables, persistence, coefficients,
};
const body = JSON.stringify(results, null, 1);
const digest = createHash('sha256').update(body).digest('hex');
const outDir = join(resolve(cfgPath, '..'), 'results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'results.json'), JSON.stringify({ sha256: digest, ...results }, null, 1) + '\n');
mkdirSync(resolve('.local'), { recursive: true });
writeFileSync(resolve('.local/usage-rows.json'), JSON.stringify(dump));
console.log(`decisions ${decisions.length}, rows ${all.length}, results sha256 ${digest}`);
