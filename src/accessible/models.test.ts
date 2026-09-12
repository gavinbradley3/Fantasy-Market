// Behavioural tests for the accessible-data RB and TE models.
//
// These assert model PROPERTIES rather than pinned numbers wherever possible: monotonicity,
// ordering between recognisable archetypes, refusal to substitute for missing data, and the
// separation of coverage from confidence. A number is pinned only where the exact value is the
// contract (the label thresholds).

import { describe, expect, it } from 'vitest';
import { evaluateAccessible, evaluateAccessibleRB, evaluateAccessibleTE } from './index';
import { sampleEvidenceScore } from './common';
import type { CountingWindow, ObservedProduction } from './production';
import type { AccessibleInput, AccessibleOutput, AccessiblePosition } from './types';

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

/** Scale a per-game profile into a career window of `games` games. */
function career(games: number, perGame: Partial<Record<keyof CountingWindow, number>>): CountingWindow {
  const out: Partial<CountingWindow> & { games: number } = { games };
  for (const [k, v] of Object.entries(perGame)) {
    if (k === 'games') continue;
    (out as Record<string, number>)[k] = v * games;
  }
  return window(out);
}

function production(over: Partial<ObservedProduction> & { career: CountingWindow }): ObservedProduction {
  // Default every window to the career window so a fixture only has to state what it varies.
  return {
    recent: over.career,
    roleWindow: over.career,
    latestSeason: null,
    priorSeason: null,
    teamShares: null,
    providerTargetShare: null,
    seasonsPlayed: 1,
    // Recent enough not to be stale relative to AS_OF, and rostered for every game played, so
    // a fixture only has to state what it is actually varying.
    newestGameKickoff: '2026-01-04T18:00:00.000Z',
    rosteredTeamWeeks: over.career.games,
    ...over,
  };
}

function input(position: AccessiblePosition, over: Partial<AccessibleInput> & { production: ObservedProduction }): AccessibleInput {
  return {
    canonicalId: 'pt-test',
    position,
    asOf: AS_OF,
    age: 25,
    draftRound: 2,
    seasonsCompleted: 3,
    expectedGamesRemaining: 8,
    availability: 'HEALTHY',
    team: 'KC',
    teamChanged: null,
    ...over,
  };
}

function valued(result: ReturnType<typeof evaluateAccessible>): AccessibleOutput {
  if (result.tier !== 'ACCESSIBLE') throw new Error(`expected a valuation, got ${result.tier}: ${result.reason}`);
  return result;
}

// --- archetype fixtures -----------------------------------------------------

const eliteRB = () =>
  input('RB', {
    age: 25,
    production: production({
      career: career(48, { carries: 17, rushingYards: 78, rushingTds: 0.6, targets: 4, receptions: 3.2, receivingYards: 26, receivingTds: 0.15 }),
      seasonsPlayed: 3,
      teamShares: { carryShare: 0.52, targetShare: 0.12, games: 8 },
    }),
  });

const backupRB = () =>
  input('RB', {
    age: 26,
    production: production({
      career: career(30, { carries: 3.1, rushingYards: 12, rushingTds: 0.05, targets: 0.5, receptions: 0.4, receivingYards: 3, receivingTds: 0.02 }),
      seasonsPlayed: 2,
      teamShares: { carryShare: 0.09, targetShare: 0.02, games: 8 },
    }),
  });

const agingProducerRB = () =>
  input('RB', {
    age: 31,
    production: production({
      career: career(90, { carries: 15, rushingYards: 65, rushingTds: 0.5, targets: 3, receptions: 2.4, receivingYards: 19, receivingTds: 0.1 }),
      seasonsPlayed: 6,
      teamShares: { carryShare: 0.45, targetShare: 0.09, games: 8 },
    }),
  });

const eliteTE = () =>
  input('TE', {
    age: 27,
    production: production({
      career: career(60, { targets: 6.5, receptions: 4.8, receivingYards: 58, receivingTds: 0.45 }),
      seasonsPlayed: 4,
      teamShares: { carryShare: null, targetShare: 0.23, games: 8 },
    }),
  });

const depthTE = () =>
  input('TE', {
    age: 28,
    production: production({
      career: career(34, { targets: 0.8, receptions: 0.55, receivingYards: 6, receivingTds: 0.03 }),
      seasonsPlayed: 3,
      teamShares: { carryShare: null, targetShare: 0.02, games: 8 },
    }),
  });

// --- RB ---------------------------------------------------------------------

describe('accessible RB model', () => {
  it('ranks an elite three-down back far above a depth back', () => {
    const elite = valued(evaluateAccessibleRB(eliteRB()));
    const backup = valued(evaluateAccessibleRB(backupRB()));
    expect(elite.positionValue).toBeGreaterThan(backup.positionValue);
    expect(elite.positionValue - backup.positionValue).toBeGreaterThan(25);
  });

  it('classifies roles from usage', () => {
    expect(valued(evaluateAccessibleRB(eliteRB())).role).toBe('Three-down lead back');
    expect(valued(evaluateAccessibleRB(backupRB())).role).toBe('Depth back');
  });

  it('penalizes an aging producer on the long horizons while respecting current production', () => {
    const aging = valued(evaluateAccessibleRB(agingProducerRB()));
    // Still a real weekly contributor...
    expect(aging.composites.weekly).toBeGreaterThan(55);
    // ...but the dynasty horizon must fall well below it, driven by the age curve.
    expect(aging.composites.dynasty).toBeLessThan(aging.composites.weekly);
    expect(aging.components.AG).toBeLessThan(30);
  });

  it('is monotone in rushing volume, holding everything else fixed', () => {
    let previous = -1;
    for (const cpg of [1, 4, 8, 12, 16, 20, 24]) {
      const v = valued(
        evaluateAccessibleRB(
          input('RB', {
            production: production({ career: career(16, { carries: cpg, rushingYards: cpg * 4.3, targets: 2, receptions: 1.6, receivingYards: 13 }) }),
          }),
        ),
      );
      expect(v.composites.weekly).toBeGreaterThanOrEqual(previous);
      previous = v.composites.weekly;
    }
  });

  it('values a low-volume efficient back below a high-volume inefficient one on the weekly horizon', () => {
    // Volume is what produces fantasy points; efficiency is a modifier. A product that ranked
    // a 4-carry back with 6.0 YPC above a 18-carry back with 3.8 would be indefensible.
    const efficient = valued(evaluateAccessibleRB(input('RB', {
      production: production({ career: career(16, { carries: 4, rushingYards: 24, targets: 1, receptions: 0.8, receivingYards: 7 }) }),
    })));
    const volume = valued(evaluateAccessibleRB(input('RB', {
      production: production({ career: career(16, { carries: 18, rushingYards: 68.4, targets: 2, receptions: 1.6, receivingYards: 12 }) }),
    })));
    expect(volume.composites.weekly).toBeGreaterThan(efficient.composites.weekly);
    // But the efficiency component itself must still favour the efficient back.
    expect(efficient.components.EFF).toBeGreaterThan(volume.components.EFF);
  });

  it('declines to value a player with games but no carries and no targets', () => {
    const r = evaluateAccessibleRB(input('RB', {
      production: production({ career: window({ games: 6, carries: 0, targets: 0 }) }),
    }));
    expect(r.tier).toBe('INSUFFICIENT');
    if (r.tier === 'INSUFFICIENT') expect(r.reasonCode).toBe('NO_OFFENSIVE_OPPORTUNITY');
  });

  it('declines to value a player with no qualifying games', () => {
    const r = evaluateAccessibleRB(input('RB', { production: production({ career: window({ games: 0 }) }) }));
    expect(r.tier).toBe('INSUFFICIENT');
    if (r.tier === 'INSUFFICIENT') expect(r.reasonCode).toBe('NO_QUALIFYING_GAMES');
  });

  it('drops the age component rather than substituting an age when it is unknown', () => {
    const withAge = valued(evaluateAccessibleRB(eliteRB()));
    const withoutAge = valued(evaluateAccessibleRB(input('RB', { ...eliteRB(), age: null })));
    expect(withAge.components).toHaveProperty('AG');
    expect(withoutAge.components).not.toHaveProperty('AG');
    expect(withoutAge.confidence.penaltyCodes).toContain('AGE_UNKNOWN');
  });

  it('never reports a route field as an input it used', () => {
    const v = valued(evaluateAccessibleRB(eliteRB()));
    const used = [...v.provenance.observedFields, ...v.provenance.derivedFields].join(' ');
    expect(used).not.toMatch(/route/i);
    expect(v.provenance.unavailableFields).toContain('career_routes');
  });
});

// --- TE ---------------------------------------------------------------------

describe('accessible TE model', () => {
  it('ranks a focal-point tight end far above a depth tight end', () => {
    const elite = valued(evaluateAccessibleTE(eliteTE()));
    const depth = valued(evaluateAccessibleTE(depthTE()));
    expect(elite.positionValue).toBeGreaterThan(depth.positionValue);
    expect(elite.positionValue - depth.positionValue).toBeGreaterThan(25);
    expect(elite.role).toBe('Primary receiving option');
  });

  it('is monotone in target volume', () => {
    let previous = -1;
    for (const tpg of [0.5, 1.5, 2.5, 4, 5.5, 7]) {
      const v = valued(evaluateAccessibleTE(input('TE', {
        production: production({ career: career(16, { targets: tpg, receptions: tpg * 0.68, receivingYards: tpg * 0.68 * 10.8 }) }),
      })));
      expect(v.composites.weekly).toBeGreaterThanOrEqual(previous);
      previous = v.composites.weekly;
    }
  });

  it('declines to value a never-targeted blocking tight end instead of scoring him zero', () => {
    const r = evaluateAccessibleTE(input('TE', {
      production: production({ career: window({ games: 17, targets: 0, receptions: 0, receivingYards: 0 }) }),
    }));
    expect(r.tier).toBe('INSUFFICIENT');
    if (r.tier === 'INSUFFICIENT') {
      expect(r.reasonCode).toBe('NO_RECEIVING_OPPORTUNITY');
      expect(r.reason).toMatch(/blocking/i);
    }
  });

  it('applies a later age peak than the RB curve', () => {
    const at29 = valued(evaluateAccessibleTE(input('TE', { ...eliteTE(), age: 29 })));
    const rbAt29 = valued(evaluateAccessibleRB(input('RB', { ...eliteRB(), age: 29 })));
    expect(at29.components.AG).toBeGreaterThan(rbAt29.components.AG);
  });
});

// --- tier-wide invariants ---------------------------------------------------

describe('accessible tier invariants', () => {
  const all = () => [
    valued(evaluateAccessibleRB(eliteRB())),
    valued(evaluateAccessibleRB(backupRB())),
    valued(evaluateAccessibleRB(agingProducerRB())),
    valued(evaluateAccessibleTE(eliteTE())),
    valued(evaluateAccessibleTE(depthTE())),
  ];

  it('does not cap confidence for being an accessible-tier valuation', () => {
    // The tier's coverage gaps are identical for all 712 players it values, so subtracting them
    // from each player's confidence ranked nobody against anybody. A well-evidenced player —
    // long career sample, reconstructed team shares, known age, attested status, fresh
    // production — is now allowed to reach HIGH on the strength of that evidence.
    for (const v of all()) {
      expect(v.confidence.score).toBeGreaterThan(50);
      // Never above the sample term: penalties only ever subtract from it.
      expect(v.confidence.score).toBeLessThanOrEqual(
        Math.round(sampleEvidenceScore(v.confidence.gamesObserved)),
      );
    }
    expect(valued(evaluateAccessibleRB(eliteRB())).confidence.label).toBe('HIGH');
  });

  it('reports the tier-wide coverage gaps as missing inputs, not as confidence penalties', () => {
    for (const v of all()) {
      expect(v.materialMissingInputs.join(' ')).toMatch(/Route participation/);
      expect(v.materialMissingInputs.join(' ')).toMatch(/Red-zone/);
      expect(v.materialMissingInputs.join(' ')).toMatch(/Team offensive context/);
      // Every penalty that survives must name something about THIS player, so no two players
      // can differ in coverage-only terms.
      for (const code of v.confidence.penaltyCodes) {
        expect(code).not.toMatch(/PARTICIPATION|HIGH_VALUE_USAGE|TEAM_CONTEXT/);
      }
    }
  });

  it('separates confidence from coverage: a thin sample scores below a long one', () => {
    const long = valued(evaluateAccessibleRB(eliteRB()));
    const thin = valued(
      evaluateAccessibleRB(
        input('RB', {
          age: null,
          draftRound: null,
          production: production({
            career: career(3, { carries: 9, rushingYards: 38, targets: 2, receptions: 1.6, receivingYards: 12 }),
            seasonsPlayed: 1,
          }),
        }),
      ),
    );
    expect(thin.confidence.score).toBeLessThan(long.confidence.score);
    // The thin sample is carried by the BASE, not by a penalty code — three games leaves half
    // the estimate on the league prior, so the score starts at 50 before anything is deducted.
    expect(thin.confidence.sampleScore).toBe(50);
    expect(long.confidence.sampleScore).toBeGreaterThan(90);
    expect(thin.confidence.penaltyCodes).toContain('AGE_UNKNOWN');
    expect(thin.confidence.label).toBe('LOW');
  });

  it('labels itself ACCESSIBLE with a versioned model id', () => {
    for (const v of all()) {
      expect(v.tier).toBe('ACCESSIBLE');
      expect(v.modelVersion).toMatch(/^(rb|te)-accessible-\d+\.\d+$/);
    }
  });

  it('keeps every component and composite inside 0..100', () => {
    for (const v of all()) {
      for (const s of Object.values(v.components)) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
      for (const s of Object.values(v.composites)) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });

  it('reduces confidence as the sample shrinks', () => {
    const scoreFor = (games: number) =>
      valued(evaluateAccessibleRB(input('RB', {
        production: production({ career: career(games, { carries: 12, rushingYards: 52, targets: 2, receptions: 1.6, receivingYards: 13 }) }),
      }))).confidence.score;
    expect(scoreFor(20)).toBeGreaterThan(scoreFor(6));
    expect(scoreFor(6)).toBeGreaterThan(scoreFor(2));
  });

  it('is deterministic — the same input yields byte-identical output', () => {
    const a = JSON.stringify(evaluateAccessibleRB(eliteRB()));
    const b = JSON.stringify(evaluateAccessibleRB(eliteRB()));
    expect(a).toBe(b);
    const c = JSON.stringify(evaluateAccessibleTE(eliteTE()));
    const d = JSON.stringify(evaluateAccessibleTE(eliteTE()));
    expect(c).toBe(d);
  });

  it('produces an explanation naming what it did and did not use', () => {
    const v = valued(evaluateAccessibleRB(eliteRB()));
    expect(v.explanation).toMatch(/observed games/);
    expect(v.explanation).toMatch(/without route, snap or red-zone data/);
  });

  it('suppresses the near-term outlook for an unavailable player without erasing long-term value', () => {
    const healthy = valued(evaluateAccessibleRB(eliteRB()));
    const out = valued(evaluateAccessibleRB(input('RB', { ...eliteRB(), availability: 'IR' })));
    expect(out.composites.weekly).toBeLessThan(healthy.composites.weekly);
    // Dynasty gives availability zero weight, so an injured elite back keeps his long-term value.
    expect(out.composites.dynasty).toBe(healthy.composites.dynasty);
    expect(out.negativeFactors.join(' ')).toMatch(/not expected to play/);
  });

  it('dispatches by position', () => {
    expect(valued(evaluateAccessible(eliteRB())).position).toBe('RB');
    expect(valued(evaluateAccessible(eliteTE())).position).toBe('TE');
  });
});

// --- defects found by the cold self-audit against the live population ----------

describe('availability distinguishes "not on a roster" from "injured"', () => {
  it('scores NOT_ROSTERED well above OUT, because they are not the same claim', () => {
    const notRostered = valued(evaluateAccessibleRB(input('RB', { ...eliteRB(), availability: 'NOT_ROSTERED' })));
    const out = valued(evaluateAccessibleRB(input('RB', { ...eliteRB(), availability: 'OUT' })));
    const healthy = valued(evaluateAccessibleRB(input('RB', { ...eliteRB(), availability: 'HEALTHY' })));
    expect(notRostered.components.AV).toBeGreaterThan(out.components.AV);
    expect(notRostered.components.AV).toBeLessThan(healthy.components.AV);
    // At an offseason as-of this state covered 45% of the live RB/TE population, so treating it
    // as an injury made nearly half the league look hurt.
    expect(notRostered.composites.weekly).toBeGreaterThan(out.composites.weekly);
  });

  it('says so in words, without claiming an injury', () => {
    const v = valued(evaluateAccessibleRB(input('RB', { ...eliteRB(), availability: 'NOT_ROSTERED' })));
    const text = v.negativeFactors.join(' ');
    expect(text).toMatch(/[Nn]ot on an active roster/);
    expect(text).not.toMatch(/not expected to play/);
  });
});

describe('stale production is detected from the newest game, not the recent window', () => {
  it('flags a player whose last game was over a year before the as-of', () => {
    // `recent` is the last 8 games of a CAREER, so it is never empty for anyone with a game and
    // could never detect staleness. The check must use the newest kickoff.
    const stale = valued(evaluateAccessibleRB(input('RB', {
      production: production({
        career: career(30, { carries: 14, rushingYards: 60, targets: 3, receptions: 2.4, receivingYards: 19 }),
        newestGameKickoff: '2024-01-07T18:00:00.000Z',
      }),
    })));
    expect(stale.confidence.penaltyCodes).toContain('STALE_PRODUCTION');
    expect(stale.negativeFactors.join(' ')).toMatch(/has not played in over a year/i);
  });

  it('does not flag a player who played inside the last year', () => {
    const current = valued(evaluateAccessibleRB(eliteRB()));
    expect(current.confidence.penaltyCodes).not.toContain('STALE_PRODUCTION');
  });

  it('costs a stale player confidence relative to an identical current player', () => {
    const base = {
      career: career(30, { carries: 14, rushingYards: 60, targets: 3, receptions: 2.4, receivingYards: 19 }),
    };
    const current = valued(evaluateAccessibleRB(input('RB', { production: production({ ...base }) })));
    const stale = valued(evaluateAccessibleRB(input('RB', {
      production: production({ ...base, newestGameKickoff: '2023-12-31T18:00:00.000Z' }),
    })));
    expect(stale.confidence.score).toBeLessThan(current.confidence.score);
  });
});

describe('durability is measured against games the player could actually have played', () => {
  it('does not penalize a mid-season arrival for games before he was rostered', () => {
    // Eight games played, eight weeks rostered: perfect availability, not 8/17.
    const midSeasonSigning = valued(evaluateAccessibleRB(input('RB', {
      production: production({
        career: career(8, { carries: 12, rushingYards: 52, targets: 2, receptions: 1.6, receivingYards: 13 }),
        rosteredTeamWeeks: 8,
      }),
    })));
    expect(midSeasonSigning.components.DUR).toBe(100);
  });

  it('still penalizes a player who missed games he was rostered for', () => {
    const injuryProne = valued(evaluateAccessibleRB(input('RB', {
      production: production({
        career: career(8, { carries: 12, rushingYards: 52, targets: 2, receptions: 1.6, receivingYards: 13 }),
        rosteredTeamWeeks: 17,
      }),
    })));
    expect(injuryProne.components.DUR).toBeLessThan(50);
  });

  it('drops the component rather than guessing when no roster week is attested', () => {
    const v = valued(evaluateAccessibleRB(input('RB', {
      production: production({
        career: career(12, { carries: 12, rushingYards: 52, targets: 2, receptions: 1.6, receivingYards: 13 }),
        rosteredTeamWeeks: null,
      }),
    })));
    expect(v.components).not.toHaveProperty('DUR');
  });

  it('never claims better-than-perfect availability when roster weeks are incomplete', () => {
    const v = valued(evaluateAccessibleRB(input('RB', {
      production: production({
        career: career(17, { carries: 12, rushingYards: 52, targets: 2, receptions: 1.6, receivingYards: 13 }),
        rosteredTeamWeeks: 9,
      }),
    })));
    expect(v.components.DUR).toBe(100);
  });
});

describe('availability cannot move a dynasty value', () => {
  // The structural guarantee behind "enabling Sleeper leaves dynasty alone". Availability is a
  // statement about THIS WEEK; a dynasty value is a statement about years. All three accessible
  // models therefore weight AV at exactly zero on the dynasty horizon, so no injury designation
  // — however severe, however it arrives — can move a dynasty composite. This is a property of
  // the weights, not an empirical observation about one board, so it holds for every player.
  const states = ['HEALTHY', 'QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR', 'PUP', 'SUSPENDED', 'NOT_ROSTERED', 'UNKNOWN'] as const;

  const eliteWR = () =>
    input('WR', {
      age: 26,
      production: production({
        career: career(60, { targets: 9, receptions: 6, receivingYards: 80, receivingTds: 0.5, receivingAirYards: 108 }),
        seasonsPlayed: 4,
        providerTargetShare: 0.28,
      }),
    });

  it('holds for RB, TE and WR across every availability state', () => {
    for (const build of [eliteRB, eliteTE, eliteWR]) {
      const dynasties = new Set<number>();
      const weeklies = new Set<number>();
      for (const availability of states) {
        const out = valued(evaluateAccessible({ ...build(), availability }));
        dynasties.add(out.composites.dynasty);
        weeklies.add(out.composites.weekly);
      }
      // One dynasty value across all nine states.
      expect(dynasties.size).toBe(1);
      // And weekly genuinely does move, so the test is not passing because nothing is wired.
      expect(weeklies.size).toBeGreaterThan(1);
    }
  });
});
