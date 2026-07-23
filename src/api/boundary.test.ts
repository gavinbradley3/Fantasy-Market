// Boundary tests (Phase 9). The API layer is a thin HTTP seam: routing, validation,
// translation, error mapping, composition. It holds no business logic and must never be pulled
// into the browser bundle. These tests enforce both mechanically.

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
const apiDir = `${join('src', 'api')}`;
const apiSrc = allFiles.filter((f) => f.includes(apiDir) && !f.endsWith('.test.ts') && !f.endsWith('__fixtures.ts'));

describe('API layer holds no business logic and stays out of the browser bundle', () => {
  it('never imports valuation / transport / ingestion / inference modules', () => {
    // The API composes scheduler + persistence + application (via the composition root) but must
    // NOT reach into valuation engines or transport/ingestion/inference internals.
    const forbidden = /from '@\/(transport|ingestion|inference|wr-model|rb-model|te-model|qb-model)\b/;
    const offenders = apiSrc.filter((f) => forbidden.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('only the composition root and server touch scheduler/persistence runtime', () => {
    // Route handlers + app router depend solely on @/application. Concrete scheduler/persistence
    // construction is confined to composition.ts (server.ts is transport-only).
    const runtimeBackend = /^\s*import\s+(?!type\b)[^;]*from '@\/(scheduler|persistence)\b/m;
    const offenders = apiSrc
      .filter((f) => !f.endsWith(`${join('api', 'composition.ts')}`))
      .filter((f) => runtimeBackend.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('is not imported by any non-api source file (kept out of the app/browser bundle)', () => {
    const offenders = allFiles
      .filter((f) => !f.includes(apiDir))
      .filter((f) => /from '@\/api\b|from '\.\.?\/api\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
