/**
 * Archive one dated prediction snapshot: frozen incumbent (E) plus research candidates C and F,
 * with the actual capture time, a classification, and a hash of every input byte.
 *
 *   New snapshot (records capture time now, fetches inputs now, runs everything now):
 *     npm run backtest:archive -- --config experiments/prospective-2026/config.json --id 2026-W12
 *
 *   Re-label an incumbent prediction recorded earlier by backtest:predict (no re-run):
 *     npm run backtest:archive -- --config ... --id 2026-W8 --existing \
 *       --captured-at <ISO start of that run> --captures <its capture dir>
 *
 * Writes experiments/<name>/snapshots/<id>/{manifest.json,candidates.json} (committed) and an
 * input bundle .local/archive-bundles/<name>/<id>.tar.xz (NOT committed; its SHA-256 is in the
 * manifest). The bundle must be copied to durable storage before the container is reclaimed;
 * the manifest's `bundle.storedAt` stays null until someone records where.
 *
 * Refuses to overwrite a snapshot. Never evaluates anything and reads no outcome: C and F at a
 * decision date read only games final before it.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { ExperimentConfig } from '@/validation/config';
import { parseCsv } from '@/validation/csv';
import { decisionDate, scheduleRows, type Checkpoint } from '@/validation/calendar';
import { loadDataset, POSITIONS, type Pos } from '@/validation/data';
import { computeBaselines, BASELINE_CONSTANTS } from '@/validation/baselines';
import { computeTwoPart } from '@/validation/challengers';
import { mainPositions, type PredictionFile } from '@/validation/evaluate';
import { classifySnapshot, perSeasonValues, PROSPECTIVE_WINDOW_HOURS } from '@/validation/archive';

const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download';
const argv = process.argv.slice(2);
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const startedAt = new Date();
const sha256 = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

const cfgPath = resolve(arg('--config') ?? '');
const id = arg('--id');
if (!id) throw new Error('--id is required');
const existing = argv.includes('--existing');
const config = JSON.parse(readFileSync(cfgPath, 'utf8')) as ExperimentConfig;
const expDir = dirname(cfgPath);
const snapDir = join(expDir, 'snapshots', id);
if (existsSync(join(snapDir, 'manifest.json'))) throw new Error(`${snapDir} already holds a snapshot; snapshots are never overwritten`);
const decision = config.decisions.find((d) => `${d.season}-${d.checkpoint}` === id);
if (!decision) throw new Error(`${id} is not a decision in ${cfgPath}`);
const S = decision.season;

const work = resolve('.local', 'archive', config.name, id);
const dataDir = existing ? resolve(config.dataDir) : join(work, 'data');
mkdirSync(dataDir, { recursive: true });
mkdirSync(snapDir, { recursive: true });

// 1. Inputs for C and F, and the release stamps nflverse published for them.
const files = [
  ...Array.from({ length: S - 2012 + 1 }, (_, i) => ({ file: `stats_player_week_${2012 + i}.csv`, path: `stats_player/stats_player_week_${2012 + i}.csv` })),
  { file: 'games.csv', path: 'schedules/games.csv' },
  { file: 'players.csv', path: 'players/players.csv' },
  { file: 'draft_picks.csv', path: 'draft_picks/draft_picks.csv' },
];
const releaseStamps: Record<string, string | null> = {};
if (!existing) {
  for (const { file, path } of files) execFileSync('curl', ['-sSfL', '--max-time', '300', '-o', join(dataDir, file), `${NFLVERSE}/${path}`]);
  for (const tag of ['stats_player', 'schedules', 'players', 'draft_picks', 'weekly_rosters', 'pbp_participation']) {
    try {
      releaseStamps[tag] = JSON.parse(execFileSync('curl', ['-sSfL', '--max-time', '60', `${NFLVERSE}/${tag}/timestamp.json`], { encoding: 'utf8' })).last_updated ?? null;
    } catch {
      releaseStamps[tag] = null;
    }
  }
}
const dataFiles = Object.fromEntries(files.map(({ file }) => [file, { bytes: statSync(join(dataDir, file)).size, sha256: sha256(join(dataDir, file)), modifiedAt: statSync(join(dataDir, file)).mtime.toISOString() }]));

// 2. Decision instant and classification.
const schedule = scheduleRows(parseCsv(readFileSync(join(dataDir, 'games.csv'), 'utf8')));
const asOf = decisionDate(schedule, S, decision.checkpoint as Checkpoint).asOf;
const firstOutcomeSeason = decision.checkpoint === 'OFFSEASON' ? S : S + 1;
const outcomeKickoffs = schedule.filter((g) => g.season === firstOutcomeSeason && g.gameType === 'REG' && g.kickoff).map((g) => Date.parse(g.kickoff!));
// The next season's schedule is often unpublished in-season; then no outcome game can have started.
const firstOutcomeMs = outcomeKickoffs.length ? Math.min(...outcomeKickoffs) : Number.POSITIVE_INFINITY;
const capturedAt = existing ? new Date(arg('--captured-at') ?? 'invalid') : startedAt;
if (!Number.isFinite(capturedAt.getTime())) throw new Error('--existing needs --captured-at <ISO>');
const cls = classifySnapshot(Date.parse(asOf), capturedAt.getTime(), firstOutcomeMs);

// 3. Incumbent prediction.
let predFile: string;
let capturesDir: string;
if (existing) {
  predFile = join(expDir, 'predictions', `${id}.json`);
  capturesDir = resolve(arg('--captures') ?? join(config.capturesDir, id));
} else {
  const snapCfg = { ...config, dataDir, capturesDir: join(work, 'captures'), workDir: join(work, 'pipeline'), isolateCaptures: true, decisions: [decision] };
  const snapCfgPath = join(snapDir, 'config.json');
  writeFileSync(snapCfgPath, JSON.stringify(snapCfg, null, 2) + '\n');
  execFileSync('npm', ['run', '-s', 'backtest:predict', '--', '--config', snapCfgPath, '--only', id], { stdio: 'inherit' });
  predFile = join(snapDir, 'predictions', `${id}.json`);
  capturesDir = join(work, 'captures', id);
}
const pred = JSON.parse(readFileSync(predFile, 'utf8')) as PredictionFile;
if (pred.manifest.asOf !== asOf) throw new Error(`prediction as-of ${pred.manifest.asOf} differs from the schedule's ${asOf}`);
const captureFiles = readdirSync(capturesDir).sort().map((f) => ({ file: f, bytes: statSync(join(capturesDir, f)).size, sha256: sha256(join(capturesDir, f)) }));

// 4. Candidates C and F on the incumbent's population. Only games final at the as-of are read
//    (computeBaselines / computeTwoPart filter by availableAt), so no outcome enters.
const ds = loadDataset(dataDir, Array.from({ length: S - 2012 + 1 }, (_, i) => 2012 + i));
const statPos = mainPositions(ds);
const population = new Map<string, Pos>();
for (const p of pred.players) if (p.gsis && (POSITIONS as readonly string[]).includes(p.position)) population.set(p.gsis, p.position as Pos);
const ctx = { ds, asOfMs: Date.parse(asOf), decisionSeason: S, checkpoint: decision.checkpoint, population, positionOf: (g: string) => statPos.get(g) ?? null };
const C = computeBaselines(ctx).C_age_adjusted;
const F = computeTwoPart(ctx);
const cValue = perSeasonValues(population, C.T1, C.T2);
const fValue = perSeasonValues(population, F.T1, F.T2);
const r1 = (x: number) => Math.round(x * 10) / 10;
const candidates = {
  id, asOf,
  note: 'Research candidates, not published valuations. T1/T2 are projected PPR points for the first and both horizon seasons; value is two-season points above replacement (per-season rule). E fields are copied from the incumbent prediction file.',
  players: [...population].sort(([a], [b]) => a.localeCompare(b)).map(([gsis, pos]) => {
    const e = pred.players.find((p) => p.gsis === gsis)!;
    return {
      gsis, pos,
      E: { positionRank: e.positionRank, overallRank: e.overallRank, dynastyValue: e.dynastyValue },
      C: { T1: r1(C.T1.get(gsis) ?? 0), T2: r1(C.T2.get(gsis) ?? 0), value: r1(cValue.get(gsis) ?? 0) },
      F: { T1: r1(F.T1.get(gsis) ?? 0), T2: r1(F.T2.get(gsis) ?? 0), value: r1(fValue.get(gsis) ?? 0) },
    };
  }),
};
const candFile = join(snapDir, 'candidates.json');
writeFileSync(candFile, JSON.stringify(candidates) + '\n');

// 5. Input bundle (local; storage is an owner decision).
const bundleDir = resolve('.local', 'archive-bundles', config.name);
mkdirSync(bundleDir, { recursive: true });
const bundle = join(bundleDir, `${id}.tar.xz`);
execFileSync('bash', ['-c', `tar -cf - -C "${dirname(capturesDir)}" "${basename(capturesDir)}" -C "${dirname(dataDir)}" "${basename(dataDir)}" | xz -T4 -6 > "${bundle}"`]);

const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'scripts'], { encoding: 'utf8' }).trim() !== '';
const manifest = {
  id, asOf,
  capturedAt: capturedAt.toISOString(),
  capturedAtSource: existing ? `supplied: ${arg('--captured-at')} (re-labelled ${startedAt.toISOString()})` : 'wall clock at the start of this run',
  completedAt: new Date().toISOString(),
  ...cls,
  prospectiveWindowHours: PROSPECTIVE_WINDOW_HOURS,
  firstOutcomeSeason,
  firstOutcomeKickoff: Number.isFinite(firstOutcomeMs) ? new Date(firstOutcomeMs).toISOString() : 'not yet scheduled',
  code: { sha: codeSha, srcOrScriptsModified: dirty, incumbentPredictionCodeSha: pred.manifest.codeSha },
  incumbent: { file: predFile.replace(resolve('.') + '/', ''), sha256: sha256(predFile), predictionChecksum: (pred.manifest as unknown as { predictionChecksum?: string }).predictionChecksum ?? null },
  candidates: { file: candFile.replace(resolve('.') + '/', ''), sha256: sha256(candFile), models: ['C_age_adjusted', 'F_two_part'], baselineConstants: BASELINE_CONSTANTS },
  inputs: {
    nflverseReleaseStamps: existing ? 'not recorded (inputs fetched before this procedure existed)' : releaseStamps,
    harnessFiles: dataFiles,
    incumbentCaptures: captureFiles,
  },
  bundle: { file: bundle.replace(resolve('.') + '/', ''), bytes: statSync(bundle).size, sha256: sha256(bundle), storedAt: null as string | null },
};
writeFileSync(join(snapDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${id}: ${cls.classification} (${cls.reason}); ${population.size} players; bundle ${(manifest.bundle.bytes / 1e6).toFixed(1)} MB`);
