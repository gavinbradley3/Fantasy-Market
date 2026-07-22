// Normalized-input / output checksum properties (Cold-audit M2) and the canonical
// merge contract (Cold-audit m2).

import { describe, expect, it } from 'vitest';
import { runInference } from '@/inference/production/runInference';
import type { NormalizedInferenceInput } from '@/inference/production/types';
import { mergeFactsOverAilFlat } from '@/inference/supplement/merge';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import { readFixture } from '@/pipeline/test-support';

const T = '2026-07-01T00:00:00.000Z';

function player(position: SupportedPosition): CanonicalPlayer {
  return {
    identity: { canonical_id: 'pt_ck', provider_ids: { sleeper: '1' }, name_normalized: 'ck', newly_created: false },
    position,
    full_name: present('CK', 'sleeper', T),
    team: present('CIN', 'sleeper', T),
    age: present(26, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(4, 'sleeper', T),
    rookie_year: notProvided(),
    draft_year: notProvided(),
    draft_round: present(1, 'nflverse', T),
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

const wrFacts = () => (readFixture('metrics.sample.json') as { wr: Record<string, Record<string, unknown>> }).wr.pt_0001;

function inp(facts: Record<string, unknown>, overrides: Partial<NormalizedInferenceInput> = {}): NormalizedInferenceInput {
  return {
    player: player('WR'),
    asOf: T,
    facts,
    evidence: { expectedGames: { gamesLeft: 12, availProb: 0.97, missedRateLast16: 0 } },
    freshnessBySource: { nflverse_weekly: 1, snaps: 1, participation: 1, pbp: 1, schedule: 1, injury: 1 },
    snapshotIds: ['s1'],
    engineVersion: 'wr-mvp-1.0',
    ...overrides,
  };
}

describe('M2 — normalized-input checksum', () => {
  it('is distinct from the output checksum', () => {
    const r = runInference(inp(wrFacts()));
    expect(r.normalizedInputChecksum).not.toBe(r.outputChecksum);
    expect(r.reproducibility.normalizedInputChecksum).toBe(r.normalizedInputChecksum);
  });

  it('changes when normalized evidence changes', () => {
    const a = runInference(inp(wrFacts(), { evidence: { expectedGames: { gamesLeft: 12, availProb: 0.97, missedRateLast16: 0 } } }));
    const b = runInference(inp(wrFacts(), { evidence: { expectedGames: { gamesLeft: 6, availProb: 0.97, missedRateLast16: 0 } } }));
    expect(a.normalizedInputChecksum).not.toBe(b.normalizedInputChecksum);
  });

  it('changes when facts change', () => {
    const a = runInference(inp(wrFacts()));
    const b = runInference(inp({ ...wrFacts(), target_share: 0.999 }));
    expect(a.normalizedInputChecksum).not.toBe(b.normalizedInputChecksum);
  });

  it('does NOT change when only object construction order changes', () => {
    const a = runInference(inp(wrFacts()));
    const b = runInference(inp(Object.fromEntries(Object.entries(wrFacts()).reverse())));
    expect(a.normalizedInputChecksum).toBe(b.normalizedInputChecksum);
  });

  it('does NOT change when only a non-input output factor changes (engine output / freshness)', () => {
    // freshnessBySource affects public confidence (output) but is not part of the
    // normalized input → the input checksum is invariant to it.
    const a = runInference(inp(wrFacts(), { freshnessBySource: { nflverse_weekly: 1, snaps: 1, participation: 1, pbp: 1, schedule: 1, injury: 1 } }));
    const b = runInference(inp(wrFacts(), { freshnessBySource: { nflverse_weekly: 0.7, snaps: 0.7, participation: 0.7, pbp: 0.7, schedule: 0.7, injury: 0.7 } }));
    expect(a.normalizedInputChecksum).toBe(b.normalizedInputChecksum);
    expect(a.outputChecksum).not.toBe(b.outputChecksum); // output DID change
  });

  it('repeated identical input → identical input checksum', () => {
    expect(runInference(inp(wrFacts())).normalizedInputChecksum).toBe(runInference(inp(wrFacts())).normalizedInputChecksum);
  });
});

describe('m2 — canonical merge contract (mergeFactsOverAilFlat)', () => {
  it('observed facts win over AIL estimates for a dual-owned field', () => {
    const merged = mergeFactsOverAilFlat('WR', { target_share: 0.99 }, { target_share: 0.24 });
    expect(merged.target_share).toBe(0.24); // fact overlay wins
  });

  it('AIL-only fields survive (no fact competitor)', () => {
    const merged = mergeFactsOverAilFlat('WR', { competition_pressure: 0.4 }, { target_share: 0.24 });
    expect(merged.competition_pressure).toBe(0.4);
    expect(merged.target_share).toBe(0.24);
  });

  it('an observed-null fact wins over an AIL estimate (present-null ownership)', () => {
    const merged = mergeFactsOverAilFlat('WR', { average_depth_of_target: 9.1 }, { average_depth_of_target: null });
    expect('average_depth_of_target' in merged).toBe(true);
    expect(merged.average_depth_of_target).toBeNull(); // observed null owns the field
  });

  it('routes through the same contract as the engineReadiness mergeSupplements (single contract)', () => {
    // A field present only in the AIL base and a field present only in the facts overlay
    // both survive; a dual field resolves to the overlay — identical to mergeSupplements.
    const merged = mergeFactsOverAilFlat('QB', { role_status: 'BACKUP', organizational_commitment: 0.5 }, { career_starts: 60, role_status: 'ESTABLISHED_STARTER' });
    expect(merged.organizational_commitment).toBe(0.5); // AIL-only survives
    expect(merged.career_starts).toBe(60); // fact-only survives
    expect(merged.role_status).toBe('ESTABLISHED_STARTER'); // overlay (fact) wins
  });
});
