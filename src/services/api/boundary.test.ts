// Browser-boundary tests (Phase 10).
//
// The frontend talks to the backend over HTTP and nothing else. These tests mechanically
// enforce that: no browser-facing file may import the Node-only backend layers, and no
// valuation / scheduler / persistence logic may be reimplemented on the browser side.
//
// The Phase 6/7/8/9 layers keep their own boundary tests; this file is the mirror image,
// guarding the browser side of the same line rather than weakening anything on the other.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');
const ROOT = join(SRC, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f);
const isFixture = (f: string) => f.endsWith('__fixtures.ts') || f.includes(`${sep}test-support`);

/**
 * Directories that make up the BROWSER-FACING app. Deliberately explicit: the backend layers
 * (`src/api`, `src/application`, `src/scheduler`, `src/persistence`, `src/transport`,
 * `src/ingestion`, `src/inference`, `src/pipeline`) are excluded, and so are the valuation
 * engines, which the browser reaches only through the published API.
 */
const BROWSER_DIRS = [
  'app',
  'components',
  'config',
  'data',
  'hooks',
  'lib',
  'pages',
  'services',
  'store',
  'styles',
  'types',
];

const browserFiles = BROWSER_DIRS.flatMap((d) => walk(join(SRC, d)))
  .concat([join(SRC, 'main.tsx')])
  .filter((f) => !isTest(f) && !isFixture(f));

const clientFiles = walk(join(SRC, 'services', 'api')).filter((f) => !isTest(f));
const publicationFiles = walk(join(SRC, 'services', 'publication')).filter((f) => !isTest(f));

/**
 * Remove comments before scanning for code tokens. Doc comments legitimately NAME the things
 * these tests ban ("this file must never import node:sqlite"), and a boundary test that fires
 * on prose teaches people to stop writing the prose.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** `import`/`export ... from '<spec>'` and bare `import '<spec>'`, type-only included. */
function specifiersOf(source: string): string[] {
  const out: string[] = [];
  const re = /(?:from|import)\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

describe('the browser bundle never imports the Node-only backend', () => {
  const FORBIDDEN = ['@/api', '@/application', '@/scheduler', '@/persistence'];

  it.each(FORBIDDEN)('no browser-facing file imports %s', (layer) => {
    const offenders = browserFiles.filter((f) =>
      specifiersOf(stripComments(readFileSync(f, 'utf8'))).some((s) => s === layer || s.startsWith(`${layer}/`)),
    );
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('no browser-facing file imports a Node built-in', () => {
    const offenders = browserFiles.filter((f) =>
      specifiersOf(stripComments(readFileSync(f, 'utf8'))).some((s) => s.startsWith('node:')),
    );
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('no browser-facing file names a backend runtime construct', () => {
    // Belt-and-braces against a relative-path import or a copy-paste: these identifiers only
    // exist in the Node layers, so their presence in browser source is itself the defect.
    const banned = [
      'node:sqlite',
      'node:http',
      'PersistenceStore',
      'composeApi',
      'createHttpServer',
      'ApplicationService',
      'ApiApp',
    ];
    const offenders: string[] = [];
    for (const f of browserFiles) {
      const source = stripComments(readFileSync(f, 'utf8'));
      for (const token of banned) {
        if (source.includes(token)) offenders.push(`${relative(ROOT, f)} → ${token}`);
      }
    }
    // `Scheduler` is matched as a construction, not as a word: the browser-safe health
    // contract legitimately has a `scheduler: { enabled, running, state }` field.
    const schedulerOffenders = browserFiles.filter((f) =>
      /\bnew Scheduler\b|\bScheduler\s*\(/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders).toEqual([]);
    expect(schedulerOffenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe('the API client is transport-only', () => {
  it('contains no React', () => {
    const offenders = clientFiles.filter((f) => {
      const source = stripComments(readFileSync(f, 'utf8'));
      return specifiersOf(source).some((s) => s === 'react' || s.startsWith('react/'));
    });
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('imports nothing outside itself but browser-safe contracts', () => {
    // The client may only depend on its own files and `zod` (already in the browser bundle).
    const allowed = /^(\.|zod$)/;
    const offenders: string[] = [];
    for (const f of clientFiles) {
      for (const s of specifiersOf(stripComments(readFileSync(f, 'utf8')))) {
        if (!allowed.test(s)) offenders.push(`${relative(ROOT, f)} → ${s}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('no backend logic is reimplemented on the browser side', () => {
  it('the published-market path imports no valuation engine', () => {
    const engines = /@\/(wr-model|rb-model|te-model|qb-model|inference|ingestion|pipeline|transport)\b/;
    const offenders = [...clientFiles, ...publicationFiles].filter((f) => engines.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('the published-market path computes no valuation — only ordering', () => {
    // The adapter derives RANK from the backend's published value and nothing else. Any
    // arithmetic that combined published fields into a new score would be a valuation.
    const adapter = stripComments(readFileSync(join(SRC, 'services', 'publication', 'adapter.ts'), 'utf8'));
    expect(adapter).not.toMatch(/Math\.(pow|log|exp|sqrt)/);
    expect(adapter).toContain('SUPPORTED_POSITIONS');
  });

  it('nothing in the browser bundle schedules recurring refreshes', () => {
    const offenders = browserFiles.filter((f) => /setInterval\s*\(/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe('the published market has no demo fallback', () => {
  const demoModules = /marketData\/mock|MockMarketDataService|buildDataset|@\/data\/pool/;

  it('the API client and publication adapter never reference demo data', () => {
    const offenders = [...clientFiles, ...publicationFiles].filter((f) =>
      demoModules.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('The Board never references demo data', () => {
    const board = stripComments(readFileSync(join(SRC, 'pages', 'BoardPage.tsx'), 'utf8'));
    expect(board).not.toMatch(demoModules);
    expect(board).not.toContain('useMarketData');
    expect(board).not.toContain('useBoard');
  });
});
