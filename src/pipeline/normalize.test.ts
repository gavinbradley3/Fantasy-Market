import { describe, expect, it } from 'vitest';
import { resolveIdentities } from '@/pipeline/identity';
import { normalizeCluster, type NormalizeConfig } from '@/pipeline/normalize';
import type { ProviderRecord } from '@/pipeline/providers/types';

const CFG: NormalizeConfig = {
  generatedAt: '2026-07-01T00:00:00.000Z',
  asOf: '2026-07-01',
  sourceTimestamps: { sleeper: '2026-06-30T00:00:00.000Z', nflverse: '2026-06-29T00:00:00.000Z' },
};

function rec(partial: Partial<ProviderRecord> & Pick<ProviderRecord, 'provider' | 'providerPlayerId' | 'position'>): ProviderRecord {
  return { crossIds: {}, ...partial };
}

function normalizeOne(records: ProviderRecord[]) {
  const res = resolveIdentities(records);
  expect(res.clusters).toHaveLength(1);
  return normalizeCluster(res.clusters[0], CFG);
}

describe('normalizeCluster', () => {
  it('applies Sleeper precedence for metadata and stamps provenance', () => {
    const { player } = normalizeOne([
      rec({ provider: 'sleeper', providerPlayerId: 's', position: 'WR', fullName: 'Real Name', team: 'CIN', crossIds: { sleeper: 's', gsis: 'g' } }),
      rec({ provider: 'nflverse', providerPlayerId: 'g', position: 'WR', fullName: 'Old Name', team: 'CIN', crossIds: { gsis: 'g', sleeper: 's' } }),
    ]);
    expect(player.full_name.present && player.full_name.value).toBe('Real Name');
    expect(player.full_name.present && player.full_name.provider).toBe('sleeper');
    expect(player.full_name.present && player.full_name.provenance).toBe('DIRECT');
  });

  it('takes draft capital from nflverse (Sleeper has none)', () => {
    const { player } = normalizeOne([
      rec({ provider: 'sleeper', providerPlayerId: 's', position: 'WR', fullName: 'X', crossIds: { sleeper: 's', gsis: 'g' } }),
      rec({ provider: 'nflverse', providerPlayerId: 'g', position: 'WR', draftRound: 1, draftPick: 5, crossIds: { gsis: 'g', sleeper: 's' } }),
    ]);
    expect(player.draft_round.present && player.draft_round.value).toBe(1);
    expect(player.draft_round.present && player.draft_round.provider).toBe('nflverse');
  });

  it('records an explicit missing state, never a placeholder', () => {
    const { player } = normalizeOne([
      rec({ provider: 'sleeper', providerPlayerId: 's', position: 'WR', fullName: 'X', crossIds: { sleeper: 's' } }),
    ]);
    expect(player.draft_round.present).toBe(false);
    if (!player.draft_round.present) expect(player.draft_round.reason).toBe('NOT_PROVIDED');
    // Headshots require a licensed source in this milestone.
    expect(player.headshot_url.present).toBe(false);
    if (!player.headshot_url.present) expect(player.headshot_url.reason).toBe('UNSUPPORTED_BY_SOURCE');
  });

  it('reports a metadata conflict but keeps the higher-precedence value', () => {
    const { player, conflicts } = normalizeOne([
      rec({ provider: 'sleeper', providerPlayerId: 's', position: 'WR', fullName: 'X', team: 'BAL', crossIds: { sleeper: 's', gsis: 'g' } }),
      rec({ provider: 'nflverse', providerPlayerId: 'g', position: 'WR', team: 'CAR', crossIds: { gsis: 'g', sleeper: 's' } }),
    ]);
    expect(player.team.present && player.team.value).toBe('BAL'); // Sleeper wins
    expect(conflicts.some((c) => c.field === 'team')).toBe(true);
  });

  it('falls back to the secondary provider and marks provenance FALLBACK', () => {
    const { player } = normalizeOne([
      rec({ provider: 'sleeper', providerPlayerId: 's', position: 'WR', fullName: 'X', crossIds: { sleeper: 's', gsis: 'g' } }),
      rec({ provider: 'nflverse', providerPlayerId: 'g', position: 'WR', team: 'DET', crossIds: { gsis: 'g', sleeper: 's' } }),
    ]);
    expect(player.team.present && player.team.value).toBe('DET');
    expect(player.team.present && player.team.provenance).toBe('FALLBACK');
  });

  it('derives age from birth_date when no direct age is supplied', () => {
    const { player } = normalizeOne([
      rec({ provider: 'sleeper', providerPlayerId: 's', position: 'WR', fullName: 'X', birthDate: '2000-01-01', crossIds: { sleeper: 's' } }),
    ]);
    expect(player.age.present && player.age.value).toBe(26); // as of 2026-07-01
    expect(player.age.present && player.age.provenance).toBe('DERIVED');
  });
});
