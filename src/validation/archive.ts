// Prediction-archive rules (pure). Used by scripts/backtest/archive-snapshot.ts.
//
// A snapshot is PROSPECTIVE only when its inputs and predictions were captured close to the
// decision instant, before any outcome it will be scored on. Anything recorded later is a
// HISTORICAL_RECONSTRUCTION: the incumbent is unchanged, but its inputs carry whatever the
// provider corrected after the decision instant, and nothing proves the capture preceded the
// knowledge of later events.

import { REPLACEMENT_RANK } from './outcomes';
import { POSITIONS, type Pos } from './data';

export type SnapshotClass = 'PROSPECTIVE' | 'HISTORICAL_RECONSTRUCTION';

/** Longest gap between the decision instant and the capture for a snapshot to count as prospective. */
export const PROSPECTIVE_WINDOW_HOURS = 72;

export interface Classification {
  readonly classification: SnapshotClass;
  readonly hoursAfterDecision: number;
  readonly reason: string;
}

/**
 * @param asOfMs            decision instant
 * @param capturedAtMs      wall-clock start of the capture
 * @param firstOutcomeMs    kickoff of the first game in the first outcome season
 */
export function classifySnapshot(asOfMs: number, capturedAtMs: number, firstOutcomeMs: number): Classification {
  const hours = (capturedAtMs - asOfMs) / 3_600_000;
  if (capturedAtMs < asOfMs) throw new Error('capture precedes the decision instant: games due before it may not be final yet');
  if (capturedAtMs >= firstOutcomeMs) {
    return { classification: 'HISTORICAL_RECONSTRUCTION', hoursAfterDecision: hours, reason: 'captured after its first outcome game had kicked off' };
  }
  if (hours > PROSPECTIVE_WINDOW_HOURS) {
    return { classification: 'HISTORICAL_RECONSTRUCTION', hoursAfterDecision: hours, reason: `captured ${hours.toFixed(1)} h after the decision instant (limit ${PROSPECTIVE_WINDOW_HOURS} h); inputs may include later provider corrections` };
  }
  return { classification: 'PROSPECTIVE', hoursAfterDecision: hours, reason: `captured ${hours.toFixed(1)} h after the decision instant, before any outcome game` };
}

/**
 * Two-season value above replacement, per-season rule (the rule used for C and F in
 * phase2-challenger-f): each horizon season's prediction against that season's k-th best
 * prediction at the position, floored at zero, summed.
 */
export function perSeasonValues(
  population: ReadonlyMap<string, Pos>,
  T1: ReadonlyMap<string, number>,
  T2: ReadonlyMap<string, number>,
): Map<string, number> {
  const kth = (vals: number[], pos: Pos) => vals.sort((a, b) => b - a)[Math.min(REPLACEMENT_RANK[pos], vals.length) - 1] ?? 0;
  const rep1 = new Map<Pos, number>();
  const rep2 = new Map<Pos, number>();
  for (const pos of POSITIONS) {
    const ids = [...population].filter(([, p]) => p === pos).map(([g]) => g);
    rep1.set(pos, kth(ids.map((g) => T1.get(g) ?? 0), pos));
    rep2.set(pos, kth(ids.map((g) => (T2.get(g) ?? 0) - (T1.get(g) ?? 0)), pos));
  }
  const out = new Map<string, number>();
  for (const [g, pos] of population) {
    const s1 = T1.get(g) ?? 0;
    const s2 = (T2.get(g) ?? 0) - s1;
    out.set(g, Math.max(0, s1 - rep1.get(pos)!) + Math.max(0, s2 - rep2.get(pos)!));
  }
  return out;
}
