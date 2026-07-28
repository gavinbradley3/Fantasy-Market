// Publication adapter tests (Phase 10).
//
// The load-bearing assertion running through all of these: an absent field stays absent. If a
// single case ever produced a number the backend did not publish, the site would be lying.

import { describe, expect, it } from 'vitest';
import { adaptPublication, PublicationAdapterError } from './adapter';
import type { ApiBoardEntry, ApiPublicationResponse } from '@/services/api';

function entry(over: Partial<ApiBoardEntry> = {}): ApiBoardEntry {
  return {
    canonicalId: 'pt-wr',
    position: 'WR',
    normalizedInputChecksum: 'ni',
    outputChecksum: 'out',
    name: 'Test Receiver',
    team: 'CIN',
    age: 26,
    playerStatus: 'active',
    asOf: '2025-10-01T00:00:00.000Z',
    outputStatus: 'OK',
    readiness: 'READY',
    readinessMissingCount: 0,
    honestyState: 'COMPLETE',
    engineInvoked: true,
    publicConfidenceLabel: 'HIGH',
    confidenceScore: 80,
    confidenceLabel: 'HIGH',
    volatilityScore: 30,
    volatilityLabel: 'LOW',
    composites: { weekly: 70, ros: 68, oneYear: 66, threeYear: 62, dynasty: 60 },
    limitations: ['UNVALIDATED_MODEL'],
    modelTier: 'FULL',
    modelVersion: 'wr-mvp-1.0',
    positionValue: null,
    positionalRank: null,
    role: null,
    explanation: null,
    positiveFactors: [],
    negativeFactors: [],
    materialMissingInputs: [],
    insufficientReason: null,
    provenance: null,
    ...over,
  };
}

function response(entries: ApiBoardEntry[]): ApiPublicationResponse {
  return {
    publication: {
      publicationId: 'pub-1',
      runId: 'run-1',
      snapshotId: 'snap-1',
      boardChecksum: 'chk',
      entryCount: entries.length,
      publishedAt: '2026-01-01T00:00:00.000Z',
      supersededPublicationId: null,
    },
    entries,
  };
}

describe('adaptPublication — a valid publication', () => {
  it('preserves identity, position, team, value, confidence and honesty fields', () => {
    const market = adaptPublication(response([entry()]));
    const p = market.players[0];
    expect(p.playerId).toBe('pt-wr'); // preserved verbatim — never re-keyed
    expect(p.name).toBe('Test Receiver');
    expect(p.position).toBe('WR');
    expect(p.team).toBe('CIN');
    expect(p.age).toBe(26);
    expect(p.value).toBe(70); // the weekly composite, the default horizon
    expect(p.composites).toEqual({ weekly: 70, ros: 68, oneYear: 66, threeYear: 62, dynasty: 60 });
    expect(p.confidenceScore).toBe(80);
    expect(p.confidenceLabel).toBe('HIGH');
    expect(p.volatilityLabel).toBe('LOW');
    expect(p.honestyState).toBe('COMPLETE');
    expect(p.limitations).toEqual(['UNVALIDATED_MODEL']);
    expect(p.outputChecksum).toBe('out');
    expect(market.publicationId).toBe('pub-1');
    expect(market.publishedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(market.valuedCount).toBe(1);
    expect(market.rejected).toEqual([]);
  });

  it('honors the requested horizon when choosing the displayed value', () => {
    const market = adaptPublication(response([entry()]), { horizon: 'dynasty' });
    expect(market.horizon).toBe('dynasty');
    expect(market.players[0].value).toBe(60);
  });
});

describe('adaptPublication — all four positions', () => {
  const board = [
    entry({ canonicalId: 'pt-qb', position: 'QB', name: 'Passer', composites: { weekly: 90, ros: 1, oneYear: 1, threeYear: 1, dynasty: 1 } }),
    entry({ canonicalId: 'pt-rb', position: 'RB', name: 'Runner', composites: { weekly: 80, ros: 1, oneYear: 1, threeYear: 1, dynasty: 1 } }),
    entry({ canonicalId: 'pt-wr', position: 'WR', name: 'Receiver', composites: { weekly: 70, ros: 1, oneYear: 1, threeYear: 1, dynasty: 1 } }),
    entry({ canonicalId: 'pt-te', position: 'TE', name: 'End', composites: { weekly: 60, ros: 1, oneYear: 1, threeYear: 1, dynasty: 1 } }),
  ];

  it('admits QB, RB, WR and TE', () => {
    const market = adaptPublication(response(board));
    expect(market.players.map((p) => p.position)).toEqual(['QB', 'RB', 'WR', 'TE']);
    expect(market.rejected).toEqual([]);
  });

  it('ranks overall by published value and per position independently', () => {
    const market = adaptPublication(response(board));
    expect(market.players.map((p) => p.overallRank)).toEqual([1, 2, 3, 4]);
    // One player per position here, so every positionRank is 1.
    expect(market.players.map((p) => p.positionRank)).toEqual([1, 1, 1, 1]);
  });

  it('ranks within a position when several share it', () => {
    const wrs = [
      entry({ canonicalId: 'a', position: 'WR', composites: { weekly: 50, ros: null, oneYear: null, threeYear: null, dynasty: null } }),
      entry({ canonicalId: 'b', position: 'WR', composites: { weekly: 90, ros: null, oneYear: null, threeYear: null, dynasty: null } }),
      entry({ canonicalId: 'c', position: 'RB', composites: { weekly: 70, ros: null, oneYear: null, threeYear: null, dynasty: null } }),
    ];
    const market = adaptPublication(response(wrs));
    expect(market.players.map((p) => [p.playerId, p.overallRank, p.positionRank])).toEqual([
      ['b', 1, 1],
      ['c', 2, 1],
      ['a', 3, 2],
    ]);
  });

  it('rejects an unsupported position instead of guessing one of the four', () => {
    const market = adaptPublication(response([entry({ canonicalId: 'pt-k', position: 'K' })]));
    expect(market.players).toHaveLength(0);
    expect(market.rejected).toEqual([
      { canonicalId: 'pt-k', reason: 'unknownPosition', detail: expect.stringContaining('"K"') },
    ]);
  });
});

describe('adaptPublication — missing and invalid data', () => {
  it('carries missing optional fields through as null, never as zero', () => {
    const unvalued = entry({
      name: null,
      team: null,
      age: null,
      composites: null,
      confidenceScore: null,
      confidenceLabel: null,
      publicConfidenceLabel: null,
      volatilityScore: null,
      volatilityLabel: null,
      outputStatus: 'UNAVAILABLE',
      readiness: 'NOT_READY',
      readinessMissingCount: 19,
      honestyState: 'UNAVAILABLE',
      engineInvoked: false,
    });
    const market = adaptPublication(response([unvalued]));
    const p = market.players[0];
    expect(p.value).toBeNull();
    expect(p.composites).toBeNull();
    expect(p.confidenceScore).toBeNull();
    expect(p.volatilityLabel).toBeNull();
    expect(p.name).toBeNull();
    expect(p.team).toBeNull();
    // Explicitly NOT zero / "" / "UNKNOWN".
    expect(p.value).not.toBe(0);
    expect(p.confidenceScore).not.toBe(0);
    // An unvalued player is unranked rather than ranked last with a fake value.
    expect(p.overallRank).toBeNull();
    expect(p.positionRank).toBeNull();
    expect(market.valuedCount).toBe(0);
    // The honest state still comes through so the UI can explain the absence.
    expect(p.readiness).toBe('NOT_READY');
    expect(p.readinessMissingCount).toBe(19);
  });

  it('orders unvalued players after valued ones, deterministically by id', () => {
    const none = { weekly: null, ros: null, oneYear: null, threeYear: null, dynasty: null };
    const market = adaptPublication(
      response([
        entry({ canonicalId: 'z-unvalued', composites: null }),
        entry({ canonicalId: 'm-valued', composites: { ...none, weekly: 10 } }),
        entry({ canonicalId: 'a-unvalued', composites: null }),
      ]),
    );
    expect(market.players.map((p) => p.playerId)).toEqual(['m-valued', 'a-unvalued', 'z-unvalued']);
  });

  it('is order-stable for players sharing a value', () => {
    const same = { weekly: 42, ros: null, oneYear: null, threeYear: null, dynasty: null };
    const build = (ids: string[]) =>
      adaptPublication(response(ids.map((id) => entry({ canonicalId: id, composites: same })))).players.map(
        (p) => p.playerId,
      );
    expect(build(['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
    expect(build(['b', 'c', 'a'])).toEqual(['a', 'b', 'c']);
  });

  it('rejects a record with no id', () => {
    const market = adaptPublication(response([entry({ canonicalId: '  ' }), entry()]));
    expect(market.players.map((p) => p.playerId)).toEqual(['pt-wr']);
    expect(market.rejected[0]).toMatchObject({ canonicalId: null, reason: 'missingId' });
  });

  it('rejects a duplicate canonical id and keeps the first occurrence', () => {
    const first = entry({ canonicalId: 'dupe', name: 'First' });
    const second = entry({ canonicalId: 'dupe', name: 'Second' });
    const market = adaptPublication(response([first, second]));
    expect(market.players).toHaveLength(1);
    expect(market.players[0].name).toBe('First');
    expect(market.rejected).toEqual([
      { canonicalId: 'dupe', reason: 'duplicateId', detail: expect.any(String) },
    ]);
  });

  it('rejects a non-finite value rather than coercing it', () => {
    const bad = entry({
      composites: { weekly: Number.NaN, ros: null, oneYear: null, threeYear: null, dynasty: null },
    });
    const market = adaptPublication(response([bad]));
    expect(market.players).toHaveLength(0);
    expect(market.rejected[0]).toMatchObject({ reason: 'invalidValue' });
  });

  it('throws for a structurally unusable response instead of returning a half-board', () => {
    expect(() => adaptPublication({ publication: undefined, entries: [] } as never)).toThrow(
      PublicationAdapterError,
    );
    expect(() => adaptPublication({ ...response([]), entries: undefined } as never)).toThrow(
      PublicationAdapterError,
    );
  });

  it('adapts an empty board without inventing players', () => {
    const market = adaptPublication(response([]));
    expect(market.players).toEqual([]);
    expect(market.valuedCount).toBe(0);
    expect(market.rejected).toEqual([]);
  });
});

describe('model tier reaches the frontend intact', () => {
  it('copies a FULL tier through', () => {
    const market = adaptPublication(response([entry()]));
    expect(market.players[0].modelTier).toBe('FULL');
    expect(market.players[0].modelVersion).toBe('wr-mvp-1.0');
  });

  it('copies an ACCESSIBLE tier through with its product-facing fields', () => {
    const market = adaptPublication(
      response([
        entry({
          canonicalId: 'pt-rb',
          position: 'RB',
          modelTier: 'ACCESSIBLE',
          modelVersion: 'rb-accessible-1.0',
          positionValue: 71.4,
          positionalRank: 12,
          role: 'Three-down lead back',
          explanation: 'Three-down lead back. Valued from 49 observed games...',
          positiveFactors: ['Carries a lead-back workload.'],
          negativeFactors: ['Only 4 career games observed.'],
          materialMissingInputs: ['Route participation (no free per-player route data since 2023)'],
          provenance: {
            gamesObserved: 49,
            seasonsObserved: 3,
            teamSharesDerived: true,
            observedFields: ['carries'],
            derivedFields: ['yards_per_carry_shrunk'],
            unavailableFields: ['career_routes'],
          },
        }),
      ]),
    );
    const p = market.players[0];
    expect(p.modelTier).toBe('ACCESSIBLE');
    expect(p.positionValue).toBe(71.4);
    expect(p.publishedPositionalRank).toBe(12);
    expect(p.role).toBe('Three-down lead back');
    expect(p.materialMissingInputs[0]).toMatch(/Route participation/);
    expect(p.provenance?.unavailableFields).toContain('career_routes');
    expect(p.provenance?.teamSharesDerived).toBe(true);
  });

  it('treats an unrecognized or absent tier as INSUFFICIENT rather than as a full valuation', () => {
    // The safe direction: an unlabelled valuation must never render as full-model output.
    const market = adaptPublication(
      response([entry({ modelTier: 'SOMETHING_NEW' as never })]),
    );
    expect(market.players[0].modelTier).toBe('INSUFFICIENT');
  });

  it('carries the insufficient reason so the UI can explain itself', () => {
    const market = adaptPublication(
      response([
        entry({
          modelTier: 'INSUFFICIENT',
          composites: null,
          insufficientReason: 'The player appeared in games but was never targeted.',
        }),
      ]),
    );
    expect(market.players[0].value).toBeNull();
    expect(market.players[0].insufficientReason).toMatch(/never targeted/);
  });
});
