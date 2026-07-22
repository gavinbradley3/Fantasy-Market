// End-to-end PRODUCTION tests (Cold-audit M1/M2/M3/m3/m5). These drive the real
// `runInference(NormalizedInferenceInput)` — the caller supplies normalized evidence +
// observed facts and the AIL runs Phase 2A/2B + projections + D1 + D2 INTERNALLY. No
// precomputed inference fields are supplied.

import { describe, expect, it } from 'vitest';
import { runInference } from '@/inference/production/runInference';
import type { NormalizedInferenceInput } from '@/inference/production/types';
import type { NormalizedEvidence } from '@/inference/production/orchestrate';
import { present, notProvided } from '@/pipeline/provenance';
import type { CanonicalPlayer, SupportedPosition } from '@/pipeline/types';
import { readFixture } from '@/pipeline/test-support';
import { METADATA_KEYS } from '@/inference/production/fieldKinds';
import { assessTEReadiness, assessWRReadiness } from '@/pipeline/readiness/engineReadiness';
import { evaluateTightEnd } from '@/te-model';
import { evaluateWideReceiver } from '@/wr-model';
import { baseInput as teBaseInput } from '../../../tests/te-model/helpers';

const T = '2026-07-01T00:00:00.000Z';

function player(position: SupportedPosition, overrides: Partial<CanonicalPlayer> = {}): CanonicalPlayer {
  return {
    identity: { canonical_id: 'pt_e2e', provider_ids: { sleeper: '1' }, name_normalized: 'e2e', newly_created: false },
    position,
    full_name: present('E2E Player', 'sleeper', T),
    team: present('CIN', 'sleeper', T),
    age: present(26, 'sleeper', T),
    birth_date: notProvided(),
    nfl_seasons_completed: present(4, 'sleeper', T),
    rookie_year: notProvided(),
    draft_year: notProvided(),
    draft_round: present(1, 'nflverse', T),
    draft_pick: notProvided(),
    height_inches: notProvided(),
    weight_pounds: notProvided(),
    jersey_number: notProvided(),
    status: present('active', 'sleeper', T),
    injury_designation: notProvided(),
    headshot_url: notProvided(),
    provenance: { sources: ['sleeper'], generated_at: T },
    ...overrides,
  };
}

const wrFacts = () => (readFixture('metrics.sample.json') as { wr: Record<string, Record<string, unknown>> }).wr.pt_0001;

function normInput(
  position: SupportedPosition,
  facts: Record<string, unknown>,
  evidence: NormalizedEvidence,
  overrides: Partial<NormalizedInferenceInput> = {},
): NormalizedInferenceInput {
  return {
    player: player(position),
    asOf: T,
    facts,
    evidence,
    freshnessBySource: { nflverse_weekly: 1, snaps: 1, participation: 1, pbp: 1, schedule: 1, injury: 1, official_starts: 1 },
    snapshotIds: ['s1'],
    engineVersion: `${position.toLowerCase()}-mvp-1.0`,
    ...overrides,
  };
}

function teFactsComplete(): Record<string, unknown> {
  const input = teBaseInput() as unknown as Record<string, unknown>;
  const meta = new Set([...METADATA_KEYS.TE, 'scoring']);
  const facts: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (!meta.has(k)) facts[k] = v;
  return facts;
}

describe('E2E production runInference (normalized input; Phase 2A/2B/D1/D2 run internally)', () => {
  // --- WR ---
  it('1. WR full observed facts: Phase 2A/2B + D1 execute; facts stay authoritative; engine equivalence', () => {
    const evidence: NormalizedEvidence = {
      expectedGames: { gamesLeft: 12, availProb: 0.97, missedRateLast16: 0 },
      competition: { kind: 'teammates', position: 'WR', teammates: [{ canonicalId: 't1', draftRound: 2, usageShare: 0.15, status: 'ACTIVE', recentlyAcquiredOrReturned: false }] },
      security: { draftRound: 1, age: 26, yearsWithTeam: 3, recentUsageShare: 0.24, negativeTransaction: 'NONE' },
      qbEnv: { adjustedYardsPerAttempt: 7.2, projectedTeamDropbacks: 36, sackRate: 0.06, recentStartRate: 0.95 },
      d1: { position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [40, 42, 44, 45] },
    };
    const res = runInference(normInput('WR', wrFacts(), evidence));
    // Phase 2A / D1 actually executed in production:
    expect(res.d1Diagnostics).not.toBeNull();
    expect(res.d1Diagnostics?.emittedValue).not.toBeNull();
    expect(res.inferredFields.some((f) => f.field === 'expected_games_remaining')).toBe(true);
    expect(res.inferredFields.some((f) => f.field === 'career_routes')).toBe(true);
    expect(res.ailSupplement.competition_pressure).toBeTypeOf('number');
    // Facts authoritative + engine equivalence to the pre-AIL path.
    const facts = wrFacts();
    for (const k of Object.keys(facts)) expect(res.mergedSupplement[k]).toEqual(facts[k]);
    const direct = assessWRReadiness(player('WR'), facts as never, T);
    if (direct.status !== 'READY') throw new Error('WR fixture not ready');
    expect(res.readinessStatus).toBe('READY');
    expect(res.engineOutput).toEqual(evaluateWideReceiver(direct.input));
  });

  it('2. WR D1 estimate above the ceiling: emitted 299, uncapped in sidecar, PROXY', () => {
    const evidence: NormalizedEvidence = {
      d1: { position: 'WR', chartedCareerRoutes: null, wrCoveredPassPlayParticipations: [500, 500, 500, 500] },
    };
    const res = runInference(normInput('WR', {}, evidence));
    expect(res.ailSupplement.career_routes).toBe(299); // §8.4 cap
    expect(res.d1Diagnostics?.uncappedEstimate).toBe(1940); // 2000 * 0.97
    expect(res.d1Diagnostics?.provenance).toBe('PROXY');
    expect(res.d1Diagnostics?.tierPenalty).toBe(80); // computed on capped value (§20.F7)
  });

  it('3. Productive WR with null route participation → reduced role ladder (internal)', () => {
    const evidence: NormalizedEvidence = {
      wrRole: { gamesObservedL4: 4, preseasonPriorAvailable: false, routePartL4: null, targetShare: 0.26, adot: null },
    };
    const res = runInference(normInput('WR', {}, evidence));
    expect(res.wrRoleClass).toBe('high_volume_primary'); // not reserve_developmental
  });

  // --- RB ---
  it('4. RB route proxy uses the RB-only 0.42 factor (never the WR 0.97)', () => {
    const evidence: NormalizedEvidence = {
      d1: { position: 'RB', chartedCareerRoutes: null },
      rbRouteProxy: { rbPassPlaySnaps: 20, teamDropbacks: 40 },
    };
    const res = runInference(normInput('RB', {}, evidence));
    // 0.42 * (20/40) = 0.21 ; the WR factor (0.97) would give 0.485.
    expect(res.d1Diagnostics?.rbRouteParticipationLast4).toBeCloseTo(0.21, 4);
    expect(res.d1Diagnostics?.status).toBe('UNAVAILABLE'); // RB career_routes never computed
  });

  it('5. RB known suspension: expected games reflect the carve-out internally', () => {
    const evidence: NormalizedEvidence = {
      expectedGames: { gamesLeft: 9, availProb: 0.0, missedRateLast16: 0, suspension: { suspended: true, remainingSuspendedGames: 2 } },
    };
    const res = runInference(normInput('RB', {}, evidence));
    const eg = res.inferredFields.find((f) => f.field === 'expected_games_remaining');
    expect(eg?.value).toBe(6.8); // §20.F6, not 0.0
  });

  // --- TE ---
  it('6. TE complete-facts baseline equivalence (explicit; m4)', () => {
    const facts = teFactsComplete();
    const res = runInference(normInput('TE', facts, {}));
    expect(res.readinessStatus).toBe('READY');
    const direct = assessTEReadiness(player('TE'), facts as never, T);
    if (direct.status !== 'READY') throw new Error('TE fixture not ready');
    // Merged TE engine input field-equivalent; complete engine output identical.
    expect(res.engineOutput).toEqual(evaluateTightEnd(direct.input));
    // AIL never overwrote an observed fact.
    for (const k of Object.keys(facts)) expect(res.mergedSupplement[k]).toEqual(facts[k]);
  });

  it('7. TE missing route participation: AIL does not own the engine fallback', () => {
    const facts = teFactsComplete();
    delete facts.route_participation_last4;
    delete facts.route_participation_last8;
    const res = runInference(normInput('TE', facts, { teRole: { gamesObservedL4: 4, preseasonPriorAvailable: false, routePartL4: null, snapShareL4: 0.8, targetShare: 0.14 } }));
    // The AIL leaves route_participation_* to the engine (never emits it).
    expect('route_participation_last4' in res.ailSupplement).toBe(false);
    // Readiness/engine follow the frozen contract (engine owns its snap proxy).
    const direct = assessTEReadiness(player('TE'), facts as never, T);
    expect(res.readinessStatus).toBe(direct.status);
  });

  // --- QB ---
  const qbGames = () =>
    Array.from({ length: 60 }, (_, i) => ({ gameId: `g${i}`, kickoff: `2024-09-${String((i % 28) + 1).padStart(2, '0')}T17:00:00.000Z`, seasonType: 'REG' as const, season: 2024, team: 'CIN', qbSnapShare: 0.95, passAttempts: 30 }));

  it('8. QB official DIRECT starts → D2 runs internally; established classification authorized', () => {
    const evidence: NormalizedEvidence = {
      d2: { asOf: T, official: { careerStarts: 60, recentStarts: 16, recentGames: 17, provenance: 'DIRECT' } },
      qbRole: { benchedWithin4Weeks: false, temporaryInjuryReplacement: false, recentStartRate: 0.94, careerStarts: 60, startsProvenance: 'DIRECT', nflSeasonsCompleted: 8, depthChartStatus: 'STARTER', veteranBridgeSigned: false, twoQbStartSignal: false },
    };
    const res = runInference(normInput('QB', {}, evidence));
    expect(res.d2Diagnostics?.startsOfficial).toBe(true);
    const roleStatus = res.inferredFields.find((f) => f.field === 'role_status');
    expect(roleStatus?.value).toBe('ESTABLISHED_STARTER');
  });

  it('9. QB official DERIVED starts → official handling', () => {
    const evidence: NormalizedEvidence = {
      d2: { asOf: T, official: { careerStarts: 60, recentStarts: 16, recentGames: 17, provenance: 'DERIVED' } },
      qbRole: { benchedWithin4Weeks: false, temporaryInjuryReplacement: false, recentStartRate: 0.94, careerStarts: 60, startsProvenance: 'DERIVED', nflSeasonsCompleted: 8, depthChartStatus: 'STARTER', veteranBridgeSigned: false, twoQbStartSignal: false },
    };
    const res = runInference(normInput('QB', {}, evidence));
    expect(res.d2Diagnostics?.startsOfficial).toBe(true);
    const career = res.inferredFields.find((f) => f.field === 'career_starts');
    expect(career?.provenance).toBe('DERIVED');
    expect(res.inferredFields.find((f) => f.field === 'role_status')?.value).toBe('ESTABLISHED_STARTER');
  });

  it('10. QB functional inferred starts only: MODEL_ESTIMATE retained; established tier inaccessible', () => {
    const games = qbGames();
    const evidence: NormalizedEvidence = {
      d2: { asOf: T, games, last17TeamGameIds: games.slice(0, 17).map((g) => g.gameId) },
      qbRole: { benchedWithin4Weeks: false, temporaryInjuryReplacement: false, recentStartRate: 0.94, careerStarts: 60, startsProvenance: 'MODEL_ESTIMATE', nflSeasonsCompleted: 8, depthChartStatus: 'STARTER', veteranBridgeSigned: false, twoQbStartSignal: false },
    };
    const res = runInference(normInput('QB', {}, evidence));
    expect(res.d2Diagnostics?.startsOfficial).toBe(false);
    expect(res.inferredFields.find((f) => f.field === 'career_starts')?.provenance).toBe('MODEL_ESTIMATE');
    expect(res.inferredFields.find((f) => f.field === 'role_status')?.value).not.toBe('ESTABLISHED_STARTER');
  });

  it('m3: D2 recent_games=0 → recent_starts NOT_APPLICABLE; starter-stability coerced to 0', () => {
    const evidence: NormalizedEvidence = {
      d2: { asOf: T, games: qbGames(), last17TeamGameIds: [] }, // recent window empty
    };
    const res = runInference(normInput('QB', {}, evidence));
    expect(res.d2Diagnostics?.recentGames).toBe(0);
    expect(res.d2Diagnostics?.recentStartRate).toBeNull();
    expect(res.d2Diagnostics?.starterStabilityRate).toBe(0); // §6.2 coercion (m3)
    const recent = res.inferredFields.find((f) => f.field === 'recent_starts');
    expect(recent?.status).toBe('NOT_APPLICABLE');
  });

  // --- cross-cutting ---
  it('11. shuffled construction order → identical checksums, serialized bytes, reproducibility', () => {
    const facts = wrFacts();
    const shuffled = Object.fromEntries(Object.entries(facts).reverse());
    const evidence: NormalizedEvidence = { expectedGames: { gamesLeft: 12, availProb: 0.97, missedRateLast16: 0 } };
    const a = runInference(normInput('WR', facts, evidence));
    const b = runInference(normInput('WR', shuffled, evidence));
    expect(a.normalizedInputChecksum).toBe(b.normalizedInputChecksum);
    expect(a.serialized).toBe(b.serialized);
    expect(a.outputChecksum).toBe(b.outputChecksum);
    expect(a.reproducibility).toEqual(b.reproducibility);
    expect(a.engineOutput).toEqual(b.engineOutput);
  });

  it('12. changing one normalized-evidence value changes the input checksum', () => {
    const facts = wrFacts();
    const a = runInference(normInput('WR', facts, { expectedGames: { gamesLeft: 12, availProb: 0.97, missedRateLast16: 0 } }));
    const b = runInference(normInput('WR', facts, { expectedGames: { gamesLeft: 8, availProb: 0.97, missedRateLast16: 0 } }));
    expect(a.normalizedInputChecksum).not.toBe(b.normalizedInputChecksum);
  });

  it('12b. a non-input factor (freshnessBySource) does not change the input checksum', () => {
    const facts = wrFacts();
    const ev: NormalizedEvidence = { expectedGames: { gamesLeft: 12, availProb: 0.97, missedRateLast16: 0 } };
    const a = runInference(normInput('WR', facts, ev, { freshnessBySource: { nflverse_weekly: 1, snaps: 1, participation: 1, pbp: 1, schedule: 1, injury: 1 } }));
    const b = runInference(normInput('WR', facts, ev, { freshnessBySource: { nflverse_weekly: 0.7, snaps: 0.7, participation: 0.7, pbp: 0.7, schedule: 0.7, injury: 0.7 } }));
    expect(a.normalizedInputChecksum).toBe(b.normalizedInputChecksum); // input unchanged
    expect(a.sourceQuality.sourceQualityFactor).not.toBe(b.sourceQuality.sourceQualityFactor); // output changed
  });

  it('13. future-dated fact cannot affect the production result (m5)', () => {
    const facts = { ...wrFacts(), career_routes: 999 };
    const factTimestamps = { career_routes: '2026-08-01T00:00:00.000Z' }; // AFTER asOf
    const res = runInference(normInput('WR', facts, {}, { factTimestamps }));
    expect(res.excludedFutureFacts).toContain('career_routes');
    // the future fact does not appear in the merged supplement …
    expect(res.mergedSupplement.career_routes).not.toBe(999);
    // … and the input checksum equals the case where that fact is simply ABSENT
    // (the excluded future value never enters the normalized input).
    const factsNoCR = { ...wrFacts() };
    delete factsNoCR.career_routes;
    const clean = runInference(normInput('WR', factsNoCR, {}));
    expect(res.normalizedInputChecksum).toBe(clean.normalizedInputChecksum);
  });

  it('13b. future-dated direct fact that would make a player READY is excluded → NOT_READY', () => {
    // A single AIL-critical fact supplied only via a future timestamp is dropped.
    const facts = { career_routes: 500 };
    const res = runInference(normInput('WR', facts, {}, { factTimestamps: { career_routes: '2026-08-01T00:00:00.000Z' } }));
    expect(res.excludedFutureFacts).toContain('career_routes');
    expect(res.readinessStatus).toBe('NOT_READY');
  });

  it('14. NOT_READY player: complete envelope still serialized; no fabricated valuation', () => {
    const res = runInference(normInput('WR', {}, {}));
    expect(res.readinessStatus).toBe('NOT_READY');
    expect(res.engineInvoked).toBe(false);
    expect(res.engineOutput).toBeNull();
    const parsed = JSON.parse(res.serialized) as Record<string, unknown>;
    expect(parsed.status).toBe('UNAVAILABLE');
    expect(parsed.sidecar).toBeTypeOf('object');
    expect(parsed.honesty_state).toBe('UNAVAILABLE');
    expect(Array.isArray((parsed as { fields: unknown }).fields)).toBe(true);
  });
});
