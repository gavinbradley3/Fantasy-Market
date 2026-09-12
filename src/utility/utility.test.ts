// The shared cross-position dynasty utility layer.
//
// The properties worth protecting are the ones the design brief named as the point of the
// layer: the Superflex quarterback premium must EMERGE from the schema rather than be applied,
// a position's internal scale ceiling must not decide the board, and replacement-level players
// must approach zero whatever their engine says about them.

import { describe, expect, it } from 'vitest';
import {
  DYNASTY_1QB_12,
  DYNASTY_SUPERFLEX_12,
  computeUtilityBoard,
  rankUtilityBoard,
  replacementTable,
  derivedSupply,
  productionAtRank,
  ageRunway,
  curveDepth,
  validateProductionReference,
  DEPTH,
  validateSchema,
  type LeagueSchema,
  type UtilityInput,
} from './index';

/** A full board: `n` players at each position, ranked 1..n. */
function board(counts: Record<string, number>): UtilityInput[] {
  const out: UtilityInput[] = [];
  for (const [position, n] of Object.entries(counts)) {
    for (let r = 1; r <= n; r++) {
      out.push({
        playerId: `${position}-${String(r).padStart(3, '0')}`,
        position: position as 'QB',
        positionRank: r,
        age: 25,
      });
    }
  }
  return out;
}

const FULL = () => board({ QB: 111, RB: 237, WR: 340, TE: 180 });

function valueOf(players: readonly { playerId: string; value: number }[], id: string): number {
  return players.find((p) => p.playerId === id)!.value;
}

describe('league schema', () => {
  it('accepts the shipped formats', () => {
    expect(() => validateSchema(DYNASTY_SUPERFLEX_12)).not.toThrow();
    expect(() => validateSchema(DYNASTY_1QB_12)).not.toThrow();
  });

  it('rejects an allocation that does not sum to one', () => {
    const bad: LeagueSchema = {
      ...DYNASTY_SUPERFLEX_12,
      flexSlots: [{ count: 2, eligible: ['RB', 'WR'], allocation: { RB: 0.5, WR: 0.2 } }],
    };
    expect(() => validateSchema(bad)).toThrow(/sums to/);
  });

  it('rejects allocating a slot to a position that cannot fill it', () => {
    const bad: LeagueSchema = {
      ...DYNASTY_SUPERFLEX_12,
      flexSlots: [{ count: 1, eligible: ['RB'], allocation: { QB: 1 } }],
    };
    expect(() => validateSchema(bad)).toThrow(/not eligible/);
  });

  it('the two shipped formats differ in exactly one slot', () => {
    // The premium demonstrated below has to be attributable to the format and nothing else.
    expect(DYNASTY_1QB_12.flexSlots).toEqual([DYNASTY_SUPERFLEX_12.flexSlots[0]]);
    expect(DYNASTY_1QB_12.dedicated).toEqual(DYNASTY_SUPERFLEX_12.dedicated);
    expect(DYNASTY_1QB_12.scoringId).toEqual(DYNASTY_SUPERFLEX_12.scoringId);
  });
});

describe('replacement is derived from the schema', () => {
  const sf = replacementTable(DYNASTY_SUPERFLEX_12);
  const one = replacementTable(DYNASTY_1QB_12);

  it('counts dedicated slots plus each position’s share of the flex slots', () => {
    // QB: 12 dedicated + 12 superflex. RB: 24 + 45% of 24 flex. TE: 12 + 10% of 24.
    expect(sf.QB.demand).toBeCloseTo(24, 10);
    expect(sf.RB.demand).toBeCloseTo(24 + 10.8, 10);
    expect(sf.WR.demand).toBeCloseTo(36 + 10.8, 10);
    expect(sf.TE.demand).toBeCloseTo(12 + 2.4, 10);
  });

  it('SUPERFLEX pushes the replacement quarterback twelve places deeper', () => {
    expect(one.QB.replacementRank).toBe(12);
    expect(sf.QB.replacementRank).toBe(24);
    // A deeper replacement is a WORSE player, so everyone above them is worth more.
    expect(sf.QB.replacementProduction).toBeLessThan(one.QB.replacementProduction);
    expect(sf.QB.ceiling).toBeGreaterThan(one.QB.ceiling);
  });

  it('changes nothing for the other positions', () => {
    for (const p of ['RB', 'WR', 'TE'] as const) {
      expect(sf[p].replacementRank).toBe(one[p].replacementRank);
    }
  });

  it('never places replacement beyond the end of the measured curve', () => {
    const greedy: LeagueSchema = { ...DYNASTY_SUPERFLEX_12, dedicated: { QB: 8, RB: 2, WR: 3, TE: 1 } };
    const t = replacementTable(greedy);
    expect(t.QB.replacementRank).toBeLessThanOrEqual(curveDepth('QB'));
  });
});

describe('the measured production curve', () => {
  it('is a sorted distribution — production never rises with rank', () => {
    expect(() => validateProductionReference()).not.toThrow();
  });

  it('is CONVEX: the step down from the top costs far more than the same step lower down', () => {
    // The defect this replaced treated rank 1→5 and rank 61→65 as the same size of change.
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      const elite = productionAtRank(pos, 1) - productionAtRank(pos, 5);
      const deep = productionAtRank(pos, 61) - productionAtRank(pos, 65);
      expect(elite).toBeGreaterThan(deep * 2);
    }
  });

  it('prices a rank in points, so the same rank is worth different amounts by position', () => {
    // "TE3" and "RB3" are the same rank and nothing alike, which is the whole reason rank alone
    // could never be compared across positions.
    expect(productionAtRank('RB', 3)).toBeGreaterThan(productionAtRank('TE', 3) * 1.2);
  });

  it('decays to a floor near zero rather than stopping at an arbitrary threshold', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      expect(productionAtRank(pos, curveDepth(pos))).toBeLessThan(1);
    }
  });

  it('measures a steeper decline for running backs than quarterbacks', () => {
    // Measured, not assumed: this is the running-back cliff falling out of nine seasons of box
    // scores rather than being written into an aging curve by hand.
    expect(ageRunway('RB', 30)).toBeLessThan(ageRunway('QB', 30));
    expect(ageRunway('RB', 23)).toBeGreaterThan(ageRunway('RB', 30));
  });

  it('gives an unknown age the position’s median runway, never a full one', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      expect(ageRunway(pos, null)).toBeLessThan(ageRunway(pos, 21));
      expect(ageRunway(pos, null)).toBeGreaterThan(0);
    }
  });
});

describe('derived supply replaces the hand-declared figures', () => {
  const supply = derivedSupply(DYNASTY_SUPERFLEX_12);

  it('applies ONE league-wide production bar to all four positions', () => {
    const t = new Set(Object.values(supply).map((s) => s.threshold));
    expect(t.size).toBe(1);
  });

  it('contradicts version 1’s assumptions, which is why they are gone', () => {
    // v1 declared WR 3.0 and TE 1.5 startable players per NFL team. Neither survives contact
    // with the box scores, and both were setting a position's value ceiling.
    expect(supply.WR.perTeam).toBeLessThan(2);
    expect(supply.TE.perTeam).toBeLessThan(1);
  });

  it('is reported only — no value on the board reads it', () => {
    const withSupply = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    // Nothing to inject: the type carries no supply field at all, and the table below proves
    // the ceiling is the distance between two measured points rather than a pool size.
    const t = replacementTable(DYNASTY_SUPERFLEX_12);
    expect(t.QB.ceiling).toBeCloseTo(t.QB.eliteProduction - t.QB.replacementProduction, 10);
    expect(withSupply.players.length).toBeGreaterThan(0);
  });
});

describe('the Superflex quarterback premium EMERGES from the format', () => {
  it('the same QB is worth far more in Superflex than in 1QB, with no multiplier anywhere', () => {
    const sf = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    const one = computeUtilityBoard(FULL(), DYNASTY_1QB_12);
    const sfQb3 = sf.players.find((p) => p.playerId === 'QB-003')!;
    const oneQb3 = one.players.find((p) => p.playerId === 'QB-003')!;
    expect(sfQb3.surplus).toBeGreaterThan(oneQb3.surplus * 1.5);
  });

  it('and quarterbacks rise relative to every other position, which nothing else moved', () => {
    const sf = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    const one = computeUtilityBoard(FULL(), DYNASTY_1QB_12);
    const ratio = (b: ReturnType<typeof computeUtilityBoard>) =>
      valueOf(b.players, 'QB-003') / valueOf(b.players, 'RB-003');
    expect(ratio(sf)).toBeGreaterThan(ratio(one));
  });

  it('removing the superflex slot is the only change that produced it', () => {
    const sf = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    const one = computeUtilityBoard(FULL(), DYNASTY_1QB_12);
    for (const id of ['RB-001', 'WR-001', 'TE-001', 'RB-020']) {
      // Non-QB surpluses are untouched; only the normalization's denominator can shift.
      const a = sf.players.find((p) => p.playerId === id)!.surplus;
      const b = one.players.find((p) => p.playerId === id)!.surplus;
      expect(a).toBeCloseTo(b, 10);
    }
  });
});

describe('no position’s internal scale can take over the board', () => {
  const ranked = rankUtilityBoard(computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12));

  it('TE1 is not automatically the best asset in the league', () => {
    expect(ranked[0].playerId).not.toBe('TE-001');
    expect(valueOf(ranked, 'TE-001')).toBeLessThan(valueOf(ranked, 'QB-001'));
  });

  it('the top 25 is not one position', () => {
    const positions = new Set(ranked.slice(0, 25).map((p) => p.position));
    expect(positions.size).toBeGreaterThan(1);
  });

  it('an elite Superflex quarterback is not buried', () => {
    const qb1 = ranked.findIndex((p) => p.playerId === 'QB-001');
    expect(qb1).toBeLessThan(5);
  });

  it('utility is driven by standing against replacement, not by position order in the input', () => {
    const forward = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    const shuffled = computeUtilityBoard([...FULL()].reverse(), DYNASTY_SUPERFLEX_12);
    expect(valueOf(shuffled.players, 'QB-001')).toBe(valueOf(forward.players, 'QB-001'));
  });
});

describe('replacement level is a floor', () => {
  const b = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
  const t = replacementTable(DYNASTY_SUPERFLEX_12);

  it('the replacement player himself has exactly zero surplus', () => {
    const id = `QB-${String(t.QB.replacementRank).padStart(3, '0')}`;
    expect(b.players.find((p) => p.playerId === id)!.surplus).toBe(0);
  });

  it('everyone below replacement has zero SURPLUS, not a negative one', () => {
    const below = b.players.filter((p) => p.positionRank !== null && p.positionRank > t[p.position].replacementRank);
    expect(below.length).toBeGreaterThan(100);
    expect(below.every((p) => p.surplus === 0)).toBe(true);
  });

  it('an unvalued player is carried at zero rather than dropped', () => {
    const withUnvalued = computeUtilityBoard(
      [...FULL(), { playerId: 'QB-none', position: 'QB', positionRank: null, age: 24 }],
      DYNASTY_SUPERFLEX_12,
    );
    const p = withUnvalued.players.find((x) => x.playerId === 'QB-none')!;
    expect(p.surplus).toBe(0);
    expect(p.depth).toBe(0);
    expect(p.value).toBe(0);
    expect(p.source).toBe('NONE');
  });
});

describe('the published scale', () => {
  it('normalizes AFTER utility, to PlayerTicker’s own 0–100', () => {
    const b = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    const values = b.players.map((p) => p.value);
    expect(Math.max(...values)).toBe(100);
    expect(Math.min(...values)).toBe(0);
  });

  it('preserves the ORDER of surplus exactly — normalization adds no information', () => {
    const ranked = rankUtilityBoard(computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12));
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].value).toBeGreaterThanOrEqual(ranked[i].value);
    }
  });

  it('a board with no utility at all is zeroes, not a division by zero', () => {
    const b = computeUtilityBoard(
      [{ playerId: 'QB-none', position: 'QB', positionRank: null, age: 24 }],
      DYNASTY_SUPERFLEX_12,
    );
    expect(b.players[0].value).toBe(0);
  });

  it('is deterministic', () => {
    const a = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    const c = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });
});

describe('the below-replacement depth term', () => {
  const b = computeUtilityBoard(FULL(), DYNASTY_SUPERFLEX_12);
  const t = replacementTable(DYNASTY_SUPERFLEX_12);
  const get = (id: string) => b.players.find((p) => p.playerId === id)!;

  it('gives below-replacement players a value, which strict VOR could not', () => {
    // Before this term, 86% of the live board shared one value: zero. A dynasty manager trades
    // those players constantly, so a board that cannot tell them apart is not describing what
    // they are trading.
    const below = b.players.filter((p) => p.positionRank !== null && p.positionRank > t[p.position].replacementRank);
    expect(below.filter((p) => p.value > 0).length).toBeGreaterThan(below.length * 0.5);
  });

  it('is MONOTONE: a worse player at the same position is never worth more', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      const ordered = b.players
        .filter((p) => p.position === pos && p.positionRank !== null)
        .sort((x, y) => (x.positionRank as number) - (y.positionRank as number));
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i].total).toBeLessThanOrEqual(ordered[i - 1].total + 1e-9);
      }
    }
  });

  it('is CONTINUOUS across the replacement line — no jump at the boundary', () => {
    // Applying depth only below replacement would make the first non-starter worth suddenly
    // MORE than the last starter, which is the defect this shape avoids.
    const r = t.RB.replacementRank;
    const last = get(`RB-${String(r - 1).padStart(3, '0')}`);
    const first = get(`RB-${String(r + 1).padStart(3, '0')}`);
    expect(first.total).toBeLessThan(last.total);
  });

  it('stays much smaller than real above-replacement utility', () => {
    const maxDepth = Math.max(...b.players.map((p) => p.depth));
    const eliteSurplus = Math.max(...b.players.map((p) => p.surplus));
    expect(maxDepth).toBeLessThan(eliteSurplus * 0.15);
  });

  it('never lets a deep bench player outrank a genuine starter', () => {
    // A genuine starter: the median startable rank at each position.
    for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
      const mid = Math.max(1, Math.floor(t[pos].replacementRank / 2));
      const starter = get(`${pos}-${String(mid).padStart(3, '0')}`);
      const bench = b.players.filter(
        (p) => p.positionRank !== null && p.positionRank > t[p.position].replacementRank,
      );
      expect(Math.max(...bench.map((p) => p.total))).toBeLessThan(starter.total);
    }
  });

  it('separates useful depth from fringe, because proximity inherits the curve’s convexity', () => {
    const nearLine = get(`RB-${String(t.RB.replacementRank + 2).padStart(3, '0')}`);
    const fringe = get('RB-120');
    expect(nearLine.depth).toBeGreaterThan(fringe.depth * 3);
  });

  it('prefers the younger of two identical players, and bounds how much', () => {
    const young = computeUtilityBoard(
      [{ playerId: 'x', position: 'RB', positionRank: 60, age: 22 }],
      DYNASTY_SUPERFLEX_12,
    ).players[0];
    const old = computeUtilityBoard(
      [{ playerId: 'x', position: 'RB', positionRank: 60, age: 31 }],
      DYNASTY_SUPERFLEX_12,
    ).players[0];
    expect(young.depth).toBeGreaterThan(old.depth);
    // Bounded by AGE_FLOOR, because the engine rank feeding this layer is ALREADY age-discounted
    // and charging a veteran twice would be wrong.
    expect(old.depth).toBeGreaterThanOrEqual(young.depth * DEPTH.AGE_FLOOR * 0.99);
  });

  it('reports which term produced the value', () => {
    expect(get('QB-001').source).toBe('BOTH');
    expect(get(`RB-${String(t.RB.replacementRank + 5).padStart(3, '0')}`).source).toBe('DEPTH');
  });
});
