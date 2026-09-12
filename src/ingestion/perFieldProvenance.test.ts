// Per-field provenance, and the QB roster/injury distinction.
//
// THE ACCEPTANCE STANDARD these tests encode: PlayerTicker must distinguish data source, roster
// state and injury state truthfully. A provider may not claim another provider's field, and
// `inactive` may not silently become an injury diagnosis.

import { describe, expect, it } from 'vitest';
import { ingest, buildNormalizedInferenceInput } from './buildInput';
import { AS_OF, fourPositionNflverseSource, freshness } from './__fixtures';
import { sleeperAdapter } from './adapters/sleeper';
import type { ProviderSource } from './buildInput';
import { toInjuryStatus } from '@/pipeline/readiness/engineReadiness';
import { probabilityActive } from '@/inference/availability';
import { AV_INJURY_STATUS_SCORE, INACTIVE_INJURY_STATUSES } from '@/qb-model/constants';
import type { CanonicalPlayer } from '@/pipeline/types';

/** A FieldState, narrowed for assertions. */
function field(v: unknown): { present: boolean; provider?: string; provenance?: string; value?: unknown; sourceTimestamp?: string } {
  return v as never;
}

/**
 * Sleeper carrying an injury designation, attested BEFORE the as-of so it is admissible, and
 * disagreeing with nflverse about biography so the protection is exercised at the same time.
 */
function sleeperWithDesignation(at = '2025-09-20T00:00:00.000Z'): ProviderSource {
  return {
    adapter: sleeperAdapter,
    freshness: { ...freshness('sleeper', at), lastUpdated: at },
    payloads: {
      identity: [
        { sleeper_id: 'S-QB4', gsis_id: '00-QB4', full_name: 'Frontier Passer', position: 'QB', team: 'CIN', age: 33, years_exp: 11, draft_round: 7, status: 'Injured Reserve', injury_status: 'IR' },
      ],
    },
  };
}

function canonicalFor(sources: readonly ProviderSource[], gsis = '00-QB4', position: 'QB' | 'RB' | 'WR' | 'TE' = 'QB', asOf = AS_OF) {
  const { snapshot } = ingest(sources);
  const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === gsis)!.canonicalId as string;
  const input = buildNormalizedInferenceInput(snapshot, {
    canonicalId,
    position,
    asOf,
    engineVersion: `${position.toLowerCase()}-mvp-1.0`,
  })!;
  return { player: input.player as CanonicalPlayer, snapshot };
}

describe('per-field provenance: a provider cannot claim another provider’s field', () => {
  it('attributes biography to nflverse and the injury designation to Sleeper, on ONE player', () => {
    const { player } = canonicalFor([fourPositionNflverseSource(), sleeperWithDesignation()]);

    // Biography: nflverse, because a current-state export does not get to restate a stable fact.
    for (const key of ['age', 'nfl_seasons_completed', 'draft_round', 'full_name'] as const) {
      const f = field(player[key]);
      expect(f.present, key).toBe(true);
      expect(f.provider, key).toBe('nflverse');
    }
    // And the VALUES are nflverse's, not Sleeper's 33 / 11 / 7.
    expect(field(player.age).value).toBe(27);
    expect(field(player.nfl_seasons_completed).value).toBe(5);
    expect(field(player.draft_round).value).toBe(1);

    // Roster team and status: nflverse, which published the weekly roster row they came from.
    expect(field(player.team).provider).toBe('nflverse');
    expect(field(player.status).provider).toBe('nflverse');

    // Injury designation: Sleeper, which is the only source that has one.
    const designation = field(player.injury_designation);
    expect(designation.present).toBe(true);
    expect(designation.provider).toBe('sleeper');
    expect(designation.value).toBe('IR');
  });

  it('lists every contributing provider on the record, not just one', () => {
    const { player } = canonicalFor([fourPositionNflverseSource(), sleeperWithDesignation()]);
    expect([...player.provenance.sources].sort()).toEqual(['nflverse', 'sleeper']);
  });

  it('a single-provider record attributes everything to that provider', () => {
    const { player } = canonicalFor([fourPositionNflverseSource()]);
    for (const key of ['age', 'nfl_seasons_completed', 'draft_round', 'team', 'status'] as const) {
      expect(field(player[key]).provider).toBe('nflverse');
    }
    expect(player.provenance.sources).toEqual(['nflverse']);
  });

  it('carries each field’s OWN attestation timestamp, not one shared stamp', () => {
    const { player } = canonicalFor([fourPositionNflverseSource(), sleeperWithDesignation()]);
    // The designation was attested by Sleeper on the 20th; biography by nflverse earlier.
    expect(field(player.injury_designation).sourceTimestamp).toBe('2025-09-20T00:00:00.000Z');
    expect(field(player.age).sourceTimestamp).not.toBe('2025-09-20T00:00:00.000Z');
  });
});

describe('point-in-time safety: a current designation cannot leak onto a historical board', () => {
  it('withholds a Sleeper designation attested AFTER the as-of', () => {
    // Preserves the ff433e0 guarantee, now gated per field rather than per record.
    const { player } = canonicalFor([fourPositionNflverseSource(), sleeperWithDesignation('2026-06-01T00:00:00.000Z')]);
    expect(field(player.injury_designation).present).toBe(false);
    // Biography is unaffected either way, and is still nflverse's.
    expect(field(player.age).value).toBe(27);
    expect(field(player.age).provider).toBe('nflverse');
  });

  it('admits the same designation on a board whose as-of postdates it', () => {
    const { player } = canonicalFor(
      [fourPositionNflverseSource(), sleeperWithDesignation('2026-06-01T00:00:00.000Z')],
      '00-QB4',
      'QB',
      '2026-07-01T00:00:00.000Z',
    );
    expect(field(player.injury_designation).value).toBe('IR');
    expect(field(player.injury_designation).provider).toBe('sleeper');
  });
});

describe('QB availability: a roster state is not an injury diagnosis', () => {
  const status = (value: string | null): CanonicalPlayer['status'] =>
    (value === null
      ? { present: false, reason: 'NOT_PROVIDED' }
      : { present: true, value, provenance: 'DIRECT', provider: 'nflverse', sourceTimestamp: AS_OF }) as never;
  const desig = (d: string | null): CanonicalPlayer['injury_designation'] =>
    (d === null
      ? { present: false, reason: 'NOT_PROVIDED' }
      : { present: true, value: d, provenance: 'DIRECT', provider: 'sleeper', sourceTimestamp: AS_OF }) as never;

  it('active with no designation is HEALTHY', () => {
    expect(toInjuryStatus(status('active'), desig(null))).toBe('HEALTHY');
  });

  it('generic inactive with no designation is NOT_ROSTERED, never an injury state', () => {
    const resolved = toInjuryStatus(status('inactive'), desig(null));
    expect(resolved).toBe('NOT_ROSTERED');
    // The whole point: none of the injury states may be claimed without injury evidence.
    expect(['OUT', 'IR', 'PUP', 'DOUBTFUL', 'QUESTIONABLE', 'HEALTHY']).not.toContain(resolved);
  });

  it('an injury designation always wins over the roster state', () => {
    for (const [designation, expected] of [
      ['Questionable', 'QUESTIONABLE'],
      ['Out', 'OUT'],
      ['IR', 'IR'],
      ['PUP', 'PUP'],
      ['Doubtful', 'DOUBTFUL'],
    ] as const) {
      expect(toInjuryStatus(status('injured'), desig(designation))).toBe(expected);
    }
  });

  it('no status at all is UNKNOWN — distinct from NOT_ROSTERED', () => {
    // Roster absence is positively attested; unknown status is the absence of any attestation.
    expect(toInjuryStatus(status(null), desig(null))).toBe('UNKNOWN');
  });

  it('Sleeper absent invents nothing: the player stays NOT_ROSTERED', () => {
    const { player } = canonicalFor([fourPositionNflverseSource()]);
    expect(field(player.injury_designation).present).toBe(false);
    // With only nflverse, an inactive player resolves to a roster state and not an injury.
    expect(toInjuryStatus(status('inactive'), desig(null))).toBe('NOT_ROSTERED');
  });
});

describe('QB availability scoring is semantic, not tuned', () => {
  it('scores NOT_ROSTERED below confirmed-active and above confirmed OUT/IR/PUP', () => {
    const s = AV_INJURY_STATUS_SCORE;
    expect(s.NOT_ROSTERED).toBeLessThan(s.HEALTHY);
    expect(s.NOT_ROSTERED).toBeGreaterThan(s.OUT);
    expect(s.NOT_ROSTERED).toBeGreaterThan(s.IR);
    expect(s.NOT_ROSTERED).toBeGreaterThan(s.PUP);
    // Above DOUBTFUL: a doubtful player has an injury against him, an unrostered one does not.
    expect(s.NOT_ROSTERED).toBeGreaterThan(s.DOUBTFUL);
    expect(s.NOT_ROSTERED).toBeLessThan(s.QUESTIONABLE);
  });

  it('matches the value the accessible models already use for the same concept', () => {
    // One idea, one meaning across PlayerTicker. The accessible models score NOT_ROSTERED 40.
    expect(AV_INJURY_STATUS_SCORE.NOT_ROSTERED).toBe(40);
  });

  it('does not force the activity probability to zero, which would re-import the injury claim', () => {
    expect(INACTIVE_INJURY_STATUSES).not.toContain('NOT_ROSTERED');
    expect(probabilityActive('NOT_ROSTERED')).toBeGreaterThan(probabilityActive('OUT'));
    expect(probabilityActive('NOT_ROSTERED')).toBeLessThan(probabilityActive('HEALTHY'));
  });

  it('keeps the engine’s own cross-validation satisfiable', () => {
    // The QB engine rejects a player whose injury_status is OUT/IR/PUP with a non-zero activity
    // probability. NOT_ROSTERED must not trip that rule, or every unrostered QB would fail.
    for (const s of INACTIVE_INJURY_STATUSES) expect(probabilityActive(s)).toBe(0);
  });
});
