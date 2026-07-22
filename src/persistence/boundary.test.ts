// Browser-boundary + architectural-boundary tests (Phase 6). Persistence is Node-only:
// no frontend code may import it, transport must not import persistence, and persistence
// must not import a valuation engine. These are enforced by static source scanning.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

const allFiles = walk(SRC);
const persistenceFiles = allFiles.filter((f) => f.includes(`${join('src', 'persistence')}`) && !f.endsWith('.test.ts') && !f.endsWith('__fixtures.ts'));

describe('persistence is a Node-only backend module', () => {
  it('no NON-persistence source file imports @/persistence (keeps it out of the browser bundle)', () => {
    const offenders = allFiles
      .filter((f) => !f.includes(`${join('src', 'persistence')}`))
      .filter((f) => /from '@\/persistence|from '\.\.?\/persistence/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('transport does not import persistence (no circular dependency)', () => {
    const transportFiles = allFiles.filter((f) => f.includes(`${join('src', 'transport')}`));
    const offenders = transportFiles.filter((f) => /from '@\/persistence|from '\.\.?\/persistence/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('persistence does not import a valuation engine', () => {
    const offenders = persistenceFiles.filter((f) => /@\/(wr-model|rb-model|te-model|qb-model)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('only the sqlite adapter imports node:sqlite', () => {
    const importers = persistenceFiles.filter((f) => /(from|require\()\s*['"]node:sqlite['"]/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => f.split('/').pop())).toEqual(['db.ts']);
  });
});
