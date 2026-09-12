// League format, as data.
//
// Everything about a league that changes what a player is worth lives here, versioned, and
// nothing about it is buried in a formula. Switching to 1QB, a third flex, or a TE-premium
// lineup is a change to a schema object — the valuation logic never learns which format it is
// running.
//
// WHY A SCHEMA AT ALL. A dynasty value is meaningless without one. "How good is this player"
// has no answer across positions; "how much better than the player you could start instead, in
// THIS lineup" does. The schema is what turns the second question into arithmetic.

/** The four positions PlayerTicker values. */
export type UtilityPosition = 'QB' | 'RB' | 'WR' | 'TE';

export const UTILITY_POSITIONS: readonly UtilityPosition[] = ['QB', 'RB', 'WR', 'TE'];

/**
 * How a multi-position slot's demand is shared out.
 *
 * A DECLARED LEAGUE BEHAVIOUR, not a fitted constant and not a positional bonus. Deriving it
 * instead would require ranking a running back against a tight end to decide who fills the
 * flex — the very cross-position comparison this whole layer exists to produce, so deriving it
 * here would be circular. It is therefore stated openly, in the schema, where it can be
 * argued with and changed.
 *
 * Shares must sum to 1 over the slot's eligible positions.
 */
export type SlotAllocation = Readonly<Partial<Record<UtilityPosition, number>>>;

export interface LineupSlot {
  /** Slots per team. */
  readonly count: number;
  readonly eligible: readonly UtilityPosition[];
  readonly allocation: SlotAllocation;
}

export interface LeagueSchema {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly teams: number;
  /** Slots every team starts at a fixed position. */
  readonly dedicated: Readonly<Record<UtilityPosition, number>>;
  /** Multi-position slots, each with its declared allocation. */
  readonly flexSlots: readonly LineupSlot[];
  /**
   * Players per NFL team who hold a real role at each position — the SUPPLY side.
   *
   * Scarcity is demand measured against supply, and supply is a football fact rather than a
   * league setting: there are 32 starting quarterbacks and roughly three times as many starting
   * receivers, whatever your lineup says. Without this the model could only see demand, and a
   * league that started more of a position would look like it valued that position more, which
   * is backwards.
   */
  readonly nflStartersPerTeam: Readonly<Record<UtilityPosition, number>>;
  /** NFL teams — the multiplier on `nflStartersPerTeam`. */
  readonly nflTeams: number;
}

/**
 * PlayerTicker's primary format: 12-team dynasty Superflex.
 *
 * 1 QB / 2 RB / 3 WR / 1 TE / 2 FLEX / 1 SUPERFLEX.
 */
export const DYNASTY_SUPERFLEX_12: LeagueSchema = {
  id: 'dynasty-superflex-12',
  version: 1,
  label: '12-team dynasty Superflex',
  teams: 12,
  dedicated: { QB: 1, RB: 2, WR: 3, TE: 1 },
  flexSlots: [
    {
      count: 2,
      eligible: ['RB', 'WR', 'TE'],
      // Flex is filled overwhelmingly by backs and receivers; a tight end reaches it only when
      // a roster is unusually deep there.
      allocation: { RB: 0.45, WR: 0.45, TE: 0.1 },
    },
    {
      count: 1,
      eligible: ['QB', 'RB', 'WR', 'TE'],
      // In a 12-team Superflex league every team that can roster a second startable quarterback
      // starts one, because the alternative is conceding the slot. This single line is what
      // makes Superflex Superflex, and setting it to {} is what makes a league 1QB.
      allocation: { QB: 1 },
    },
  ],
  nflStartersPerTeam: { QB: 1, RB: 1.5, WR: 3, TE: 1.5 },
  nflTeams: 32,
};

/**
 * The same league with the superflex slot removed — the 1QB comparison.
 *
 * Present so the Superflex quarterback premium can be demonstrated rather than asserted: the
 * two schemas differ in one slot and nothing else, so any difference in quarterback value
 * between them is produced by the format.
 */
export const DYNASTY_1QB_12: LeagueSchema = {
  ...DYNASTY_SUPERFLEX_12,
  id: 'dynasty-1qb-12',
  label: '12-team dynasty 1QB',
  flexSlots: [DYNASTY_SUPERFLEX_12.flexSlots[0]],
};

/** Structural validation. A malformed schema is a configuration error, never a silent default. */
export function validateSchema(schema: LeagueSchema): void {
  if (schema.teams <= 0) throw new Error('league schema: teams must be positive');
  if (schema.nflTeams <= 0) throw new Error('league schema: nflTeams must be positive');
  for (const p of UTILITY_POSITIONS) {
    if (schema.dedicated[p] < 0) throw new Error(`league schema: negative dedicated slots for ${p}`);
    if (schema.nflStartersPerTeam[p] <= 0) {
      throw new Error(`league schema: nflStartersPerTeam must be positive for ${p}`);
    }
  }
  for (const slot of schema.flexSlots) {
    if (slot.count < 0) throw new Error('league schema: negative flex slot count');
    const shares = Object.entries(slot.allocation);
    for (const [pos, share] of shares) {
      if (!slot.eligible.includes(pos as UtilityPosition)) {
        throw new Error(`league schema: ${pos} is allocated a slot it is not eligible for`);
      }
      if (share < 0) throw new Error(`league schema: negative allocation share for ${pos}`);
    }
    const total = shares.reduce((s, [, v]) => s + v, 0);
    // An empty allocation is legitimate — it is how a slot is switched off (see DYNASTY_1QB_12).
    if (shares.length > 0 && Math.abs(total - 1) > 1e-9) {
      throw new Error(`league schema: slot allocation sums to ${total}, expected 1`);
    }
  }
}
