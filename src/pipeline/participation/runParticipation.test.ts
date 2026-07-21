import { describe, expect, it } from 'vitest';
import { runParticipationStage } from '@/pipeline/participation/runParticipation';
import { buildParticipationSupplement } from '@/pipeline/participation/supplements';
import { assessWRReadiness } from '@/pipeline/readiness/engineReadiness';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import type { WRMetricsSupplement } from '@/pipeline/readiness/metrics';
import type { PlayerParticipationAggregate } from '@/pipeline/participation/types';
import { buildParticipationFixtureSnapshot, rawParticipationPayload, readFixture } from '@/pipeline/test-support';

const T = '2026-07-01T00:00:00.000Z';

function player(id: string, position: SupportedPosition, gsis: string, rookieYear: number): CanonicalPlayer {
  return {
    identity: { canonical_id: id, provider_ids: { gsis }, name_normalized: 'x', newly_created: false },
    position,
    full_name: present('Test', 'sleeper', T),
    team: present('CIN', 'sleeper', T),
    age: present(25, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(3, 'sleeper', T),
    rookie_year: present(rookieYear, 'nflverse', T),
    draft_year: present(rookieYear, 'nflverse', T),
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

// A full WR supplement with career_routes removed — the only remaining gap.
function wrSupplementWithoutRoutes(): Partial<WRMetricsSupplement> {
  const raw = readFixture('metrics.sample.json') as { wr: Record<string, WRMetricsSupplement> };
  const supp = { ...raw.wr.pt_0001 } as Record<string, unknown>;
  delete supp.career_routes;
  return supp as Partial<WRMetricsSupplement>;
}

const chase = player('pt_0001', 'WR', '00-0036900', 2021);

describe('participation stage (coverage-aware WR route proxy)', () => {
  it('COMPLETE (as-of ≤ 2023): supplies a PROXY career_routes that removes the blocker', () => {
    const res = runParticipationStage([chase], [buildParticipationFixtureSnapshot()], { currentSeason: 2023 });
    expect(res.completeRouteValues).toBe(1);
    expect(res.blockersSatisfied).toBe(1);
    const routes = res.supplements.wr?.['pt_0001']?.career_routes;
    expect(routes).toBeCloseTo(7 * 0.97, 6); // 7 qualifying participations × 0.97, full precision
    // Merged with the rest of the WR supplement → READY (blocker removed).
    const merged = { ...wrSupplementWithoutRoutes(), ...res.supplements.wr!['pt_0001'] } as WRMetricsSupplement;
    expect(assessWRReadiness(chase, merged, '2023-09-01').status).toBe('READY');
  });

  it('PARTIAL (as-of 2025): supplies NO career_routes and removes no blocker', () => {
    const res = runParticipationStage([chase], [buildParticipationFixtureSnapshot()], { currentSeason: 2025 });
    expect(res.completeRouteValues).toBe(0);
    expect(res.partialRouteValues).toBe(1);
    expect(res.blockersSatisfied).toBe(0);
    expect(res.supplements.wr?.['pt_0001']).toBeUndefined();
    // The WR stays NOT_READY — a partial proxy must not satisfy a full-career field.
    expect(assessWRReadiness(chase, wrSupplementWithoutRoutes(), '2025-09-01').status).toBe('NOT_READY');
  });

  it('does NOT apply the WR proxy to RB, TE, or QB', () => {
    for (const pos of ['RB', 'TE', 'QB'] as const) {
      const agg: PlayerParticipationAggregate = {
        canonicalId: 'pt_z',
        position: pos,
        gsis: 'G',
        qualifyingPassPlayParticipations: 500,
        coverage: { state: 'COMPLETE', firstCoveredSeason: 2021, lastCoveredSeason: 2023, coveredGames: 40, careerStartSeason: 2021, asOfSeason: 2023 },
      };
      const built = buildParticipationSupplement(agg);
      expect(built.satisfiedBlocker).toBe(false);
      expect(Object.keys(built.supplement)).toHaveLength(0);
      expect(built.fields[0].availability).toBe('NOT_APPLICABLE');
    }
  });

  it('never populates QB starts from participation presence', () => {
    const agg: PlayerParticipationAggregate = {
      canonicalId: 'pt_qb',
      position: 'QB',
      gsis: 'G',
      qualifyingPassPlayParticipations: 600,
      coverage: { state: 'COMPLETE', firstCoveredSeason: 2018, lastCoveredSeason: 2023, coveredGames: 90, careerStartSeason: 2018, asOfSeason: 2023 },
    };
    const built = buildParticipationSupplement(agg);
    expect('career_starts' in built.supplement).toBe(false);
    expect('recent_starts' in built.supplement).toBe(false);
    expect(built.fields[0].reason).toContain('not an official start');
  });

  it('is deterministic and order-independent (shuffled plays → identical aggregate)', () => {
    const a = runParticipationStage([chase], [buildParticipationFixtureSnapshot()], { currentSeason: 2023 });
    const shuffled = [...(rawParticipationPayload() as unknown[])].reverse();
    const snap = buildParticipationFixtureSnapshot();
    const b = runParticipationStage([chase], [{ metadata: { ...snap.metadata, checksum: 'x', recordCount: shuffled.length }, payload: shuffled }], { currentSeason: 2023 });
    expect(JSON.stringify(a.supplements)).toBe(JSON.stringify(b.supplements));
  });
});
