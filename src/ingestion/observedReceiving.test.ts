// Observed receiving rates for the WR engine.
//
// The defect these guard against: the WR engine declared `target_share` and
// `average_depth_of_target`, the provider published both, the adapter dropped the columns,
// and every receiver in the league received the same two fallback constants. So the
// assertions that matter most here are the ones about DIFFERENTIATION and about absence —
// an unobserved window must yield nothing, never a zero.

import { describe, expect, it } from 'vitest';
import { observedReceivingRates } from './observedReceiving';
import { ingest, buildNormalizedInferenceInput, type ProviderSource } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import { freshness } from './__fixtures';
import type { GameStatRecord } from './types';

let seq = 0;
function game(over: Partial<GameStatRecord> = {}): GameStatRecord {
  seq += 1;
  return {
    canonicalId: 'pt-wr',
    providerRef: { key: 'gsis', value: '00-WR' },
    freshness: { provider: 'nflverse', effectiveDate: '2026-01-01T00:00:00.000Z', fetchedAt: '2026-01-01T00:00:00.000Z', lastUpdated: null, sourceVersion: 'v1' },
    sourceTimestamp: '2026-01-01T00:00:00.000Z',
    gameId: `g${seq}`,
    kickoff: `2025-09-${String(seq).padStart(2, '0')}T00:00:00.000Z`,
    season: 2025,
    seasonType: 'REG',
    team: 'MIN',
    passAttempts: null,
    carries: null,
    targets: 10,
    snaps: null,
    teamSnaps: null,
    qbSnapShare: null,
    completions: null,
    passingYards: null,
    passingTds: null,
    interceptions: null,
    sacks: null,
    rushingYards: null,
    rushingTds: null,
    receptions: null,
    receivingYards: null,
    receivingTds: null,
    receivingAirYards: 100,
    targetShare: 0.25,
    ...over,
  } as GameStatRecord;
}

/** A full latest season, so the role window is that season rather than the rolling one. */
function season(n: number, over: Partial<GameStatRecord> = {}): GameStatRecord[] {
  return Array.from({ length: n }, () => game(over));
}

describe('target share', () => {
  it('recovers the provider’s own team denominator rather than reconstructing one', () => {
    // 10 targets at a 0.25 share ⇒ the team threw 40. Over 8 such games: 80 / 320 = 0.25.
    const rates = observedReceivingRates(season(8));
    expect(rates.target_share).toBeCloseTo(0.25, 10);
  });

  it('weights by volume, not by game — a big game counts for more than a quiet one', () => {
    seq = 0;
    const games = [
      ...Array.from({ length: 4 }, () => game({ targets: 20, targetShare: 0.4 })), // team 50
      ...Array.from({ length: 4 }, () => game({ targets: 2, targetShare: 0.1 })), // team 20
    ];
    // 88 player targets ÷ 280 team targets = 0.3142…, NOT the unweighted mean of 0.25.
    expect(observedReceivingRates(games).target_share).toBeCloseTo(88 / 280, 10);
  });

  it('differentiates receivers — the whole point of the fix', () => {
    seq = 0;
    const alpha = observedReceivingRates(season(8, { targets: 12, targetShare: 0.32 }));
    seq = 0;
    const depth = observedReceivingRates(season(8, { targets: 2, targetShare: 0.05 }));
    expect(alpha.target_share).toBeGreaterThan(depth.target_share!);
  });

  it('skips a game that cannot supply a denominator instead of counting it as zero', () => {
    seq = 0;
    const games = [
      ...Array.from({ length: 8 }, () => game({ targets: 10, targetShare: 0.25 })),
      game({ targets: 0, targetShare: 0 }),
      game({ targets: 5, targetShare: null }),
    ];
    // The extra games contribute to neither side, so the answer is unchanged.
    expect(observedReceivingRates(games).target_share).toBeCloseTo(0.25, 10);
  });

  it('reports NOTHING when no game supplied a share — never a zero share', () => {
    seq = 0;
    const rates = observedReceivingRates(season(8, { targetShare: null }));
    expect(rates.target_share).toBeUndefined();
    expect('target_share' in rates).toBe(false);
  });
});

describe('average depth of target', () => {
  it('is air yards over targets across the window', () => {
    seq = 0;
    expect(observedReceivingRates(season(8)).average_depth_of_target).toBeCloseTo(10, 10);
  });

  it('separates a deep threat from an underneath receiver', () => {
    seq = 0;
    const deep = observedReceivingRates(season(8, { targets: 6, receivingAirYards: 96 })); // 16.0
    seq = 0;
    const short = observedReceivingRates(season(8, { targets: 10, receivingAirYards: 40 })); // 4.0
    expect(deep.average_depth_of_target).toBeCloseTo(16, 10);
    expect(short.average_depth_of_target).toBeCloseTo(4, 10);
  });

  it('handles negative air yards, which are real (a behind-the-line target)', () => {
    seq = 0;
    expect(observedReceivingRates(season(8, { targets: 4, receivingAirYards: -8 })).average_depth_of_target)
      .toBeCloseTo(-2, 10);
  });

  it('reports nothing when the provider supplied no air yards', () => {
    seq = 0;
    expect(observedReceivingRates(season(8, { receivingAirYards: null })).average_depth_of_target).toBeUndefined();
  });

  it('is independent of target share — one absent does not suppress the other', () => {
    seq = 0;
    const rates = observedReceivingRates(season(8, { targetShare: null }));
    expect(rates.target_share).toBeUndefined();
    expect(rates.average_depth_of_target).toBeCloseTo(10, 10);
  });
});

describe('windowing', () => {
  it('measures the CURRENT role: a full latest season, not the whole career', () => {
    seq = 0;
    const older = Array.from({ length: 17 }, () => game({ season: 2023, targets: 2, targetShare: 0.05, receivingAirYards: 10 }));
    const latest = Array.from({ length: 17 }, () => game({ season: 2025, targets: 12, targetShare: 0.30, receivingAirYards: 144 }));
    const rates = observedReceivingRates([...older, ...latest]);
    expect(rates.target_share).toBeCloseTo(0.3, 10);
    expect(rates.average_depth_of_target).toBeCloseTo(12, 10);
  });

  it('excludes the postseason', () => {
    seq = 0;
    const reg = Array.from({ length: 8 }, () => game({ targets: 10, targetShare: 0.25 }));
    const post = Array.from({ length: 3 }, () => game({ seasonType: 'POST', targets: 30, targetShare: 0.9 }));
    expect(observedReceivingRates([...reg, ...post]).target_share).toBeCloseTo(0.25, 10);
  });

  it('is order-independent', () => {
    seq = 0;
    const games = season(8);
    const forward = observedReceivingRates(games);
    const reversed = observedReceivingRates([...games].reverse());
    expect(reversed).toEqual(forward);
  });

  it('returns nothing at all for a player with no games', () => {
    expect(observedReceivingRates([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// End to end: does the provider column actually reach the engine's input?
//
// Self-contained rather than built on the shared fixture, because the shared payloads are
// the byte source for a number of checksum tests and adding columns to them would move
// those bytes for reasons unrelated to what is being proved here.
// ---------------------------------------------------------------------------

const AS_OF = '2026-01-15T00:00:00.000Z';

function weeklyRows(gsis: string, team: string, over: Record<string, unknown>) {
  return Array.from({ length: 12 }, (_, i) => ({
    player_id: gsis, season: 2025, week: i + 1, season_type: 'REG', recent_team: team, ...over,
  }));
}

function ingestOne(position: 'WR' | 'TE', over: Record<string, unknown>) {
  const source: ProviderSource = {
    adapter: nflverseAdapter,
    freshness: freshness('nflverse'),
    payloads: {
      identity: [{ gsis_id: '00-X', player_name: 'Test Player', position, team: 'MIN', age: 26, seasons: 4, draft_round: 1, status: 'ACTIVE' }],
      games: weeklyRows('00-X', 'MIN', over),
    },
  };
  const { snapshot } = ingest([source]);
  const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === '00-X')!.canonicalId!;
  const input = buildNormalizedInferenceInput(snapshot, {
    canonicalId, position, asOf: AS_OF, engineVersion: position === 'WR' ? 'wr-mvp-1.0' : 'te-mvp-1.0',
  })!;
  return input.facts as Record<string, unknown>;
}

describe('the provider columns reach the WR engine input', () => {
  it('supplies target_share and average_depth_of_target as observed FACTS', () => {
    const facts = ingestOne('WR', { targets: 10, receptions: 7, receiving_yards: 90, receiving_air_yards: 120, target_share: 0.25 });
    expect(facts.target_share).toBeCloseTo(0.25, 10);
    expect(facts.average_depth_of_target).toBeCloseTo(12, 10);
  });

  it('two receivers with different usage no longer receive the same numbers', () => {
    // Before the fix both of these produced target_share 0.09 and aDOT 10 — the engine's
    // fallbacks — because the adapter never read the columns.
    const alpha = ingestOne('WR', { targets: 12, receiving_air_yards: 168, target_share: 0.30 });
    const depth = ingestOne('WR', { targets: 3, receiving_air_yards: 21, target_share: 0.07 });
    expect(alpha.target_share).not.toBe(depth.target_share);
    expect(alpha.average_depth_of_target).not.toBe(depth.average_depth_of_target);
    expect(alpha.target_share as number).toBeGreaterThan(depth.target_share as number);
  });

  it('omits the fields entirely when the provider omitted the columns', () => {
    const facts = ingestOne('WR', { targets: 10, receptions: 7, receiving_yards: 90 });
    expect('target_share' in facts).toBe(false);
    expect('average_depth_of_target' in facts).toBe(false);
  });

  it('leaves TE facts untouched — the accessible tier reads its own production', () => {
    const facts = ingestOne('TE', { targets: 10, receptions: 7, receiving_yards: 90, receiving_air_yards: 120, target_share: 0.25 });
    expect('target_share' in facts).toBe(false);
    expect('average_depth_of_target' in facts).toBe(false);
    expect(facts.career_targets).toBe(120); // the TE counting fact is unchanged
  });
});
