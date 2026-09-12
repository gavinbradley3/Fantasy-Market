// Volume shrinkage — the property tests that make the small-sample protection STRUCTURAL.
//
// Before this, the volume components read a raw per-game rate off the role window, so a
// one-game sample was arithmetically identical to a proven season and could out-rank it on the
// headline value. Confidence reported the thin sample, but the value did not, so nothing in the
// mathematics prevented it — the live board merely happened not to contain such a line.
//
// These tests assert the three properties that make it impossible rather than unlikely:
//   1. a tiny sample cannot dominate elite long-term production on volume alone,
//   2. increasing the sample converges smoothly on the observed production, and
//   3. the convergence has no cliff, threshold or discontinuity anywhere.

import { describe, expect, it } from 'vitest';
import { evaluateAccessibleRB, evaluateAccessibleTE } from '@/accessible';
import type { AccessibleOutput } from '@/accessible';
import { VOLUME_PSEUDO_GAMES, shrunkPerGameRate } from './common';
import type { CountingWindow, ObservedProduction } from './production';

const AS_OF = '2026-02-15T00:00:00.000Z';

function win(games: number, per: Partial<Record<keyof CountingWindow, number>>): CountingWindow {
  const o: Record<string, number | null> = {
    games, carries: null, rushingYards: null, rushingTds: null,
    targets: null, receptions: null, receivingYards: null, receivingTds: null,
    receivingAirYards: null,
  };
  for (const [k, v] of Object.entries(per)) o[k] = (v as number) * games;
  return o as unknown as CountingWindow;
}

function inp(position: 'RB' | 'TE', career: CountingWindow, over: Record<string, unknown> = {}) {
  const production: ObservedProduction = {
    career, recent: career, roleWindow: career, latestSeason: null, priorSeason: null,
    teamShares: null, providerTargetShare: null, seasonsPlayed: 1,
    newestGameKickoff: '2026-01-04T18:00:00.000Z',
    rosteredTeamWeeks: career.games,
  };
  return {
    canonicalId: 'x', position, asOf: AS_OF, age: 25, draftRound: 2, seasonsCompleted: 3,
    expectedGamesRemaining: 8, availability: 'HEALTHY', team: 'KC', teamChanged: null,
    production, ...over,
  } as never;
}

const rb = (c: CountingWindow, o?: Record<string, unknown>) => evaluateAccessibleRB(inp('RB', c, o)) as AccessibleOutput;
const te = (c: CountingWindow, o?: Record<string, unknown>) => evaluateAccessibleTE(inp('TE', c, o)) as AccessibleOutput;

/** A back at a fixed per-game workload, observed over `games` games. */
const backOver = (games: number, carriesPerGame: number) =>
  win(games, { carries: carriesPerGame, rushingYards: carriesPerGame * 4.3, rushingTds: 0.6, targets: 2, receptions: 1.6, receivingYards: 13 });

describe('volume shrinkage: the estimator', () => {
  it('is the documented posterior mean, with games as the exposure count', () => {
    // shrunk = (n*observed + k*prior) / (n + k)
    for (const [total, games, prior] of [[100, 10, 6], [25, 1, 6], [0, 17, 6], [51, 3, 2.2]] as const) {
      const observed = total / games;
      const expected = (games * observed + VOLUME_PSEUDO_GAMES * prior) / (games + VOLUME_PSEUDO_GAMES);
      expect(shrunkPerGameRate(total, games, prior)).toBeCloseTo(expected, 12);
    }
  });

  it('puts exactly n/(n+k) of the weight on observation', () => {
    const prior = 6;
    for (const n of [1, 2, 3, 5, 8, 13, 17, 34]) {
      const observed = 20;
      const shrunk = shrunkPerGameRate(observed * n, n, prior)!;
      const weight = (shrunk - prior) / (observed - prior);
      expect(weight).toBeCloseTo(n / (n + VOLUME_PSEUDO_GAMES), 12);
    }
    // the declared equal-weight point really is equal weight
    expect(shrunkPerGameRate(20 * VOLUME_PSEUDO_GAMES, VOLUME_PSEUDO_GAMES, 6)).toBeCloseTo((20 + 6) / 2, 12);
  });

  it('never converts an UNOBSERVED column into the prior', () => {
    // null means "the provider supplied nothing", which must stay a dropped component rather
    // than becoming a league-average player.
    expect(shrunkPerGameRate(null, 10, 6)).toBeNull();
    const noCarries = win(10, { targets: 4, receptions: 3, receivingYards: 30 });
    const v = rb(noCarries);
    expect(v.tier).toBe('ACCESSIBLE');
    expect('RV' in v.components).toBe(false);
  });

  it('regresses an observed ZERO by the same rule, so evidence still separates the cases', () => {
    // A back who never carried in one appearance has shown far less than one who never carried
    // in seventeen. Both are pulled toward the prior, the second far less.
    const one = shrunkPerGameRate(0, 1, 6)!;
    const many = shrunkPerGameRate(0, 17, 6)!;
    expect(one).toBeGreaterThan(many);
    expect(many).toBeLessThan(one / 2);
    // and an observed zero always scores below observed positive usage at the same sample size
    expect(rb(win(17, { carries: 0, rushingYards: 0, targets: 2, receptions: 1.6, receivingYards: 13 })).components.RV)
      .toBeLessThan(rb(backOver(17, 8)).components.RV);
  });
});

describe('volume shrinkage: property 1 — a tiny sample cannot dominate elite production', () => {
  // The exact scenario the audit used to demonstrate the weakness.
  const caseA = win(1, { carries: 25, rushingYards: 150, rushingTds: 2, targets: 2, receptions: 2, receivingYards: 15 });
  const caseB = win(5, { carries: 15, rushingYards: 86, rushingTds: 0, targets: 2, receptions: 1.6, receivingYards: 12 });
  const caseC = win(17, { carries: 18.8, rushingYards: 97, rushingTds: 0.88, targets: 2.35, receptions: 1.9, receivingYards: 15.3 });

  it('ranks a full elite season above a five-game sample above a one-game sample', () => {
    const a = rb(caseA), b = rb(caseB), c = rb(caseC);
    expect(c.positionValue).toBeGreaterThan(b.positionValue);
    expect(b.positionValue).toBeGreaterThan(a.positionValue);
  });

  it('does not let one game saturate the rush-volume component', () => {
    // Before shrinkage this was exactly 100 — indistinguishable from a season at that workload.
    expect(rb(caseA).components.RV).toBeLessThan(70);
    expect(rb(caseC).components.RV).toBeGreaterThan(rb(caseA).components.RV);
  });

  it('holds at tight end too', () => {
    const oneGame = win(1, { targets: 12, receptions: 9, receivingYards: 130, receivingTds: 2 });
    const fullSeason = win(17, { targets: 7, receptions: 4.8, receivingYards: 55, receivingTds: 0.5 });
    expect(te(fullSeason).positionValue).toBeGreaterThan(te(oneGame).positionValue);
    expect(te(oneGame).components.TV).toBeLessThan(te(fullSeason).components.TV);
  });

  it('holds across the whole physically realisable single-game range', () => {
    // Shrinkage bounds the WEIGHT on the observation (25% at n=1), not its magnitude, so the
    // guarantee is domain-bounded rather than absolute — state it precisely rather than
    // overclaiming. Solving (c + k·prior)/(1 + k) for the full season's shrunk rate of 16.88
    // puts the tie point at 49.5 carries in a single game. The NFL single-game rushing-attempt
    // record is 45 (Jamal Anderson, 1998), so no reachable one-game line can get there.
    const fullSeason = rb(backOver(17, 18.8));
    for (const carries of [25, 30, 35, 40, 45]) {
      const extreme = rb(win(1, { carries, rushingYards: carries * 6, rushingTds: 4, targets: 3, receptions: 3, receivingYards: 40 }));
      expect(extreme.components.RV).toBeLessThan(fullSeason.components.RV);
    }
    // The bound itself: the tie point sits above the all-time record.
    const tie = shrunkPerGameRate(45, 1, 6)!;
    expect(tie).toBeLessThan((17 * 18.8 + VOLUME_PSEUDO_GAMES * 6) / (17 + VOLUME_PSEUDO_GAMES));
  });
});

describe('volume shrinkage: property 2 — smooth convergence on observed production', () => {
  it('rises monotonically toward the raw rate as the sample grows', () => {
    let prev = -Infinity;
    for (const n of [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 25, 34, 50]) {
      const rv = rb(backOver(n, 15)).components.RV;
      expect(rv).toBeGreaterThan(prev);
      prev = rv;
    }
  });

  it('converges on the unshrunk value in the limit', () => {
    const prior = 6;
    const observed = 15;
    const far = shrunkPerGameRate(observed * 100_000, 100_000, prior)!;
    expect(far).toBeCloseTo(observed, 3);
    // a large sample is already almost unchanged: at a full season the estimate retains
    // n/(n+k) = 85% of the observed excess over the prior
    const season = shrunkPerGameRate(observed * 17, 17, prior)!;
    expect((season - prior) / (observed - prior)).toBeCloseTo(17 / 20, 12);
    expect(Math.abs(season - observed)).toBeLessThan(1.4);
  });

  it('leaves a full season essentially where the raw rate put it', () => {
    // The requirement is "almost unchanged", quantified: a 17-game elite workload keeps its
    // component within a few points and stays at the top of the scale.
    const elite = rb(backOver(17, 18.8));
    expect(elite.components.RV).toBeGreaterThan(80);
  });
});

describe('volume shrinkage: property 3 — no cliffs, thresholds or discontinuities', () => {
  it('has strictly diminishing steps in sample size (concave, no jump)', () => {
    const steps: number[] = [];
    let prev: number | null = null;
    for (let n = 1; n <= 40; n++) {
      const rv = rb(backOver(n, 15)).components.RV;
      if (prev !== null) steps.push(rv - prev);
      prev = rv;
    }
    // every step is positive (monotone) and no step exceeds the first (diminishing returns)
    expect(steps.every((s) => s >= 0)).toBe(true);
    expect(Math.max(...steps)).toBeCloseTo(steps[0], 6);
    // and the steps shrink toward zero rather than stopping abruptly
    expect(steps[steps.length - 1]).toBeLessThan(steps[0] / 10);
  });

  it('is continuous in the observed rate — no threshold in the statistic itself', () => {
    // Walk the carry total across every anchor boundary in fine increments; the component may
    // change slope but must never jump.
    let prev: number | null = null;
    let maxJump = 0;
    for (let carries = 0; carries <= 30 * 17; carries += 1) {
      const rv = rb(win(17, { carries: carries / 17, rushingYards: (carries / 17) * 4.3, targets: 2, receptions: 1.6, receivingYards: 13 })).components.RV;
      if (prev !== null) maxJump = Math.max(maxJump, Math.abs(rv - prev));
      prev = rv;
    }
    // one extra carry across a whole season can never move the component by a whole point
    expect(maxJump).toBeLessThan(1);
  });

  it('is continuous at the equal-weight point (k games) — nothing special happens there', () => {
    const below = shrunkPerGameRate(15 * (VOLUME_PSEUDO_GAMES - 1), VOLUME_PSEUDO_GAMES - 1, 6)!;
    const at = shrunkPerGameRate(15 * VOLUME_PSEUDO_GAMES, VOLUME_PSEUDO_GAMES, 6)!;
    const above = shrunkPerGameRate(15 * (VOLUME_PSEUDO_GAMES + 1), VOLUME_PSEUDO_GAMES + 1, 6)!;
    expect(at - below).toBeGreaterThan(0);
    expect(above - at).toBeGreaterThan(0);
    // the step either side of the "equal weight" point is of the same order: it is a label on a
    // smooth curve, not a branch in the code
    expect(above - at).toBeLessThan(at - below);
  });

  it('applies the identical rule to both positions and every volume component', () => {
    // Nothing is special-cased: each volume component converges the same way.
    const grow = (n: number) => rb(backOver(n, 15));
    expect(grow(1).components.RCV).toBeLessThan(grow(17).components.RCV);
    const teGrow = (n: number) => te(win(n, { targets: 6, receptions: 4.1, receivingYards: 46, receivingTds: 0.4 }));
    expect(teGrow(1).components.TV).toBeLessThan(teGrow(17).components.TV);
    expect(teGrow(1).components.RP).toBeLessThan(teGrow(17).components.RP);
  });
});

describe('volume shrinkage: what it must NOT change', () => {
  it('does not touch confidence — the fix is mathematical, not a disclosure downgrade', () => {
    // Sample size reaches confidence through the SAMPLE TERM, which is the same shrinkage
    // weight this file is about: one game leaves three quarters of the estimate on the prior,
    // so confidence starts at 25 for it and at 85 for a full season.
    expect(rb(backOver(1, 25)).confidence.sampleScore).toBe(25);
    expect(rb(backOver(17, 25)).confidence.sampleScore).toBe(85);
    // And confidence still says nothing about how GOOD the player is: two backs with the same
    // sample and the same evidence gaps score the same, whatever their workload.
    expect(rb(backOver(17, 18.8)).confidence.score).toBe(rb(backOver(17, 4)).confidence.score);
  });

  it('quotes the RAW observed rate in the role label and the explanation', () => {
    // The user-facing numbers stay facts about what happened; only the SCORE is regularized.
    const v = rb(win(1, { carries: 25, rushingYards: 150, rushingTds: 2, targets: 3, receptions: 3, receivingYards: 25 }));
    expect(v.role).toBe('Three-down lead back');
    expect(v.positiveFactors.join(' ')).toContain('25.0 per game');
    expect(v.negativeFactors.join(' ')).toContain('1 career games observed');
  });

  it('still refuses a player with no usage at all rather than scoring him at the prior', () => {
    // The INSUFFICIENT gates read career totals and are untouched by shrinkage.
    expect(rb(win(5, { carries: 0, targets: 0 })).tier).toBe('INSUFFICIENT');
    expect(te(win(5, { targets: 0 })).tier).toBe('INSUFFICIENT');
  });
});
