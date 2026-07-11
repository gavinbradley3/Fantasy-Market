// §26.16.7 (confidence) + §10.8 confidence tests.
import { describe, expect, it } from 'vitest';
import { computeConfidence, confidenceLabel } from '@/rb-model/confidence';
import { round } from '@/rb-model/rounding';
import { evaluateRunningBack } from '@/rb-model/engine';
import { loadFixture } from '@/rb-model/testutil';
import type { FallbackLogEntry, RBMVPInput } from '@/rb-model/types';

const base = (): RBMVPInput => loadFixture('elite-bell-cow');
const noFallback: FallbackLogEntry[] = [];

describe('§10.8 confidence', () => {
  it('fallback penalties total correctly (start 100 − Σ penalties)', () => {
    const log: FallbackLogEntry[] = [
      { field: 'Route participation', fallback_used: 'x', confidence_penalty: 15 },
      { field: 'TPRR', fallback_used: 'x', confidence_penalty: 10 },
    ];
    const c = computeConfidence(base(), log, 25);
    expect(c.score).toBe(75);
  });

  it('low-sample touch tiers are mutually exclusive', () => {
    const mk = (touches: number) => computeConfidence({ ...base(), career_touches: touches }, noFallback, 0).score;
    expect(mk(40)).toBe(85); // < 50 → −15
    expect(mk(100)).toBe(90); // 50–149 → −10
    expect(mk(200)).toBe(94); // 150–299 → −6
    expect(mk(500)).toBe(100); // ≥ 300 → none
  });

  it('injury UNKNOWN, role UNKNOWN, team null, and coaching UNKNOWN each deduct', () => {
    expect(computeConfidence({ ...base(), injury_status: 'UNKNOWN' }, noFallback, 0).score).toBe(90);
    expect(computeConfidence({ ...base(), role_change: 'UNKNOWN' }, noFallback, 0).score).toBe(90);
    expect(computeConfidence({ ...base(), team: null }, noFallback, 0).score).toBe(95);
    expect(computeConfidence({ ...base(), coaching_continuity: 'UNKNOWN' }, noFallback, 0).score).toBe(95);
  });

  it('teammate return deducts 8', () => {
    expect(computeConfidence({ ...base(), teammate_return_flag: true }, noFallback, 0).score).toBe(92);
  });

  it('§26.16.4.1 route-participation fallback contributes exactly a 15-point total', () => {
    const i = base();
    i.route_participation_last4 = null;
    const before = evaluateRunningBack(base()).confidence.score;
    const after = evaluateRunningBack(i).confidence.score;
    expect(before - after).toBe(15);
  });

  it('confidence does not change projections, components, or composites', () => {
    const a = evaluateRunningBack(base());
    const b = evaluateRunningBack({ ...base(), team: null }); // only moves confidence
    expect(b.confidence.score).toBeLessThan(a.confidence.score);
    expect(b.components).toEqual(a.components);
    expect(b.composites).toEqual(a.composites);
    expect(b.weekly).toEqual(a.weekly);
    expect(b.ros).toEqual(a.ros);
  });

  it('§26.16.7.2 labels derive from the rounded score; raw 79.96 → 80.0 HIGH', () => {
    expect(round(79.96, 1)).toBe(80.0);
    expect(confidenceLabel(round(79.96, 1))).toBe('HIGH');
    // boundary behavior
    expect(confidenceLabel(79.9)).toBe('MEDIUM');
    expect(confidenceLabel(60.0)).toBe('MEDIUM');
    expect(confidenceLabel(59.9)).toBe('LOW');
  });

  it('missing-data player is LOW confidence with all penalties itemized', () => {
    const o = evaluateRunningBack(loadFixture('missing-data'));
    expect(o.confidence.label).toBe('LOW');
    expect(o.confidence.score).toBeLessThan(60);
    expect(o.confidence.penalties.length).toBeGreaterThan(0);
  });
});
