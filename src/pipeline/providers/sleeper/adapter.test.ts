import { describe, expect, it } from 'vitest';
import { sleeperAdapter } from '@/pipeline/providers/sleeper/adapter';
import { rawPayload } from '@/pipeline/test-support';

describe('sleeperAdapter', () => {
  const result = sleeperAdapter.parse(rawPayload('sleeper'));

  it('keeps only supported-position player records', () => {
    expect(result.records.every((r) => ['QB', 'RB', 'WR', 'TE'].includes(r.position))).toBe(true);
    // Chase, Bijan, LaPorta, Allen, Nabers, Diontae, Mike Williams = 7.
    expect(result.records).toHaveLength(7);
  });

  it('rejects malformed records and unsupported positions without crashing', () => {
    const reasons = result.rejected.map((r) => r.reason).sort();
    expect(reasons).toContain('MALFORMED'); // bad1: no player_id
    expect(reasons).toContain('UNSUPPORTED_POSITION'); // K123: kicker
    // A team-defense row with no name is skipped silently, not rejected.
    expect(result.rejected.some((r) => r.locator === 'BUF')).toBe(false);
  });

  it('maps metadata fields and carries cross-provider ids', () => {
    const chase = result.records.find((r) => r.providerPlayerId === '6794');
    expect(chase).toBeDefined();
    expect(chase?.fullName).toBe("Ja'Marr Chase");
    expect(chase?.position).toBe('WR');
    expect(chase?.crossIds.gsis).toBe('00-0036900');
    expect(chase?.crossIds.espn).toBe('4362628');
    expect(chase?.heightInches).toBe(72);
    expect(chase?.jerseyNumber).toBe(1);
  });

  it('maps injury_status to an injured canonical status', () => {
    const diontae = result.records.find((r) => r.providerPlayerId === '5846');
    expect(diontae?.status).toBe('injured');
    expect(diontae?.injuryDesignation).toBe('Questionable');
  });

  it('leaves absent fields undefined rather than inventing values', () => {
    const nabers = result.records.find((r) => r.providerPlayerId === '11565');
    expect(nabers?.crossIds.gsis).toBeUndefined();
    expect(nabers?.draftRound).toBeUndefined();
  });

  it('is deterministic and rejects duplicate provider ids', () => {
    const dupPayload = {
      a: { player_id: '1', full_name: 'Dup One', position: 'WR', team: 'X' },
      b: { player_id: '1', full_name: 'Dup Two', position: 'WR', team: 'Y' },
    };
    const r = sleeperAdapter.parse(dupPayload);
    expect(r.records).toHaveLength(1);
    expect(r.rejected.some((x) => x.reason === 'DUPLICATE_PROVIDER_ID')).toBe(true);
  });

  it('reports a whole-payload shape failure as a single rejection', () => {
    const r = sleeperAdapter.parse([1, 2, 3]);
    expect(r.records).toHaveLength(0);
    expect(r.rejected).toEqual([{ provider: 'sleeper', reason: 'MALFORMED', locator: '<payload>' }]);
  });
});
