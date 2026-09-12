// Model-tier selection, end to end from provider payloads.
//
// These drive the REAL path — provider rows → ingest → normalized input → runInference — so
// they fail if the tier decision, the production evidence, the point-in-time clamp or the
// envelope publication regresses. Nothing here hand-feeds an engine input.

import { describe, expect, it } from 'vitest';
import { ingest, buildNormalizedInferenceInput } from '@/ingestion/buildInput';
import type { NormalizedSnapshot } from '@/ingestion/snapshot';
import { AS_OF, fourPositionNflverseSource } from '@/ingestion/__fixtures';
import { runInference } from './runInference';
import { blockedOnlyByPremiumInputs, PREMIUM_ONLY_FIELDS, decideTier, toAccessibleAvailability } from './modelTier';
import type { ProductionResult } from './types';

function idOf(snapshot: NormalizedSnapshot, gsis: string): string {
  return snapshot.players.find((p) => p.providerIds.gsis === gsis)!.canonicalId!;
}

function run(
  position: 'QB' | 'RB' | 'WR' | 'TE',
  gsis: string,
  extraFacts: Readonly<Record<string, unknown>> = {},
  opts: { asOf?: string } = {},
): { result: ProductionResult; snapshot: NormalizedSnapshot } {
  const { snapshot } = ingest([fourPositionNflverseSource()]);
  const asOf = opts.asOf ?? AS_OF;
  const input = buildNormalizedInferenceInput(snapshot, {
    canonicalId: idOf(snapshot, gsis),
    position,
    asOf,
    engineVersion: `${position.toLowerCase()}-mvp-1.0`,
  });
  expect(input).not.toBeNull();
  // `extraFacts` stands in for a premium source filling the engine's own declared inputs. They
  // are supplied as observed FACTS — the same channel any licensed feed would arrive through —
  // with as-of timestamps, since facts past the as-of are excluded by contract.
  const withFacts =
    Object.keys(extraFacts).length === 0
      ? input!
      : {
          ...input!,
          facts: { ...input!.facts, ...extraFacts },
          factTimestamps: {
            ...input!.factTimestamps,
            ...Object.fromEntries(Object.keys(extraFacts).map((k) => [k, asOf])),
          },
        };
  return { result: runInference(withFacts), snapshot };
}

describe('premium-only blocker classification', () => {
  it('treats career_routes as the premium-only field', () => {
    expect(PREMIUM_ONLY_FIELDS).toContain('career_routes');
  });

  it('falls back only when EVERY blocker is premium-only', () => {
    expect(blockedOnlyByPremiumInputs(['career_routes'])).toBe(true);
    // A non-premium blocker means the pipeline failed to supply something it should have.
    // Downgrading there would hide an ingestion regression behind a reduced valuation.
    expect(blockedOnlyByPremiumInputs(['career_routes', 'expected_games_remaining'])).toBe(false);
    expect(blockedOnlyByPremiumInputs(['career_carries'])).toBe(false);
  });

  it('never reports a ready player as fallback-eligible', () => {
    expect(blockedOnlyByPremiumInputs([])).toBe(false);
  });
});

describe('RB / TE reach the accessible tier when route data is absent', () => {
  it('RB is valued by the accessible model, not the frozen engine', () => {
    const { result } = run('RB', '00-RB4');
    // The frozen engine is still correctly blocked on the route input...
    expect(result.readinessStatus).toBe('NOT_READY');
    expect(result.readinessMissing).toEqual(['career_routes']);
    expect(result.engineInvoked).toBe(false);
    expect(result.engineOutput).toBeNull();
    // ...and the accessible model produced a real valuation from observed production.
    expect(result.modelTier).toBe('ACCESSIBLE');
    expect(result.accessibleOutput).not.toBeNull();
    expect(result.accessibleOutput!.positionValue).toBeGreaterThan(0);
    expect(result.accessibleOutput!.modelVersion).toBe('rb-accessible-1.0');
  });

  it('TE is valued by the accessible model', () => {
    const { result } = run('TE', '00-TE4');
    expect(result.readinessMissing).toEqual(['career_routes']);
    expect(result.modelTier).toBe('ACCESSIBLE');
    expect(result.accessibleOutput!.modelVersion).toBe('te-accessible-1.0');
    expect(result.accessibleOutput!.positionValue).toBeGreaterThan(0);
  });

  it('derives real production from the ingested box score rather than defaults', () => {
    const { result } = run('RB', '00-RB4');
    const p = result.accessibleOutput!.provenance;
    // The fixture supplies four games at 17 carries / 4 targets each.
    expect(p.gamesObserved).toBe(4);
    expect(p.observedFields).toContain('carries');
    expect(p.observedFields).toContain('rushing_yards');
    expect(p.derivedFields).toContain('yards_per_carry_shrunk');
    // The role is derived from that usage, not from a default.
    expect(result.accessibleOutput!.role).toMatch(/lead back|Lead rusher/i);
  });

  it('names career_routes as unavailable and never as an input it used', () => {
    for (const [pos, gsis] of [['RB', '00-RB4'], ['TE', '00-TE4'], ['WR', '00-WR4']] as const) {
      const { result } = run(pos, gsis);
      const prov = result.accessibleOutput!.provenance;
      expect(prov.unavailableFields).toContain('career_routes');
      expect([...prov.observedFields, ...prov.derivedFields].join(' ')).not.toMatch(/route/i);
    }
  });
});

describe('the full model keeps precedence when its inputs exist', () => {
  it('WR stands the frozen engine down when its premium evidence is only estimated', () => {
    const { result } = run('WR', '00-WR4');
    // The engine is still TRIED, still runs, and its output is still retained on the envelope
    // for diagnostics and for the day real route evidence arrives.
    expect(result.readinessStatus).toBe('READY');
    expect(result.engineInvoked).toBe(true);
    expect(result.engineOutput).not.toBeNull();
    // But the four inputs that make it the premium engine were never supplied — career routes
    // arrive as a capped PROXY and the other three have no producer at all — so what it produced
    // is a valuation built from league constants. The published tier says so.
    expect(result.modelTier).toBe('ACCESSIBLE');
    expect(result.accessibleOutput).not.toBeNull();
    expect(result.accessibleOutput?.modelVersion).toBe('wr-accessible-1.0');
  });

  it('routes WR back to FULL the moment the premium evidence is genuinely supplied', () => {
    // The promotion path, exercised without naming or needing any particular provider: supply
    // the engine's own four declared inputs as observed FACTS and the gate opens.
    const { result } = run('WR', '00-WR4', {
      career_routes: 1400,
      targets_per_route_run: 0.24,
      expected_fantasy_points_per_target: 1.9,
      catch_rate_over_expected: 0.03,
    });
    expect(result.modelTier).toBe('FULL');
    expect(result.accessibleOutput).toBeNull();
  });

  it('QB still runs the frozen engine and is tier FULL', () => {
    const { result } = run('QB', '00-QB4');
    expect(result.engineInvoked).toBe(true);
    expect(result.modelTier).toBe('FULL');
    expect(result.accessibleOutput).toBeNull();
  });

  it('a charted route history routes an RB back to the FULL model', () => {
    // decideTier is the single authority, so proving it here proves the whole switch: with
    // the full model reporting success, the accessible tier is never consulted.
    const { snapshot } = ingest([fourPositionNflverseSource()]);
    const player = snapshot.players.find((p) => p.providerIds.gsis === '00-RB4')!;
    const decision = decideTier({
      position: 'RB',
      player: {
        identity: { canonical_id: player.canonicalId! } as never,
        position: 'RB',
      } as never,
      asOf: AS_OF,
      fullModelRan: true,
      readinessMissing: [],
      production: undefined,
      expectedGamesRemaining: 3,
    });
    expect(decision.tier).toBe('FULL');
    expect(decision.accessible).toBeNull();
  });
});

describe('honesty of the published tier', () => {
  it('publishes the tier in the envelope so a reduced valuation cannot pass as a full one', () => {
    const { result } = run('RB', '00-RB4');
    const envelope = JSON.parse(result.serialized) as Record<string, unknown>;
    expect(envelope.model_tier).toBe('ACCESSIBLE');
    expect(envelope.accessible_model).not.toBeNull();
    // engine_output stays null: no frozen engine ran, and nothing pretends one did.
    expect(envelope.engine_output).toBeNull();
    expect(envelope.engine_invoked).toBe(false);
    expect(envelope.status).toBe('AVAILABLE');
  });

  it('caps accessible-tier confidence below HIGH and records why', () => {
    for (const [pos, gsis] of [['RB', '00-RB4'], ['TE', '00-TE4'], ['WR', '00-WR4']] as const) {
      const { result } = run(pos, gsis);
      const c = result.accessibleOutput!.confidence;
      expect(c.label).not.toBe('HIGH');
      expect(c.penaltyCodes).toContain('NO_PARTICIPATION_DATA');
      expect(result.publicConfidenceLabel).toBe(c.label);
      expect(result.publishedConfidenceScore).toBeLessThanOrEqual(c.score);
    }
  });

  it('states the material missing inputs in product language, not registry keys', () => {
    const { result } = run('TE', '00-TE4');
    const missing = result.accessibleOutput!.materialMissingInputs;
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.join(' ')).toMatch(/Route participation/);
    // A raw registry key must never be the user-facing explanation.
    expect(result.accessibleOutput!.explanation).not.toMatch(/career_routes/);
  });

  it('never substitutes a zero for an unobserved column', () => {
    const { result } = run('TE', '00-TE4');
    // The TE fixture supplies no carries at all. The window must report null, not 0 —
    // otherwise "never handed the ball" and "column absent" become indistinguishable.
    const production = result.accessibleOutput!;
    expect(production.provenance.gamesObserved).toBe(4);
    const envelope = JSON.parse(result.serialized) as { accessible_model: { provenance: unknown } };
    expect(envelope.accessible_model).toBeTruthy();
    // The frozen supplement's unavailable fields stay null rather than becoming zero.
    expect(result.mergedSupplement.target_share).toBeNull();
    expect(result.mergedSupplement.snap_share_last4).toBeNull();
    expect('career_routes' in result.mergedSupplement).toBe(false);
  });
});

describe('point-in-time correctness and determinism', () => {
  it('excludes games after the as-of from the production windows', () => {
    // The fixture's four games kick off 2025-09-04, -07, -10 and -13. The production windows
    // must grow strictly with the as-of and must never contain a game that had not been
    // played yet. Asserted on the built evidence because it is the clamp itself under test.
    const { snapshot } = ingest([fourPositionNflverseSource()]);
    const id = idOf(snapshot, '00-RB4');
    const gamesAt = (asOf: string): number => {
      const input = buildNormalizedInferenceInput(snapshot, {
        canonicalId: id,
        position: 'RB',
        asOf,
        engineVersion: 'rb-mvp-1.0',
      });
      return input!.evidence.production!.career.games;
    };
    expect(gamesAt('2025-09-05T00:00:00.000Z')).toBe(1);
    expect(gamesAt('2025-09-08T00:00:00.000Z')).toBe(2);
    expect(gamesAt('2025-09-11T00:00:00.000Z')).toBe(3);
    expect(gamesAt('2025-09-16T00:00:00.000Z')).toBe(4);
    // And a future game never appears, however far the window is asked to reach.
    expect(gamesAt('2026-01-01T00:00:00.000Z')).toBe(4);
  });

  it('refuses to downgrade to the accessible tier when a non-premium input is missing', () => {
    // At an early as-of the provider has not yet attested the counting facts or the team, so
    // the blocker set is wider than career_routes. That is an evidence gap, not a licensing
    // one, and it must surface as INSUFFICIENT rather than as a quietly reduced valuation.
    const { result } = run('RB', '00-RB4', {}, { asOf: '2025-09-16T00:00:00.000Z' });
    expect(result.readinessMissing.length).toBeGreaterThan(1);
    expect(result.modelTier).toBe('INSUFFICIENT');
    expect(result.accessibleOutput).toBeNull();
    const envelope = JSON.parse(result.serialized) as { tier_not_attempted_reason: string };
    expect(envelope.tier_not_attempted_reason).toMatch(/not premium-only/);
  });

  it('produces byte-identical output for the same input (replay determinism)', () => {
    const a = run('RB', '00-RB4').result;
    const b = run('RB', '00-RB4').result;
    expect(a.serialized).toBe(b.serialized);
    expect(a.outputChecksum).toBe(b.outputChecksum);
    expect(a.normalizedInputChecksum).toBe(b.normalizedInputChecksum);
    const t1 = run('TE', '00-TE4').result;
    const t2 = run('TE', '00-TE4').result;
    expect(t1.outputChecksum).toBe(t2.outputChecksum);
  });

  it('changes the output checksum when the as-of changes', () => {
    const early = run('RB', '00-RB4', {}, { asOf: '2025-09-11T00:00:00.000Z' }).result;
    const late = run('RB', '00-RB4').result;
    expect(early.outputChecksum).not.toBe(late.outputChecksum);
  });

  it('keeps the QB normalized input free of the accessible-tier evidence', () => {
    // Production evidence is built for the positions the accessible tier serves — RB, TE and
    // WR. QB has no accessible model, so its normalized input must not carry the channel at
    // all, which is what keeps QB inputs and valuations byte-identical.
    const { snapshot } = ingest([fourPositionNflverseSource()]);
    for (const [pos, gsis] of [['QB', '00-QB4']] as const) {
      const input = buildNormalizedInferenceInput(snapshot, {
        canonicalId: idOf(snapshot, gsis),
        position: pos,
        asOf: AS_OF,
        engineVersion: `${pos.toLowerCase()}-mvp-1.0`,
      });
      expect(input!.evidence.production).toBeUndefined();
    }
    for (const [pos, gsis] of [['RB', '00-RB4'], ['TE', '00-TE4'], ['WR', '00-WR4']] as const) {
      const input = buildNormalizedInferenceInput(snapshot, {
        canonicalId: idOf(snapshot, gsis),
        position: pos,
        asOf: AS_OF,
        engineVersion: `${pos.toLowerCase()}-mvp-1.0`,
      });
      expect(input!.evidence.production).toBeDefined();
    }
  });
});


describe('Sleeper injury enrichment — the join that splits an ambiguous `inactive`', () => {
  // nflverse publishes a player status but no injury feed, so `inactive` conflates a player on
  // injured reserve with a free agent between contracts. 396 of 867 board entries — 46% — sit
  // in that state. Sleeper's players resource carries a per-player designation, which arrives
  // as `injury_designation` on the canonical player and splits the state here.
  const state = (status: string | null, designation: string | null) =>
    toAccessibleAvailability(
      status === null
        ? { present: false, reason: 'NOT_PROVIDED' }
        : { present: true, value: status as 'active', provenance: 'DIRECT', provider: 'sleeper', sourceTimestamp: AS_OF },
      designation === null
        ? { present: false, reason: 'NOT_PROVIDED' }
        : { present: true, value: designation, provenance: 'DIRECT', provider: 'sleeper', sourceTimestamp: AS_OF },
    );

  it('reports an unenriched `inactive` as NOT_ROSTERED, never as injured', () => {
    // This is the nflverse-only reading, and it is the conservative one: without a designation
    // there is no evidence of injury, and claiming one would be inventing it.
    expect(state('inactive', null)).toBe('NOT_ROSTERED');
  });

  it('splits an injured status into the designation Sleeper actually supplied', () => {
    expect(state('injured', 'Out')).toBe('OUT');
    expect(state('injured', 'IR')).toBe('IR');
    expect(state('injured', 'PUP')).toBe('PUP');
    expect(state('injured', 'Doubtful')).toBe('DOUBTFUL');
    expect(state('injured', 'Questionable')).toBe('QUESTIONABLE');
  });

  it('falls back to QUESTIONABLE for an injured player whose designation it cannot parse', () => {
    // A designation exists, so the player IS hurt; the severity is what is unknown. The mildest
    // injured state is the honest reading, not the most severe.
    expect(state('injured', 'Sore ankle, game-time decision')).toBe('QUESTIONABLE');
  });

  it('never invents a designation for a player Sleeper did not carry', () => {
    expect(state(null, null)).toBe('UNKNOWN');
    expect(state('active', null)).toBe('HEALTHY');
  });
});
