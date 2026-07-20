import { describe, expect, it } from 'vitest';
import { joinStats } from '@/pipeline/stats/join';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer, ProviderIds, SupportedPosition } from '@/pipeline/types';
import type { WeeklyStatRecord } from '@/pipeline/stats/types';

const T = '2026-07-01T00:00:00.000Z';

function player(id: string, position: SupportedPosition, providerIds: ProviderIds): CanonicalPlayer {
  return {
    identity: { canonical_id: id, provider_ids: providerIds, name_normalized: id, newly_created: false },
    position,
    full_name: present('Test', 'sleeper', T),
    team: present('CIN', 'sleeper', T),
    age: present(25, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(4, 'sleeper', T),
    rookie_year: notProvided(),
    draft_year: notProvided(),
    draft_round: notProvided(),
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

function row(gsis: string, position: SupportedPosition | 'OTHER', over: Partial<WeeklyStatRecord> = {}): WeeklyStatRecord {
  return {
    gsis,
    position,
    season: 2025,
    week: 1,
    seasonType: 'REG',
    completions: 0, attempts: 0, passingYards: 0, passingTds: 0, interceptions: 0, sacks: 0, sackYards: 0,
    carries: 0, rushingYards: 0, rushingTds: 0,
    receptions: 0, targets: 0, receivingYards: 0, receivingTds: 0,
    receivingAirYards: null, receivingYardsAfterCatch: null, targetShare: null,
    ...over,
  };
}

const CFG = { currentSeason: 2025 };

describe('joinStats (GSIS strong-id join)', () => {
  it('joins stat rows to canonical players by GSIS', () => {
    const players = [player('pt_1', 'WR', { gsis: 'G1' })];
    const rows = [row('G1', 'WR', { targets: 8 }), row('G1', 'WR', { week: 2, targets: 6 })];
    const r = joinStats(players, rows, CFG);
    expect(r.aggregates).toHaveLength(1);
    expect(r.aggregates[0].canonicalId).toBe('pt_1');
    expect(r.aggregates[0].windows.CURRENT_SEASON.games).toBe(2);
  });

  it('reports unmatched stat rows and canonical players without stats', () => {
    const players = [player('pt_1', 'WR', { gsis: 'G1' }), player('pt_2', 'RB', { gsis: 'G2' })];
    const rows = [row('G1', 'WR'), row('G9', 'WR')];
    const r = joinStats(players, rows, CFG);
    expect(r.unmatchedGsis).toEqual(['G9']);
    expect(r.canonicalWithoutStats).toEqual(['pt_2']);
  });

  it('reports canonical players with no GSIS (cannot be joined by name)', () => {
    const players = [player('pt_1', 'WR', { sleeper: '123' })];
    const r = joinStats(players, [row('G1', 'WR')], CFG);
    expect(r.canonicalWithoutGsis).toEqual(['pt_1']);
    expect(r.aggregates).toHaveLength(0);
  });

  it('fails safe on an identity collision (two canonical players share a GSIS)', () => {
    const players = [player('pt_1', 'WR', { gsis: 'G1' }), player('pt_2', 'WR', { gsis: 'G1' })];
    const r = joinStats(players, [row('G1', 'WR')], CFG);
    expect(r.identityCollisions).toEqual(['G1']);
    expect(r.aggregates).toHaveLength(0); // never merged
  });

  it('flags a position mismatch but still aggregates the canonical position', () => {
    const players = [player('pt_1', 'RB', { gsis: 'G1' })];
    const rows = [row('G1', 'WR', { targets: 5 })]; // stat rows say WR, canonical says RB
    const r = joinStats(players, rows, CFG);
    expect(r.positionMismatches).toEqual(['G1']);
    expect(r.aggregates[0].position).toBe('RB');
  });
});
