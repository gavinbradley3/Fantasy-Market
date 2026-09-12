import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The utility layer sits ABOVE the position engines. Its whole claim — that it compares
// positions without ever comparing their internal composites — is only true while these hold.

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = walk(join(SRC, 'utility')).filter((f) => !f.endsWith('.test.ts'));

describe('utility layer boundaries', () => {
  it('imports no position engine — it consumes standing, never a valuation', () => {
    const offenders = files.filter((f) => /@\/(qb-model|rb-model|wr-model|te-model|accessible)\b/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('imports no inference, ingestion, persistence or market module', () => {
    const offenders = files.filter((f) =>
      /@\/(inference|ingestion|persistence|transport|market|api|application)\b/.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('is pure — no IO, no clock, no randomness', () => {
    for (const f of files) {
      const src = code(f);
      expect(src).not.toMatch(/\bfetch\b|node:|Date\.now\(\)|new Date\(|Math\.random/);
    }
  });

  it('names no market source anywhere — nothing here is fitted to one', () => {
    for (const f of files) {
      expect(code(f).toLowerCase()).not.toMatch(/dynastyprocess|fantasycalc|fantasypros|keeptradecut/);
    }
  });

  it('contains no per-position numeric multiplier outside the declared schema', () => {
    // The Superflex premium must come from the schema's slot counts. A literal like `* 1.4`
    // sitting beside a position name is the shape of the shortcut this layer exists to avoid.
    for (const f of files.filter((x) => !x.endsWith('leagueSchema.ts'))) {
      const src = code(f);
      expect(src).not.toMatch(/\b(QB|RB|WR|TE)\b[^\n]{0,40}[*]\s*\d+\.\d+/);
    }
  });
});
