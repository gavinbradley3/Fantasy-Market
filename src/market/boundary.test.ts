import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Boundaries for the market layer. Two properties are worth holding on to as this grows:
// the adapter stays pure (so ingestion is deterministic and replayable), and the frontend can
// only reach the pure part (so no page ever ends up fetching a market CSV from the browser).

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

/** Source with comments stripped, so a test asserts what the CODE does, not what it says. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * As above, with string literals blanked too. Needed for the network check: a barrel that
 * re-exports `from './fetch'` mentions the word without calling anything.
 */
function codeWithoutStrings(file: string): string {
  return code(file).replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''");
}

const allFiles = walk(SRC);
const marketFiles = allFiles.filter((f) => f.includes(join('src', 'market')));

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

// The market modules that are pure data and pure functions, and therefore safe in a bundle.
// Anything else in @/market either fetches or reaches for the pipeline's resolver.
const BROWSER_SAFE = ['@/market/types', '@/market/comparison'];

describe('market layer boundaries', () => {
  it('browser-facing files import only the PURE market modules, never the barrel', () => {
    const offenders = browserish
      .map((f) => {
        const specifiers = [...code(f).matchAll(/from '(@\/market[^']*)'/g)].map((m) => m[1]);
        const bad = specifiers.filter((s) => !BROWSER_SAFE.includes(s));
        return bad.length > 0 ? `${f}: ${bad.join(', ')}` : null;
      })
      .filter((x): x is string => x !== null);
    expect(offenders).toEqual([]);
  });

  it('does not import @/persistence — market owns no storage', () => {
    // Market snapshots are stored by the persistence layer (migration 4). Market defines the
    // shape and the adapters; it never opens a database, which is what keeps this module
    // free of node:sqlite and safe to import from a script or a test.
    const offenders = marketFiles.filter((f) =>
      /from '@\/persistence|from '\.\.?\/persistence/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the adapter pure — no IO and no wall clock in dynastyProcess.ts', () => {
    const src = code(join(SRC, 'market', 'dynastyProcess.ts'));
    expect(src).not.toMatch(/\bfetch\b/);
    expect(src).not.toMatch(/node:fs|node:sqlite/);
    // The capture instant is injected, so adaptation is deterministic and replayable.
    expect(src).not.toMatch(/Date\.now\(\)|new Date\(\s*\)/);
  });

  it('keeps the comparison pure — it reads two sides and computes, nothing else', () => {
    const src = code(join(SRC, 'market', 'comparison.ts'));
    expect(src).not.toMatch(/\bfetch\b/);
    expect(src).not.toMatch(/node:|Date\.now\(\)|new Date\(\s*\)/);
  });

  it('confines network access to fetch.ts', () => {
    const callers = marketFiles
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => /\bfetch\b|XMLHttpRequest/.test(codeWithoutStrings(f)));
    expect(callers.map((f) => f.split('/').pop())).toEqual(['fetch.ts']);
  });
});
