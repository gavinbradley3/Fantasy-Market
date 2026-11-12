/**
 * Assert that a directory about to be published contains only approved data.
 *
 *   npm run assert:public-data -- --dir <dist or data dir>
 *
 * Fails (exit 1) when:
 *   - the data directory holds any file outside PUBLIC_DATA_FILES;
 *   - any published file contains a marker of external market data (vendor names, vendor
 *     column names, the market file names) — checked across the WHOLE directory, including the
 *     built JavaScript;
 *   - board.json still carries a non-null redacted field.
 *
 * Used by the deploy job (before artifact upload) and by the PR preview job.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_DATA_FILES, REDACTED_BOARD_FIELDS } from '../src/config/release';

/** Strings that only external market data would put into a published file. */
export const MARKET_MARKERS = ['dynastyprocess', 'DynastyProcess', 'value_2qb', 'value_1qb', 'fantasypros', 'FantasyPros', 'market-latest', 'market-history'] as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function assertPublicData(root: string): string[] {
  const problems: string[] = [];
  const dataDir = existsSync(join(root, 'data')) ? join(root, 'data') : root;
  for (const f of readdirSync(dataDir)) {
    if (!(PUBLIC_DATA_FILES as readonly string[]).includes(f)) problems.push(`unapproved data file: ${relative(root, join(dataDir, f)) || f}`);
  }
  for (const file of walk(root)) {
    if (!/\.(json|jsonl|js|html|css|txt|csv|map)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const marker of MARKET_MARKERS) {
      if (text.includes(marker)) problems.push(`${relative(root, file)} contains external-market marker "${marker}"`);
    }
  }
  const boardPath = join(dataDir, 'board.json');
  if (existsSync(boardPath)) {
    const board = JSON.parse(readFileSync(boardPath, 'utf8')) as { entries: Record<string, unknown>[] };
    for (const field of REDACTED_BOARD_FIELDS) {
      const n = board.entries.filter((e) => e[field] !== null && e[field] !== undefined).length;
      if (n > 0) problems.push(`board.json: ${n} entries still carry ${field}`);
    }
  }
  return problems;
}

function main(): number {
  const i = process.argv.indexOf('--dir');
  if (i < 0 || !process.argv[i + 1]) throw new Error('usage: --dir <published directory>');
  const root = resolve(process.argv[i + 1]);
  const problems = assertPublicData(root);
  for (const p of problems) console.error(`::error::${p}`);
  if (problems.length === 0) {
    const files = walk(root).map((f) => relative(root, f)).sort();
    console.log(`public data check passed: ${files.length} files; data files: ${readdirSync(existsSync(join(root, 'data')) ? join(root, 'data') : root).sort().join(', ')}`);
  }
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
