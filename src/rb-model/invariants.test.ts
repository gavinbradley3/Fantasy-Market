// §26.16.1 architecture/determinism invariants + §10.1 architecture tests.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRunningBack } from '@/rb-model/engine';
import * as rbIndex from '@/rb-model/index';
import { loadFixture, PRIMARY_FIXTURES } from '@/rb-model/testutil';
import type { RBMVPInput } from '@/rb-model/types';

const here = dirname(fileURLToPath(import.meta.url));

// Source files that make up the deterministic engine (exclude tests + the
// fs-based test helper).
function engineSources(): { file: string; text: string }[] {
  return readdirSync(here)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'testutil.ts')
    .map((f) => ({ file: f, text: readFileSync(join(here, f), 'utf8') }));
}

describe('§10.1 architecture', () => {
  it('exposes exactly one public evaluation function', () => {
    expect(typeof rbIndex.evaluateRunningBack).toBe('function');
    const fns = Object.entries(rbIndex).filter(([, v]) => typeof v === 'function');
    // evaluateRunningBack is the only evaluation entry point; the rest are the
    // error class + reference table helpers, not evaluators.
    expect(fns.filter(([name]) => /^evaluate/.test(name))).toHaveLength(1);
  });

  it('RB modules do not import WR model, market data, or services', () => {
    for (const { file, text } of engineSources()) {
      expect(text, `${file} imports wr-model`).not.toMatch(/from '@\/wr-model/);
      expect(text, `${file} imports services/market`).not.toMatch(/from '@\/(services|hooks|stores|lib\/market)/);
    }
  });

  it('RB modules contain no randomness, network, or system-clock reads', () => {
    for (const { file, text } of engineSources()) {
      expect(text, `${file} uses Math.random`).not.toMatch(/Math\.random/);
      expect(text, `${file} uses Date`).not.toMatch(/\bnew Date\b|\bDate\.now\b/);
      expect(text, `${file} uses fetch/XHR/WebSocket`).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
    }
  });

  it('the projection module does not depend on composites (composites never feed EFO)', () => {
    const proj = readFileSync(join(here, 'projections.ts'), 'utf8');
    // No import of the composites module, and no composite value in the inputs.
    expect(proj).not.toMatch(/from '@\/rb-model\/composites'/);
    expect(proj).not.toMatch(/import[\s\S]*composite/i);
  });
});

describe('§26.16.1 formula-level invariants', () => {
  it('8. identical input and configuration produce identical output', () => {
    for (const name of PRIMARY_FIXTURES) {
      const a = evaluateRunningBack(loadFixture(name));
      const b = evaluateRunningBack(loadFixture(name));
      expect(b).toEqual(a);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it('10. composites do not feed EFO (horizon choice leaves Weekly/ROS untouched)', () => {
    const i = loadFixture('elite-bell-cow');
    const weekly = evaluateRunningBack(i, { selected_horizon: 'WEEKLY' });
    const dynasty = evaluateRunningBack(i, { selected_horizon: 'DYNASTY' });
    expect(dynasty.weekly).toEqual(weekly.weekly);
    expect(dynasty.ros).toEqual(weekly.ros);
    expect(dynasty.composites).toEqual(weekly.composites);
  });

  it('11. the schema accepts no ADP/ranking/market/consensus/trade value', () => {
    const i = loadFixture('elite-bell-cow') as RBMVPInput & Record<string, unknown>;
    const withMarket = { ...i, adp: 3, market_price: 9.9, consensus_rank: 1, trade_value: 42 };
    // Extra market-like keys are ignored — output is byte-identical.
    expect(JSON.stringify(evaluateRunningBack(withMarket))).toBe(JSON.stringify(evaluateRunningBack(i)));
  });

  it('12. One/Three/Dynasty fantasy points are neither returned nor fabricated', () => {
    const o = evaluateRunningBack(loadFixture('elite-bell-cow')) as unknown as Record<string, unknown>;
    // Only weekly and ros carry fantasy points.
    expect(o.one_year).toBeUndefined();
    expect(o.three_year).toBeUndefined();
    expect(o.dynasty).toBeUndefined();
    const fpBearers = Object.entries(o).filter(
      ([, v]) => v && typeof v === 'object' && 'expected_fantasy_points' in (v as object),
    );
    expect(fpBearers.map(([k]) => k).sort()).toEqual(['ros', 'weekly']);
    // The long horizons still get composite scores (0–100), not fantasy points.
    const composites = o.composites as Record<string, number>;
    for (const k of ['ONE_YEAR', 'THREE_YEAR', 'DYNASTY']) {
      expect(composites[k]).toBeGreaterThanOrEqual(0);
      expect(composites[k]).toBeLessThanOrEqual(100);
    }
  });

  it('metadata is complete on every output', () => {
    const o = evaluateRunningBack(loadFixture('elite-bell-cow'));
    expect(o.schema_version).toBe('rb-mvp-1.0');
    expect(o.model_version).toBe('rb-mvp-1.0');
    expect(o.reference_version).toBe('rb-reference-1.0');
    expect(o.as_of_timestamp).toBe('2026-10-13T12:00:00Z');
  });

  it('every serialized output number is finite and in range', () => {
    for (const name of PRIMARY_FIXTURES) {
      const o = evaluateRunningBack(loadFixture(name));
      for (const v of Object.values(o.components)) expect(Number.isFinite(v)).toBe(true);
      for (const v of Object.values(o.composites)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      for (const v of Object.values(o.weekly)) expect(Number.isFinite(v)).toBe(true);
      expect(o.weekly.probability_active).toBeGreaterThanOrEqual(0);
      expect(o.weekly.probability_active).toBeLessThanOrEqual(1);
      expect(Number.isFinite(o.ros.expected_fantasy_points)).toBe(true);
      expect(o.confidence.score).toBeGreaterThanOrEqual(0);
      expect(o.volatility.score).toBeLessThanOrEqual(100);
    }
  });
});
