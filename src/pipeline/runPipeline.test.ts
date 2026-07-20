import { describe, expect, it } from 'vitest';
import { runPipeline } from '@/pipeline/runPipeline';
import { verifySnapshot } from '@/pipeline/snapshot';
import {
  TEST_CONFIG,
  bothFixtureSnapshots,
  loadIdentityMap,
  readFixture,
} from '@/pipeline/test-support';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';

function metrics(): MetricsSupplements {
  const raw = readFixture('metrics.sample.json') as Record<string, unknown>;
  return { wr: raw.wr as MetricsSupplements['wr'], rb: {}, te: {} };
}

describe('runPipeline (fixture, offline)', () => {
  const input = {
    snapshots: bothFixtureSnapshots(),
    identityMap: loadIdentityMap(),
    supplements: metrics(),
    config: TEST_CONFIG,
  };

  it('runs the full fixture pipeline to a healthy report', () => {
    const { report } = runPipeline(input);
    expect(report.ok).toBe(true);
    expect(report.canonicalPlayersGenerated).toBe(9);
    expect(report.countsByPosition).toEqual({ QB: 1, RB: 1, WR: 6, TE: 1 });
  });

  it('resolves identities per the audit priority', () => {
    const { report } = runPipeline(input);
    expect(report.persistedMatches).toBe(1); // Chase pinned to pt_0001
    expect(report.crossProviderMatches).toBe(4);
    expect(report.ambiguousNameCollisions).toBe(1); // the two Mike Williams
    expect(report.duplicateCanonicalIds).toBe(0);
    expect(report.metadataConflicts).toBeGreaterThanOrEqual(1); // Diontae team + status
  });

  it('reports engine readiness including the QB engine gap', () => {
    const { report, readiness } = runPipeline(input);
    expect(report.engineReadyPlayers).toBe(1); // only the supplemented WR
    expect(report.engineUnavailablePlayers).toBe(1); // QB
    expect(readiness.find((r) => r.canonicalId === 'pt_0001')?.status).toBe('READY');
    expect(readiness.find((r) => r.position === 'QB')?.status).toBe('ENGINE_UNAVAILABLE');
  });

  it('is deterministic: identical input yields identical output', () => {
    const a = runPipeline(input);
    const b = runPipeline(input);
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
    expect(JSON.stringify(a.canonicalPlayers)).toBe(JSON.stringify(b.canonicalPlayers));
  });

  it('counts adapter rejections without crashing', () => {
    const { report } = runPipeline(input);
    expect(report.totalRejected).toBe(4);
    expect(report.rejectedRecords.some((r) => r.reason === 'MALFORMED')).toBe(true);
  });

  it('marks the run failed when a snapshot integrity check fails', () => {
    const { report } = runPipeline({ ...input, integrityFailures: ['checksum mismatch for sleeper'] });
    expect(report.ok).toBe(false);
  });

  it('marks the run failed when no records load', () => {
    const { report } = runPipeline({ ...input, snapshots: [] });
    expect(report.ok).toBe(false);
  });

  it('loads and verifies the committed snapshot files', () => {
    for (const provider of ['sleeper', 'nflverse'] as const) {
      const result = verifySnapshot(readFixture('snapshots', `${provider}.snapshot.json`));
      expect(result.ok).toBe(true);
    }
  });
});
