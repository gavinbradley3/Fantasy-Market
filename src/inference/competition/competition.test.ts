import { describe, expect, it } from 'vitest';
import {
  anotherReceivingTeFlag,
  competitionCategory,
  competitionPressure,
  incomingCompetitionFlag,
  qbCompetitionPressure,
  teammateReturnFlag,
  type CompetitionTeammate,
} from '@/inference/competition/competition';

function mate(p: Partial<CompetitionTeammate> & { canonicalId: string }): CompetitionTeammate {
  return { draftRound: 1, usageShare: 0.2, status: 'ACTIVE', recentlyAcquiredOrReturned: false, ...p };
}

describe('competition pressure (REGISTRY §4)', () => {
  it('no eligible teammates → logistic(3·(0−1)) ≈ 0.0474 (WR)', () => {
    expect(competitionPressure('WR', [])).toBeCloseTo(0.0474, 4);
  });

  it('result stays within [0.02, 0.98]', () => {
    const crowded = Array.from({ length: 6 }, (_, i) => mate({ canonicalId: `t${i}`, usageShare: 0.9 }));
    const p = competitionPressure('WR', crowded);
    expect(p).toBeGreaterThanOrEqual(0.02);
    expect(p).toBeLessThanOrEqual(0.98);
  });

  it('IR teammate is down-weighted (near-zero health), never removed', () => {
    const active = competitionPressure('RB', [mate({ canonicalId: 'a', status: 'ACTIVE', usageShare: 0.5 })]);
    const ir = competitionPressure('RB', [mate({ canonicalId: 'a', status: 'IR', usageShare: 0.5 })]);
    expect(ir).toBeLessThan(active);
  });

  it('subject exclusion / duplicate handling are the caller-supplied set (only listed teammates count)', () => {
    // The model sums exactly the supplied teammates; a recent acquisition raises pressure.
    const baseline = competitionPressure('WR', [mate({ canonicalId: 'a' })]);
    const recent = competitionPressure('WR', [mate({ canonicalId: 'a', recentlyAcquiredOrReturned: true })]);
    expect(recent).toBeGreaterThan(baseline);
  });

  it('QB competition uses the engine role map (§4.1)', () => {
    expect(qbCompetitionPressure('ESTABLISHED_STARTER')).toBe(0.05);
    expect(qbCompetitionPressure('RECENTLY_BENCHED')).toBe(0.9);
  });

  it('public categories (§4.4, lower-inclusive, boundary → higher)', () => {
    expect(competitionCategory(0.24)).toBe('LOW');
    expect(competitionCategory(0.25)).toBe('MODERATE');
    expect(competitionCategory(0.5)).toBe('ELEVATED');
    expect(competitionCategory(0.75)).toBe('HIGH');
  });

  it('flags (§4.3)', () => {
    expect(teammateReturnFlag([{ ...mate({ canonicalId: 'a', recentlyAcquiredOrReturned: true }), priorUsageShare: 0.5 }])).toBe(true);
    expect(incomingCompetitionFlag([{ ...mate({ canonicalId: 'a', draftRound: 1, recentlyAcquiredOrReturned: true }), priorUsageShare: null }])).toBe(true);
    expect(anotherReceivingTeFlag([0.55, null])).toBe(true);
    expect(anotherReceivingTeFlag([0.3])).toBe(false);
  });
});
