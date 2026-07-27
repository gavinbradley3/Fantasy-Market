// The committed sample files are TEST FIXTURES, not a production data source.
//
// This is the property the whole phase turns on, so it is asserted rather than assumed. A
// sample file that quietly reappears on the production path would make a board look real
// while being backed by development data — exactly the failure mode this replaced.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createLivePipeline } from './livePipeline';
import { buildSourcePlan } from './sources';
import { PersistenceStore } from '@/persistence';
import { tempDbPath } from '@/persistence/__fixtures';
import { HttpClient, MemoryPayloadStore, fixedClock } from '@/transport';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.local' || e.name === 'dist') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const isTestOrFixture = (f: string) => /\.test\.tsx?$/.test(f) || /__fixtures\.ts$/.test(f) || f.includes('test-support');

describe('committed sample data never reaches the production path', () => {
  it('the production pipeline and runtime read no committed fixture file', () => {
    const runtimeSrc = walk(join(ROOT, 'src', 'runtime')).filter((f) => !isTestOrFixture(f));
    const offenders = runtimeSrc.filter((f) => /fixtures[/'"]|\.sample\.|__fixtures/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the server entry point builds the live pipeline, not a fixture-backed one', () => {
    const serve = readFileSync(join(ROOT, 'scripts', 'serve-api.ts'), 'utf8');
    expect(serve).toMatch(/createLivePipeline/);
    // The old fixture pipeline replayed committed synthetic payloads on the server path.
    expect(serve).not.toMatch(/mockedSuccessfulRefresh|persistence\/__fixtures/);
  });

  it('only test and fixture files read the committed pipeline samples', () => {
    // `src/pipeline` is the standalone OFFLINE analysis tool, not the production path; its
    // CLI and test-support helper are the sanctioned readers.
    // These are development CLIs and helpers for that offline tool. None of them can publish
    // a board: they print reports and regenerate fixtures.
    const sanctioned = [
      join('src', 'pipeline', 'test-support.ts'),
      join('scripts', 'run-pipeline.ts'),
      join('scripts', 'generate-pipeline-fixtures.ts'),
      join('scripts', 'readiness-audit.ts'),
    ];
    const offenders = walk(ROOT)
      .filter((f) => !isTestOrFixture(f))
      .filter((f) => !sanctioned.some((s) => f.endsWith(s)))
      .filter((f) => /fixtures['"/]pipeline|fixtures', 'pipeline'/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every production source is fetched from the provider registry, never a local path', async () => {
    // A plan carries provider + capability + neutral params only. No file path, no URL: the
    // registry alone maps a coordinate to a location.
    const plan = buildSourcePlan({ seasons: [2025], effectiveDate: '2026-02-15T00:00:00.000Z', mode: 'live' });
    expect(plan.length).toBeGreaterThan(0);
    for (const source of plan) {
      expect(source.provider).toBe('nflverse');
      expect(JSON.stringify(source)).not.toMatch(/fixtures|\.json|\.csv|https?:/);
    }
  });

  it('a refresh with no captures and no network yields nothing rather than falling back', async () => {
    // There is no silent demo fallback anywhere on this path: with nothing to read, the
    // refresh fails honestly instead of publishing sample data.
    const dbPath = tempDbPath();
    const store = PersistenceStore.open(dbPath, () => '2026-01-01T00:00:00.000Z');
    try {
      const pipeline = createLivePipeline({
        store: () => store,
        payloadStore: new MemoryPayloadStore(),
        seasons: [2025],
        asOf: () => '2026-02-15T00:00:00.000Z',
        clock: fixedClock('2026-02-15T00:00:00.000Z'),
        replayOnly: true,
        client: new HttpClient({ fetchFn: () => { throw new Error('no network'); } }),
      });
      const out = await pipeline.refresh({ runId: 'r', trigger: 'manual', attempt: 1, startedAt: '2026-01-01T00:00:00.000Z' });
      expect(out.result.status).toBe('failure');
      expect(out.result.snapshot).toBeNull();
      expect(out.builds).toEqual([]);
    } finally {
      store.close();
      readdirSync(dirname(dbPath)); // touch so the temp dir is definitely materialized
    }
  });
});
