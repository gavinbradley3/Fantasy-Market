// Boundary tests (Phase 8). The application layer is a THIN coordination seam: it holds no
// business logic and depends only on narrow ports + foreign *types*. These tests mechanically
// enforce that no valuation/transport/ingestion/inference code — and no persistence *runtime*
// or Node built-in — can migrate upward into it, and that no browser/app code imports it.

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
const appDir = `${join('src', 'application')}`;
const appSrc = allFiles.filter((f) => f.includes(appDir) && !f.endsWith('.test.ts') && !f.endsWith('__fixtures.ts'));

describe('application layer holds no business logic and no heavy dependencies', () => {
  it('never imports valuation / transport / ingestion / inference modules (type or runtime)', () => {
    const forbidden = /from '@\/(transport|ingestion|inference|wr-model|rb-model|te-model|qb-model)\b/;
    const offenders = appSrc.filter((f) => forbidden.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports persistence ONLY as erased types (never a runtime import that pulls node:sqlite)', () => {
    const runtimePersistence = /^\s*import\s+(?!type\b)[^;]*from '@\/persistence\b/m;
    const offenders = appSrc.filter((f) => runtimePersistence.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports no Node built-in modules (no database/filesystem internals reach the app layer)', () => {
    const offenders = appSrc.filter((f) => /(from|require\()\s*['"]node:/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('is not imported by any non-application source file (kept out of the app/browser bundle)', () => {
    const offenders = allFiles
      .filter((f) => !f.includes(appDir))
      .filter((f) => /from '@\/application|from '\.\.?\/application/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
