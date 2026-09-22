// Publication adapter tests (Phase 10).
//
// The load-bearing assertion running through all of these: an absent field stays absent. If a
// single case ever produced a number the backend did not publish, the site would be lying.

import { describe, expect, it } from 'vitest';
import { adaptPublication, PublicationAdapterError } from './adapter';
import { publicationResponseSchema, type ApiBoardEntry, type ApiPublicationResponse } from '@/services/api';

function entry(over: Partial<ApiBoardEntry> = {}): ApiBoardEntry {
  return {
    // The canonical value/rank trio is absent by default, so these cases exercise the explicit
    // legacy compatibility path. Canonical cases below supply all three fields together.
    dynastySurplus: null,
    dynastyDepth: null,
    dynastyValueSource: null,
    leagueSchemaId: null,
    productionCurveVersion: null,
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
  const rejectedHeadlines: Partial<ApiBoardEntry> = {
    positionValue: 99, positionalRank: 1, role: 'Unsupported current lead', explanation: 'Rejected conclusion',
    positiveFactors: ['Rejected positive'], negativeFactors: ['Rejected negative'],
    materialMissingInputs: ['Rejected-model diagnostic'], inputsSubstituted: 16,
    provenance: { gamesObserved: 100, seasonsObserved: 7, teamSharesDerived: true,
      observedFields: ['routes'], derivedFields: [], unavailableFields: [] },
  };

  it.each(['INSUFFICIENT', 'UNKNOWN'])('withholds diagnostic claims and legacy numbers under %s', (tier) => {
    const market = adaptPublication(response([entry({ ...rejectedHeadlines, modelTier: tier as never,
      insufficientReason: 'No supported result' })]));
    expect(market.players[0]).toMatchObject({
      value: null, composites: null, overallRank: null, positionRank: null,
      confidenceScore: null, confidenceLabel: null, publicConfidenceLabel: null,
      volatilityScore: null, volatilityLabel: null, modelVersion: null, positionValue: null,
      publishedPositionalRank: null, role: null, explanation: null, positiveFactors: [],
      negativeFactors: [], materialMissingInputs: [], inputsSubstituted: null, provenance: null,
      insufficientReason: 'No supported result', name: 'Test Receiver', limitations: ['UNVALIDATED_MODEL'],
    });
    expect(market.valuedCount).toBe(0);
  });

  it('keeps the conservative absent-tier default instead of inferring model authorization from numbers', () => {
    const { modelTier: _tier, ...preTier } = entry(rejectedHeadlines);
    const parsed = publicationResponseSchema.parse(response([preTier as ApiBoardEntry]));
    const p = adaptPublication(parsed).players[0];
    expect(p.modelTier).toBe('INSUFFICIENT');
    expect(p.value).toBeNull();
    expect(p.role).toBeNull();
    expect(p.confidenceScore).toBeNull();
    // Legacy boards declaring their producing model retain their values and old rank path.
    const declared = adaptPublication(response([entry()]));
    expect(declared.dynastyContract).toBe('legacy');
    expect(declared.players[0]).toMatchObject({ value: 70, overallRank: 1, confidenceScore: 80 });
  });

  it('does not headline confidence or role for a canonical null despite retained diagnostic composites', () => {
    const market = adaptPublication(response([entry({ ...rejectedHeadlines,
      dynastyValue: null, dynastyOverallRank: null, dynastyPositionRank: null,
    })]));
    expect(market.players[0]).toMatchObject({
      dynastyValue: null, confidenceScore: null, publicConfidenceLabel: null, role: null,
      explanation: null, positiveFactors: [], negativeFactors: [], inputsSubstituted: null, provenance: null,
    });
    expect(market.valuedCount).toBe(0);
  });

  it('rejects an unavailable canonical value without rewriting surviving canonical ranks', () => {
    const market = adaptPublication(response([
      entry({ canonicalId: 'rejected', modelTier: 'INSUFFICIENT', dynastyValue: 99,
        dynastyOverallRank: 1, dynastyPositionRank: 1 }),
      entry({ canonicalId: 'accepted', dynastyValue: 50, dynastyOverallRank: 2, dynastyPositionRank: 2 }),
    ]));
    expect(market.rejected).toMatchObject([{ canonicalId: 'rejected', reason: 'invalidValue' }]);
    expect(market.players).toHaveLength(1);
    expect(market.players[0]).toMatchObject({ playerId: 'accepted', dynastyValue: 50, overallRank: 2, positionRank: 2 });
  });

  it('never borrows full-model volatility or fallback counts for an accessible valuation', () => {
    const p = adaptPublication(response([entry({ ...rejectedHeadlines, modelTier: 'ACCESSIBLE' })])).players[0];
    expect(p.value).toBe(70);
    expect(p.confidenceScore).toBe(80);
    expect(p.volatilityScore).toBeNull();
    expect(p.volatilityLabel).toBeNull();
    expect(p.inputsSubstituted).toBeNull();
  });

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

describe('the board ranks on the SHARED cross-position value', () => {
  // Sorting the position engines' internal composites together put whichever position had the
  // widest internal scale on top — a TE scale reaching 92 beat a QB scale capped near 58,
  // regardless of who was actually more valuable. These pin the replacement.

  const withUtility = (over: Partial<ApiBoardEntry>, dynastyValue: number, composite: number) =>
    entry({
      dynastyValue,
      dynastyOverallRank: 1,
      dynastyPositionRank: 1,
      leagueSchemaId: 'dynasty-superflex-12',
      composites: { weekly: composite, ros: composite, oneYear: composite, threeYear: composite, dynasty: composite },
      ...over,
    });

  it('orders by the shared value even when the composites disagree', () => {
    const market = adaptPublication(
      response([
        // A tight end whose internal composite towers over the quarterback's.
        withUtility({ canonicalId: 'pt-te', position: 'TE', name: 'Big Scale TE', dynastyOverallRank: 2 }, 30, 92),
        withUtility({ canonicalId: 'pt-qb', position: 'QB', name: 'Superflex QB', dynastyOverallRank: 1 }, 100, 56),
      ]),
      { horizon: 'dynasty' },
    );
    expect(market.players[0].playerId).toBe('pt-qb');
    expect(market.players[0].overallRank).toBe(1);
    expect(market.players[1].playerId).toBe('pt-te');
  });

  it('carries the shared value and its league format through to the model', () => {
    const market = adaptPublication(
      response([withUtility({ canonicalId: 'pt-qb', position: 'QB' }, 87.5, 56)]),
      { horizon: 'dynasty' },
    );
    expect(market.players[0].dynastyValue).toBe(87.5);
    expect(market.players[0].leagueSchemaId).toBe('dynasty-superflex-12');
    // The position composite is still there for diagnosis — it is just not what ranked him.
    expect(market.players[0].value).toBe(56);
  });

  it('falls back to the composite for a board published before the layer existed', () => {
    const market = adaptPublication(
      response([
        entry({ canonicalId: 'pt-a', position: 'WR', composites: { weekly: 40, ros: 40, oneYear: 40, threeYear: 40, dynasty: 40 } }),
        entry({ canonicalId: 'pt-b', position: 'WR', composites: { weekly: 60, ros: 60, oneYear: 60, threeYear: 60, dynasty: 60 } }),
      ]),
      { horizon: 'dynasty' },
    );
    expect(market.players[0].playerId).toBe('pt-b');
    expect(market.players[0].dynastyValue).toBeNull();
  });

  it('leaves a player with no shared value unranked rather than ranking him last', () => {
    const market = adaptPublication(
      response([
        withUtility({ canonicalId: 'pt-qb', position: 'QB' }, 100, 56),
        entry({ canonicalId: 'pt-none', position: 'WR', dynastyValue: null, dynastyOverallRank: null,
          dynastyPositionRank: null, composites: { weekly: 50, ros: 50, oneYear: 50, threeYear: 50, dynasty: 50 } }),
      ]),
      { horizon: 'dynasty' },
    );
    const none = market.players.find((p) => p.playerId === 'pt-none')!;
    expect(none.overallRank).toBeNull();
  });
});
