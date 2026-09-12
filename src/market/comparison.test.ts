// Model-vs-market comparison.
//
// The central assertion in this file is a NEGATIVE one: no function here ever subtracts a
// model value from a market value. The two are quoted on unrelated scales, and the moment
// something computes `(55.3 - 10256) / 10256` the product starts telling people a player is
// "99.5% overvalued". Order comparisons are the honest alternative, and these tests pin both
// the arithmetic and its sign conventions.

import { describe, expect, it } from 'vitest';
import { compareModelToMarket, percentileOfRank, type ModelSide } from './comparison';
import type { MarketSnapshot } from './types';

const quote = (over: Partial<MarketSnapshot> = {}): MarketSnapshot => ({
  canonicalPlayerId: 'pt-josh',
  source: 'dynastyprocess',
  format: 'dynasty_superflex',
  value: 10256,
  overallRank: 1,
  positionRank: 1,
  sourceConsensusRank: 1,
  sourcePlayerId: '17298',
  sourcePosition: 'QB',
  sourceTeam: 'BUF',
  sourceTimestamp: '2026-09-11T00:00:00.000Z',
  sourceVersion: '2026-09-11',
  ingestedAt: '2026-09-11T18:00:00.000Z',
  freshness: 'fresh',
  provenance: 'external',
  ...over,
});

const model = (over: Partial<ModelSide> = {}): ModelSide => ({
  canonicalPlayerId: 'pt-josh',
  position: 'QB',
  value: 55.3,
  overallRank: 1,
  positionRank: 1,
  modelVersion: 'qb-mvp-1.0',
  updatedAt: '2026-09-11T12:00:00.000Z',
  ...over,
});

const opts = { format: 'dynasty_superflex' as const, marketSource: 'dynastyprocess' };

describe('percentileOfRank', () => {
  it('puts the best rank at 100 and the worst at 0', () => {
    expect(percentileOfRank(1, 441)).toBe(100);
    expect(percentileOfRank(441, 441)).toBe(0);
  });

  it('makes boards of different sizes comparable — the reason percentile exists here', () => {
    // Rank 50 is a materially better standing on a 441-player board than on a 616-player one.
    expect(percentileOfRank(50, 441)).toBeGreaterThan(0);
    expect(percentileOfRank(50, 441)).not.toBe(percentileOfRank(50, 616));
  });

  it('returns null rather than a number for an unranked player', () => {
    expect(percentileOfRank(null, 441)).toBeNull();
  });

  it('refuses nonsense instead of producing a plausible-looking value', () => {
    expect(percentileOfRank(0, 100)).toBeNull();
    expect(percentileOfRank(101, 100)).toBeNull();
    expect(percentileOfRank(1, 0)).toBeNull();
    expect(percentileOfRank(Number.NaN, 100)).toBeNull();
  });

  it('places the only player on a one-player board at the top of it', () => {
    expect(percentileOfRank(1, 1)).toBe(100);
  });
});

describe('comparison', () => {
  it('carries both raw values without ever combining them', () => {
    const [row] = compareModelToMarket([model()], [quote()], opts);
    expect(row.modelValue).toBe(55.3);
    expect(row.marketValue).toBe(10256);
    // The contract has no field in which a cross-scale difference could hide.
    expect(Object.keys(row)).not.toContain('absoluteDifference');
    expect(Object.keys(row)).not.toContain('percentageDifference');
  });

  it('states rank disagreement with the documented sign: model 5 vs market 12 is +7', () => {
    const rows = compareModelToMarket(
      [model({ overallRank: 5 }), model({ canonicalPlayerId: 'pt-b', overallRank: 12 })],
      [quote({ overallRank: 12 }), quote({ canonicalPlayerId: 'pt-b', overallRank: 5 })],
      opts,
    );
    expect(rows[0].overallRankDifference).toBe(-7); // PlayerTicker HIGHER (5 is better than 12)
    expect(rows[1].overallRankDifference).toBe(7); // PlayerTicker LOWER
  });

  it('percentile difference is positive when PlayerTicker rates the player higher', () => {
    const modelBoard = [model({ overallRank: 1 }), model({ canonicalPlayerId: 'pt-b', overallRank: 2 })];
    const marketBoard = [quote({ overallRank: 2 }), quote({ canonicalPlayerId: 'pt-b', overallRank: 1 })];
    const [josh] = compareModelToMarket(modelBoard, marketBoard, opts);
    expect(josh.modelPercentile).toBe(100);
    expect(josh.marketPercentile).toBe(0);
    expect(josh.percentileDifference).toBe(100);
  });

  it('a player the market does not cover is UNCOVERED, not zero and not last', () => {
    const [row] = compareModelToMarket([model({ canonicalPlayerId: 'pt-uncovered' })], [quote()], opts);
    expect(row.marketValue).toBeNull();
    expect(row.marketRank).toBeNull();
    expect(row.marketSource).toBeNull();
    expect(row.overallRankDifference).toBeNull();
    expect(row.percentileDifference).toBeNull();
    expect(row.comparable).toBe(false);
    // The model side is untouched — the player still has a PlayerTicker valuation.
    expect(row.modelValue).toBe(55.3);
  });

  it('keeps every model player, covered or not — the board must be able to show absence', () => {
    const rows = compareModelToMarket(
      [model(), model({ canonicalPlayerId: 'pt-uncovered' })],
      [quote()],
      opts,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.comparable)).toEqual([true, false]);
  });

  it('an unvalued model player is incomparable even when the market has a quote', () => {
    const [row] = compareModelToMarket([model({ value: null, overallRank: null })], [quote()], opts);
    expect(row.comparable).toBe(false);
    expect(row.marketValue).toBe(10256); // the market side is still shown
    expect(row.overallRankDifference).toBeNull();
  });

  it('ignores quotes from the other format — a 1QB number never answers a Superflex question', () => {
    const [row] = compareModelToMarket([model()], [quote({ format: 'dynasty_1qb', value: 7000 })], opts);
    expect(row.marketValue).toBeNull();
    expect(row.comparable).toBe(false);
  });

  it('compares position ranks only within the same position', () => {
    const same = compareModelToMarket([model({ positionRank: 2 })], [quote({ positionRank: 1 })], opts)[0];
    expect(same.positionRankDifference).toBe(1);

    // A join that put a WR's market quote on a QB's model row is a defect; the retained
    // source position is what makes it detectable rather than silently averaged in.
    const crossed = compareModelToMarket([model({ positionRank: 2 })], [quote({ sourcePosition: 'WR' })], opts)[0];
    expect(crossed.positionRankDifference).toBeNull();
  });

  it('counts each side’s denominator from its own ranked players', () => {
    // 3 model players, 2 of them ranked; 2 market quotes, both ranked. Using a shared
    // denominator would misplace every player on at least one side.
    const rows = compareModelToMarket(
      [model({ overallRank: 1 }), model({ canonicalPlayerId: 'pt-b', overallRank: 2 }), model({ canonicalPlayerId: 'pt-c', overallRank: null, value: null })],
      [quote({ overallRank: 1 }), quote({ canonicalPlayerId: 'pt-b', overallRank: 2 })],
      opts,
    );
    expect(rows[0].modelPercentile).toBe(100); // rank 1 of 2 ranked
    expect(rows[1].modelPercentile).toBe(0); // rank 2 of 2 ranked
    expect(rows[2].modelPercentile).toBeNull();
  });

  it('preserves attribution on every comparable row', () => {
    const [row] = compareModelToMarket([model()], [quote()], opts);
    expect(row.marketSource).toBe('dynastyprocess');
    expect(row.marketUpdatedAt).toBe('2026-09-11T00:00:00.000Z');
    expect(row.modelVersion).toBe('qb-mvp-1.0');
  });

  it('is deterministic — the same inputs produce byte-identical output', () => {
    const once = compareModelToMarket([model()], [quote()], opts);
    const twice = compareModelToMarket([model()], [quote()], opts);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });

  it('handles an empty market without inventing a comparison', () => {
    const [row] = compareModelToMarket([model()], [], opts);
    expect(row.comparable).toBe(false);
    expect(row.marketPercentile).toBeNull();
  });
});
