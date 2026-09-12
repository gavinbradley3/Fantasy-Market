// QB role evidence, and the scoping that keeps a wider career window from becoming a wider board.
//
// Before this wire existed, `role_status` and `depth_chart_status` had no producer at all, so
// every quarterback in the league fell to the ENUM neutral — BACKUP. Role Security carries 21%
// of the dynasty composite, so an established starter and a third-stringer scored identically
// on a fifth of the model.

import { describe, expect, it } from 'vitest';
import { ingest, buildNormalizedInferenceInput, type ProviderSource } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import { freshness } from './__fixtures';

const AS_OF = '2026-02-01T00:00:00.000Z';

/** One weekly stat row plus the schedule row that makes it a startable team game. */
function weeks(gsis: string, season: number, count: number, over: Record<string, unknown> = {}) {
  return Array.from({ length: count }, (_, i) => ({
    player_id: gsis, season, week: i + 1, season_type: 'REG', recent_team: 'BUF',
    attempts: 30, completions: 20, passing_yards: 240, passing_tds: 2, passing_interceptions: 1,
    sacks_suffered: 2, carries: 4, rushing_yards: 20, rushing_tds: 0, ...over,
  }));
}

function build(rows: readonly Record<string, unknown>[], seasons?: readonly number[]) {
  const source: ProviderSource = {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [{ gsis_id: '00-QB', player_name: 'Test Passer', position: 'QB', team: 'BUF', age: 28, seasons: 8, draft_round: 1, status: 'ACTIVE' }],
      games: rows,
    },
  };
  const { snapshot } = ingest([source]);
  const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === '00-QB')!.canonicalId!;
  const input = buildNormalizedInferenceInput(snapshot, {
    canonicalId, position: 'QB', asOf: AS_OF, engineVersion: 'qb-mvp-1.0',
    ...(seasons ? { valuationSeasons: seasons } : {}),
  })!;
  return { snapshot, input };
}

describe('career evidence spans the career, not the valuation window', () => {
  it('QB career facts read every ingested season', () => {
    const { input } = build([...weeks('00-QB', 2019, 16), ...weeks('00-QB', 2025, 16)], [2025]);
    // 32 games of 30 attempts — the 2019 season is career evidence even though the player is
    // valued on 2025.
    expect(input.facts.career_pass_attempts).toBe(32 * 30);
    expect(input.facts.career_adjusted_yards_per_attempt).toBeCloseTo((240 + 20 * 2 - 45 * 1) / 30, 10);
  });

  it('but RECENT-FORM facts stay inside the recent window', () => {
    const { input } = build([...weeks('00-QB', 2019, 16), ...weeks('00-QB', 2025, 16)], [2025]);
    // The engine bounds `recent_games` to eight; a wider career must not widen it.
    expect(input.facts.recent_games).toBe(8);
    expect(input.facts.recent_pass_attempts).toBe(8 * 30);
  });

  it('a NON-QB position stays scoped to the valuation seasons', () => {
    // Giving the quarterback a real career and re-basing the other models on a wider window
    // are two different decisions; only the first is taken.
    const source: ProviderSource = {
      adapter: nflverseAdapter,
      freshness: freshness('nflverse'),
      payloads: {
        identity: [{ gsis_id: '00-TE', player_name: 'Test End', position: 'TE', team: 'BUF', age: 28, seasons: 8, draft_round: 2, status: 'ACTIVE' }],
        games: [
          ...Array.from({ length: 16 }, (_, i) => ({ player_id: '00-TE', season: 2019, week: i + 1, season_type: 'REG', recent_team: 'BUF', targets: 5, receptions: 4, receiving_yards: 50 })),
          ...Array.from({ length: 16 }, (_, i) => ({ player_id: '00-TE', season: 2025, week: i + 1, season_type: 'REG', recent_team: 'BUF', targets: 5, receptions: 4, receiving_yards: 50 })),
        ],
      },
    };
    const { snapshot } = ingest([source]);
    const id = snapshot.players.find((p) => p.providerIds.gsis === '00-TE')!.canonicalId!;
    const scoped = buildNormalizedInferenceInput(snapshot, { canonicalId: id, position: 'TE', asOf: AS_OF, engineVersion: 'te-mvp-1.0', valuationSeasons: [2025] })!;
    expect(scoped.facts.career_targets).toBe(16 * 5); // 2025 only
  });
});
