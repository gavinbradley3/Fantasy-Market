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
    // The board ranks on the shared cross-position dynasty value, and the market comparison
    // reuses that ranking, so the fixture carries one — plus the position composites, which
    // are deliberately DIFFERENT numbers so a test can catch a reversion to ranking on them.
    dynastyValue: 88.0,
    dynastySurplus: null,
    dynastyDepth: null,
    dynastyValueSource: null,
    leagueSchemaId: 'dynasty-superflex-12',
    productionCurveVersion: 'production-v1-2017-2025',
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

  it('uses the board’s OWN rank as the model side — it does not compute a second ordering', () => {
    const a = player({ playerId: 'pt-a', dynastyValue: 91, overallRank: 1, positionRank: 1 });
    const b = player({ playerId: 'pt-b', dynastyValue: 62, overallRank: 2, positionRank: 2 });
    const sides = buildDynastyModelSide([a, b]);
    expect(sides.find((s) => s.canonicalPlayerId === 'pt-a')?.overallRank).toBe(1);
    expect(sides.find((s) => s.canonicalPlayerId === 'pt-b')?.overallRank).toBe(2);
    // The model VALUE carried alongside it is the quantity that ordering is over, so a reader
    // never sees a rank from one number and a value from another.
    expect(sides.find((s) => s.canonicalPlayerId === 'pt-a')?.value).toBe(91);
  });

  it('does NOT re-rank on the position engines’ internal composites — the Bowers regression', () => {
    // THE DEFECT THIS REPLACED. `composites.dynasty` is anchored inside its own position's
    // distribution, so a tight end's internal composite can exceed a quarterback's while the
    // canonical board — ranking on cross-position value over replacement — has them the other
    // way round. Sorting the four positions' internal scales together produced a second
    // PlayerTicker ranking, and the Edge column reported the gap between OUR TWO RANKINGS as
    // though it were the market's disagreement with us.
    const qb = player({
      playerId: 'pt-qb',
      position: 'QB',
      dynastyValue: 88,
      overallRank: 1,
      positionRank: 1,
      composites: { weekly: 61, ros: 60, oneYear: 58, threeYear: 56, dynasty: 55.3 },
    });
    const bowers = player({
      playerId: 'pt-bowers',
      position: 'TE',
      dynastyValue: 54,
      overallRank: 2,
      positionRank: 1,
      // Higher on the TE scale than the quarterback's number is on the QB scale...
      composites: { weekly: 80, ros: 79, oneYear: 78, threeYear: 77, dynasty: 76.4 },
    });
    const sides = buildDynastyModelSide([qb, bowers]);
    // ...and yet the model side keeps the board's order, because it IS the board's order.
    expect(sides.find((s) => s.canonicalPlayerId === 'pt-qb')?.overallRank).toBe(1);
    expect(sides.find((s) => s.canonicalPlayerId === 'pt-bowers')?.overallRank).toBe(2);
  });

  it('leaves a player the board did not rank UNRANKED rather than last', () => {
    const sides = buildDynastyModelSide([
      player({ dynastyValue: 88 }),
      player({ playerId: 'pt-none', dynastyValue: null, value: null, composites: null, overallRank: null, positionRank: null }),
    ]);
    const none = sides.find((s) => s.canonicalPlayerId === 'pt-none');
    expect(none?.overallRank).toBeNull();
    expect(none?.value).toBeNull();
  });

  it('agrees with the board rank the reader sees, for every player on a real board', () => {
    // The invariant in one line: subtracting the two ranks on screen must reproduce the Edge.
    const board = [
      player({ playerId: 'pt-1', dynastyValue: 100, overallRank: 1 }),
      player({ playerId: 'pt-2', position: 'RB', dynastyValue: 71, overallRank: 2 }),
      player({ playerId: 'pt-3', position: 'WR', dynastyValue: 70, overallRank: 3 }),
      player({ playerId: 'pt-4', position: 'TE', dynastyValue: 12, overallRank: 4 }),
    ];
    for (const side of buildDynastyModelSide(board)) {
      const onBoard = board.find((p) => p.playerId === side.canonicalPlayerId)!;
      expect(side.overallRank).toBe(onBoard.overallRank);
    }
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
