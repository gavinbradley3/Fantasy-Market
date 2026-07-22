// Correction 2 — end-to-end regression for the audit's competition double-count.
// A WR subject with one real same-team teammate must produce IDENTICAL competition
// evidence and AIL output whether the teammate's identity is supplied by one provider
// or by two providers that resolve to the same canonical id.

import { describe, expect, it } from 'vitest';
import { runInference } from '@/inference/production/runInference';
import { ingest, buildNormalizedInferenceInput } from './buildInput';
import type { ProviderSource } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import { sleeperAdapter } from './adapters/sleeper';
import { freshness, AS_OF } from './__fixtures';

// Two WRs on CIN: W1 (subject) + W2 (teammate).
function nfl(): ProviderSource {
  return {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [
        { gsis_id: '00-W1', player_name: 'Wr One', position: 'WR', team: 'CIN', age: 26, draft_round: 1, status: 'ACTIVE' },
        { gsis_id: '00-W2', player_name: 'Wr Two', position: 'WR', team: 'CIN', age: 25, draft_round: 2, status: 'ACTIVE' },
      ],
    },
  };
}
// Sleeper lists the SAME two players, cross-linked by gsis → same canonical ids.
function slp(): ProviderSource {
  return {
    adapter: sleeperAdapter,
    freshness: freshness('sleeper'),
    payloads: {
      identity: [
        { sleeper_id: 'S-W1', gsis_id: '00-W1', full_name: 'Wr One', position: 'WR', team: 'CIN', age: 26, draft_round: 1, status: 'ACTIVE' },
        { sleeper_id: 'S-W2', gsis_id: '00-W2', full_name: 'Wr Two', position: 'WR', team: 'CIN', age: 25, draft_round: 2, status: 'ACTIVE' },
      ],
    },
  };
}

const subjectId = (snap: ReturnType<typeof ingest>['snapshot']) =>
  snap.players.find((p) => p.providerIds.gsis === '00-W1')!.canonicalId!;

describe('competition does not scale with provider count (Correction 2, e2e)', () => {
  it('teammate count and competition evidence are identical for 1 vs 2 identity providers', () => {
    const one = ingest([nfl()]).snapshot;
    const two = ingest([nfl(), slp()]).snapshot;

    const inOne = buildNormalizedInferenceInput(one, { canonicalId: subjectId(one), position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' })!;
    const inTwo = buildNormalizedInferenceInput(two, { canonicalId: subjectId(two), position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' })!;

    const compOne = inOne.evidence.competition as unknown as { teammates: unknown[] };
    const compTwo = inTwo.evidence.competition as unknown as { teammates: unknown[] };
    expect(compOne.teammates.length).toBe(1);
    expect(compTwo.teammates.length).toBe(1); // was 2 before the fix
    expect(compTwo).toEqual(compOne); // byte-equal competition evidence

    // The value-bearing AIL result is identical (subject id is stable across provider
    // count). The output CHECKSUM legitimately differs, because it hashes provenance
    // that honestly differs — the snapshot id and the provider-id union — which is a
    // permitted provenance-only difference, not a value change.
    const resOne = runInference(inOne);
    const resTwo = runInference(inTwo);
    expect(resTwo.mergedSupplement).toEqual(resOne.mergedSupplement);
    expect(resTwo.engineOutput).toEqual(resOne.engineOutput);
    expect(resTwo.readinessStatus).toBe(resOne.readinessStatus);
    expect(resTwo.honestyState).toBe(resOne.honestyState);
    expect(resTwo.inferredFields).toEqual(resOne.inferredFields);
  });
});
