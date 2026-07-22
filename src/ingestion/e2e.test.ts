// End-to-end: provider payloads → ingest → NormalizedInferenceInput → runInference.
// Proves the ingestion layer feeds the FROZEN AIL with no provider leakage, and that
// the whole path is deterministic and replayable.

import { describe, expect, it } from 'vitest';
import { runInference } from '@/inference/production/runInference';
import { ingest, buildNormalizedInferenceInput } from './buildInput';
import type { NormalizedSnapshot } from './snapshot';
import { nflverseSource, sleeperSource, AS_OF, freshness } from './__fixtures';
import { nflverseAdapter } from './adapters/nflverse';

function wrId(snapshot: NormalizedSnapshot): string {
  return snapshot.players.find((p) => p.providerIds.gsis === '00-WR')!.canonicalId!;
}
function qbId(snapshot: NormalizedSnapshot): string {
  return snapshot.players.find((p) => p.providerIds.gsis === '00-QB')!.canonicalId!;
}

describe('ingestion → runInference (end-to-end)', () => {
  it('WR: provider data flows to the AIL; D1 runs; result is well-formed', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const input = buildNormalizedInferenceInput(snapshot, { canonicalId: wrId(snapshot), position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' });
    expect(input).not.toBeNull();
    const res = runInference(input!);
    expect(res.playerId).toBe(wrId(snapshot));
    expect(res.position).toBe('WR');
    // D1 executed inside production from ingested participation.
    expect(res.d1Diagnostics).not.toBeNull();
    // schedule → expected games remaining is an emitted inferred field.
    expect(res.inferredFields.some((f) => f.field === 'expected_games_remaining')).toBe(true);
    // a live WR without complete observed facts is honestly NOT_READY (frontier).
    expect(res.readinessStatus).toBe('NOT_READY');
    expect(res.serialized.length).toBeGreaterThan(0);
    expect(res.normalizedInputChecksum).not.toBe(res.outputChecksum);
    // no provider-specific key leaked into the merged supplement.
    expect(JSON.stringify(res.mergedSupplement).includes('gsis')).toBe(false);
    expect(JSON.stringify(res.mergedSupplement).includes('sleeper')).toBe(false);
  });

  it('QB: official starts flow through D2 (DERIVED, official)', () => {
    const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
    const input = buildNormalizedInferenceInput(snapshot, { canonicalId: qbId(snapshot), position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0' })!;
    const res = runInference(input);
    expect(res.d2Diagnostics).not.toBeNull();
    expect(res.d2Diagnostics?.startsOfficial).toBe(true); // official-starts feed present
    expect(res.inferredFields.find((f) => f.field === 'career_starts')?.provenance).toBe('DERIVED');
  });

  it('replay determinism: identical payloads → identical checksums & reproducibility id', () => {
    const build = () => {
      const { snapshot } = ingest([nflverseSource(), sleeperSource()]);
      return runInference(buildNormalizedInferenceInput(snapshot, { canonicalId: wrId(snapshot), position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' })!);
    };
    const a = build();
    const b = build();
    expect(a.normalizedInputChecksum).toBe(b.normalizedInputChecksum);
    expect(a.outputChecksum).toBe(b.outputChecksum);
    expect(a.serialized).toBe(b.serialized);
    expect(a.reproducibility).toEqual(b.reproducibility);
  });

  it('multi-provider consistency: dropping the sleeper source keeps the same canonical id (nflverse alone)', () => {
    const both = ingest([nflverseSource(), sleeperSource()]);
    const nflOnly = ingest([nflverseSource()]);
    expect(wrId(nflOnly.snapshot)).toBe(wrId(both.snapshot)); // gsis-derived id is stable
  });

  it('future-dated game cannot influence the result (as-of enforcement in evidence + fact clamp)', () => {
    // Add a future game stat row (kickoff after AS_OF) for the WR.
    const future = {
      adapter: nflverseAdapter,
      freshness: freshness('nflverse'),
      payloads: { games: [{ gsis_id: '00-WR', game_id: '2025_20_CIN', kickoff: '2025-12-25T17:00:00.000Z', season: 2025, season_type: 'REG', team: 'CIN', targets: 99, snaps: 60, team_snaps: 65 }] },
    };
    const withFuture = ingest([nflverseSource(), sleeperSource(), future]);
    const baseline = ingest([nflverseSource(), sleeperSource()]);
    const resF = runInference(buildNormalizedInferenceInput(withFuture.snapshot, { canonicalId: wrId(withFuture.snapshot), position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' })!);
    const resB = runInference(buildNormalizedInferenceInput(baseline.snapshot, { canonicalId: wrId(baseline.snapshot), position: 'WR', asOf: AS_OF, engineVersion: 'wr-mvp-1.0' })!);
    // The future game is excluded from the player's evidence (kickoff > asOf), so the
    // inference RESULT is byte-identical: merged supplement, readiness, honesty, engine.
    expect(resF.mergedSupplement).toEqual(resB.mergedSupplement);
    expect(resF.readinessStatus).toBe(resB.readinessStatus);
    expect(resF.honestyState).toBe(resB.honestyState);
    expect(resF.engineOutput).toEqual(resB.engineOutput);
    // The snapshot id legitimately differs (the snapshot's content changed), so the
    // reproducibility checksum differs — provenance is honest, values are not affected.
    expect(resF.normalizedInputChecksum).not.toBe(resB.normalizedInputChecksum);
  });

  it('diagnostics report providers used and warnings without affecting determinism', () => {
    const { diagnostics } = ingest([nflverseSource(), sleeperSource()]);
    expect(diagnostics.providersUsed).toEqual(['nflverse', 'sleeper']);
    expect(diagnostics.discardedCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(diagnostics.warnings)).toBe(true);
  });
});
