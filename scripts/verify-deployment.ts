/**
 * Verify a LIVE deployment from the outside, as a visitor would see it.
 *
 *   npm run verify:deployment -- --url https://<owner>.github.io/<repo>/ [--attempts 20] [--delay-ms 30000]
 *
 * Checks, all over HTTP against the deployed site:
 *   1. the app shell loads and is PlayerTicker;
 *   2. /data/board.json is valid JSON with entries, and carries no uncalibrated confidence values;
 *   3. /data/status.json loads;
 *   4. the external market files are NOT served (market-latest.json, market-history.jsonl);
 *   5. the deployed JavaScript contains no external-market marker;
 *   6. a deep link (/board) is answered by the app shell.
 *
 * GitHub Pages caches for up to ten minutes, so the whole check is retried until it passes or the
 * attempts run out. Exit 0 only when every check passes in one attempt.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKET_MARKERS } from './assert-public-data';
import { REDACTED_BOARD_FIELDS } from '../src/config/release';

export type Fetcher = (url: string) => Promise<{ status: number; text: () => Promise<string> }>;

export async function verifyDeployment(base: string, fetcher: Fetcher): Promise<string[]> {
  const root = base.endsWith('/') ? base : `${base}/`;
  const problems: string[] = [];
  const get = async (path: string) => {
    const res = await fetcher(`${root}${path}`);
    return { status: res.status, body: await res.text() };
  };

  const shell = await get('');
  if (shell.status !== 200 || !shell.body.includes('<div id="root"')) problems.push(`app shell: HTTP ${shell.status}`);

  const board = await get('data/board.json');
  if (board.status !== 200) problems.push(`board.json: HTTP ${board.status}`);
  else {
    try {
      const doc = JSON.parse(board.body) as { entries?: Record<string, unknown>[] };
      const entries = doc.entries ?? [];
      if (entries.length === 0) problems.push('board.json has no entries');
      for (const f of REDACTED_BOARD_FIELDS) {
        const n = entries.filter((e) => e[f] !== null && e[f] !== undefined).length;
        if (n > 0) problems.push(`board.json: ${n} entries carry ${f}`);
      }
    } catch {
      problems.push('board.json is not valid JSON');
    }
  }

  const status = await get('data/status.json');
  if (status.status !== 200) problems.push(`status.json: HTTP ${status.status}`);

  for (const file of ['data/market-latest.json', 'data/market-history.jsonl']) {
    const r = await get(file);
    if (r.status !== 404) problems.push(`${file} is served (HTTP ${r.status}); it must return 404`);
  }

  const scripts = [...shell.body.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) {
    const path = src.startsWith('http') ? src : src.replace(/^\//, '').replace(new URL(root).pathname.replace(/^\//, ''), '');
    const js = await get(path);
    for (const marker of MARKET_MARKERS) if (js.body.includes(marker)) problems.push(`${src} contains "${marker}"`);
  }

  // Pages answers an unknown path with 404.html (the app shell) and HTTP 404; the body is what matters.
  const deep = await get('board');
  if (!deep.body.includes('<div id="root"')) problems.push(`deep link /board is not answered by the app shell (HTTP ${deep.status})`);

  return problems;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const arg = (name: string, fallback?: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const url = arg('--url');
  if (!url) throw new Error('usage: --url <deployed site> [--attempts n] [--delay-ms ms]');
  const attempts = Number(arg('--attempts', '20'));
  const delay = Number(arg('--delay-ms', '30000'));
  let problems: string[] = [];
  for (let i = 1; i <= attempts; i++) {
    problems = await verifyDeployment(url, (u) => fetch(u, { cache: 'no-store' })).catch((e) => [`fetch failed: ${String(e)}`]);
    if (problems.length === 0) {
      console.log(`deployment verified on attempt ${i}: ${url}`);
      return 0;
    }
    console.log(`attempt ${i}/${attempts}: ${problems.join('; ')}`);
    if (i < attempts) await new Promise((r) => setTimeout(r, delay));
  }
  for (const p of problems) console.error(`::error::${p}`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
