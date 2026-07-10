import { describe, expect, it } from 'vitest';
import { computeConfidence, confidenceLabel } from '@/wr-model/confidence';
import { loadFixture } from '@/wr-model/testutil';
import type { WRMVPInput } from '@/wr-model/types';

const base = (): WRMVPInput => loadFixture('elite-full-time');

describe('confidence (§26.11)', () => {
  it('a clean, high-sample input scores 100 / HIGH', () => {
    const c = computeConfidence(base(), [], 0, 0);
    expect(c.score).toBe(100);
    expect(c.label).toBe('HIGH');
  });

  it('sums fallback penalties correctly', () => {
    const log = [
      { field: 'RP4', fallback_used: 'RP8', confidence_penalty: 8 },
      { field: 'CROE', fallback_used: '0', confidence_penalty: 5 },
    ];
    const c = computeConfidence(base(), log, 13, 0);
    expect(c.score).toBe(100 - 13);
  });

  it('career-route penalty tiers are mutually exclusive', () => {
    const under100 = computeConfidence({ ...base(), career_routes: 50 }, [], 0, 0);
    const mid = computeConfidence({ ...base(), career_routes: 200 }, [], 0, 0);
    expect(under100.score).toBe(100 - 15);
    expect(mid.score).toBe(100 - 8);
    // Never both.
    expect(under100.penalties.filter((p) => p.includes('Career routes'))).toHaveLength(1);
  });

  it('injury UNKNOWN −10, route-role UNKNOWN −10, null team −5', () => {
    expect(computeConfidence({ ...base(), injury_status: 'UNKNOWN' }, [], 0, 0).score).toBe(90);
    expect(computeConfidence({ ...base(), route_role_change: 'UNKNOWN' }, [], 0, 0).score).toBe(90);
    expect(computeConfidence({ ...base(), team: null }, [], 0, 0).score).toBe(95);
  });

  it('label boundaries are correct at 60 and 80', () => {
    expect(confidenceLabel(80)).toBe('HIGH');
    expect(confidenceLabel(79.999)).toBe('MEDIUM');
    expect(confidenceLabel(60)).toBe('MEDIUM');
    expect(confidenceLabel(59.999)).toBe('LOW');
  });
});
