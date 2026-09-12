// src/ops is a NODE-ONLY operations module.
//
// It reads SQLite-backed run history, reads V8 heap statistics and is imported by scheduled
// scripts. None of that can reach the browser bundle, and the persistence and application
// boundary tests grant it their exemptions on the strength of this file — so these assertions
// are what make those exemptions true rather than merely claimed.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const OPS = join('src', 'ops');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const allFiles = walk(SRC);
const opsFiles = allFiles.filter((f) => f.includes(OPS) && !f.endsWith('.test.ts'));

describe('ops layer boundaries', () => {
  it('exists and is not empty, so the exemptions granted to it are not vacuous', () => {
    expect(opsFiles.length).toBeGreaterThan(0);
  });

  it('is imported by NO browser or app code', () => {
    // Pages, components, hooks and frontend services must never reach it. If this ever fails,
    // the persistence and application exemptions become unsound and a SQLite-backed module
    // could be pulled into the bundle.
    const browserish = allFiles.filter(
      (f) =>
        !f.includes(OPS) &&
        (f.includes(join('src', 'pages')) ||
          f.includes(join('src', 'components')) ||
          f.includes(join('src', 'hooks')) ||
          f.includes(join('src', 'services')) ||
          f.endsWith(join('src', 'main.tsx')) ||
          f.endsWith(join('src', 'App.tsx'))),
    );
    const offenders = browserish.filter((f) => /from '@\/ops|from '\.\.?\/ops/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports no valuation engine — freshness is not a valuation concern', () => {
    const offenders = opsFiles.filter((f) =>
      /@\/(qb-model|rb-model|wr-model|te-model|accessible|utility)\b/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('imports no transport or ingestion module — it reports on runs, it does not perform them', () => {
    const offenders = opsFiles.filter((f) =>
      /@\/(transport|ingestion|market)\b/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
