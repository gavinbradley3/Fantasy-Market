import { describe, expect, it } from 'vitest';
import { runPhase2A, type Phase2AContext } from '@/inference/result/orchestrator';
import { LIMITATION_CODES } from '@/inference/types';
import { REGISTRY_VERSION } from '@/inference/registry/constants';
import type { CompetitionTeammate } from '@/inference/competition';

function field(res: ReturnType<typeof runPhase2A>, name: string) {
  return res.fields.find((f) => f.field === name);
}

const wrCtx: Phase2AContext = {
  position: 'WR',
  canonicalId: 'pt_0001',
  asOf: '2025-09-10T00:00:00.000Z',
  expectedGames: { gamesLeft: 10, availProb: 0.97, missedRateLast16: 0 },
  competition: {
    kind: 'teammates',
    position: 'WR',
    teammates: [
      { canonicalId: 'a', draftRound: 2, usageShare: 0.2, status: 'ACTIVE', recentlyAcquiredOrReturned: false },
      { canonicalId: 'b', draftRound: 5, usageShare: 0.1, status: 'ACTIVE', recentlyAcquiredOrReturned: false },
    ],
  },
  security: { draftRound: 1, age: 24, yearsWithTeam: 3, recentUsageShare: 0.2, negativeTransaction: 'NONE' },
  offensiveEnv: { teamPointsPerDrive: 2.05, projectedTeamDropbacks: 34, teamRedZoneTripsPerGame: 3.4 },
};

describe('Phase 2A orchestrator (intermediate result)', () => {
  it('produces intermediate fields stamped with the registry version', () => {
    const res = runPhase2A(wrCtx);
    expect(field(res, 'expected_games_remaining')?.value).toBe(9.7);
    expect(field(res, 'contract_security')?.value).toBe(0.95);
    expect(field(res, 'offensive_environment_score')?.value).toBe(52);
    for (const f of res.fields) expect(f.registryVersion).toBe(REGISTRY_VERSION);
  });

  it('roster security carries NOT_TRUE_CONTRACT_DATA', () => {
    const res = runPhase2A(wrCtx);
    expect(field(res, 'contract_security')?.limitations).toContain(LIMITATION_CODES.NOT_TRUE_CONTRACT_DATA);
  });

  it('is deterministic and invariant to teammate input order', () => {
    const original = wrCtx.competition;
    if (!original || original.kind !== 'teammates') throw new Error('fixture');
    const reversed: CompetitionTeammate[] = [...original.teammates].reverse();
    const shuffled: Phase2AContext = {
      ...wrCtx,
      competition: { kind: 'teammates', position: 'WR', teammates: reversed },
    };
    const a = field(runPhase2A(wrCtx), 'competition_pressure')?.value;
    const b = field(runPhase2A(shuffled), 'competition_pressure')?.value;
    expect(a).toBe(b);
  });

  it('repeated runs are byte-identical (intermediate serialization)', () => {
    expect(JSON.stringify(runPhase2A(wrCtx))).toBe(JSON.stringify(runPhase2A(wrCtx)));
  });
});
