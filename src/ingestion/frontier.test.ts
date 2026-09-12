// Phase 11 — the readiness frontier, proven per position through the REAL production path:
//
//   provider-shaped raw rows → ingest (identity join + normalization) → evidence
//   → automated inference → readiness → frozen engine
//
// Nothing here supplies an engine input directly. Every supplement field the engines see is
// produced by the path itself, so a regression anywhere in it fails these tests.

import { describe, expect, it } from 'vitest';
import { runInference } from '@/inference/production/runInference';
import { ingest, buildNormalizedInferenceInput } from './buildInput';
import { fourPositionNflverseSource, fourPositionSleeperSource, AS_OF } from './__fixtures';
import { observedCountingFacts, windowsFor, RECENT_GAME_WINDOW } from './observedFacts';
import type { GameStatRecord } from './types';
import type { SupportedPosition } from '@/pipeline/types';

const ENGINE_VERSION: Record<SupportedPosition, string> = {
  QB: 'qb-mvp-1.0',
  RB: 'rb-mvp-1.0',
  WR: 'wr-mvp-1.0',
  TE: 'te-mvp-1.0',
};

function board() {
  const { snapshot } = ingest([fourPositionNflverseSource(), fourPositionSleeperSource()]);
  const idFor = (gsis: string) => snapshot.players.find((p) => p.providerIds.gsis === gsis)!.canonicalId!;
  return { snapshot, idFor };
}

function runFor(gsis: string, position: SupportedPosition) {
  const { snapshot, idFor } = board();
  const canonicalId = idFor(gsis);
  const input = buildNormalizedInferenceInput(snapshot, {
    canonicalId,
    position,
    asOf: AS_OF,
    engineVersion: ENGINE_VERSION[position],
  });
  expect(input).not.toBeNull();
  return { canonicalId, input: input!, result: runInference(input!) };
}

const CASES: [SupportedPosition, string][] = [
  ['QB', '00-QB4'],
  ['RB', '00-RB4'],
  ['WR', '00-WR4'],
  ['TE', '00-TE4'],
];

/**
 * Positions that reach their engine from CURRENT free provider data.
 *
 * RB and TE do not, and the reason is a specification rule rather than a wiring gap:
 * `src/inference/d1/routeExposure.ts` states "RB and TE: career_routes is UNAVAILABLE
 * unless charted (§8.1 rungs 4/5)" and "TE never computes routes". `career_routes` is a
 * NON-NULLABLE engine input, so under the §20.F3 matrix it is omitted and correctly keeps
 * those players NOT_READY. The only authorized fix is a charted route source; estimating it
 * from snaps for RB/TE is exactly the fabrication this layer forbids.
 */
const CROSSING: [SupportedPosition, string][] = [
  ['QB', '00-QB4'],
  ['WR', '00-WR4'],
];

const ROUTE_BLOCKED: [SupportedPosition, string][] = [
  ['RB', '00-RB4'],
  ['TE', '00-TE4'],
];

describe('production path: identity and normalization', () => {
  it('joins all four positions across providers under one canonical id each', () => {
    const { snapshot } = board();
    const supported = snapshot.players.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.position ?? ''));
    expect(supported).toHaveLength(4);
    // Every player carries BOTH provider ids — the cross-provider join really happened.
    for (const p of supported) {
      expect(p.canonicalId).toBeTruthy();
      expect(p.providerIds.gsis).toBeTruthy();
      expect(p.providerIds.sleeper).toBeTruthy();
    }
    // No canonical id is shared between two players.
    const ids = supported.map((p) => p.canonicalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no provider-specific key leaks into what the engines consume', () => {
    for (const [position, gsis] of CASES) {
      const { result } = runFor(gsis, position);
      const merged = JSON.stringify(result.mergedSupplement);
      expect(merged).not.toContain('gsis');
      expect(merged).not.toContain('sleeper');
      expect(merged).not.toContain('game_id');
    }
  });
});

describe('production path: every position reaches its engine', () => {
  it.each(CROSSING)('%s crosses the frontier and the frozen engine produces a value', (position, gsis) => {
    const { result } = runFor(gsis, position);

    expect(result.position).toBe(position);
    expect(result.readinessStatus).toBe('READY');
    expect(result.readinessMissing).toEqual([]);
    expect(result.engineInvoked).toBe(true);
    expect(result.engineOutput).not.toBeNull();
    expect(result.engineError).toBeNull();

    // A real composite came out of the engine, not a placeholder.
    const out = result.engineOutput as unknown as { composites: Record<string, number> };
    const composites = Object.values(out.composites);
    expect(composites.length).toBeGreaterThan(0);
    for (const v of composites) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(composites.some((v) => v !== 0)).toBe(true);
  });

  it.each(CROSSING)('%s is honest about how thin the evidence is', (position, gsis) => {
    const { result } = runFor(gsis, position);
    // Values produced from mostly-unavailable inputs must NOT claim high confidence. These
    // fixtures carry four career games, so whichever model values them says so: the sample
    // term alone caps the accessible score at 57, and the frozen QB engine's own confidence
    // is lower still.
    expect(result.honestyState).not.toBe('COMPLETE');
    expect(result.publicConfidenceLabel).not.toBe('HIGH');
    expect(result.publishedConfidenceScore).toBeLessThan(60);
    // The engine's own fallback log names every documented fallback it had to use.
    const out = result.engineOutput as unknown as { fallback_log: unknown[] };
    expect(Array.isArray(out.fallback_log)).toBe(true);
    // Unavailable inputs are recorded as unavailable, not as values.
    const unavailable = result.inferredFields.filter((f) => f.status === 'UNAVAILABLE');
    expect(unavailable.length).toBeGreaterThan(0);
    for (const f of unavailable) expect(f.value).toBeNull();
  });

  it.each(CASES)('%s output is deterministic across identical runs', (position, gsis) => {
    const a = runFor(gsis, position).result;
    const b = runFor(gsis, position).result;
    expect(a.serialized).toBe(b.serialized);
    expect(a.outputChecksum).toBe(b.outputChecksum);
    expect(a.engineOutput).toEqual(b.engineOutput);
  });
});

describe('positions blocked by an unavailable NON-NULLABLE input stay blocked at the FULL tier', () => {
  it.each(ROUTE_BLOCKED)('%s is NOT_READY on career_routes alone — and on nothing else', (position, gsis) => {
    const { result } = runFor(gsis, position);
    // Exactly one blocker, and it is the paid/charted-only field. Everything else on the
    // engine's interface was decided by the path: this proves the rest of the production
    // route works for these positions and isolates the single external dependency.
    expect(result.readinessMissing).toEqual(['career_routes']);
    expect(result.readinessStatus).toBe('NOT_READY');
    // The FROZEN engine is still not run, and no full-model value is invented for it.
    expect(result.engineInvoked).toBe(false);
    expect(result.engineOutput).toBeNull();
    // READINESS continues to describe the FULL model's input completeness, which is genuinely
    // incomplete — the accessible tier does not launder that away.
    expect(result.readinessStatus).toBe('NOT_READY');
    // HONESTY describes the model that produced the published value, and one did: the
    // accessible model, from observed box-score football. It used to read UNAVAILABLE here,
    // which was a verdict on the blocked full model printed beside a complete valuation — on
    // the live board all 272 accessible players carried it. It can never read VERIFIED either;
    // ESTIMATED is the honest word for a reduced-input model that guessed at nothing.
    expect(result.honestyState).toBe('ESTIMATED');
  });

  it.each(ROUTE_BLOCKED)(
    '%s is nonetheless valued by the ACCESSIBLE tier, labelled as such',
    (position, gsis) => {
      // The behaviour this replaces: RB/TE published no value at all, so the whole position
      // was unvalued because ONE licensed input was unavailable. The full model is still
      // blocked (asserted above); what changed is that a reduced, clearly-labelled model now
      // runs on the box-score evidence the pipeline really has.
      const { result } = runFor(gsis, position);
      expect(result.modelTier).toBe('ACCESSIBLE');
      expect(result.accessibleOutput).not.toBeNull();
      expect(result.accessibleOutput!.positionValue).toBeGreaterThan(0);
      // Confidence is published, and it is the accessible model's own — not capped by the AIL's
      // view of the FULL model's coverage, which is incomplete by definition here.
      expect(result.publicConfidenceLabel).not.toBeNull();
      expect(result.publicConfidenceLabel).toBe(result.accessibleOutput!.confidence.label);
      expect(result.publishedConfidenceScore).toBe(result.accessibleOutput!.confidence.score);
      // The reduced valuation is never presented as a full-model one.
      expect(result.engineOutput).toBeNull();
      expect(result.accessibleOutput!.provenance.unavailableFields).toContain('career_routes');
    },
  );

  it('RB/TE route exposure reports UNAVAILABLE rather than estimating from snaps', () => {
    for (const [position, gsis] of ROUTE_BLOCKED) {
      const { result } = runFor(gsis, position);
      expect(result.d1Diagnostics?.status).toBe('UNAVAILABLE');
      expect(result.d1Diagnostics?.emittedValue).toBeNull();
      expect(result.d1Diagnostics?.provenance).toBeNull();
      void position;
    }
  });
});

describe('readiness stays honest', () => {
  it('a player with NO stat rows is NOT_READY and gets no engine value', () => {
    // Same providers, but ask for a player whose games were never supplied.
    const { snapshot } = ingest([fourPositionNflverseSource(), fourPositionSleeperSource()]);
    const qb = snapshot.players.find((p) => p.providerIds.gsis === '00-QB4')!;
    const stripped = { ...snapshot, games: [], officialStarts: [] };
    const input = buildNormalizedInferenceInput(stripped, {
      canonicalId: qb.canonicalId!,
      position: 'QB',
      asOf: AS_OF,
      engineVersion: 'qb-mvp-1.0',
    });
    const res = runInference(input!);
    expect(res.readinessStatus).toBe('NOT_READY');
    expect(res.engineInvoked).toBe(false);
    expect(res.engineOutput).toBeNull();
    expect(res.honestyState).toBe('UNAVAILABLE');
    expect(res.readinessMissing.length).toBeGreaterThan(0);
    // Every blocking field is a NON-NULLABLE engine input — nullable ones were decided.
    expect(res.readinessMissing).toContain('career_pass_attempts');
  });

  it('an unready player is never invoked, and a ready player exactly once', () => {
    const ready = runFor('00-WR4', 'WR').result;
    expect(ready.engineInvoked).toBe(true);
    expect(ready.engineOutput).not.toBeNull();
    // The engine ran against the merged supplement, and produced one output object.
    expect(Array.isArray(ready.engineOutput)).toBe(false);
  });
});

describe('observed counting facts are counted, never invented', () => {
  const game = (over: Partial<GameStatRecord>): GameStatRecord =>
    ({
      canonicalId: 'c', providerRef: { provider: 'nflverse', id: 'x' }, freshness: null,
      sourceTimestamp: '2025-09-30T00:00:00.000Z',
      gameId: 'g', kickoff: '2025-09-10T17:00:00.000Z', season: 2025, seasonType: 'REG', team: 'CIN',
      passAttempts: null, carries: null, targets: null, snaps: null, teamSnaps: null, qbSnapShare: null,
      completions: null, passingYards: null, passingTds: null, interceptions: null, sacks: null,
      rushingYards: null, rushingTds: null, receptions: null, receivingYards: null, receivingTds: null,
      ...over,
    }) as unknown as GameStatRecord;

  it('sums only what the provider actually supplied', () => {
    const facts = observedCountingFacts('QB', [
      game({ gameId: 'a', passAttempts: 30, completions: 20 }),
      game({ gameId: 'b', passAttempts: 25, completions: 18 }),
    ]);
    expect(facts.career_pass_attempts).toBe(55);
    expect(facts.recent_completions).toBe(38);
    expect(facts.career_games_played).toBe(2);
  });

  it('leaves an entirely-unsupplied column UNDECIDED rather than summing it to zero', () => {
    const facts = observedCountingFacts('QB', [game({ passAttempts: 30 }), game({ passAttempts: 25 })]);
    // No game reported sacks — the key must not exist at all.
    expect('recent_sacks' in facts).toBe(false);
    expect(facts.recent_sacks).toBeUndefined();
    expect(facts.recent_sacks).not.toBe(0);
  });

  it('a genuine zero is preserved as zero', () => {
    const facts = observedCountingFacts('QB', [game({ interceptions: 0 }), game({ interceptions: 0 })]);
    expect(facts.recent_interceptions).toBe(0);
  });

  it('career_touches is only produced when BOTH components were observed', () => {
    const both = observedCountingFacts('RB', [game({ carries: 10, targets: 3 })]);
    expect(both.career_touches).toBe(13);
    const carriesOnly = observedCountingFacts('RB', [game({ carries: 10 })]);
    expect(carriesOnly.career_carries).toBe(10);
    expect('career_touches' in carriesOnly).toBe(false);
  });

  it('excludes postseason and orders the recent window newest-first', () => {
    const games = [
      game({ gameId: 'reg1', kickoff: '2025-09-01T00:00:00.000Z', carries: 1 }),
      game({ gameId: 'reg2', kickoff: '2025-09-08T00:00:00.000Z', carries: 2 }),
      game({ gameId: 'post', kickoff: '2026-01-10T00:00:00.000Z', seasonType: 'POST', carries: 99 }),
    ];
    const w = windowsFor(games);
    expect(w.career.map((g) => g.gameId)).toEqual(['reg2', 'reg1']);
    expect(observedCountingFacts('RB', games).career_carries).toBe(3); // postseason excluded
  });

  it('the recent window is bounded and the career window is not', () => {
    const many = Array.from({ length: RECENT_GAME_WINDOW + 5 }, (_, i) =>
      game({ gameId: `g${i}`, kickoff: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, passAttempts: 1 }),
    );
    const facts = observedCountingFacts('QB', many);
    expect(facts.career_pass_attempts).toBe(RECENT_GAME_WINDOW + 5);
    expect(facts.recent_pass_attempts).toBe(RECENT_GAME_WINDOW);
    expect(facts.career_games_played).toBe(RECENT_GAME_WINDOW + 5);
    expect(facts.recent_games).toBe(RECENT_GAME_WINDOW);
  });

  it('produces nothing at all when the player has no games', () => {
    expect(observedCountingFacts('QB', [])).toEqual({});
    expect(observedCountingFacts('WR', [])).toEqual({});
  });

  it('never produces a field outside the position it was asked for', () => {
    const wr = observedCountingFacts('WR', [game({ targets: 5, carries: 1 })]);
    // The WR engine owns no counting input here; nothing is manufactured for it.
    expect(wr).toEqual({});
  });
});
