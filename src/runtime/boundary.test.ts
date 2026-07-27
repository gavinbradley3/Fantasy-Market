// Boundary tests for the production refresh runtime.
//
// src/runtime is the one module that legitimately sees both ends of the stack — transport
// and ingestion on one side, persistence and publication on the other. That makes it the
// module most capable of damaging the architecture, so its limits are asserted rather than
// assumed: it must stay Node-only (never reachable from the browser bundle), it must go
// through the audited entry points instead of reaching around them, and it must not become
// a second home for valuation, normalization or provider knowledge.

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
const runtimeSrc = allFiles.filter(
  (f) => f.includes(`${join('src', 'runtime')}`) && !f.endsWith('.test.ts') && !f.endsWith('__fixtures.ts'),
);

describe('the production runtime is a Node-only composition layer', () => {
  it('has source files to check', () => {
    expect(runtimeSrc.length).toBeGreaterThan(0);
  });

  it('is imported by no other source file (kept out of the app/browser bundle)', () => {
    // Only a deployment entry point under scripts/ may construct it. Nothing in src/ —
    // least of all the frontend — may reach the pipeline, because doing so would pull
    // transport, persistence and the engines into the browser bundle.
    const offenders = allFiles
      .filter((f) => !f.includes(`${join('src', 'runtime')}`))
      .filter((f) => /from '@\/runtime|from '\.\.?\/runtime/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports no valuation engine (it orchestrates; it never values)', () => {
    const offenders = runtimeSrc.filter((f) => /@\/(wr-model|rb-model|te-model|qb-model)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('reaches the network only through the transport client', () => {
    // No bare fetch/http/https anywhere: every request must go through HttpClient, so the
    // retry policy, timeouts, size caps, redaction and envelope capture cannot be bypassed.
    const offenders = runtimeSrc.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /\bfetch\s*\(/.test(src) || /from 'node:(http|https|net)'/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('does not normalize provider data or name provider fields', () => {
    // Normalization belongs to the Phase 4 adapters. The runtime picks WHAT to fetch and
    // WHICH players to value; it must never learn a provider's column vocabulary.
    const offenders = runtimeSrc.filter((f) =>
      /gsis_id|player_id|player_name|recent_team|pass_attempts|offense_players/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('does not construct raw URLs (the provider registry owns every path)', () => {
    const offenders = runtimeSrc.filter((f) => /https?:\/\//.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
