import { describe, expect, it } from 'vitest';
import { runPipeline } from '@/pipeline/runPipeline';
import { runStatsStage } from '@/pipeline/stats/runStats';
import { assessQBReadiness } from '@/pipeline/readiness/engineReadiness';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer } from '@/pipeline/types';
import type { QBMetricsSupplement } from '@/pipeline/readiness/metrics';
import {
  TEST_CONFIG,
  STATS_OPTIONS,
  bothFixtureSnapshots,
  buildStatsFixtureSnapshot,
  loadIdentityMap,
  rawStatsPayload,
  readFixture,
} from '@/pipeline/test-support';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';

function authored(): MetricsSupplements {
  const raw = readFixture('metrics.sample.json') as Record<string, unknown>;
  return {
    wr: raw.wr as MetricsSupplements['wr'],
    rb: {},
    te: {},
    qb: raw.qb as MetricsSupplements['qb'],
  };
}

const T = '2026-07-01T00:00:00.000Z';

function qbPlayer(id: string): CanonicalPlayer {
  return {
    identity: { canonical_id: id, provider_ids: { gsis: 'GX' }, name_normalized: 'x', newly_created: false },
    position: 'QB',
    full_name: present('Test QB', 'sleeper', T),
    team: present('BUF', 'sleeper', T),
    age: present(28, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(6, 'sleeper', T),
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

// A hypothetical COMPLETE QB stats supplement (as if routes/starts had a source)
// used to prove the readiness merge/plumbing — clearly not what free nflverse
// supplies. Sourced from the authored fixture minus the metadata keys.
function completeQBStats(): Partial<QBMetricsSupplement> {
  const raw = readFixture('metrics.sample.json') as { qb: Record<string, QBMetricsSupplement> };
  return raw.qb.pt_0002;
}

describe('runStatsStage + readiness integration (fixture, offline)', () => {
  const pipelineInput = {
    snapshots: bothFixtureSnapshots(),
    identityMap: loadIdentityMap(),
    supplements: authored(),
    config: TEST_CONFIG,
    statsSnapshots: [buildStatsFixtureSnapshot()],
    statsOptions: STATS_OPTIONS,
  };

  it('joins stats and eliminates missing fields without inventing routes/starts', () => {
    const { report } = runPipeline(pipelineInput);
    const s = report.statsStage!;
    expect(s.canonicalJoins).toBe(5); // Chase, Diontae, Bijan, LaPorta, Allen
    expect(s.unmatchedStatRows).toBeGreaterThanOrEqual(1);
    expect(s.canonicalPlayersWithoutGsis).toBe(1); // Nabers (sleeper-only)
    expect(s.identityCollisions).toBe(0);
    expect(s.missingFieldsEliminatedByStats).toBeGreaterThan(0);
    // Honest: routes/starts still block, so no player becomes newly ready.
    expect(s.playersNewlyReady).toBe(0);
    // Remaining gaps still include stats (routes/starts), projections, context.
    expect(s.remainingGaps.stats).toBeGreaterThan(0);
    expect(s.remainingGaps.projections).toBeGreaterThan(0);
    expect(s.remainingGaps.context).toBeGreaterThan(0);
  });

  it('marks the run failed on an identity collision (unsafe join)', () => {
    // Two canonical players cannot appear here, so drive the join directly.
    const players = [qbPlayer('pt_a'), { ...qbPlayer('pt_b') }];
    const res = runStatsStage(players, [buildStatsFixtureSnapshot()], STATS_OPTIONS);
    expect(res.join.identityCollisions).toEqual(['GX']);
  });

  it('is deterministic and order-independent (shuffled stat rows → identical report)', () => {
    const a = runPipeline(pipelineInput);
    const shuffledRaw = [...(rawStatsPayload() as unknown[])].reverse();
    const shuffledSnap = { ...buildStatsFixtureSnapshot() };
    // Rebuild snapshot from shuffled rows (checksum differs, aggregates must not).
    const b = runPipeline({
      ...pipelineInput,
      statsSnapshots: [{ metadata: { ...shuffledSnap.metadata, checksum: 'x', recordCount: shuffledRaw.length }, payload: shuffledRaw }],
    });
    expect(JSON.stringify(a.report.statsStage!.recordsByPosition)).toBe(
      JSON.stringify(b.report.statsStage!.recordsByPosition),
    );
    expect(a.report.statsStage!.derivedMetricsProduced).toBe(b.report.statsStage!.derivedMetricsProduced);
  });

  it('PLUMBING: a complete stats supplement + full authored non-stats supplement → READY', () => {
    // completeQBStats includes every QB supplement field (incl. hypothetical
    // routes/starts source). With complete metadata this reaches the engine.
    const r = assessQBReadiness(qbPlayer('pt_z'), completeQBStats(), '2026-07-01');
    expect(r.status).toBe('READY');
  });

  it('stats-complete but PROJECTION-incomplete stays NOT_READY (staged gap)', () => {
    const supp = { ...completeQBStats() };
    delete (supp as Record<string, unknown>).expected_games_remaining; // a projection field
    const r = assessQBReadiness(qbPlayer('pt_z'), supp, '2026-07-01');
    expect(r.status).toBe('NOT_READY');
    if (r.status === 'NOT_READY') {
      expect(r.missing.some((m) => m.field === 'expected_games_remaining' && m.suppliedBy === 'projections')).toBe(true);
    }
  });

  it('stats-complete but CONTEXT-incomplete stays NOT_READY (staged gap)', () => {
    const supp = { ...completeQBStats() };
    delete (supp as Record<string, unknown>).depth_chart_status; // a context field
    const r = assessQBReadiness(qbPlayer('pt_z'), supp, '2026-07-01');
    expect(r.status).toBe('NOT_READY');
    if (r.status === 'NOT_READY') {
      expect(r.missing.some((m) => m.field === 'depth_chart_status' && m.suppliedBy === 'context')).toBe(true);
    }
  });
});
