import { describe, expect, it } from 'vitest';
import { playerTickerValue } from '@/components/market/publishedRows';
import { buildDynastyModelSide } from '@/services/market';
import { boardSubtitle } from '@/pages/BoardPage';
import { adaptPublication } from './adapter';
import { ApiClient, fetchCurrentPublication, type ApiBoardEntry, type ApiPublicationResponse } from '@/services/api';

function entry(overrides: Partial<ApiBoardEntry>): ApiBoardEntry {
  return {
    canonicalId: 'pt-a', position: 'WR', normalizedInputChecksum: 'in', outputChecksum: 'out',
    name: 'A', team: null, age: 25, playerStatus: 'active', asOf: '2026-09-12T00:00:00Z',
    outputStatus: 'OK', readiness: 'READY', readinessMissingCount: 0, honestyState: 'COMPLETE',
    engineInvoked: true, publicConfidenceLabel: 'HIGH', confidenceScore: 80, confidenceLabel: 'HIGH',
    volatilityScore: 20, volatilityLabel: 'LOW',
    composites: { weekly: 50, ros: 50, oneYear: 50, threeYear: 50, dynasty: 50 }, limitations: [],
    modelTier: 'FULL', modelVersion: 'test', positionValue: 50, positionalRank: 99, role: null,
    explanation: null, positiveFactors: [], negativeFactors: [], materialMissingInputs: [],
    insufficientReason: null, provenance: null, dynastyValue: 70, dynastySurplus: 1,
    dynastyDepth: 0, dynastyValueSource: 'ABOVE_REPLACEMENT', dynastyPositionRank: 1,
    dynastyOverallRank: 1, leagueSchemaId: 'dynasty-superflex-12', productionCurveVersion: 'test',
    ...overrides,
  };
}

function response(entries: ApiBoardEntry[]): ApiPublicationResponse {
  return { publication: { publicationId: 'p', runId: 'r', snapshotId: 's', boardChecksum: 'c',
    entryCount: entries.length, publishedAt: '2026-09-12T00:00:00Z', supersededPublicationId: null }, entries };
}

async function throughRuntimeBoundary(entries: unknown[]) {
  const body = response(entries as ApiBoardEntry[]);
  const client = new ApiClient({ fetchFn: async () => new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  }) });
  return fetchCurrentPublication(client);
}

describe('canonical publication contract across runtime validation and adaptation', () => {
  it('retains backend ranks when equal values oppose the old frontend tie-breaker', async () => {
    const parsed = await throughRuntimeBoundary([
      entry({ canonicalId: 'pt-backend-first', dynastyOverallRank: 1, dynastyPositionRank: 1, dynastyValue: 70, composites: { weekly: 1, ros: 1, oneYear: 1, threeYear: 1, dynasty: 1 } }),
      entry({ canonicalId: 'pt-frontend-first', dynastyOverallRank: 2, dynastyPositionRank: 2, dynastyValue: 70, composites: { weekly: 99, ros: 99, oneYear: 99, threeYear: 99, dynasty: 99 } }),
    ]);
    const market = adaptPublication(parsed);
    expect(market.players.map(p => [p.playerId, p.overallRank, p.positionRank])).toEqual([
      ['pt-backend-first', 1, 1], ['pt-frontend-first', 2, 2],
    ]);
  });

  it('preserves explicit canonical null despite a diagnostic composite', async () => {
    const parsed = await throughRuntimeBoundary([entry({ dynastyValue: null, dynastyOverallRank: null,
      dynastyPositionRank: null, composites: { weekly: 55, ros: 55, oneYear: 55, threeYear: 55, dynasty: 55 } })]);
    const market = adaptPublication(parsed);
    expect(playerTickerValue(market.players[0])).toBeNull();
    expect(market.players[0]).toMatchObject({ overallRank: null, positionRank: null });
  });

  it('restores scrambled response order solely from canonical overall rank', async () => {
    const parsed = await throughRuntimeBoundary([
      entry({ canonicalId: 'rank-3', dynastyOverallRank: 3, dynastyPositionRank: 2, dynastyValue: 30 }),
      entry({ canonicalId: 'rank-1', dynastyOverallRank: 1, dynastyPositionRank: 1, dynastyValue: 90 }),
      entry({ canonicalId: 'rank-2', position: 'QB', dynastyOverallRank: 2, dynastyPositionRank: 1, dynastyValue: 60 }),
    ]);
    expect(adaptPublication(parsed).players.map(player => [player.playerId, player.overallRank])).toEqual([
      ['rank-1', 1], ['rank-2', 2], ['rank-3', 3],
    ]);
  });

  it('does not infer legacy mode from an entirely unvalued current board', async () => {
    const parsed = await throughRuntimeBoundary([
      entry({ canonicalId: 'u2', dynastyValue: null, dynastyOverallRank: null, dynastyPositionRank: null }),
      entry({ canonicalId: 'u1', dynastyValue: null, dynastyOverallRank: null, dynastyPositionRank: null }),
    ]);
    const market = adaptPublication(parsed);
    expect(market.dynastyContract).toBe('canonical');
    expect(market.players.map(player => player.playerId)).toEqual(['u1', 'u2']);
    expect(market.players.every(player => playerTickerValue(player) === null && player.overallRank === null)).toBe(true);
  });

  it('uses dynastyPositionRank rather than the accessible-model positionalRank', async () => {
    const parsed = await throughRuntimeBoundary([
      entry({ positionalRank: 99, dynastyPositionRank: 4, dynastyOverallRank: 10 }),
    ]);
    const player = adaptPublication(parsed).players[0];
    expect(player.positionRank).toBe(4);
    expect(player.publishedPositionalRank).toBe(99);
  });

  it('keeps genuine legacy compatibility explicit and separate from canonical Market Edge', async () => {
    const { dynastyValue: _value, dynastyOverallRank: _overall, dynastyPositionRank: _position, ...legacy } = entry({});
    const parsed = await throughRuntimeBoundary([{ ...legacy, composites: { weekly: 42, ros: 42, oneYear: 42, threeYear: 42, dynasty: 42 } }]);
    const market = adaptPublication(parsed);
    expect(market.dynastyContract).toBe('legacy');
    expect(playerTickerValue(market.players[0])).toBe(42);
    expect(boardSubtitle(market)).toMatch(/Legacy composite board/);
    expect(buildDynastyModelSide(market.players)[0]).toMatchObject({
      value: null, overallRank: null, positionRank: null,
    });
  });

  it.each([
    ['mixed contract', [entry({ canonicalId: 'current' }), (() => {
      const { dynastyValue: _v, dynastyOverallRank: _o, dynastyPositionRank: _p, ...legacy } = entry({ canonicalId: 'legacy' });
      return legacy;
    })()]],
    ['invalid rank', [entry({ dynastyOverallRank: 0 })]],
    ['duplicate rank', [entry({ canonicalId: 'one' }), entry({ canonicalId: 'two', position: 'QB', dynastyPositionRank: 1 })]],
    ['ranked null value', [entry({ dynastyValue: null })]],
    ['unranked canonical value', [entry({ dynastyOverallRank: null, dynastyPositionRank: null })]],
  ])('rejects %s at runtime validation', async (_name, entries) => {
    await expect(throughRuntimeBoundary(entries)).rejects.toMatchObject({ kind: 'invalidResponse' });
  });

  it('does not compact surviving ranks when an unsupported entry is rejected', async () => {
    const parsed = await throughRuntimeBoundary([
      entry({ canonicalId: 'one', dynastyOverallRank: 1, dynastyPositionRank: 1 }),
      entry({ canonicalId: 'drop-k', position: 'K', dynastyOverallRank: 2, dynastyPositionRank: 1 }),
      entry({ canonicalId: 'three', position: 'QB', dynastyOverallRank: 3, dynastyPositionRank: 1 }),
    ]);
    const market = adaptPublication(parsed);
    expect(market.players.map(player => player.overallRank)).toEqual([1, 3]);
    expect(market.rejected).toMatchObject([{ canonicalId: 'drop-k', reason: 'unknownPosition' }]);
  });
});
