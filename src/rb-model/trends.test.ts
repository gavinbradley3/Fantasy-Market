// §26.7 trend-score tests + §26.16.3.3 (missing previous history is neutral, not
// a fallback: no log entry, no penalty, no status change).
import { describe, expect, it } from 'vitest';
import { computeTrends } from '@/rb-model/trends';
import { evaluateRunningBack } from '@/rb-model/engine';
import { loadFixture } from '@/rb-model/testutil';
import type { RBMVPInput } from '@/rb-model/types';

const base = (): RBMVPInput => loadFixture('elite-bell-cow');

describe('§26.7 trend scores', () => {
  it('missing previous history yields the neutral 50 for that trend', () => {
    const t = computeTrends(0.6, 0.5, 0.4, null, null, null);
    expect(t.snapTrendScore).toBe(50);
    expect(t.carryTrendScore).toBe(50);
    expect(t.routeTrendScore).toBe(50);
    expect(t.workloadTrendScore).toBe(50);
  });

  it('trend = clamp(50 + 200 × delta, 0, 100) for each role share', () => {
    // +0.10 delta → 70; −0.10 delta → 30
    const t = computeTrends(0.6, 0.45, 0.35, 0.5, 0.55, 0.45);
    expect(t.snapTrendScore).toBeCloseTo(50 + 200 * 0.1, 10);
    expect(t.carryTrendScore).toBeCloseTo(50 - 200 * 0.1, 10);
    expect(t.routeTrendScore).toBeCloseTo(50 - 200 * 0.1, 10);
  });

  it('extreme deltas clamp to [0,100]', () => {
    const up = computeTrends(0.9, 0.9, 0.9, 0.1, 0.1, 0.1);
    expect(up.snapTrendScore).toBe(100);
    expect(up.carryTrendScore).toBe(100);
    expect(up.routeTrendScore).toBe(100);
    const down = computeTrends(0.05, 0.05, 0.05, 0.9, 0.9, 0.9);
    expect(down.snapTrendScore).toBe(0);
    expect(down.carryTrendScore).toBe(0);
    expect(down.routeTrendScore).toBe(0);
  });

  it('workload_trend_score = 0.45 × snap + 0.35 × carry + 0.20 × route', () => {
    const t = computeTrends(0.6, 0.45, 0.35, 0.5, 0.55, 0.45);
    expect(t.workloadTrendScore).toBeCloseTo(
      0.45 * t.snapTrendScore + 0.35 * t.carryTrendScore + 0.2 * t.routeTrendScore,
      10,
    );
  });

  it('a partially missing history is neutral only for the missing trend', () => {
    const t = computeTrends(0.6, 0.5, 0.4, 0.5, null, 0.35);
    expect(t.snapTrendScore).toBeCloseTo(70, 10);
    expect(t.carryTrendScore).toBe(50);
    expect(t.routeTrendScore).toBeCloseTo(60, 10);
  });
});

describe('§26.16.3.3 missing previous trend history does not change status', () => {
  it('null previous_* keeps status OK, an empty fallback log, and full confidence', () => {
    const withHistory = evaluateRunningBack(base());
    const i = base();
    i.previous_snap_share = null;
    i.previous_carry_share = null;
    i.previous_route_participation = null;
    const o = evaluateRunningBack(i);
    expect(o.status).toBe('OK');
    expect(o.fallback_log).toHaveLength(0);
    expect(o.confidence.score).toBe(withHistory.confidence.score);
  });
});
