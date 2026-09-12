// The accessible WR model.
//
// The properties worth protecting are the ones that define why this model exists: observed
// football must outweigh biography, the components must actually ORDER receivers rather than
// return league constants, target share must lead, and the frozen engine must stay reactivatable.

import { describe, expect, it } from 'vitest';
import { ACCESSIBLE_CONFIDENCE_CEILING, WR_AGE_ANCHORS, RB_AGE_ANCHORS, TE_AGE_ANCHORS } from './common';
import { classifyWRRole, draftCapitalScore, evaluateAccessibleWR, WR_ACCESSIBLE_VERSION } from './wr';
import { scaleFrom, score100 } from './scale';
import type { CountingWindow, ObservedProduction } from './production';
import type { AccessibleInput, AccessibleOutput } from './types';

const AS_OF = '2026-02-15T00:00:00.000Z';

function window(over: Partial<CountingWindow> & { games: number }): CountingWindow {
  return {
    carries: null,
    rushingYards: null,
    rushingTds: null,
    targets: null,
    receptions: null,
    receivingYards: null,
    receivingTds: null,
    receivingAirYards: null,
    ...over,
  };
}

/** A receiver season expressed per game, scaled into a `games`-game window. */
function season(
  games: number,
  perGame: { targets: number; receptions: number; receivingYards: number; receivingTds: number; adot?: number },
): CountingWindow {
  return window({
    games,
    targets: perGame.targets * games,
    receptions: perGame.receptions * games,
    receivingYards: perGame.receivingYards * games,
    receivingTds: perGame.receivingTds * games,
    receivingAirYards: (perGame.adot ?? 9.5) * perGame.targets * games,
  });
}

function production(over: Partial<ObservedProduction> & { career: CountingWindow }): ObservedProduction {
  return {
    recent: over.career,
    roleWindow: over.career,
    latestSeason: null,
    priorSeason: null,
    teamShares: null,
    providerTargetShare: null,
    seasonsPlayed: 1,
    newestGameKickoff: '2026-01-04T18:00:00.000Z',
    rosteredTeamWeeks: over.career.games,
    ...over,
  };
}

function input(over: Partial<AccessibleInput> & { production: ObservedProduction }): AccessibleInput {
  return {
    canonicalId: 'pt-test',
    position: 'WR',
    asOf: AS_OF,
    age: 25,
    draftRound: 2,
    seasonsCompleted: 3,
    expectedGamesRemaining: 17,
    availability: 'HEALTHY',
    team: 'BUF',
    teamChanged: null,
    ...over,
  };
}

const ok = (r: ReturnType<typeof evaluateAccessibleWR>): AccessibleOutput => {
  expect(r.tier).toBe('ACCESSIBLE');
  return r as AccessibleOutput;
};

/** An established number-one receiver: 9 targets a game, 80 yards, real share. */
const ALPHA = () =>
  input({
    production: production({
      career: season(51, { targets: 9, receptions: 6, receivingYards: 80, receivingTds: 0.5, adot: 12 }),
      providerTargetShare: 0.28,
      seasonsPlayed: 3,
    }),
  });

/** A depth receiver: 2 targets a game, 18 yards. */
const DEPTH = () =>
  input({
    production: production({
      career: season(34, { targets: 2, receptions: 1.2, receivingYards: 15, receivingTds: 0.06, adot: 8 }),
      providerTargetShare: 0.07,
      seasonsPlayed: 2,
    }),
  });

describe('the model runs on observed football and orders receivers by it', () => {
  it('separates an alpha from a depth receiver by a wide margin', () => {
    const alpha = ok(evaluateAccessibleWR(ALPHA()));
    const depth = ok(evaluateAccessibleWR(DEPTH()));
    expect(alpha.positionValue).toBeGreaterThan(depth.positionValue + 30);
  });

  it('publishes its own version, never the frozen engine’s', () => {
    expect(ok(evaluateAccessibleWR(ALPHA())).modelVersion).toBe(WR_ACCESSIBLE_VERSION);
  });

  it('consumes no route, expected-value or contract input, and says so', () => {
    const out = ok(evaluateAccessibleWR(ALPHA()));
    for (const f of [
      'career_routes',
      'route_participation',
      'targets_per_route_run',
      'expected_fantasy_points_per_target',
      'catch_rate_over_expected',
      'contract_security',
    ]) {
      expect(out.provenance.unavailableFields).toContain(f);
    }
    expect(out.provenance.observedFields).toContain('receiving_air_yards');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(evaluateAccessibleWR(ALPHA()))).toBe(JSON.stringify(evaluateAccessibleWR(ALPHA())));
  });

  it('never reaches HIGH confidence, because the role-confirming inputs are absent for everyone', () => {
    const out = ok(evaluateAccessibleWR(ALPHA()));
    expect(out.confidence.score).toBeLessThanOrEqual(ACCESSIBLE_CONFIDENCE_CEILING);
    expect(out.confidence.label).not.toBe('HIGH');
  });
});

describe('observed football outweighs biography', () => {
  it('an elite veteran beats an unproven first-round rookie on the dynasty horizon', () => {
    // The specific failure this model exists to correct. The frozen engine puts 0.25 on age and
    // development and resolves its Role Durability contract-security input from draft round, so
    // an unproven first-rounder outranks a proven producer there.
    const veteran = ok(
      evaluateAccessibleWR(
        input({
          age: 29,
          draftRound: 5,
          production: production({
            career: season(85, { targets: 9.5, receptions: 6.5, receivingYards: 88, receivingTds: 0.55, adot: 12 }),
            providerTargetShare: 0.29,
            seasonsPlayed: 5,
          }),
        }),
      ),
    );
    const rookie = ok(
      evaluateAccessibleWR(
        input({
          age: 22,
          draftRound: 1,
          seasonsCompleted: 0,
          production: production({
            career: season(14, { targets: 3.4, receptions: 2, receivingYards: 26, receivingTds: 0.14, adot: 10 }),
            providerTargetShare: 0.13,
          }),
        }),
      ),
    );
    expect(veteran.composites.dynasty).toBeGreaterThan(rookie.composites.dynasty);
    expect(veteran.positionValue).toBeGreaterThan(rookie.positionValue);
  });

  it('age still moves the dynasty horizon — it is discounted, not ignored', () => {
    const young = ok(evaluateAccessibleWR(input({ ...ALPHA(), age: 24 })));
    const old = ok(evaluateAccessibleWR(input({ ...ALPHA(), age: 32 })));
    expect(young.composites.dynasty).toBeGreaterThan(old.composites.dynasty);
  });

  it('draft capital DECAYS as the observed record accumulates', () => {
    // A first-rounder and an undrafted player diverge sharply with no games and converge toward
    // each other with a career behind them, because by then the football evidence has answered
    // the question draft position was only guessing at.
    const gapAt = (games: number) => draftCapitalScore(1, games) - draftCapitalScore(null, games);
    expect(gapAt(0)).toBeGreaterThan(80);
    expect(gapAt(16)).toBeLessThan(gapAt(0) / 1.9);
    expect(gapAt(64)).toBeLessThan(gapAt(0) / 4);
    expect(gapAt(64)).toBeGreaterThan(0);
  });

  it('never applies a rookie penalty or a veteran bonus — only the curves and the evidence', () => {
    // Two players identical in every observed respect and in age differ ONLY by draft round,
    // and the difference is bounded by the decayed draft-capital component's own weight.
    const base = ALPHA();
    const r1 = ok(evaluateAccessibleWR(input({ ...base, draftRound: 1 })));
    const udfa = ok(evaluateAccessibleWR(input({ ...base, draftRound: null })));
    expect(r1.positionValue - udfa.positionValue).toBeLessThan(3);
  });
});

describe('target share leads, because a receiver’s value is a claim on the passing game', () => {
  it('the same production on a bigger share of the offence is worth more', () => {
    const small = ok(
      evaluateAccessibleWR(
        input({ production: production({ career: ALPHA().production.career, providerTargetShare: 0.14 }) }),
      ),
    );
    const big = ok(
      evaluateAccessibleWR(
        input({ production: production({ career: ALPHA().production.career, providerTargetShare: 0.3 }) }),
      ),
    );
    expect(big.components.TS).toBeGreaterThan(small.components.TS);
    expect(big.positionValue).toBeGreaterThan(small.positionValue);
  });

  it('prefers the provider’s MEASURED share to a reconstructed one, which is only a bound', () => {
    const measured = ok(
      evaluateAccessibleWR(
        input({
          production: production({
            career: ALPHA().production.career,
            providerTargetShare: 0.2,
            teamShares: { carryShare: null, targetShare: 0.45, games: 17 },
          }),
        }),
      ),
    );
    const reconstructedOnly = ok(
      evaluateAccessibleWR(
        input({
          production: production({
            career: ALPHA().production.career,
            providerTargetShare: null,
            teamShares: { carryShare: null, targetShare: 0.45, games: 17 },
          }),
        }),
      ),
    );
    // The measured 0.20 is used, not the reconstructed upper bound of 0.45.
    expect(measured.components.TS).toBeLessThan(reconstructedOnly.components.TS);
    expect(measured.provenance.observedFields).toContain('target_share');
    expect(reconstructedOnly.provenance.teamSharesDerived).toBe(true);
    // Falling back to a bound costs confidence.
    expect(reconstructedOnly.confidence.score).toBeLessThan(measured.confidence.score);
  });
});

describe('air yards are used as volume, not as an average', () => {
  it('deeper targets at the same volume raise opportunity', () => {
    const shallow = ok(
      evaluateAccessibleWR(
        input({
          production: production({
            career: season(51, { targets: 8, receptions: 6, receivingYards: 70, receivingTds: 0.4, adot: 6 }),
            providerTargetShare: 0.24,
          }),
        }),
      ),
    );
    const deep = ok(
      evaluateAccessibleWR(
        input({
          production: production({
            career: season(51, { targets: 8, receptions: 6, receivingYards: 70, receivingTds: 0.4, adot: 15 }),
            providerTargetShare: 0.24,
          }),
        }),
      ),
    );
    expect(deep.components.OP).toBeGreaterThan(shallow.components.OP);
  });

  it('reports missing target depth rather than assuming a league-average one', () => {
    const noDepth = ok(
      evaluateAccessibleWR(
        input({
          production: production({
            career: window({ games: 40, targets: 300, receptions: 200, receivingYards: 2600, receivingTds: 16 }),
            providerTargetShare: 0.24,
          }),
        }),
      ),
    );
    expect(noDepth.confidence.penaltyCodes).toContain('NO_TARGET_DEPTH');
  });
});

describe('efficiency is per TARGET, not per reception', () => {
  it('two receivers with identical yards per CATCH are separated by their catch rate', () => {
    // Yards per reception would score these two identically. Yards per target does not, because
    // it counts the targets that produced nothing.
    const mk = (receptions: number) =>
      ok(
        evaluateAccessibleWR(
          input({
            production: production({
              career: window({
                games: 50,
                targets: 500,
                receptions,
                receivingYards: receptions * 13,
                receivingTds: 25,
                receivingAirYards: 5500,
              }),
              providerTargetShare: 0.24,
            }),
          }),
        ),
      );
    const sure = mk(340);
    const erratic = mk(240);
    expect(sure.components.EF).toBeGreaterThan(erratic.components.EF + 10);
  });
});

describe('small samples cannot saturate a component', () => {
  it('one enormous game does not out-score a career', () => {
    const oneGame = ok(
      evaluateAccessibleWR(
        input({
          production: production({
            career: window({ games: 1, targets: 14, receptions: 11, receivingYards: 210, receivingTds: 3, receivingAirYards: 190 }),
            providerTargetShare: 0.42,
          }),
        }),
      ),
    );
    const career = ok(evaluateAccessibleWR(ALPHA()));
    expect(oneGame.components.OP).toBeLessThan(career.components.OP);
    expect(oneGame.components.PR).toBeLessThan(career.components.PR);
    expect(oneGame.confidence.penaltyCodes).toContain('MINIMAL_CAREER_SAMPLE');
    expect(oneGame.confidence.score).toBeLessThan(career.confidence.score);
  });
});

describe('it declines rather than guessing', () => {
  it('refuses a player with no game record', () => {
    const r = evaluateAccessibleWR(input({ production: production({ career: window({ games: 0 }) }) }));
    expect(r.tier).toBe('INSUFFICIENT');
    expect(r.tier === 'INSUFFICIENT' && r.reasonCode).toBe('NO_QUALIFYING_GAMES');
  });

  it('refuses a receiver who played but was never targeted, instead of scoring him zero', () => {
    const r = evaluateAccessibleWR(
      input({ production: production({ career: window({ games: 12, targets: 0, receptions: 0 }) }) }),
    );
    expect(r.tier).toBe('INSUFFICIENT');
    expect(r.tier === 'INSUFFICIENT' && r.reasonCode).toBe('NO_RECEIVING_OPPORTUNITY');
  });
});

describe('the WR structure is its own, not the TE model retuned', () => {
  it('has a WR age curve distinct from both other positions', () => {
    expect(WR_AGE_ANCHORS).not.toEqual(RB_AGE_ANCHORS);
    expect(WR_AGE_ANCHORS).not.toEqual(TE_AGE_ANCHORS);
    // Receivers hold value later than backs and decline earlier than tight ends.
    const at = (anchors: typeof WR_AGE_ANCHORS, age: number) => score100(scaleFrom(anchors, age));
    expect(at(WR_AGE_ANCHORS, 29)).toBeGreaterThan(at(RB_AGE_ANCHORS, 29));
    expect(at(WR_AGE_ANCHORS, 31)).toBeLessThan(at(TE_AGE_ANCHORS, 31));
  });

  it('publishes WR component codes, including target share and draft capital', () => {
    const out = ok(evaluateAccessibleWR(ALPHA()));
    for (const code of ['TS', 'OP', 'PR', 'EF', 'SC', 'AG', 'DC', 'AV']) {
      expect(out.components[code]).toBeTypeOf('number');
    }
  });

  it('labels roles from share first, with depth only refining the label', () => {
    expect(classifyWRRole(9.5, 0.3, 10)).toBe('Alpha target earner');
    expect(classifyWRRole(7.5, 0.23, 9)).toBe('Number-one receiver');
    expect(classifyWRRole(7.5, 0.23, 14)).toBe('Number-one receiver, downfield role');
    expect(classifyWRRole(1.0, 0.04, 16)).toBe('Depth receiver');
  });
});
