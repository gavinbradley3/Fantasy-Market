import { describe, expect, it } from 'vitest';
import { runPipeline } from '@/pipeline/runPipeline';
import { runSnapStage } from '@/pipeline/snaps/runSnaps';
import { computeWrProxyRoutes } from '@/pipeline/snaps/proxyRegistry';
import { assessTEReadiness, assessWRReadiness } from '@/pipeline/readiness/engineReadiness';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import type { WRMetricsSupplement } from '@/pipeline/readiness/metrics';
import type { MetricsSupplements } from '@/pipeline/readiness/engineReadiness';
import {
  TEST_CONFIG,
  STATS_OPTIONS,
  bothFixtureSnapshots,
  buildStatsFixtureSnapshot,
  buildSnapFixtureSnapshot,
  loadIdentityMap,
  rawSnapPayload,
  readFixture,
} from '@/pipeline/test-support';

const T = '2026-07-01T00:00:00.000Z';

function authored(): MetricsSupplements {
  const raw = readFixture('metrics.sample.json') as Record<string, unknown>;
  return { wr: raw.wr as MetricsSupplements['wr'], rb: {}, te: {}, qb: raw.qb as MetricsSupplements['qb'] };
}

function player(id: string, position: SupportedPosition, gsis?: string): CanonicalPlayer {
  return {
    identity: { canonical_id: id, provider_ids: gsis ? { gsis } : { sleeper: '1' }, name_normalized: 'x', newly_created: false },
    position,
    full_name: present('Test', 'sleeper', T),
    team: present('ATL', 'sleeper', T),
    age: present(24, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(3, 'sleeper', T),
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

const pipelineInput = {
  snapshots: bothFixtureSnapshots(),
  identityMap: loadIdentityMap(),
  supplements: authored(),
  config: TEST_CONFIG,
  statsSnapshots: [buildStatsFixtureSnapshot()],
  statsOptions: STATS_OPTIONS,
  snapSnapshots: [buildSnapFixtureSnapshot()],
  snapOptions: STATS_OPTIONS,
};

describe('snap stage integration (fixture, offline)', () => {
  it('joins by GSIS and supplies direct snap-share metrics honestly', () => {
    const { report } = runPipeline(pipelineInput);
    const s = report.snapStage!;
    expect(s.canonicalJoins).toBe(5);
    expect(s.identityCollisions).toBe(0);
    expect(s.directMetricsSupplied).toBeGreaterThan(0); // RB×3 + TE×1
    expect(s.proxyMetricsSupplied).toBe(0); // no pipeline proxy activated (pass snaps absent)
    // Honest: snap-share fields are nullable, so no readiness BLOCKER is removed.
    expect(s.playersNewlyReady).toBe(0);
    expect(s.canonicalPlayersWithoutGsis).toBe(1); // Nabers
  });

  it('reports a direct snap field as SUPPLIED for the RB (availability gap closed)', () => {
    const { snapResult } = runPipeline(pipelineInput);
    const rb = snapResult!.perPlayerFields.find((p) => p.position === 'RB');
    const s4 = rb?.fields.find((f) => f.field === 'snap_share_last4');
    expect(s4?.availability).toBe('SUPPLIED');
    expect(s4?.provenance).toBe('DIRECT');
  });

  it('fails safe on an identity collision', () => {
    const players = [player('pt_a', 'RB', '00-0038542'), player('pt_b', 'RB', '00-0038542')];
    const res = runSnapStage(players, [buildSnapFixtureSnapshot()], STATS_OPTIONS);
    expect(res.join.identityCollisions).toEqual(['00-0038542']);
  });

  it('is deterministic and order-independent (shuffled snap rows → identical aggregates)', () => {
    const a = runPipeline(pipelineInput);
    const shuffled = [...(rawSnapPayload() as unknown[])].reverse();
    const snap = buildSnapFixtureSnapshot();
    const b = runPipeline({
      ...pipelineInput,
      snapSnapshots: [{ metadata: { ...snap.metadata, checksum: 'x', recordCount: shuffled.length }, payload: shuffled }],
    });
    expect(JSON.stringify(a.report.snapStage!.recordsByPosition)).toBe(
      JSON.stringify(b.report.snapStage!.recordsByPosition),
    );
    expect(a.report.snapStage!.directMetricsSupplied).toBe(b.report.snapStage!.directMetricsSupplied);
  });

  it('AUTHORIZED proxy removes a permitted gap: a WR PROXY career_routes satisfies readiness', () => {
    const raw = readFixture('metrics.sample.json') as { wr: Record<string, WRMetricsSupplement> };
    const full = raw.wr.pt_0001;
    const proxy = computeWrProxyRoutes('WR', 800); // hypothetical pass snaps → PROXY routes
    expect(proxy.ok).toBe(true);
    if (!proxy.ok) return;
    // Without routes → NOT_READY; with the authorized PROXY value → READY.
    const withoutRoutes = { ...full } as Record<string, unknown>;
    delete withoutRoutes.career_routes;
    expect(assessWRReadiness(player('pt_w', 'WR'), withoutRoutes as WRMetricsSupplement, '2026-07-01').status).toBe('NOT_READY');
    const withProxy = { ...withoutRoutes, career_routes: proxy.value } as WRMetricsSupplement;
    expect(assessWRReadiness(player('pt_w', 'WR'), withProxy, '2026-07-01').status).toBe('READY');
  });

  it('UNAUTHORIZED proxy does not satisfy readiness: TE routes are not filled from the WR rule', () => {
    // The WR 0.97 rule is unauthorized for TE — no value is produced to fill routes.
    expect(computeWrProxyRoutes('TE', 800).ok).toBe(false);
    // A TE fed only snap data keeps career_routes missing → NOT_READY.
    const res = runSnapStage([player('pt_t', 'TE', '00-0039051')], [buildSnapFixtureSnapshot()], STATS_OPTIONS);
    const teSupp = res.supplements.te?.['pt_t'] ?? {};
    expect('career_routes' in teSupp).toBe(false);
    expect(assessTEReadiness(player('pt_t', 'TE', '00-0039051'), teSupp, '2026-07-01').status).toBe('NOT_READY');
  });
});
