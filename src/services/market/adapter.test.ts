// The external-market boundary: API wire shape → the frontend's model.
//
// Two things must survive this crossing intact — absence, and attribution. A null value that
// becomes a zero here is a lie the UI cannot detect, and a dropped publisher turns somebody
// else's data into ours.

import { describe, expect, it } from 'vitest';
import { adaptMarket, formatLabel, marketUpdatedLabel } from './adapter';
import { buildBoardComparisons, buildDynastyModelSide, countCovered } from './boardComparison';
import type { ApiMarketResponse } from '@/services/api';
import type { PublishedPlayer } from '@/services/publication';

function response(over: Partial<ApiMarketResponse> = {}): ApiMarketResponse {
  return {
    source: 'dynastyprocess',
    format: 'dynasty_superflex',
    attribution: {
      publisher: 'DynastyProcess',
      url: 'https://github.com/dynastyprocess/data',
      licence: 'GPL-3.0',
      derivedFrom: 'FantasyPros expert consensus',
      refreshCadence: 'weekly',
      usage: 'External comparison source, not PlayerTicker-owned market data.',
    },
    sourceTimestamp: '2026-09-11T00:00:00.000Z',
    sourceVersion: '2026-09-11',
    capturedAt: '2026-09-11T18:00:00.000Z',
    captureCount: 1,
    quoteCount: 1,
    quotes: [
      {
        canonicalPlayerId: 'pt-josh',
        source: 'dynastyprocess',
        format: 'dynasty_superflex',
        value: 10256,
        overallRank: 1,
        positionRank: 1,
        sourceTimestamp: '2026-09-11T00:00:00.000Z',
        ingestedAt: '2026-09-11T18:00:00.000Z',
        freshness: 'fresh',
        provenance: 'external',
      },
    ],
    ...over,
  };
}

function player(over: Partial<PublishedPlayer> = {}): PublishedPlayer {
  return {
    playerId: 'pt-josh',
    position: 'QB',
    name: 'Josh Allen',
    team: 'BUF',
    age: 30,
    value: 55.3,
    // The market comparison is made on the DYNASTY composite, not on the board's displayed
    // horizon, so the fixture has to carry one.
    composites: { weekly: 61.0, ros: 60.2, oneYear: 58.1, threeYear: 56.0, dynasty: 55.3 },
    overallRank: 1,
    positionRank: 1,
    confidenceScore: 800,
    confidenceLabel: 'HIGH',
    publicConfidenceLabel: 'HIGH',
    volatilityScore: 30,
    volatilityLabel: 'LOW',
    honestyState: 'VERIFIED',
    readiness: 'READY',
    outputStatus: 'OK',
    readinessMissingCount: 0,
    limitations: [],
    asOf: '2026-09-11T00:00:00.000Z',
    outputChecksum: 'out-1',
    modelTier: 'FULL',
    modelVersion: 'qb-mvp-1.0',
    positionValue: null,
    publishedPositionalRank: null,
    role: null,
    explanation: null,
    positiveFactors: [],
    negativeFactors: [],
    materialMissingInputs: [],
    insufficientReason: null,
    provenance: null,
    ...over,
  } as PublishedPlayer;
}

describe('adaptMarket', () => {
  it('indexes quotes by the canonical id the board already joins on', () => {
    const market = adaptMarket(response());
    expect(market.quotesByPlayerId.get('pt-josh')?.value).toBe(10256);
  });

  it('carries attribution through — it is not an optional field on the way in', () => {
    const market = adaptMarket(response());
    expect(market.attribution.publisher).toBe('DynastyProcess');
    expect(market.attribution.derivedFrom).toBe('FantasyPros expert consensus');
    expect(market.attribution.refreshCadence).toBe('weekly');
  });

  it('keeps a null value null rather than turning "no quote" into a zero', () => {
    const market = adaptMarket(
      response({ quotes: [{ ...response().quotes[0], value: null, overallRank: null, positionRank: null }] }),
    );
    const quote = market.quotesByPlayerId.get('pt-josh');
    expect(quote?.value).toBeNull();
    expect(quote?.overallRank).toBeNull();
  });

  it('withholds movement until there are two captures to measure it between', () => {
    expect(adaptMarket(response({ captureCount: 1 })).movementAvailable).toBe(false);
    expect(adaptMarket(response({ captureCount: 2 })).movementAvailable).toBe(true);
    expect(adaptMarket(response({ captureCount: 0 })).movementAvailable).toBe(false);
  });

  it('does not invent the upstream fields the API deliberately withholds', () => {
    const quote = adaptMarket(response()).quotesByPlayerId.get('pt-josh');
    expect(quote?.sourcePlayerId).toBeNull();
    expect(quote?.sourceConsensusRank).toBeNull();
  });

  it('an empty market adapts to an empty market, not to an error', () => {
    const market = adaptMarket(response({ quotes: [], quoteCount: 0, captureCount: 0, sourceTimestamp: null }));
    expect(market.quotesByPlayerId.size).toBe(0);
    expect(market.attribution.publisher).toBe('DynastyProcess');
  });
});

describe('display labels', () => {
  it('names the lens, because Superflex and 1QB are different numbers', () => {
    expect(formatLabel('dynasty_superflex')).toBe('Superflex');
    expect(formatLabel('dynasty_1qb')).toBe('1QB');
  });

  it('renders a restrained date for weekly data', () => {
    expect(marketUpdatedLabel('2026-09-11T00:00:00.000Z')).toBe('Sep 11');
  });

  it('says nothing at all when the market carries no stamp', () => {
    expect(marketUpdatedLabel(null)).toBeNull();
    expect(marketUpdatedLabel('not a date')).toBeNull();
  });
});

describe('board comparisons', () => {
  it('joins the board to the market on the canonical id', () => {
    const comparisons = buildBoardComparisons([player()], adaptMarket(response()));
    expect(comparisons.get('pt-josh')?.marketRank).toBe(1);
    expect(comparisons.get('pt-josh')?.comparable).toBe(true);
  });

  it('produces an empty index when there is no market, so call sites have one shape', () => {
    expect(buildBoardComparisons([player()], undefined).size).toBe(0);
  });

  it('ranks the model side on DYNASTY value, not on the board’s displayed horizon', () => {
    // The board is showing weekly; on weekly this player leads, on dynasty they do not. The
    // comparison must use the dynasty ordering or the disagreement it reports is an artefact.
    const a = player({ playerId: 'pt-a', composites: { weekly: 99, ros: 0, oneYear: 0, threeYear: 0, dynasty: 10 } });
    const b = player({ playerId: 'pt-b', composites: { weekly: 1, ros: 0, oneYear: 0, threeYear: 0, dynasty: 90 } });
    const sides = buildDynastyModelSide([a, b]);
    expect(sides.find((s) => s.canonicalPlayerId === 'pt-b')?.overallRank).toBe(1);
    expect(sides.find((s) => s.canonicalPlayerId === 'pt-a')?.overallRank).toBe(2);
  });

  it('leaves a player with no dynasty composite UNRANKED rather than last', () => {
    const sides = buildDynastyModelSide([player(), player({ playerId: 'pt-none', composites: null })]);
    const none = sides.find((s) => s.canonicalPlayerId === 'pt-none');
    expect(none?.overallRank).toBeNull();
    expect(none?.value).toBeNull();
  });

  it('counts coverage honestly — uncovered players are not counted as covered', () => {
    const comparisons = buildBoardComparisons(
      [
        player(),
        player({
          playerId: 'pt-uncovered',
          overallRank: 2,
          composites: { weekly: 40, ros: 40, oneYear: 40, threeYear: 40, dynasty: 40 },
        }),
      ],
      adaptMarket(response()),
    );
    expect(comparisons.size).toBe(2);
    expect(countCovered(comparisons)).toBe(1);
    expect(comparisons.get('pt-uncovered')?.marketRank).toBeNull();
  });
});
