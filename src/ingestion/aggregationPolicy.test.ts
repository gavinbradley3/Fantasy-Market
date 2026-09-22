import { describe, expect, it } from 'vitest';
import { BETA_AGGREGATION_VERSION, betaAggregationOptions, betaTargetShare } from './aggregationPolicy';
import { aggregationCoverage } from './aggregationCoverage';
import { observedCountingFacts } from './observedFacts';
import { observedCareerRates } from './observedCareerRates';
import { observedReceivingRates } from './observedReceiving';
import { buildTeamGameTotals, observedProduction } from './observedProduction';
import { buildNormalizedInferenceInput, ingest } from './buildInput';
import { nflverseAdapter } from './adapters/nflverse';
import type { GameStatRecord } from './types';
import { runInference } from '@/inference/production/runInference';

const STAMP = '2026-09-22T00:00:00.000Z';
const freshness = { provider: 'nflverse' as const, fetchedAt: STAMP, effectiveDate: STAMP, lastUpdated: null, sourceVersion: 'fixture-v1' };
function game(gameId: string, over: Partial<GameStatRecord> = {}): GameStatRecord {
  return {
    canonicalId: 'pt-test', providerRef: { key: 'gsis', value: '00-test' }, freshness, sourceTimestamp: STAMP,
    gameId, kickoff: gameId === 'g1' ? '2026-09-13T17:00:00.000Z' : '2026-09-20T17:00:00.000Z',
    season: 2026, seasonType: 'REG', team: 'MIN', passAttempts: 30, carries: 0, targets: 10,
    snaps: null, teamSnaps: null, qbSnapShare: null, completions: 20, passingYards: 240, passingTds: 2,
    interceptions: 1, sacks: 0, rushingYards: 0, rushingTds: 0, receptions: 5, receivingYards: 60,
    receivingTds: 0, receivingAirYards: 100, targetShare: 0.25, ...over,
  };
}

describe('versioned beta M08 target denominator', () => {
  it('counts zero-target appearances with the same provider denominator, not a reconstructed floor', () => {
    const player = [game('g1'), game('g2', { targets: 0, targetShare: 0, receivingAirYards: 0 })];
    // A peer supplies 5 / .25 = 20 team targets in g2. Summing retained rows gives only 5.
    const peers = [...player, game('g2', { canonicalId: 'pt-peer', targets: 5, targetShare: 0.25 })];
    const options = betaAggregationOptions(peers);
    expect(observedReceivingRates(player).target_share).toBe(0.25); // frozen legacy experiment
    expect(observedReceivingRates(player, options).target_share).toBeCloseTo(10 / 60, 12);
    expect(observedProduction(player, buildTeamGameTotals(peers), null, options)?.providerTargetShare).toBeCloseTo(10 / 60, 12);
    expect(aggregationCoverage('WR', player, options).numericalEvidenceComplete).toBe(true);
  });

  it('keeps a missing denominator unknown and names its game instead of dropping it', () => {
    const player = [game('g1'), game('g2', { targets: 0, targetShare: 0 })];
    const options = betaAggregationOptions(player);
    expect(observedReceivingRates(player, options).target_share).toBeUndefined();
    expect(betaTargetShare(player, options)).toEqual({ value: null, missingGameIds: ['g2'], conflictingGameIds: [] });
    expect(aggregationCoverage('WR', player, options).issues).toContainEqual(expect.objectContaining({ code: 'TARGET_DENOMINATOR_UNAVAILABLE', unavailableGameIds: ['g2'] }));
  });

  it.each([
    { team: 'GB' },
    { freshness: { ...freshness, provider: 'sleeper' as const } },
    { freshness: { ...freshness, fetchedAt: '2026-09-23T00:00:00.000Z' } },
    { gameId: 'another-game' },
  ])('never borrows denominator from wrong reference coordinates: %j', (wrong) => {
    const player = game('g2', { targets: 0, targetShare: 0, passAttempts: 35 });
    const peer = game('g2', { canonicalId: 'pt-peer', targets: 5, targetShare: 0.25, ...wrong });
    expect(betaTargetShare([player], betaAggregationOptions([player, peer])).value).toBeNull();
  });

  it('rejects conflicting and non-integer provider denominators deterministically', () => {
    const player = game('g1');
    for (const share of [0.5, 0.3]) {
      const peer = game('g1', { canonicalId: 'pt-peer', targets: 5, targetShare: share });
      const a = betaTargetShare([player], betaAggregationOptions([player, peer]));
      const b = betaTargetShare([player], betaAggregationOptions([peer, player]));
      expect(a).toEqual({ value: null, missingGameIds: [], conflictingGameIds: ['g1'] });
      expect(a).toEqual(b);
    }
  });

  it('distinguishes observed zero from absent target count, accepting ordinary serialization error', () => {
    const zero = game('g1', { targets: 0, targetShare: 0 });
    const peer = game('g1', { targets: 1, targetShare: 1 / 30 });
    const options = betaAggregationOptions([zero, peer]);
    expect(betaTargetShare([zero], options).value).toBe(0);
    expect(betaTargetShare([{ ...zero, targets: null }], options).value).toBeNull();
  });
});

describe('versioned beta M09 complete-window observations', () => {
  it('does not dilute a partially observed passing total across complete game counts', () => {
    const rows = [game('g1', { passingYards: 100 }), game('g2', { passingYards: null })];
    const before = JSON.stringify(rows);
    const legacy = observedCountingFacts('QB', rows);
    expect(legacy.recent_passing_yards).toBe(100);
    expect(legacy.recent_games).toBe(2); // historical defect: 100 / 2 implies 50 observed YPG
    const beta = observedCountingFacts('QB', rows, betaAggregationOptions(rows));
    expect(beta.recent_passing_yards).toBeUndefined();
    expect(beta.recent_games).toBe(2);
    expect(aggregationCoverage('QB', rows, betaAggregationOptions(rows)).issues).toContainEqual(expect.objectContaining({
      code: 'PARTIAL_WINDOW_COLUMN', window: 'recent', field: 'passingYards', observedGames: 1, totalGames: 2, unavailableGameIds: ['g2'],
    }));
    expect(JSON.stringify(rows)).toBe(before);
  });

  it('does not sum mismatched career AY/A components or divide partial rushing yards by all starts', () => {
    const rows = [game('g1', { rushingYards: 20 }), game('g2', { passingTds: null, rushingYards: null })];
    expect(observedCareerRates(rows, 2)).toEqual({ career_adjusted_yards_per_attempt: 430 / 60, career_rushing_yards_per_start: 10 });
    expect(observedCareerRates(rows, 2, betaAggregationOptions(rows))).toEqual({});
  });

  it.each(['RB', 'WR', 'TE'] as const)('preserves full %s appearances while making an incomplete total unknown', (position) => {
    const rows = [game('g1'), game('g2', { receivingYards: null })];
    const options = betaAggregationOptions(rows);
    expect(observedProduction(rows, new Map())?.career.receivingYards).toBe(60);
    const beta = observedProduction(rows, new Map(), null, options)!;
    expect(beta.career.games).toBe(2);
    expect(beta.career.receivingYards).toBeNull();
    expect(beta.roleWindow.receivingYards).toBeNull();
    expect(beta.career.targets).toBe(20);
    expect(aggregationCoverage(position, rows, options).numericalEvidenceComplete).toBe(false);
  });

  it('keeps all-observed zero totals and treats wholly missing columns distinctly', () => {
    const rows = [game('g1', { interceptions: 0 }), game('g2', { interceptions: 0 })];
    expect(observedCountingFacts('QB', rows, betaAggregationOptions(rows)).recent_interceptions).toBe(0);
    const missing = rows.map((g) => ({ ...g, interceptions: null }));
    expect(aggregationCoverage('QB', missing, betaAggregationOptions(missing)).issues).toContainEqual(expect.objectContaining({ code: 'UNOBSERVED_WINDOW_COLUMN', field: 'interceptions', observedGames: 0 }));
  });

  it('does not present a partially observed aDOT as the whole role window', () => {
    const rows = [game('g1'), game('g2', { receivingAirYards: null })];
    expect(observedReceivingRates(rows).average_depth_of_target).toBe(10);
    expect(observedReceivingRates(rows, betaAggregationOptions(rows)).average_depth_of_target).toBeUndefined();
  });
});

describe('normalization/evidence integration and compatibility', () => {
  it('requires the beta policy explicitly, threads actual peers through evidence and leaves legacy bytes unchanged', () => {
    const row = (id: string, week: number, targets: number, share: number) => ({
      player_id: id, season: 2026, week, season_type: 'REG', recent_team: 'MIN', targets, target_share: share,
      receptions: 0, receiving_yards: 0, receiving_tds: 0, receiving_air_yards: 0,
    });
    const { snapshot } = ingest([{ adapter: nflverseAdapter, freshness, payloads: {
      identity: [
        { gsis_id: '00-main', player_name: 'Synthetic Receiver', position: 'WR', team: 'MIN', age: 25, seasons: 4 },
        { gsis_id: '00-peer', player_name: 'Synthetic Peer', position: 'WR', team: 'MIN', age: 25, seasons: 4 },
      ],
      games: [row('00-main', 1, 10, 0.25), row('00-main', 2, 0, 0), row('00-peer', 2, 5, 0.25)],
    } }]);
    const canonicalId = snapshot.players.find((p) => p.providerIds.gsis === '00-main')!.canonicalId!;
    const options = { canonicalId, position: 'WR' as const, asOf: STAMP, engineVersion: 'wr-mvp-1.0', valuationSeasons: [2026] };
    const before = buildNormalizedInferenceInput(snapshot, options)!;
    const beta = buildNormalizedInferenceInput(snapshot, { ...options, aggregationPolicy: BETA_AGGREGATION_VERSION })!;
    expect(before.facts.target_share).toBe(0.25);
    expect(beta.facts.target_share).toBeCloseTo(10 / 60, 12);
    expect(beta.evidence.production?.providerTargetShare).toBeCloseTo(10 / 60, 12);
    expect(beta.evidence.aggregationCoverage?.numericalEvidenceComplete).toBe(true);
    expect(before.evidence).not.toHaveProperty('aggregationCoverage');
    expect(buildNormalizedInferenceInput(snapshot, options)).toEqual(before);
    expect(buildNormalizedInferenceInput(snapshot, { ...options, aggregationPolicy: BETA_AGGREGATION_VERSION })).toEqual(beta);
    // The actual evidence-selected ACCESSIBLE consumer uses the corrected share; this is
    // diagnostic inference, not an assertion of current-role eligibility or publishability.
    const beforeResult = runInference(before);
    const betaResult = runInference(beta);
    expect(beforeResult.readinessMissing).toEqual(['career_routes']);
    expect(beforeResult.modelTier).toBe('ACCESSIBLE');
    expect(betaResult.modelTier).toBe('ACCESSIBLE');
    expect(betaResult.accessibleOutput!.components.TS).toBeLessThan(beforeResult.accessibleOutput!.components.TS!);
  });
});
