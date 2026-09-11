import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// src/market is a Node-only backend module: ./store opens SQLite. These guards mirror the
// ones src/persistence and src/transport carry, so the prototype cannot drift into the
// browser bundle or quietly couple itself to the persistence layer.

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const allFiles = walk(SRC);

describe('market is a Node-only backend module', () => {
  it('no browser-facing file imports @/market', () => {
    // The market prototype is not wired into any page yet; if it ever is, it must be through
    // the HTTP API like the published board, not by importing SQLite into the bundle.
    const browserish = allFiles.filter(
      (f) =>
        (f.includes(join('src', 'pages')) ||
          f.includes(join('src', 'components')) ||
          f.includes(join('src', 'hooks')) ||
          f.includes(join('src', 'store')) ||
          f.includes(join('src', 'services'))) &&
        !f.endsWith('.test.ts') &&
        !f.endsWith('.test.tsx'),
    );
    const offenders = browserish.filter((f) => /from '@\/market/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('does not import @/persistence — the persistence boundary stays intact', () => {
    const marketFiles = allFiles.filter((f) => f.includes(join('src', 'market')));
    const offenders = marketFiles.filter((f) =>
      /from '@\/persistence|from '\.\.?\/persistence/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the adapter pure — no IO and no wall clock in dynastyProcess.ts', () => {
    // Comments are stripped first: this asserts what the CODE does, and the file's own prose
    // legitimately mentions the things being banned.
    const code = readFileSync(join(SRC, 'market', 'dynastyProcess.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(/node:fs|node:sqlite/);
    // The capture instant is injected, so adaptation is deterministic and replayable.
    expect(code).not.toMatch(/Date\.now\(\)|new Date\(\s*\)/);
  });
});
