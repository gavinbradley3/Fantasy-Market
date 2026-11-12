// Download the nflverse release files the validation harness reads, and record their SHA-256.
//
//   npm run backtest:fetch -- --config experiments/<name>/config.json            download missing files, write manifest
//   npm run backtest:fetch -- --config experiments/<name>/config.json --verify   compare local files to the archived manifest
//
// nflverse republishes these assets in place (stat corrections, new rows). The archived
// manifest (experiments/<name>/data-manifest.json) is the only record of WHICH bytes a result
// was computed from; a later download that hashes differently is a different experiment input.
// Files live under the config's dataDir, which is git-ignored: they are not redistributed.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ExperimentConfig } from '@/validation/config';

const BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const STAT_SEASONS = Array.from({ length: 2026 - 2012 + 1 }, (_, i) => 2012 + i);
const FILES: { file: string; path: string }[] = [
  ...STAT_SEASONS.map((y) => ({ file: `stats_player_week_${y}.csv`, path: `stats_player/stats_player_week_${y}.csv` })),
  { file: 'games.csv', path: 'schedules/games.csv' },
  { file: 'players.csv', path: 'players/players.csv' },
  { file: 'draft_picks.csv', path: 'draft_picks/draft_picks.csv' },
];

const argv = process.argv.slice(2);
const cfgPath = resolve(argv[argv.indexOf('--config') + 1]);
const config = JSON.parse(readFileSync(cfgPath, 'utf8')) as ExperimentConfig;
const dir = resolve(config.dataDir);
const manifestPath = join(dirname(cfgPath), 'data-manifest.json');
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

if (argv.includes('--verify')) {
  const archived = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files: Record<string, { sha256: string }> };
  let bad = 0;
  for (const [file, { sha256 }] of Object.entries(archived.files)) {
    const local = join(dir, file);
    const got = existsSync(local) ? sha(local) : 'missing';
    if (got !== sha256) {
      bad++;
      console.log(`DIFFERS ${file}: archived ${sha256.slice(0, 16)}, local ${got.slice(0, 16)}`);
    }
  }
  console.log(bad === 0 ? `all ${Object.keys(archived.files).length} files match the archived manifest` : `${bad} file(s) differ`);
  process.exit(bad === 0 ? 0 : 1);
}

mkdirSync(dir, { recursive: true });
const files: Record<string, { url: string; bytes: number; sha256: string }> = {};
for (const { file, path } of FILES) {
  const local = join(dir, file);
  const url = `${BASE}/${path}`;
  if (!existsSync(local) || statSync(local).size === 0) {
    execFileSync('curl', ['-sSfL', '--max-time', '300', '-o', local, url], { stdio: 'inherit' });
  }
  files[file] = { url, bytes: statSync(local).size, sha256: sha(local) };
}
writeFileSync(manifestPath, JSON.stringify({ source: 'nflverse-data GitHub releases; licence terms per the nflverse-data repository; files are not redistributed here', files }, null, 1) + '\n');
console.log(`wrote ${manifestPath} (${Object.keys(files).length} files)`);
