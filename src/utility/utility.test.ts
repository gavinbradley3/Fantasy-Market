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
  standing,
  validateSchema,
  type LeagueSchema,
  type UtilityInput,
} from './index';

/** A full board: `n` players at each position, ranked 1..n. */
function board(counts: Record<string, number>): UtilityInput[] {
  const out: UtilityInput[] = [];
  for (const [position, n] of Object.entries(counts)) {
    for (let r = 1; r <= n; r++) {
      out.push({ playerId: `${position}-${String(r).padStart(3, '0')}`, position: position as 'QB', positionRank: r });
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
    expect(DYNASTY_1QB_12.nflStartersPerTeam).toEqual(DYNASTY_SUPERFLEX_12.nflStartersPerTeam);
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
    expect(sf.QB.replacementStanding).toBeLessThan(one.QB.replacementStanding);
  });

  it('changes nothing for the other positions', () => {
    for (const p of ['RB', 'WR', 'TE'] as const) {
      expect(sf[p].replacementRank).toBe(one[p].replacementRank);
    }
  });

  it('never places replacement beyond the supply of NFL-relevant players', () => {
    const greedy: LeagueSchema = { ...DYNASTY_SUPERFLEX_12, dedicated: { QB: 8, RB: 2, WR: 3, TE: 1 } };
    const t = replacementTable(greedy);
    expect(t.QB.replacementRank).toBeLessThanOrEqual(t.QB.supply);
  });
});

describe('standing', () => {
  it('runs from 1 at the best player to 0 at the last with an NFL role', () => {
    expect(standing(1, 32)).toBe(1);
    expect(standing(32, 32)).toBe(0);
  });

  it('clamps a player beyond the position’s supply to zero rather than negative', () => {
    expect(standing(90, 32)).toBe(0);
  });

  it('treats an unranked player as standing nowhere', () => {
    expect(standing(0, 32)).toBe(0);
    expect(standing(Number.NaN, 32)).toBe(0);
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

  it('everyone below replacement is zero, not negative', () => {
    const below = b.players.filter((p) => p.positionRank !== null && p.positionRank > t[p.position].replacementRank);
    expect(below.length).toBeGreaterThan(100);
    expect(below.every((p) => p.surplus === 0)).toBe(true);
  });

  it('an unvalued player is carried at zero rather than dropped', () => {
    const withUnvalued = computeUtilityBoard(
      [...FULL(), { playerId: 'QB-none', position: 'QB', positionRank: null }],
      DYNASTY_SUPERFLEX_12,
    );
    const p = withUnvalued.players.find((x) => x.playerId === 'QB-none')!;
    expect(p.surplus).toBe(0);
    expect(p.value).toBe(0);
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

  it('a board where nobody clears replacement is all zeroes, not a division by zero', () => {
    const b = computeUtilityBoard(
      [{ playerId: 'QB-999', position: 'QB', positionRank: 999 }],
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
