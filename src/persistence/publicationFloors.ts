// Per-position publication floors.
//
// A refresh can complete every source, run every inference, and still produce a board that is
// useless for one position — a dropped column, a schema rename or an upstream gap can leave every
// tight end INSUFFICIENT while each individual result is "successful". PT-02 completeness cannot
// see that: an INSUFFICIENT result is a legitimate, complete outcome. This check can.
//
// It is a pure function over (position, valued) pairs so it can be tested exhaustively and its
// verdict printed verbatim.

export interface PositionFloor {
  /** Minimum number of VALUED players at the position. */
  readonly minValued: number;
  /** Minimum valued / selected share at the position (0–1). */
  readonly minValuedShare: number;
}

export type PublicationFloors = Readonly<Record<string, PositionFloor>>;

/**
 * Production floors.
 *
 * `minValued` is the number of startable players a 12-team Superflex league needs at the
 * position (QB 24, RB 40, WR 60, TE 24): a board that cannot rank at least that many is not a
 * usable dynasty board for that position. `minValuedShare` 0.6 sits well below every share the
 * live pipeline has produced (RB 0.94, WR 0.93, TE 0.91, QB 1.00 on the September board), so
 * ordinary INSUFFICIENT players never trip it, while a systematic loss does.
 */
export const PRODUCTION_PUBLICATION_FLOORS: PublicationFloors = {
  QB: { minValued: 24, minValuedShare: 0.6 },
  RB: { minValued: 40, minValuedShare: 0.6 },
  WR: { minValued: 60, minValuedShare: 0.6 },
  TE: { minValued: 24, minValuedShare: 0.6 },
};

export interface FloorViolation {
  readonly position: string;
  readonly selected: number;
  readonly valued: number;
  readonly reason: string;
}

export interface FloorReport {
  readonly ok: boolean;
  readonly byPosition: Readonly<Record<string, { selected: number; valued: number; share: number | null }>>;
  readonly violations: readonly FloorViolation[];
}

export function checkPublicationFloors(
  entries: readonly { readonly position: string; readonly valued: boolean }[],
  floors: PublicationFloors,
): FloorReport {
  const byPosition: Record<string, { selected: number; valued: number; share: number | null }> = {};
  for (const e of entries) {
    const slot = (byPosition[e.position] ??= { selected: 0, valued: 0, share: null });
    slot.selected += 1;
    if (e.valued) slot.valued += 1;
  }
  for (const slot of Object.values(byPosition)) slot.share = slot.selected > 0 ? slot.valued / slot.selected : null;

  const violations: FloorViolation[] = [];
  for (const position of Object.keys(floors).sort()) {
    const floor = floors[position];
    const slot = byPosition[position] ?? { selected: 0, valued: 0, share: null };
    if (slot.valued < floor.minValued) {
      violations.push({
        position,
        selected: slot.selected,
        valued: slot.valued,
        reason: `${position}: ${slot.valued} valued, below the floor of ${floor.minValued}`,
      });
    } else if (slot.share === null || slot.share < floor.minValuedShare) {
      violations.push({
        position,
        selected: slot.selected,
        valued: slot.valued,
        reason: `${position}: ${slot.valued} of ${slot.selected} valued (${((slot.share ?? 0) * 100).toFixed(1)}%), below the floor of ${(floor.minValuedShare * 100).toFixed(0)}%`,
      });
    }
  }
  return { ok: violations.length === 0, byPosition, violations };
}
