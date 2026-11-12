/**
 * Produce frozen PlayerTicker predictions for every decision date in an experiment config.
 *
 *   npm run backtest:predict -- --config experiments/<name>/config.json [--only <id,...>]
 *
 * For each decision date this runs the UNCHANGED production pipeline (`npm run ingest`, then
 * `export:site-data`) at that as-of instant, then writes a compact prediction file:
 *
 *   experiments/<name>/predictions/<id>.json
 *     { manifest: { id, asOf, codeSha, seasons, careerSeasons, publicationId, valuationChecksum,
 *                   captureChecksums[] }, players: [{ gsis, position, dynastyValue,
 *                   dynastyComposite, positionRank, overallRank, modelTier }] }
 *
 * The model is never edited or tuned here; this script only records what it says.
 */

import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '@/validation/csv';
import { decisionDate, scheduleRows, type Checkpoint } from '@/validation/calendar';
import { currentIngestSeason, rollingSeasonWindow } from '@/ingestion/season';
import { valuationChecksum } from '@/ops/valuationChecksum';
import type { ExperimentConfig } from '@/validation/config';

function run(cmd: string, args: string[], logFile: string): void {
  const out = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=12000' } });
  writeFileSync(logFile, out);
}

function main(): number {
  const argv = process.argv.slice(2);
  const cfgPath = resolve(argv[argv.indexOf('--config') + 1]);
  const only = argv.includes('--only') ? new Set(argv[argv.indexOf('--only') + 1].split(',')) : null;
  const config = JSON.parse(readFileSync(cfgPath, 'utf8')) as ExperimentConfig;
  const root = dirname(cfgPath);
  const work = resolve(config.workDir);
  mkdirSync(join(root, 'predictions'), { recursive: true });
  const schedule = scheduleRows(parseCsv(readFileSync(join(config.dataDir, 'games.csv'), 'utf8')));
  const codeSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  for (const d of config.decisions) {
    const date = decisionDate(schedule, d.season, d.checkpoint as Checkpoint);
    if (only && !only.has(date.id)) continue;
    const outFile = join(root, 'predictions', `${date.id}.json`);
    if (existsSync(outFile)) { console.log(`${date.id}: exists, skipped`); continue; }
    const ingestSeason = currentIngestSeason(new Date(date.asOf));
    const seasons = rollingSeasonWindow(ingestSeason);
    // Nine seasons ending at the ingest season, mirroring production (2017-2025 for a 2026 board).
    const careerSeasons = Array.from({ length: 9 }, (_, i) => ingestSeason - 8 + i);
    const dir = join(work, date.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const db = join(dir, 'pt.db');
    const t0 = Date.now();
    run('npm', ['run', '-s', 'ingest', '--', '--as-of', date.asOf, '--seasons', seasons.join(','), '--career-seasons', careerSeasons.join(','),
      '--db', db, '--captures', resolve(config.capturesDir), '--no-sleeper'], join(dir, 'ingest.log'));
    run('npm', ['run', '-s', 'export:site-data', '--', '--db', db, '--out', join(dir, 'export')], join(dir, 'export.log'));

    const board = JSON.parse(readFileSync(join(dir, 'export', 'board.json'), 'utf8')) as { publication: Record<string, unknown>; entries: Record<string, any>[] };
    const sqlite = new DatabaseSync(db, { readOnly: true });
    const gsisOf = new Map<string, string | null>();
    for (const r of sqlite.prepare('SELECT serialized FROM normalized_input_artifact').all() as { serialized: string }[]) {
      const input = JSON.parse(r.serialized);
      gsisOf.set(String(input.player.identity.canonical_id), input.player.identity.provider_ids?.gsis ?? null);
    }
    const captureChecksums = (sqlite.prepare('SELECT payload_checksum, request_key FROM raw_payload_artifact ORDER BY request_key').all() as { payload_checksum: string; request_key: string }[])
      .map((r) => `${r.request_key}=${r.payload_checksum}`);
    sqlite.close();

    const players = board.entries.map((e) => ({
      gsis: gsisOf.get(e.canonicalId) ?? null,
      position: e.position,
      dynastyValue: e.dynastyValue ?? null,
      dynastyComposite: e.composites?.dynasty ?? null,
      positionRank: e.dynastyPositionRank ?? null,
      overallRank: e.dynastyOverallRank ?? null,
      modelTier: e.modelTier ?? null,
    }));
    writeFileSync(outFile, `${JSON.stringify({
      manifest: {
        id: date.id, asOf: date.asOf, codeSha, seasons, careerSeasons,
        publicationId: board.publication.publicationId, valuationChecksum: valuationChecksum(board.entries),
        captureChecksums, durationSeconds: Math.round((Date.now() - t0) / 1000),
      },
      players,
    })}\n`);
    console.log(`${date.id}: ${players.length} players, ${players.filter((p) => p.overallRank !== null).length} ranked, ${Math.round((Date.now() - t0) / 1000)}s`);
    rmSync(db, { force: true });
    for (const s of ['-wal', '-shm']) rmSync(`${db}${s}`, { force: true });
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
