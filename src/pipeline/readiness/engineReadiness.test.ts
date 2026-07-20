import { describe, expect, it } from 'vitest';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import {
  assessRBReadiness,
  assessReadiness,
  assessTEReadiness,
  assessWRReadiness,
} from '@/pipeline/readiness/engineReadiness';
import type { WRMetricsSupplement } from '@/pipeline/readiness/metrics';
import { evaluateWideReceiver } from '@/wr-model';
import { readFixture } from '@/pipeline/test-support';

const T = '2026-07-01T00:00:00.000Z';

function player(position: SupportedPosition, overrides: Partial<CanonicalPlayer> = {}): CanonicalPlayer {
  const base: CanonicalPlayer = {
    identity: { canonical_id: 'pt_test', provider_ids: { sleeper: '1' }, name_normalized: 'test player', newly_created: false },
    position,
    full_name: present('Test Player', 'sleeper', T),
    team: present('CIN', 'sleeper', T),
    age: present(25, 'sleeper', T),
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
  return { ...base, ...overrides };
}

const wrSupplement = () =>
  (readFixture('metrics.sample.json') as { wr: Record<string, WRMetricsSupplement> }).wr.pt_0001;

describe('engine readiness', () => {
  it('reports a metadata-only WR as NOT_READY with staged missing fields', () => {
    const r = assessWRReadiness(player('WR'), null, T);
    expect(r.status).toBe('NOT_READY');
    if (r.status === 'NOT_READY') {
      expect(r.presentMetadata).toContain('full_name');
      expect(r.missing.some((m) => m.field === 'career_routes' && m.suppliedBy === 'stats')).toBe(true);
      expect(r.missing.some((m) => m.field === 'expected_games_remaining' && m.suppliedBy === 'projections')).toBe(true);
    }
  });

  it('maps a canonical WR + complete supplement into a runnable engine input', () => {
    const r = assessWRReadiness(player('WR'), wrSupplement(), T);
    expect(r.status).toBe('READY');
    if (r.status === 'READY') {
      expect(r.input.player_id).toBe('pt_test');
      expect(r.input.injury_status).toBe('HEALTHY');
      expect(r.input.draft_round).toBe(1);
      // The frozen engine accepts the assembled input and produces output.
      const output = evaluateWideReceiver(r.input);
      expect(output.schema_version).toBe('wr-mvp-1.0');
      expect(output.player_id).toBe('pt_test');
      expect(Number.isFinite(output.composites.DYNASTY)).toBe(true);
    }
  });

  it('blocks readiness when required metadata is missing, even with a supplement', () => {
    const r = assessWRReadiness(player('WR', { age: notProvided(), full_name: notProvided() }), wrSupplement(), T);
    expect(r.status).toBe('NOT_READY');
    if (r.status === 'NOT_READY') {
      expect(r.missing.some((m) => m.field === 'age' && m.suppliedBy === 'metadata')).toBe(true);
      expect(r.missing.some((m) => m.field === 'full_name' && m.suppliedBy === 'metadata')).toBe(true);
    }
  });

  it('reports RB and TE metadata-only players as NOT_READY', () => {
    expect(assessRBReadiness(player('RB'), null, T).status).toBe('NOT_READY');
    expect(assessTEReadiness(player('TE'), null, T).status).toBe('NOT_READY');
  });

  it('reports QB as ENGINE_UNAVAILABLE (no QB engine in this repo yet)', () => {
    const r = assessReadiness(player('QB'), {}, T);
    expect(r.status).toBe('ENGINE_UNAVAILABLE');
    expect(r.missing).toHaveLength(0);
  });

  it('derives injury_status from canonical status and designation', () => {
    const injured = player('WR', {
      status: present('injured', 'sleeper', T),
      injury_designation: present('Doubtful', 'sleeper', T),
    });
    const r = assessWRReadiness(injured, wrSupplement(), T);
    expect(r.status === 'READY' && r.input.injury_status).toBe('DOUBTFUL');
  });
});
