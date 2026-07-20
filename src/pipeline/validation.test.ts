import { describe, expect, it } from 'vitest';
import { present, notProvided } from '@/pipeline/provenance';
import { validateCanonicalPlayer, validateCanonicalPlayers } from '@/pipeline/validation';
import type { CanonicalPlayer } from '@/pipeline/types';

const T = '2026-07-01T00:00:00.000Z';

function base(): CanonicalPlayer {
  return {
    identity: { canonical_id: 'pt_1', provider_ids: { sleeper: '1' }, name_normalized: 'x', newly_created: true },
    position: 'WR',
    full_name: present('X', 'sleeper', T),
    team: present('CIN', 'sleeper', T),
    age: present(25, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(4, 'sleeper', T),
    rookie_year: notProvided(),
    draft_year: notProvided(),
    draft_round: notProvided(),
    draft_pick: notProvided(),
    height_inches: notProvided(),
    weight_pounds: notProvided(),
    jersey_number: notProvided(),
    status: present('active', 'sleeper', T),
    injury_designation: notProvided(),
    headshot_url: notProvided(),
    provenance: { sources: ['sleeper'], generated_at: T },
  };
}

describe('canonical validation', () => {
  it('accepts a well-formed record (missing optional fields are legal)', () => {
    expect(validateCanonicalPlayer(base())).toHaveLength(0);
  });

  it('flags out-of-range present numeric values', () => {
    const bad = { ...base(), age: present(120, 'sleeper', T) };
    const issues = validateCanonicalPlayer(bad);
    expect(issues.some((i) => i.field === 'age')).toBe(true);
  });

  it('flags a record with no retained provider id', () => {
    const bad: CanonicalPlayer = { ...base(), identity: { ...base().identity, provider_ids: {} } };
    expect(validateCanonicalPlayer(bad).some((i) => i.field === 'identity.provider_ids')).toBe(true);
  });

  it('partitions valid and rejected records', () => {
    const good = base();
    const bad = { ...base(), identity: { ...base().identity, canonical_id: 'pt_2' }, draft_round: present(9, 'nflverse', T) };
    const result = validateCanonicalPlayers([good, bad]);
    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });
});
