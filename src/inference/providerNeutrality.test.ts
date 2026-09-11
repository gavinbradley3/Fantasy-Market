// Provider neutrality of the model interfaces.
//
// WHAT THIS PROTECTS
// A valuation engine should not know who supplied a number. The moment a field is called
// `pff_yprr`, three things follow: the engine can only be fed by that vendor, swapping vendors
// becomes a schema migration, and the model's public vocabulary starts advertising a
// commercial dependency PlayerTicker does not have and must not require.
//
// THE SEAM ALREADY EXISTS, and it is `FieldState<T>`: the FIELD carries a canonical name and
// the PROVIDER is a separate axis (`PresentField.provider: ProviderId`). Onboarding a premium
// source such as PFF later means adding a member to `ProviderId` and a normalizer that maps
// its columns onto the canonical names — not touching a single engine interface. These tests
// pin both halves of that: the names stay neutral, and provenance stays separable.
//
// NOTHING HERE REQUIRES PFF, AND NOTHING PREPARES FOR IT SPECIFICALLY. The property under test
// is neutrality itself, which is equally protection against any single vendor.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROVIDER_IDS, type PresentField, type ProviderId } from '@/pipeline/types';

const SRC = join(process.cwd(), 'src');

/**
 * Vendor names that must never appear in a model's field vocabulary.
 *
 * `sleeper` and `nflverse` are absent from this list on purpose: they are legitimate values of
 * `ProviderId`, which is exactly the separate axis this test is defending. The point is not
 * that provider names are forbidden everywhere — it is that they belong on the provenance
 * side, never in a field name.
 */
const VENDOR_TOKENS = [
  'pff',
  'sportradar',
  'stathead',
  'fantasypros',
  'keeptradecut',
  'ktc',
  'dynastyprocess',
  'fantasycalc',
  'rotowire',
  'sportsdataio',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** Comments stripped — this test asserts the code's vocabulary, not its prose. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ENGINE_TYPE_FILES = ['qb-model', 'rb-model', 'wr-model', 'te-model'].map((m) =>
  join(SRC, m, 'types.ts'),
);
const INFERENCE_FILES = walk(join(SRC, 'inference'));

describe('model interfaces are provider-neutral', () => {
  it('no valuation engine names a vendor in its input or output contract', () => {
    const offenders: string[] = [];
    for (const file of ENGINE_TYPE_FILES) {
      const src = code(file).toLowerCase();
      for (const token of VENDOR_TOKENS) {
        if (new RegExp(`\\b${token}`).test(src)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the inference layer names no vendor either — canonical names all the way down', () => {
    const offenders: string[] = [];
    for (const file of INFERENCE_FILES) {
      const src = code(file).toLowerCase();
      for (const token of VENDOR_TOKENS) {
        if (new RegExp(`\\b${token}`).test(src)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the advanced QB inputs are described by what they MEAN, not by who sells them', () => {
    // These are precisely the inputs a premium provider would improve. They are named for the
    // football concept, so a better source can fill them without the engine noticing.
    const src = code(join(SRC, 'qb-model', 'types.ts'));
    for (const field of [
      'offensive_environment_score',
      'protection_context_score',
      'competition_pressure',
      'completion_percentage_over_expected',
      'adjusted_yards_per_attempt',
    ]) {
      expect(src).toContain(field);
    }
  });
});

describe('provenance identifies the provider separately from the field', () => {
  it('a present value carries its provider on its own axis', () => {
    const field: PresentField<number> = {
      present: true,
      value: 7.4,
      provider: 'nflverse',
      provenance: 'DERIVED',
      sourceTimestamp: '2026-09-11T00:00:00.000Z',
    };
    // The consumer reads `value`; the auditor reads `provider`. Neither has to parse a name.
    expect(field.provider).toBe('nflverse');
    expect(Object.keys(field)).toContain('provider');
  });

  it('adding a premium provider is a change to ProviderId, not to any engine interface', () => {
    // Today's set. A future licensed source joins it here — one union member and a normalizer
    // that maps its columns onto the canonical names above.
    expect([...PROVIDER_IDS].sort()).toEqual(['nflverse', 'sleeper']);
    // The seam is a type: this line only compiles because the axis exists.
    const provider: ProviderId = 'nflverse';
    expect(PROVIDER_IDS).toContain(provider);
  });

  it('PlayerTicker functions with no premium provider wired at all', () => {
    // The live board is built entirely from the providers above. If a PFF-shaped dependency
    // were ever introduced, this list would have to grow to keep the product working — which
    // is exactly the failure this asserts against.
    expect(PROVIDER_IDS).not.toContain('pff' as ProviderId);
  });
});
