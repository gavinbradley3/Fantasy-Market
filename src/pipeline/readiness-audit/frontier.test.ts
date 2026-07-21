import { describe, expect, it } from 'vitest';
import { computeFrontier } from '@/pipeline/readiness-audit/frontier';
import type { ReadinessSummary, MissingRequirement } from '@/pipeline/readiness/engineReadiness';
import type { SupportedPosition } from '@/pipeline/types';

function miss(field: string, suppliedBy: MissingRequirement['suppliedBy']): MissingRequirement {
  return { field, suppliedBy, reason: 'x' };
}

function nr(id: string, position: SupportedPosition, missing: MissingRequirement[]): ReadinessSummary {
  return { canonicalId: id, position, status: 'NOT_READY', presentMetadata: [], missing };
}

function ready(id: string, position: SupportedPosition): ReadinessSummary {
  return { canonicalId: id, position, status: 'READY', presentMetadata: [], missing: [] };
}

const T = '2026-07-01T00:00:00.000Z';

describe('readiness frontier (player-level counterfactuals)', () => {
  it('a player with only a context blocker becomes ready after context', () => {
    const f = computeFrontier([nr('p1', 'WR', [miss('competition_pressure', 'context')])], T);
    const p = f.players[0];
    expect(p.readyAfter.CONTEXT_ONLY).toBe(true);
    expect(p.readyAfter.PROJECTIONS_ONLY).toBe(false);
    expect(f.scenarioReadyCounts.CONTEXT_ONLY).toBe(1);
  });

  it('a player with only a projection blocker becomes ready after projections', () => {
    const f = computeFrontier([nr('p1', 'WR', [miss('projected_team_dropbacks', 'projections')])], T);
    expect(f.players[0].readyAfter.PROJECTIONS_ONLY).toBe(true);
    expect(f.players[0].readyAfter.CONTEXT_ONLY).toBe(false);
  });

  it('stats + context blockers: context alone is not enough', () => {
    const f = computeFrontier([nr('p1', 'RB', [miss('career_touches', 'stats'), miss('role_change', 'context')])], T);
    const p = f.players[0];
    expect(p.readyAfter.CONTEXT_ONLY).toBe(false);
    expect(p.readyAfter.STATS_FREE).toBe(false);
    // career_touches is free stats, role_change is context → all-free-solvable? role_change is AUTHORED → not free.
    expect(p.readyAfter.ALL_FREE_SOLVABLE).toBe(false);
    expect(p.readyAfter.AUTHORED_SUPPLEMENT).toBe(true);
  });

  it('projections + unavailable route: not ready after ctx+proj, ready after free+spec', () => {
    const f = computeFrontier(
      [nr('p1', 'WR', [miss('projected_team_dropbacks', 'projections'), miss('career_routes', 'stats')])],
      T,
    );
    const p = f.players[0];
    expect(p.readyAfter.CONTEXT_PLUS_PROJECTIONS).toBe(false); // career_routes is stats
    expect(p.readyAfter.FREE_PLUS_SPEC_FALLBACK).toBe(true); // routes spec-fallback + projections free
    expect(p.finalBlockersAfterContextProjections).toEqual(['career_routes']);
  });

  it('identifies universal blockers and most-frequent blockers', () => {
    const f = computeFrontier(
      [
        nr('a', 'WR', [miss('career_routes', 'stats'), miss('competition_pressure', 'context')]),
        nr('b', 'WR', [miss('career_routes', 'stats'), miss('practice_status', 'context')]),
      ],
      T,
    );
    expect(f.universalBlockersByPosition.WR).toEqual(['career_routes']);
    expect(f.mostFrequentBlockers[0]).toEqual({ field: 'career_routes', players: 2 });
  });

  it('counts blocker combinations and computes final blockers after both stages', () => {
    const f = computeFrontier(
      [
        nr('a', 'QB', [miss('career_starts', 'stats'), miss('depth_chart_status', 'context')]),
        nr('b', 'QB', [miss('career_starts', 'stats'), miss('depth_chart_status', 'context')]),
      ],
      T,
    );
    expect(f.blockerCombinations[0].players).toBe(2);
    expect(f.finalBlockersAfterContextProjections).toEqual(['career_starts']);
  });

  it('produces position summaries and handles an already-ready player', () => {
    const f = computeFrontier([ready('r', 'QB'), nr('n', 'WR', [miss('career_routes', 'stats')])], T);
    const qb = f.positionSummaries.find((p) => p.position === 'QB')!;
    expect(qb.currentlyReady).toBe(1);
    expect(qb.readyAfter.CONTEXT_ONLY).toBe(1);
    const wr = f.positionSummaries.find((p) => p.position === 'WR')!;
    expect(wr.currentlyReady).toBe(0);
  });

  it('handles an empty player set', () => {
    const f = computeFrontier([], T);
    expect(f.playersAssessed).toBe(0);
    expect(f.scenarioReadyCounts.AUTHORED_SUPPLEMENT).toBe(0);
    expect(f.positionSummaries).toHaveLength(4); // one per supported position
  });

  it('is deterministic (repeated computation is byte-identical)', () => {
    const input = [
      nr('z', 'TE', [miss('career_routes', 'stats'), miss('prospect_type', 'context')]),
      nr('a', 'WR', [miss('career_routes', 'stats')]),
    ];
    const a = computeFrontier(input, T);
    const b = computeFrontier(input, T);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Deterministic ordering by canonical id.
    expect(a.players.map((p) => p.canonicalId)).toEqual(['a', 'z']);
  });
});
