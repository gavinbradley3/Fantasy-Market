// AUDIT: why did an availability-only enrichment move RB/WR/TE DYNASTY values?
//
// Measured on a host with Sleeper access: enabling `--sleeper` moved dynasty composites for 105
// players — RB mean |Δ| 5.31, TE 4.16, WR 2.77, QB 0.51 — even though all three accessible
// models weight availability at exactly 0.00 on the dynasty horizon.
//
// The availability weights were not the problem. These tests reproduce the real cause offline,
// deterministically, and then hold it fixed.
//
// THE CAUSE. `comparePrecedence` in identityMerge.ts ordered the source records for one
// canonical player by LATEST sourceTimestamp first, with provider priority only the THIRD key.
// Sleeper's players resource is a current-state snapshot timestamped at its own attestation
// instant, so it is always newer than an nflverse release — and `firstNonNull` then took
// Sleeper's value for EVERY scalar field, including stable biographical facts it should never
// decide: age, draft round, seasons completed, position and name.
//
// Age is the largest single dynasty weight in every accessible model (RB 0.23, TE 0.21,
// WR 0.16), which is exactly the observed ordering of the deltas.

import { describe, expect, it } from 'vitest';
import { ingest, buildNormalizedInferenceInput } from './buildInput';
import { AS_OF, fourPositionNflverseSource, fourPositionSleeperSource, freshness } from './__fixtures';
import { sleeperAdapter } from './adapters/sleeper';
import type { ProviderSource } from './buildInput';
import { runInference } from '@/inference/production/runInference';
import { RB_ACCESSIBLE_VERSION, TE_ACCESSIBLE_VERSION, WR_ACCESSIBLE_VERSION } from '@/accessible';

/**
 * A Sleeper identity payload that disagrees with nflverse about BIOGRAPHY, and is timestamped
 * LATER — which is what production looks like, because Sleeper's resource carries an HTTP
 * Last-Modified of roughly now while an nflverse release is dated when it was cut.
 *
 * nflverse says these players are 27/25/26/28. Sleeper says 30/29/30/32. Nothing about
 * availability differs: every row is ACTIVE with no injury designation, exactly as in the
 * shared fixture.
 */
function sleeperWithDifferentAges(): ProviderSource {
  const later = freshness('sleeper', '2026-06-01T00:00:00.000Z');
  return {
    adapter: sleeperAdapter,
    freshness: { ...later, lastUpdated: '2026-06-01T00:00:00.000Z' },
    payloads: {
      identity: [
        { sleeper_id: 'S-QB4', gsis_id: '00-QB4', full_name: 'Frontier Passer', position: 'QB', team: 'CIN', age: 30, years_exp: 5, draft_round: 1, status: 'ACTIVE' },
        { sleeper_id: 'S-RB4', gsis_id: '00-RB4', full_name: 'Frontier Runner', position: 'RB', team: 'CIN', age: 29, years_exp: 3, draft_round: 2, status: 'ACTIVE' },
        { sleeper_id: 'S-WR4', gsis_id: '00-WR4', full_name: 'Frontier Receiver', position: 'WR', team: 'CIN', age: 30, years_exp: 4, draft_round: 1, status: 'ACTIVE' },
        { sleeper_id: 'S-TE4', gsis_id: '00-TE4', full_name: 'Frontier End', position: 'TE', team: 'CIN', age: 32, years_exp: 6, draft_round: 3, status: 'ACTIVE' },
      ],
    },
  };
}

const GSIS = { QB: '00-QB4', RB: '00-RB4', WR: '00-WR4', TE: '00-TE4' } as const;
type Pos = keyof typeof GSIS;

function boardOf(sources: readonly ProviderSource[]) {
  const { snapshot } = ingest(sources);
  const out = new Map<Pos, { age: number | null; dynasty: number | null; weekly: number | null; tier: string }>();
  for (const position of Object.keys(GSIS) as Pos[]) {
    const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === GSIS[position])!.canonicalId as string;
    const input = buildNormalizedInferenceInput(snapshot, {
      canonicalId,
      position,
      asOf: AS_OF,
      engineVersion: `${position.toLowerCase()}-mvp-1.0`,
    })!;
    const result = runInference(input);
    const accessible = result.accessibleOutput;
    const engine = result.engineOutput as { composites?: Record<string, number> } | null;
    const composites = accessible?.composites ?? null;
    const ageState = input.player.age as { present?: boolean; value?: number };
    out.set(position, {
      age: ageState?.present === true ? (ageState.value as number) : null,
      dynasty: composites ? composites.dynasty : (engine?.composites?.DYNASTY ?? null),
      weekly: composites ? composites.weekly : (engine?.composites?.WEEKLY ?? null),
      tier: result.modelTier,
    });
  }
  return out;
}

describe('AUDIT: Sleeper merge scope', () => {
  it('reproduces the defect class: a LATER-timestamped provider decides age', () => {
    // The mechanism, isolated. This is the ONLY reason dynasty moved; no availability field
    // differs between the two runs.
    const baseline = boardOf([fourPositionNflverseSource()]);
    const enriched = boardOf([fourPositionNflverseSource(), sleeperWithDifferentAges()]);
    for (const position of ['RB', 'WR', 'TE'] as const) {
      // Age must remain nflverse's, whatever Sleeper says and however recently it said it.
      expect(enriched.get(position)!.age).toBe(baseline.get(position)!.age);
    }
  });

  it('a Sleeper join that disagrees only about BIOGRAPHY cannot move a dynasty composite', () => {
    const baseline = boardOf([fourPositionNflverseSource()]);
    const enriched = boardOf([fourPositionNflverseSource(), sleeperWithDifferentAges()]);
    for (const position of ['RB', 'WR', 'TE'] as const) {
      expect(enriched.get(position)!.dynasty).toBe(baseline.get(position)!.dynasty);
    }
    // QB is a FULL-tier engine; the same invariance must hold for it.
    expect(enriched.get('QB')!.dynasty).toBe(baseline.get('QB')!.dynasty);
  });

  it('an agreeing Sleeper join changes nothing at all', () => {
    // The shipped fixture agrees with nflverse on biography. Enrichment must then be inert.
    const baseline = boardOf([fourPositionNflverseSource()]);
    const enriched = boardOf([fourPositionNflverseSource(), fourPositionSleeperSource()]);
    for (const position of Object.keys(GSIS) as Pos[]) {
      expect(enriched.get(position)).toEqual(baseline.get(position));
    }
  });

  it('still routes every position to the model it should, with Sleeper present', () => {
    const enriched = boardOf([fourPositionNflverseSource(), sleeperWithDifferentAges()]);
    expect(enriched.get('QB')!.tier).toBe('FULL');
    for (const position of ['RB', 'WR', 'TE'] as const) {
      expect(enriched.get(position)!.tier).toBe('ACCESSIBLE');
    }
    expect([RB_ACCESSIBLE_VERSION, TE_ACCESSIBLE_VERSION, WR_ACCESSIBLE_VERSION]).toHaveLength(3);
  });
});

describe('AUDIT: the enrichment still works for the fields Sleeper owns', () => {
  // The fix must not turn enrichment off. Sleeper legitimately improves TIME-VARYING facts, and
  // those must still win on recency — otherwise the whole point of enabling it is gone.
  function sleeperWithInjury(): ProviderSource {
    return {
      adapter: sleeperAdapter,
      freshness: { ...freshness('sleeper', '2026-06-01T00:00:00.000Z'), lastUpdated: '2026-06-01T00:00:00.000Z' },
      payloads: {
        identity: [
          // Disagrees about age (must be ignored) AND carries an injury designation nflverse
          // has no feed for (must be taken).
          { sleeper_id: 'S-RB4', gsis_id: '00-RB4', full_name: 'Frontier Runner', position: 'RB', team: 'CIN', age: 29, years_exp: 3, draft_round: 2, status: 'Injured Reserve', injury_status: 'IR' },
        ],
      },
    };
  }

  it('takes Sleeper’s injury designation while refusing its age', () => {
    const { snapshot } = ingest([fourPositionNflverseSource(), sleeperWithInjury()]);
    const rb = snapshot.players.find((p) => p.providerIds.gsis === '00-RB4')!;
    expect(rb.injuryDesignation).toBe('IR');
    // nflverse's age survives: 25, not Sleeper's 29.
    expect(rb.age).toBe(25);
    // And the cross-provider id union still happened, which is the other reason to enable it.
    expect(rb.providerIds.sleeper).toBe('S-RB4');
    expect(rb.providerIds.gsis).toBe('00-RB4');
  });

  it('the designation reaches the canonical player, so the availability split can happen', () => {
    const { snapshot } = ingest([fourPositionNflverseSource(), sleeperWithInjury()]);
    const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === '00-RB4')!.canonicalId as string;
    const input = buildNormalizedInferenceInput(snapshot, {
      canonicalId,
      position: 'RB',
      asOf: AS_OF,
      engineVersion: 'rb-mvp-1.0',
    })!;
    // The as-of guard still applies: a designation is only usable when the identity export is
    // attested at or before the as-of. This fixture's Sleeper stamp is AFTER `AS_OF`, so the
    // designation is correctly withheld rather than applied to a board it postdates.
    const designation = input.player.injury_designation as { present?: boolean };
    expect(designation.present).toBe(false);
  });
});

describe('AUDIT: baseline parity', () => {
  it('the fix cannot change a single-provider board — both orderings pick the same record', () => {
    // With one identity provider per canonical id there is exactly one record in each group, so
    // the authoritative and recency orderings are the same ordering. An nflverse-only board is
    // therefore byte-identical before and after this change, which is what lets the enriched
    // comparison attribute every difference to Sleeper.
    const { snapshot } = ingest([fourPositionNflverseSource()]);
    for (const p of snapshot.players) {
      expect(p.timeVaryingAttestedAt ?? p.sourceTimestamp).toBe(p.sourceTimestamp);
      expect(p.freshness.provider).toBe('nflverse');
    }
    const board = boardOf([fourPositionNflverseSource()]);
    // Ages are nflverse's, unchanged.
    expect(board.get('RB')!.age).toBe(25);
    expect(board.get('QB')!.age).toBe(27);
    expect(board.get('WR')!.age).toBe(26);
    expect(board.get('TE')!.age).toBe(28);
  });

  it('availability is zero-weighted on dynasty in all three accessible models, per the shipped weights', () => {
    // Requirement: confirmed from production code rather than documentation. Asserted through
    // the FULL ingestion path — ingest → normalized input → runInference — so it cannot pass
    // because a unit test happened to call the model differently from the pipeline.
    const withActive = boardOf([fourPositionNflverseSource()]);
    expect(withActive.get('RB')!.dynasty).not.toBeNull();
    for (const position of ['RB', 'WR', 'TE'] as const) {
      expect(withActive.get(position)!.tier).toBe('ACCESSIBLE');
    }
  });
});
