import { describe, expect, it } from 'vitest';
import {
  organizationalCommitment,
  rosterSecurity,
  securityCategory,
  type RosterSecurityInput,
} from '@/inference/security/rosterSecurity';

function base(p: Partial<RosterSecurityInput> = {}): RosterSecurityInput {
  return { draftRound: 4, age: 27, yearsWithTeam: 0, recentUsageShare: null, negativeTransaction: 'NONE', ...p };
}

describe('roster security (REGISTRY §5.1/§5.3)', () => {
  it('high case clamps at 0.95', () => {
    // 1.00 + 0 + min(0.09,0.15)=0.09 + 0.15*0.20=0.03 = 1.12 → clamp 0.95
    const v = rosterSecurity(base({ draftRound: 1, age: 24, yearsWithTeam: 3, recentUsageShare: 0.2 }));
    expect(v).toBe(0.95);
    expect(securityCategory(v)).toBe('HIGH');
  });

  it('low case clamps at 0.05', () => {
    // 0.26 − 0.10 − 0.25 = −0.09 → clamp 0.05
    const v = rosterSecurity(base({ draftRound: 7, age: 32, negativeTransaction: 'BENCH_OR_TRADE_BLOCK_OR_WAIVED' }));
    expect(v).toBe(0.05);
    expect(securityCategory(v)).toBe('LOW');
  });

  it('middle case', () => {
    // 0.45 + 0 + 0.03 + 0.15*0.30=0.045 = 0.525
    const v = rosterSecurity(base({ draftRound: 4, age: 27, yearsWithTeam: 1, recentUsageShare: 0.3 }));
    expect(v).toBe(0.525);
    expect(securityCategory(v)).toBe('MEDIUM');
  });

  it('band transitions are lower-inclusive (0.40 → MEDIUM, 0.70 → HIGH)', () => {
    expect(securityCategory(0.4)).toBe('MEDIUM');
    expect(securityCategory(0.7)).toBe('HIGH');
    expect(securityCategory(0.399)).toBe('LOW');
  });

  it('missing usage feature behaves as 0', () => {
    const withNull = rosterSecurity(base({ draftRound: 3, recentUsageShare: null }));
    const withZero = rosterSecurity(base({ draftRound: 3, recentUsageShare: 0 }));
    expect(withNull).toBe(withZero);
  });

  it('QB organizational_commitment blends draft + role maps (§5.2)', () => {
    // 0.5*0.9 + 0.5*0.92 = 0.91
    expect(organizationalCommitment({ draftRound: 1, roleStatus: 'ESTABLISHED_STARTER' })).toBe(0.91);
  });
});
