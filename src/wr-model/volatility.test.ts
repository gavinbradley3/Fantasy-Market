import { describe, expect, it } from 'vitest';
import { computeVolatility, volatilityLabel } from '@/wr-model/volatility';
import { loadFixture } from '@/wr-model/testutil';
import type { WRMVPInput } from '@/wr-model/types';

const base = (): WRMVPInput => loadFixture('elite-full-time');

describe('volatility (§26.12)', () => {
  it('lower route participation raises volatility', () => {
    const hi = computeVolatility(base(), 0.4, 10, 0.2).score;
    const lo = computeVolatility(base(), 0.95, 10, 0.2).score;
    expect(hi).toBeGreaterThan(lo);
  });

  it('deeper aDOT raises volatility', () => {
    expect(computeVolatility(base(), 0.8, 20, 0.2).score).toBeGreaterThan(
      computeVolatility(base(), 0.8, 5, 0.2).score,
    );
  });

  it('higher prior weight raises volatility', () => {
    expect(computeVolatility(base(), 0.8, 10, 0.9).score).toBeGreaterThan(
      computeVolatility(base(), 0.8, 10, 0.05).score,
    );
  });

  it('QUESTIONABLE and UNKNOWN injury statuses add 15', () => {
    const b = computeVolatility(base(), 0.8, 10, 0.2).score;
    expect(computeVolatility({ ...base(), injury_status: 'QUESTIONABLE' }, 0.8, 10, 0.2).score).toBeCloseTo(b + 15, 6);
    expect(computeVolatility({ ...base(), injury_status: 'UNKNOWN' }, 0.8, 10, 0.2).score).toBeCloseTo(b + 15, 6);
  });

  it('PROMOTED, DEMOTED and UNKNOWN role statuses add 15', () => {
    const b = computeVolatility(base(), 0.8, 10, 0.2).score;
    for (const role of ['PROMOTED', 'DEMOTED', 'UNKNOWN'] as const) {
      expect(computeVolatility({ ...base(), route_role_change: role }, 0.8, 10, 0.2).score).toBeCloseTo(b + 15, 6);
    }
  });

  it('fewer than 200 career routes adds 10', () => {
    const b = computeVolatility({ ...base(), career_routes: 400 }, 0.8, 10, 0.2).score;
    const low = computeVolatility({ ...base(), career_routes: 150 }, 0.8, 10, 0.2).score;
    expect(low).toBeCloseTo(b + 10, 6);
  });

  it('label boundaries are correct at 33 and 66', () => {
    expect(volatilityLabel(66)).toBe('HIGH');
    expect(volatilityLabel(65.999)).toBe('MEDIUM');
    expect(volatilityLabel(33)).toBe('MEDIUM');
    expect(volatilityLabel(32.999)).toBe('LOW');
  });
});
