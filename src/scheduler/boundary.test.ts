// Boundary tests (Phase 7). The scheduler is a PURE, portable operational layer: its source
// imports no backend/Node-only modules (it drives everything through the injected
// RefreshPipeline). And nothing else in the app imports it, so it can never drag Node-only
// persistence code into the browser bundle.

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
const schedulerSrc = allFiles.filter((f) => f.includes(`${join('src', 'scheduler')}`) && !f.endsWith('.test.ts') && !f.endsWith('__fixtures.ts'));

describe('scheduler is a pure, portable operational layer', () => {
  it('imports no persistence / transport / ingestion / inference module', () => {
    const forbidden = /from '@\/(persistence|transport|ingestion|inference)\b|from '\.\.\/(persistence|transport|ingestion|inference)\b/;
    const offenders = schedulerSrc.filter((f) => forbidden.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports no Node built-in modules (stays browser-portable)', () => {
    const offenders = schedulerSrc.filter((f) => /(from|require\()\s*['"]node:/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('is not imported by any non-scheduler source file (kept out of the app/browser bundle)', () => {
    // The Phase 8 application service layer (src/application) is a sanctioned Node-only consumer
    // that drives the scheduler through its public surface (its Phase 8 dependency contract
    // permits depending on the scheduler). It cannot reach the browser bundle:
    // src/application/boundary.test.ts proves no browser/app file imports @/application, and the
    // production bundle is verified free of scheduler code. Every other non-scheduler file
    // remains forbidden from importing @/scheduler.
    const offenders = allFiles
      .filter((f) => !f.includes(`${join('src', 'scheduler')}`))
      .filter((f) => !f.includes(`${join('src', 'application')}`))
      .filter((f) => /from '@\/scheduler|from '\.\.?\/scheduler/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
