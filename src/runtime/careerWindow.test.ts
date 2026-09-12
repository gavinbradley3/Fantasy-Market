// The career window deepens the players the valuation window selects — it never adds players,
// and it never buys more than it needs.
//
// The regression this pins was measured on a live board: acquiring eight extra seasons of game
// stats for QB career depth took the board from 868 entries to 1,897, enrolling a decade of
// retirees who carry no current evidence.

import { describe, expect, it } from 'vitest';
import { ingest, type ProviderSource } from '@/ingestion/buildInput';
import { nflverseAdapter } from '@/ingestion/adapters/nflverse';
import { freshness } from '@/ingestion/__fixtures';
import { buildSourcePlan } from './sources';
import { selectInferenceBuilds } from './selection';

const AS_OF = '2026-02-01T00:00:00.000Z';

function weeks(gsis: string, season: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    player_id: gsis, season, week: i + 1, season_type: 'REG', recent_team: 'BUF',
    attempts: 30, completions: 20, passing_yards: 240, passing_tds: 2, passing_interceptions: 1,
    sacks_suffered: 2, carries: 4, rushing_yards: 20, rushing_tds: 0,
  }));
}

describe('the career window deepens players, it never adds them', () => {
  it('selection ignores a player whose only games predate the valuation window', () => {
    const source: ProviderSource = {
      adapter: nflverseAdapter,
      freshness: freshness('nflverse'),
      payloads: {
        identity: [
          { gsis_id: '00-QB', player_name: 'Current Passer', position: 'QB', team: 'BUF' },
          { gsis_id: '00-OLD', player_name: 'Retired Passer', position: 'QB', team: 'BUF' },
        ],
        games: [...weeks('00-QB', 2025, 8), ...weeks('00-OLD', 2019, 16)],
      },
    };
    const { snapshot } = ingest([source]);
    const scoped = selectInferenceBuilds(snapshot, { asOf: AS_OF, valuationSeasons: [2025] });
    const unscoped = selectInferenceBuilds(snapshot, { asOf: AS_OF });
    expect(scoped).toHaveLength(1);
    expect(unscoped).toHaveLength(2); // the regression this pins: a decade of retirees
  });
});

describe('the source plan acquires career seasons cheaply', () => {
  const plan = (over = {}) =>
    buildSourcePlan({ seasons: [2025], effectiveDate: AS_OF, mode: 'live', careerSeasons: [2019, 2020], ...over });

  it('acquires GAME STATS ONLY for a career season', () => {
    const career = plan().filter((r) => r.params?.season === '2019');
    expect(career.map((r) => r.capability)).toEqual(['games']);
  });

  it('still acquires the full set for a valuation season', () => {
    const valuation = plan().filter((r) => r.params?.season === '2025').map((r) => r.capability).sort();
    expect(valuation).toEqual(['games', 'participation', 'roster']);
  });

  it('does not double-request a season named in both lists', () => {
    const p = plan({ careerSeasons: [2025, 2019] });
    const keys = p.map((r) => `${r.provider}|${r.capability}|${r.params?.season ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is unchanged when no career seasons are named', () => {
    const withNone = buildSourcePlan({ seasons: [2025], effectiveDate: AS_OF, mode: 'live' });
    expect(withNone.some((r) => r.params?.season === '2019')).toBe(false);
  });
});
